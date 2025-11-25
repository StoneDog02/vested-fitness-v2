import { json, type ActionFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { getCurrentTimestampISO } from "~/lib/timezone";
import { stripe } from "~/utils/stripe.server";

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

    // Check if client is already inactive
    if (client.status === "inactive") {
      return json({ error: "Client is already inactive" }, { status: 400 });
    }

    // Cancel all active subscriptions in Stripe
    if (client.stripe_customer_id) {
      try {
        // Get all active subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: client.stripe_customer_id,
          status: "active",
          limit: 100,
        });

        // Also check for incomplete, trialing, and past_due subscriptions
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
                comment: "Client deactivated by coach",
                feedback: "other",
              },
            });
            console.log(`[DEACTIVATE] Cancelled Stripe subscription: ${subscription.id}`);
          } catch (cancelError) {
            console.error(
              `[DEACTIVATE] Error cancelling subscription ${subscription.id}:`,
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
                `[DEACTIVATE] Error updating subscription ${subscription.id} in database:`,
                updateError
              );
            }
          } catch (dbError) {
            console.error(
              `[DEACTIVATE] Error updating subscription in database:`,
              dbError
            );
          }
        }
      } catch (stripeError) {
        console.error("[DEACTIVATE] Error handling Stripe subscriptions:", stripeError);
        // Continue with deactivation even if Stripe operations fail
      }
    }

    // Set client status to inactive
    const { error: statusUpdateError } = await supabaseAdmin
      .from("users")
      .update({
        status: "inactive",
        inactive_since: getCurrentTimestampISO(),
      })
      .eq("id", client.id);

    if (statusUpdateError) {
      console.error("[DEACTIVATE] Error updating client status to inactive:", statusUpdateError);
      return json({ error: "Failed to deactivate client" }, { status: 500 });
    }

    return json({
      success: true,
      message: `Client ${client.name} has been deactivated and all subscriptions have been cancelled.`,
    });
  } catch (error) {
    console.error("[DEACTIVATE] Client deactivation error:", error);
    return json({ error: "Failed to deactivate client" }, { status: 500 });
  }
};
