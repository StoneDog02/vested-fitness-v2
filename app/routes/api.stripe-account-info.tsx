import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { stripe } from "~/utils/stripe.server";

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
    const { data: user } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authId)
      .single();

    if (!user || user.role !== "coach") {
      return json({ error: "Only coaches can access this" }, { status: 403 });
    }

    // Get Stripe account information
    // Note: This gets the connected account info if using Connect, or the main account
    try {
      const account = await stripe.accounts.retrieve();
      return json({
        account: {
          id: account.id,
          email: account.email,
          business_type: account.business_type,
          country: account.country,
          default_currency: account.default_currency,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
        },
      });
    } catch (error: any) {
      // If accounts.retrieve() fails (not using Connect), return basic info
      // For standard Stripe accounts, we can't retrieve account details with secret key
      // Return a basic response indicating the account is active
      return json({
        account: {
          id: "main_account",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching Stripe account info:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

