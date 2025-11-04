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
      billingCycleAnchor,
      skipFirstPayment,
      notes,
    } = await request.json();

    if (!clientId || !priceId) {
      return json({ error: "Missing clientId or priceId" }, { status: 400 });
    }

    // Parse skipFirstPayment (can be string "true"/"false" or boolean)
    const shouldSkipPayment = skipFirstPayment === true || skipFirstPayment === "true";

    // Verify client belongs to this coach
    const { data: client } = await supabase
      .from("users")
      .select("id, email, stripe_customer_id")
      .eq("id", clientId)
      .eq("coach_id", coachUser.id)
      .single();

    if (!client) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer({
      userId: client.id,
      email: client.email,
    });

    // Check if client already has an active subscription for this price
    const existingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10,
    });

    const hasExistingSubscription = existingSubscriptions.data.some((sub) =>
      sub.items.data.some((item) => item.price.id === priceId)
    );

    if (hasExistingSubscription) {
      return json({ 
        error: "Client already has an active subscription for this product" 
      }, { status: 400 });
    }

    // Retrieve the price from Stripe
    const price = await stripe.prices.retrieve(priceId);
    const baseAmount = price.unit_amount || 0;

    // Calculate billing cycle anchor
    let billingCycleAnchorUnix: number | undefined;
    if (billingCycleAnchor) {
      billingCycleAnchorUnix = dayjs(billingCycleAnchor).startOf("day").unix();
    }

    // Create subscription parameters
    const subscriptionParams: any = {
      customer: customerId,
      items: [{ price: priceId }],
      proration_behavior: "none",
      metadata: {
        userId: client.id,
        createdVia: "manual_coach_setup",
        ...(notes ? { notes } : {}),
      },
    };

    // Set billing cycle anchor if provided
    if (billingCycleAnchorUnix) {
      subscriptionParams.billing_cycle_anchor = billingCycleAnchorUnix;
    }

    // If skipping first payment, use trial period or payment_behavior
    if (shouldSkipPayment) {
      // Use trial_end to skip first payment - set trial to end at billing cycle anchor
      if (billingCycleAnchorUnix) {
        subscriptionParams.trial_end = billingCycleAnchorUnix;
      } else {
        // If no anchor date, set trial to next month
        subscriptionParams.trial_end = dayjs().add(1, "month").startOf("day").unix();
      }
      // Don't require payment method for trial subscriptions
      subscriptionParams.payment_behavior = "default_incomplete";
    } else {
      // Get payment method if available
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });

      const customer = await stripe.customers.retrieve(customerId);
      const defaultPaymentMethodId = 
        (customer as any).invoice_settings?.default_payment_method ||
        paymentMethods.data[0]?.id;

      if (defaultPaymentMethodId) {
        subscriptionParams.default_payment_method = defaultPaymentMethodId;
        subscriptionParams.payment_behavior = "default_incomplete";
      } else {
        // No payment method - create subscription with trial
        subscriptionParams.trial_end = billingCycleAnchorUnix || dayjs().add(1, "month").startOf("day").unix();
        subscriptionParams.payment_behavior = "default_incomplete";
      }
    }

    // Create the subscription
    const subscription = await stripe.subscriptions.create(subscriptionParams);

    return json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        billing_cycle_anchor: subscription.billing_cycle_anchor,
        trial_end: subscription.trial_end,
      },
      message: "Subscription created successfully",
    });
  } catch (error: any) {
    console.error("Error creating manual subscription:", error);
    return json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

