import { json, type ActionFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { stripe, getOrCreateStripeCustomer, listPaymentMethods } from "~/utils/stripe.server";

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
      return json({ error: "Only coaches can reactivate subscriptions" }, { status: 403 });
    }

    // Parse request body
    const { subscriptionId, clientId } = await request.json();

    if (!subscriptionId || !clientId) {
      return json({ error: "Missing subscriptionId or clientId" }, { status: 400 });
    }

    // Verify client belongs to this coach
    let { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, email, stripe_customer_id")
      .eq("slug", clientId)
      .eq("coach_id", coachUser.id)
      .single();
    
    if (!client || clientError) {
      const { data: clientById } = await supabase
        .from("users")
        .select("id, email, stripe_customer_id")
        .eq("id", clientId)
        .eq("coach_id", coachUser.id)
        .single();
      client = clientById;
    }

    if (!client) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    if (!client.stripe_customer_id) {
      return json({ error: "Client has no Stripe customer ID" }, { status: 400 });
    }

    // Retrieve the existing subscription
    const existingSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product', 'latest_invoice'],
    });

    // Verify this subscription belongs to the client
    if (existingSubscription.customer !== client.stripe_customer_id) {
      return json({ error: "Subscription does not belong to this client" }, { status: 403 });
    }

    // Check if subscription is expired
    if (existingSubscription.status !== 'incomplete_expired') {
      return json({ 
        error: `Subscription is not expired. Current status: ${existingSubscription.status}` 
      }, { status: 400 });
    }

    // Get the price ID and billing cycle anchor from the existing subscription
    const priceId = existingSubscription.items.data[0]?.price.id;
    if (!priceId) {
      return json({ error: "Could not find price ID for subscription" }, { status: 400 });
    }

    const billingCycleAnchor = (existingSubscription as any).billing_cycle_anchor;
    const metadata = existingSubscription.metadata || {};

    // Get payment methods for the customer
    const paymentMethods = await listPaymentMethods(client.stripe_customer_id);
    const customer = await stripe.customers.retrieve(client.stripe_customer_id);
    const defaultPaymentMethodId = 
      (customer as any).invoice_settings?.default_payment_method ||
      paymentMethods.data[0]?.id;

    if (!defaultPaymentMethodId) {
      return json({ error: "Client has no payment method on file" }, { status: 400 });
    }

    // Create a new subscription with the same details
    // We can't reactivate an incomplete_expired subscription, so we create a new one
    const subscriptionParams: any = {
      customer: client.stripe_customer_id,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice", "latest_invoice.payment_intent"],
      proration_behavior: "none",
      default_payment_method: defaultPaymentMethodId,
      metadata: {
        ...metadata,
        userId: client.id,
        createdVia: "subscription_reactivation",
        reactivatedFrom: subscriptionId,
      },
    };

    // Preserve the billing cycle anchor if it exists
    if (billingCycleAnchor) {
      subscriptionParams.billing_cycle_anchor = billingCycleAnchor;
    }

    // Create the new subscription
    const newSubscription = await stripe.subscriptions.create(subscriptionParams);

    // Attempt to pay immediately if not future-dated
    const isFutureDated = billingCycleAnchor !== undefined && billingCycleAnchor > Math.floor(Date.now() / 1000);
    const invoice = newSubscription.latest_invoice;

    if (!isFutureDated && invoice && typeof invoice === 'object' && 'id' in invoice) {
      const invoiceId = typeof invoice.id === 'string' ? invoice.id : (invoice as any).id;
      
      try {
        // Small delay to ensure invoice is processed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const invoiceObj = await stripe.invoices.retrieve(invoiceId, {
          expand: ['payment_intent'],
        });
        
        if (invoiceObj.status === 'draft') {
          await stripe.invoices.finalizeInvoice(invoiceId, {
            auto_advance: true,
          });
          const finalizedInvoice = await stripe.invoices.retrieve(invoiceId);
          
          if (finalizedInvoice.status === 'open' && defaultPaymentMethodId) {
            try {
              await stripe.invoices.pay(invoiceId, {
                payment_method: defaultPaymentMethodId,
                off_session: true,
              });
              
              // Re-fetch subscription to get updated status
              const updatedSubscription = await stripe.subscriptions.retrieve(newSubscription.id);
              
              return json({
                success: true,
                subscription: updatedSubscription,
                message: "Subscription reactivated and payment processed successfully",
              });
            } catch (payError: any) {
              // Payment failed, but subscription was created
              console.error(`[API] Failed to pay invoice during reactivation:`, payError.message);
              return json({
                success: true,
                subscription: newSubscription,
                message: "Subscription reactivated. Payment will be retried automatically.",
                paymentPending: true,
              });
            }
          }
        } else if (invoiceObj.status === 'open' && defaultPaymentMethodId) {
          try {
            await stripe.invoices.pay(invoiceId, {
              payment_method: defaultPaymentMethodId,
              off_session: true,
            });
            
            const updatedSubscription = await stripe.subscriptions.retrieve(newSubscription.id);
            return json({
              success: true,
              subscription: updatedSubscription,
              message: "Subscription reactivated and payment processed successfully",
            });
          } catch (payError: any) {
            console.error(`[API] Failed to pay open invoice during reactivation:`, payError.message);
            return json({
              success: true,
              subscription: newSubscription,
              message: "Subscription reactivated. Payment will be retried automatically.",
              paymentPending: true,
            });
          }
        }
      } catch (invoiceError) {
        console.error("[API] Error handling invoice during reactivation:", invoiceError);
      }
    }

    // Return the new subscription (may be incomplete if payment failed)
    return json({
      success: true,
      subscription: newSubscription,
      message: isFutureDated
        ? "Subscription reactivated. Payment will be processed on the scheduled date."
        : "Subscription reactivated. Payment will be retried automatically.",
    });
  } catch (error: any) {
    console.error("Error reactivating subscription:", error);
    const errorMessage = error?.message || error?.toString() || "Internal server error";
    return json(
      { error: errorMessage, success: false },
      { status: 500 }
    );
  }
}

