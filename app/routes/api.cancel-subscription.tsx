import { json, type ActionFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { resetPaymentFailedAttempts, stripe } from "~/utils/stripe.server";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const clientId = formData.get("clientId") as string;

    if (!clientId) {
      return json({ error: "Client ID is required" }, { status: 400 });
    }

    // Get the coach's auth token from cookies
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
        return json({ error: "Authentication required" }, { status: 401 });
      }
    }

    if (!accessToken) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    // Decode the JWT to get the coach's auth ID
    let coachAuthId: string;
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      coachAuthId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : "";
      if (!coachAuthId) {
        return json({ error: "Invalid authentication" }, { status: 401 });
      }
    } catch (e) {
      return json({ error: "Invalid authentication" }, { status: 401 });
    }

    // Create admin client for user operations
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Verify the coach exists and get their ID
    const { data: coach, error: coachError } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("auth_id", coachAuthId)
      .single();

    if (coachError || !coach || coach.role !== "coach") {
      return json({ error: "Coach not found or invalid permissions" }, { status: 403 });
    }

    // Get the client and verify they belong to this coach
    const { data: client, error: clientError } = await supabaseAdmin
      .from("users")
      .select("id, name, email, status, coach_id, stripe_customer_id")
      .eq("id", clientId)
      .eq("coach_id", coach.id)
      .single();

    if (clientError || !client) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    // Cancel all active subscriptions in Stripe
    if (client.stripe_customer_id) {
      try {
        // Get all subscriptions for this customer
        const allSubscriptions = await stripe.subscriptions.list({
          customer: client.stripe_customer_id,
          limit: 100,
        });

        // Filter to get subscriptions that should be cancelled (active, trialing, past_due, incomplete)
        const subscriptionsToCancel = allSubscriptions.data.filter(
          (sub) =>
            sub.status === "active" ||
            sub.status === "trialing" ||
            sub.status === "past_due" ||
            sub.status === "incomplete"
        );

        // Cancel each subscription
        for (const subscription of subscriptionsToCancel) {
          try {
            await stripe.subscriptions.cancel(subscription.id, {
              cancellation_details: {
                comment: "Subscription cancelled by coach",
                feedback: "other",
              },
            });
            console.log(`[CANCEL_SUBSCRIPTION] Cancelled Stripe subscription: ${subscription.id}`);
          } catch (cancelError) {
            console.error(
              `[CANCEL_SUBSCRIPTION] Error cancelling subscription ${subscription.id}:`,
              cancelError
            );
            // Continue with other subscriptions even if one fails
          }
        }

        // Update recurring_subscriptions table for all subscriptions
        for (const subscription of allSubscriptions.data) {
          try {
            const { error: updateError } = await supabaseAdmin
              .from("recurring_subscriptions")
              .update({
                status: "canceled",
                updated_at: new Date().toISOString(),
              })
              .eq("stripe_subscription_id", subscription.id);

            if (updateError) {
              console.error(
                `[CANCEL_SUBSCRIPTION] Error updating subscription ${subscription.id} in database:`,
                updateError
              );
            }
          } catch (dbError) {
            console.error(
              `[CANCEL_SUBSCRIPTION] Error updating subscription in database:`,
              dbError
            );
          }
        }

        // Clear payment_required so the client can still access the app (no active subscription to pay)
        try {
          await resetPaymentFailedAttempts(client.stripe_customer_id);
          console.log(`[CANCEL_SUBSCRIPTION] Cleared access_status and payment_failed_attempts for client ${client.id}`);
        } catch (resetError) {
          console.error("[CANCEL_SUBSCRIPTION] Error clearing client access status:", resetError);
          // Don't fail the request; subscription was already cancelled
        }
      } catch (stripeError) {
        console.error("[CANCEL_SUBSCRIPTION] Error handling Stripe subscriptions:", stripeError);
        return json({ error: "Failed to cancel subscriptions" }, { status: 500 });
      }
    } else {
      return json({ error: "Client has no Stripe customer ID" }, { status: 400 });
    }

    return json({
      success: true,
      message: `Subscription for ${client.name} has been cancelled. The client remains active and can still access the app.`,
    });
  } catch (error) {
    console.error("[CANCEL_SUBSCRIPTION] Subscription cancellation error:", error);
    return json({ error: "Failed to cancel subscription" }, { status: 500 });
  }
};

