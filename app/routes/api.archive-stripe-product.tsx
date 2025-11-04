import { json, type ActionFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { stripe } from "~/utils/stripe.server";

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
    const { data: user } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authId)
      .single();

    if (!user || user.role !== "coach") {
      return json({ error: "Only coaches can archive products" }, { status: 403 });
    }

    // Parse request body
    const { productId, archive } = await request.json();

    if (!productId) {
      return json({ error: "Missing productId" }, { status: 400 });
    }

    // Archive or unarchive the product (set active: false/true)
    const product = await stripe.products.update(productId, {
      active: archive === false ? true : false,
    });

    // Also archive/unarchive all associated prices
    const prices = await stripe.prices.list({ product: productId, limit: 100 });
    await Promise.all(
      prices.data.map((price) =>
        stripe.prices.update(price.id, {
          active: archive === false ? true : false,
        })
      )
    );

    return json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        active: product.active,
      },
      message: product.active ? "Product activated successfully" : "Product archived successfully",
    });
  } catch (error: any) {
    console.error("Error archiving Stripe product:", error);
    return json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

