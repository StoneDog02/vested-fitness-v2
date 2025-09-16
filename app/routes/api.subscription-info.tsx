import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import { extractAuthFromCookie } from "~/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { getBillingHistory, getCurrentOpenInvoice } from "~/utils/stripe.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const cookies = parse(request.headers.get("cookie") || "");
    const { accessToken } = extractAuthFromCookie(cookies);
    if (!accessToken) return json({ error: "unauthorized" }, { status: 401 });

    // Decode JWT minimally to get auth id (sub)
    const parts = accessToken.split(".");
    if (parts.length !== 3) return json({ error: "invalid token" }, { status: 401 });
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    const authId = payload?.sub as string | undefined;
    if (!authId) return json({ error: "invalid token" }, { status: 401 });

    const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: user } = await supabase
      .from("users")
      .select("id, stripe_customer_id")
      .eq("auth_id", authId)
      .single();
    if (!user || !user.stripe_customer_id) {
      return json({ billingHistory: [], currentInvoice: null });
    }

    const [billingHistory, currentInvoice] = await Promise.all([
      getBillingHistory(user.stripe_customer_id),
      getCurrentOpenInvoice(user.stripe_customer_id),
    ]);
    return json({ billingHistory, currentInvoice });
  } catch (e) {
    return json({ error: "internal" }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return loader({ request } as unknown as LoaderFunctionArgs);
}