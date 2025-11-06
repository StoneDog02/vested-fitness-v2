import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { getSubscriptionInfo, listPaymentMethods, stripe } from "~/utils/stripe.server";
import type Stripe from "stripe";

export async function loader({ request }: LoaderFunctionArgs) {
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
      return json({ error: "Only coaches can access this" }, { status: 403 });
    }

    // Get clientId from query params
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      return json({ error: "Missing clientId" }, { status: 400 });
    }

    // Verify client belongs to this coach
    const { data: client } = await supabase
      .from("users")
      .select("id, name, email, stripe_customer_id")
      .eq("id", clientId)
      .eq("coach_id", coachUser.id)
      .single();

    if (!client) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    // Fetch subscription info if customer exists
    let subscription = null;
    let paymentMethods: any[] = [];
    
    if (client.stripe_customer_id) {
      try {
        subscription = await getSubscriptionInfo(client.stripe_customer_id);
        // subscription might be null if no active subscription exists - that's ok
        
        // Fetch attached payment methods
        const pmList = await listPaymentMethods(client.stripe_customer_id);
        paymentMethods = pmList.data || [];
        
        // Also check for default payment method set on customer
        // This is important because Stripe can have a default payment method
        // that's not explicitly attached (e.g., saved during setup)
        const customer = await stripe.customers.retrieve(client.stripe_customer_id);
        if (customer && !customer.deleted) {
          const defaultPaymentMethodId = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
          
          if (defaultPaymentMethodId && typeof defaultPaymentMethodId === 'string') {
            // Check if this payment method is already in our list
            const alreadyInList = paymentMethods.some(pm => pm.id === defaultPaymentMethodId);
            
            if (!alreadyInList) {
              // Fetch the default payment method and add it to the list
              try {
                const defaultPm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);
                if (defaultPm) {
                  paymentMethods.push(defaultPm);
                }
              } catch (pmError) {
                // If we can't retrieve the payment method, that's ok
                // It might have been deleted or is invalid
                console.log(`Could not retrieve default payment method ${defaultPaymentMethodId}:`, pmError);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching subscription info:", error);
        // Continue with null subscription and empty payment methods
        // This handles cases where Stripe API fails but client exists
        subscription = null;
        paymentMethods = [];
      }
    }
    // If no stripe_customer_id, subscription and paymentMethods remain null/empty - that's ok

    // Always return 200 OK with valid data structure for valid clients
    return json({
      subscription,
      paymentMethods,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        stripe_customer_id: client.stripe_customer_id,
      },
    });
  } catch (error) {
    console.error("Error in client-subscription-info loader:", error);
    // Only return error status for actual errors (auth, etc.)
    // For other errors, return 200 OK with null values to prevent breaking the UI
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    return json({
      subscription: null,
      paymentMethods: [],
      client: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

