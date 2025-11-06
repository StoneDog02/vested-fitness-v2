import { json, type ActionFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { stripe, getOrCreateStripeCustomer } from "~/utils/stripe.server";
import dayjs from "dayjs";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Get coach from auth cookie
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );
    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          "base64"
        ).toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch (e) {
        accessToken = undefined;
      }
    }
    let authId: string | undefined;
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
        authId =
          decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
      } catch (e) {
        authId = undefined;
      }
    }
    if (!authId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get coach user record
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: coachUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authId)
      .single();

    if (!coachUser || coachUser.role !== "coach") {
      return json({ error: "Only coaches can create subscriptions" }, { status: 403 });
    }

    // Parse request body
    const {
      clientId,
      priceId,
      taxPercentage,
      startDate,
      notes,
    } = await request.json();

    if (!clientId || !priceId) {
      return json({ error: "Missing clientId or priceId" }, { status: 400 });
    }

    // Verify client belongs to this coach
    // Try by slug first, then by id
    let { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, email, stripe_customer_id")
      .eq("slug", clientId)
      .eq("coach_id", coachUser.id)
      .single();
    
    // If not found by slug, try by id
    if (!client || clientError) {
      const { data: clientById, error: clientByIdError } = await supabase
        .from("users")
        .select("id, email, stripe_customer_id")
        .eq("id", clientId)
        .eq("coach_id", coachUser.id)
        .single();
      client = clientById;
      clientError = clientByIdError;
    }

    if (!client) {
      console.error("Client lookup failed:", clientError);
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer({
      userId: client.id,
      email: client.email,
    });

    // Get payment methods for the customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId = 
      (customer as any).invoice_settings?.default_payment_method ||
      paymentMethods.data[0]?.id;

    if (!defaultPaymentMethodId) {
      return json({ error: "Client has no payment method on file" }, { status: 400 });
    }

    // Retrieve the price from Stripe
    const price = await stripe.prices.retrieve(priceId);
    const baseAmount = price.unit_amount || 0;

    // Calculate tax amount if tax percentage is provided
    let taxAmount = 0;
    let invoiceTotal = baseAmount;
    const taxPercent = typeof taxPercentage === 'string' ? parseFloat(taxPercentage) : taxPercentage;
    if (taxPercent && taxPercent > 0) {
      taxAmount = Math.round(baseAmount * (taxPercent / 100));
      invoiceTotal = baseAmount + taxAmount;
    }

    // Calculate billing cycle anchor (start date)
    // If start date is today or in the past, charge immediately (no anchor)
    // If start date is in the future, schedule charge for that date (set anchor)
    let billingCycleAnchor: number | undefined;
    if (startDate) {
      const startDateTime = dayjs(startDate).startOf("day");
      const today = dayjs().startOf("day");
      
      // Only set billing_cycle_anchor if start date is in the future
      // If today or past, let Stripe charge immediately
      if (startDateTime.isAfter(today)) {
        billingCycleAnchor = startDateTime.unix();
      }
      // If start date is today or in the past, don't set billing_cycle_anchor
      // This will cause Stripe to charge immediately
    }

    // Create subscription
    const subscriptionParams: any = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice", "latest_invoice.payment_intent"],
      proration_behavior: "none",
      default_payment_method: defaultPaymentMethodId,
      metadata: {
        userId: client.id,
        createdVia: "coach_subscription_creation",
        ...(notes ? { notes } : {}),
      },
    };

    if (billingCycleAnchor) {
      subscriptionParams.billing_cycle_anchor = billingCycleAnchor;
    }

    // Add tax if provided
    if (taxAmount > 0) {
      // Create subscription first
      const subscription = await stripe.subscriptions.create(subscriptionParams);

      // Add tax as a recurring invoice item that will be included in every billing cycle
      await stripe.invoiceItems.create({
        customer: customerId,
        subscription: subscription.id,
        amount: taxAmount,
        currency: price.currency,
        description: `Tax (${taxPercent}%)`,
        // Don't specify period - this makes it recurring for the subscription
      });

      // Only finalize invoice if one exists (might not exist for future-dated subscriptions)
      if (subscription.latest_invoice && typeof subscription.latest_invoice === 'string') {
        try {
          const invoice = await stripe.invoices.retrieve(subscription.latest_invoice);
          if (invoice.status === 'draft') {
            await stripe.invoices.finalizeInvoice(invoice.id, {
              auto_advance: true,
            });
          }
        } catch (invoiceError) {
          // If invoice retrieval/finalization fails, log but don't fail the subscription creation
          console.error("Error handling invoice:", invoiceError);
        }
      }

      return json({
        success: true,
        subscription,
        message: "Subscription created successfully",
      });
    } else {
      const subscription = await stripe.subscriptions.create(subscriptionParams);
      return json({
        success: true,
        subscription,
        message: "Subscription created successfully",
      });
    }
  } catch (error: any) {
    console.error("Error creating subscription:", error);
    const errorMessage = error?.message || error?.toString() || "Internal server error";
    console.error("Full error details:", {
      message: errorMessage,
      stack: error?.stack,
      response: error?.response,
    });
    return json(
      { error: errorMessage, success: false },
      { status: 500 }
    );
  }
}

