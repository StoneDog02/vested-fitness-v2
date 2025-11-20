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

    // Create subscription
    const subscription = await stripe.subscriptions.create(subscriptionParams);
    
    // Add tax if provided
    if (taxAmount > 0) {
      // Add tax as a recurring invoice item that will be included in every billing cycle
      await stripe.invoiceItems.create({
        customer: customerId,
        subscription: subscription.id,
        amount: taxAmount,
        currency: price.currency,
        description: `Tax (${taxPercent}%)`,
        // Don't specify period - this makes it recurring for the subscription
      });
    }

    // Only attempt to pay immediately if start date is today or in the past
    // If start date is in the future, Stripe will handle payment on the scheduled date
    const subscriptionStatus = (subscription as any).status;
    const invoice = subscription.latest_invoice;
    
    // Check if this is a future-dated subscription
    const isFutureDated = billingCycleAnchor !== undefined;
    
    console.log(`[API] Subscription created: ${subscription.id}, status: ${subscriptionStatus}, isFutureDated: ${isFutureDated}`);
    console.log(`[API] Invoice:`, invoice ? (typeof invoice === 'string' ? invoice : (invoice as any).id) : 'none');
    
    if (!isFutureDated) {
      // Start date is today or in the past - attempt to pay immediately
      let invoiceId: string | null = null;
      
      // Extract invoice ID (it might be expanded or just an ID string)
      if (invoice) {
        if (typeof invoice === 'string') {
          invoiceId = invoice;
        } else if (typeof invoice === 'object' && 'id' in invoice) {
          invoiceId = typeof invoice.id === 'string' ? invoice.id : String(invoice.id);
        }
      }
      
      if (!invoiceId) {
        console.log(`[API] No invoice found for immediate subscription. Stripe will create one automatically.`);
      } else {
        console.log(`[API] Attempting to pay invoice ${invoiceId} for subscription ${subscription.id}`);
        
        try {
          // Small delay to ensure invoice is fully processed by Stripe
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Retrieve the invoice to check its status
          const invoiceObj = await stripe.invoices.retrieve(invoiceId, {
            expand: ['payment_intent'],
          });
          console.log(`[API] Invoice ${invoiceId} status: ${invoiceObj.status}`);
          
          // Check payment intent status if available
          const paymentIntent = (invoiceObj as any).payment_intent;
          if (paymentIntent) {
            const piStatus = typeof paymentIntent === 'object' ? paymentIntent.status : 'unknown';
            console.log(`[API] Payment intent status: ${piStatus}`);
          }
          
          // Finalize draft invoices
          if (invoiceObj.status === 'draft') {
            console.log(`[API] Finalizing draft invoice ${invoiceId}`);
            await stripe.invoices.finalizeInvoice(invoiceId, {
              auto_advance: true,
            });
            // Re-retrieve after finalization
            const finalizedInvoice = await stripe.invoices.retrieve(invoiceId);
            console.log(`[API] Invoice ${invoiceId} after finalization: ${finalizedInvoice.status}`);
            
            // If invoice is now open and we have a payment method, attempt to pay it
            if (finalizedInvoice.status === 'open' && defaultPaymentMethodId) {
              try {
                console.log(`[API] Paying invoice ${invoiceId} with payment method ${defaultPaymentMethodId}`);
                const paidInvoice = await stripe.invoices.pay(invoiceId, {
                  payment_method: defaultPaymentMethodId,
                  off_session: true, // Indicate this is an off-session payment
                });
                console.log(`[API] Invoice payment result: ${paidInvoice.status}`);
                
                // Re-fetch subscription to get updated status
                const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id);
                const updatedStatus = (updatedSubscription as any).status;
                console.log(`[API] Subscription ${subscription.id} status after payment: ${updatedStatus}`);
                
                return json({
                  success: true,
                  subscription: updatedSubscription,
                  message: "Subscription created and payment processed successfully",
                });
              } catch (payError: any) {
                // If payment fails, log the full error
                console.error(`[API] Failed to pay invoice ${invoiceId}:`, {
                  message: payError.message,
                  type: payError.type,
                  code: payError.code,
                  decline_code: payError.decline_code,
                  payment_intent: payError.payment_intent,
                });
              }
            } else {
              console.log(`[API] Cannot pay invoice ${invoiceId}: status=${finalizedInvoice.status}, hasPaymentMethod=${!!defaultPaymentMethodId}`);
            }
          } else if (invoiceObj.status === 'open' && defaultPaymentMethodId) {
            // Invoice is already open, attempt to pay it
            try {
              console.log(`[API] Paying open invoice ${invoiceId} with payment method ${defaultPaymentMethodId}`);
              const paidInvoice = await stripe.invoices.pay(invoiceId, {
                payment_method: defaultPaymentMethodId,
                off_session: true, // Indicate this is an off-session payment
              });
              console.log(`[API] Invoice payment result: ${paidInvoice.status}`);
              
              // Re-fetch subscription to get updated status
              const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id);
              const updatedStatus = (updatedSubscription as any).status;
              console.log(`[API] Subscription ${subscription.id} status after payment: ${updatedStatus}`);
              
              return json({
                success: true,
                subscription: updatedSubscription,
                message: "Subscription created and payment processed successfully",
              });
            } catch (payError: any) {
              console.error(`[API] Failed to pay open invoice ${invoiceId}:`, {
                message: payError.message,
                type: payError.type,
                code: payError.code,
                decline_code: payError.decline_code,
                payment_intent: payError.payment_intent,
              });
            }
          } else if (invoiceObj.status === 'paid') {
            // Invoice is already paid
            console.log(`[API] Invoice ${invoiceId} is already paid`);
            const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id);
            return json({
              success: true,
              subscription: updatedSubscription,
              message: "Subscription created and payment processed successfully",
            });
          } else {
            console.log(`[API] Invoice ${invoiceId} is in status ${invoiceObj.status}, cannot pay at this time`);
          }
        } catch (invoiceError: any) {
          // If invoice retrieval/finalization fails, log the full error
          console.error("[API] Error handling invoice:", {
            message: invoiceError.message,
            type: invoiceError.type,
            code: invoiceError.code,
          });
        }
      }
    } else {
      // Future-dated subscription - payment will be attempted on the scheduled date
      console.log(`[API] Future-dated subscription created. Payment will be processed on ${startDate}`);
    }

    // Return subscription
    // For future-dated subscriptions, status will be 'incomplete' until payment date
    // For immediate subscriptions, status may be 'incomplete' if payment failed
    return json({
      success: true,
      subscription,
      message: isFutureDated
        ? `Subscription created successfully. Payment will be processed on ${startDate}.`
        : subscriptionStatus === 'active' 
          ? "Subscription created and payment processed successfully"
          : "Subscription created successfully. Payment will be processed automatically.",
    });
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

