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
      return json({ error: "Only coaches can create products" }, { status: 403 });
    }

    // Parse request body
    const {
      name,
      description,
      amount,
      currency = "usd",
      interval = "month",
      intervalCount = 1,
    } = await request.json();

    if (!name || !amount) {
      return json({ error: "Name and amount are required" }, { status: 400 });
    }

    // Convert amount to cents (Stripe uses cents)
    const amountInCents = Math.round(parseFloat(amount) * 100);

    if (amountInCents <= 0) {
      return json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    // Create product
    const product = await stripe.products.create({
      name,
      description: description || undefined,
      active: true,
    });

    // Create price for the product
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountInCents,
      currency,
      recurring: {
        interval: interval as "day" | "week" | "month" | "year",
        interval_count: intervalCount,
      },
      active: true,
    });

    return json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
      },
      price: {
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
      },
      message: "Product created successfully",
    });
  } catch (error: any) {
    console.error("Error creating Stripe product:", error);
    return json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

