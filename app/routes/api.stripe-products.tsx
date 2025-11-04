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

    // Get all clients for this coach with their names
    const { data: clients } = await supabase
      .from("users")
      .select("id, name, stripe_customer_id")
      .eq("coach_id", user.id)
      .eq("role", "client");

    const totalClients = (clients || []).length;
    const clientsWithStripeIds = (clients || []).filter((c) => c.stripe_customer_id).length;

    // Create a map of stripe_customer_id to client name
    const customerIdToClientName: Record<string, string> = {};
    (clients || []).forEach((client) => {
      if (client.stripe_customer_id) {
        customerIdToClientName[client.stripe_customer_id] = client.name;
      }
    });

    // Get stripe customer IDs for this coach's clients
    const coachClientCustomerIds = (clients || [])
      .map((c) => c.stripe_customer_id)
      .filter((id): id is string => id !== null && id !== undefined);

    // Get all products with their prices (both active and inactive)
    const products = await stripe.products.list({ limit: 100 });
    const prices = await stripe.prices.list({ limit: 100 });

    // Get all subscriptions for this coach's clients (all statuses for debugging)
    const allSubscriptions = await stripe.subscriptions.list({ 
      limit: 100 
    });

    // Filter subscriptions to only include this coach's clients
    const subscriptions = {
      ...allSubscriptions,
      data: allSubscriptions.data.filter((sub) => 
        typeof sub.customer === 'string' 
          ? coachClientCustomerIds.includes(sub.customer)
          : coachClientCustomerIds.includes(sub.customer.id)
      ),
    };

    // Count subscriptions by status for debugging
    const subscriptionsByStatus: Record<string, number> = {};
    subscriptions.data.forEach((sub) => {
      subscriptionsByStatus[sub.status] = (subscriptionsByStatus[sub.status] || 0) + 1;
    });

    // Filter to only active subscriptions for counting
    const activeSubscriptions = subscriptions.data.filter((sub) => sub.status === 'active');

    // Count active subscriptions per price ID and collect client names
    const subscriptionCountsByPriceId: Record<string, number> = {};
    const clientsByPriceId: Record<string, string[]> = {};
    
    activeSubscriptions.forEach((sub) => {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const clientName = customerIdToClientName[customerId];
      
      if (clientName) {
        sub.items.data.forEach((item) => {
          const priceId = item.price.id;
          subscriptionCountsByPriceId[priceId] = (subscriptionCountsByPriceId[priceId] || 0) + 1;
          
          if (!clientsByPriceId[priceId]) {
            clientsByPriceId[priceId] = [];
          }
          // Avoid duplicates
          if (!clientsByPriceId[priceId].includes(clientName)) {
            clientsByPriceId[priceId].push(clientName);
          }
        });
      }
    });

    // Combine products with their prices and subscription counts
    const productsWithPrices = products.data.map((product) => {
      const productPrices = prices.data.filter((price) => price.product === product.id);
      // Count total active clients for this product (sum across all prices)
      // Also collect all unique client names for this product
      const productClientNames: string[] = [];
      const totalActiveClients = productPrices.reduce((sum, price) => {
        const priceClients = clientsByPriceId[price.id] || [];
        priceClients.forEach((name) => {
          if (!productClientNames.includes(name)) {
            productClientNames.push(name);
          }
        });
        return sum + (subscriptionCountsByPriceId[price.id] || 0);
      }, 0);
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        created: product.created,
        images: product.images,
        metadata: product.metadata,
        activeClients: totalActiveClients,
        clientNames: productClientNames.sort(),
        prices: productPrices.map((price) => ({
          id: price.id,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
          interval_count: price.recurring?.interval_count,
          active: price.active,
          activeClients: subscriptionCountsByPriceId[price.id] || 0,
          clientNames: (clientsByPriceId[price.id] || []).sort(),
        })),
      };
    });

    // Calculate total monthly recurring revenue (MRR) from active subscriptions only
    let totalMonthlyRevenue = 0;
    activeSubscriptions.forEach((sub) => {
      sub.items.data.forEach((item) => {
        const price = item.price;
        if (price.unit_amount && price.recurring) {
          const amount = price.unit_amount;
          const interval = price.recurring.interval;
          const intervalCount = price.recurring.interval_count || 1;
          
          // Convert to monthly equivalent
          if (interval === 'month') {
            totalMonthlyRevenue += amount / intervalCount;
          } else if (interval === 'year') {
            totalMonthlyRevenue += (amount / intervalCount) / 12;
          } else if (interval === 'week') {
            totalMonthlyRevenue += (amount / intervalCount) * 4.33; // ~4.33 weeks per month
          } else if (interval === 'day') {
            totalMonthlyRevenue += (amount / intervalCount) * 30; // ~30 days per month
          }
        }
      });
    });

    return json({ 
      products: productsWithPrices,
      totalMonthlyRevenue: Math.round(totalMonthlyRevenue),
      // Debug info
      debug: {
        totalClients,
        clientsWithStripeIds,
        totalSubscriptions: subscriptions.data.length,
        activeSubscriptions: activeSubscriptions.length,
        subscriptionsByStatus,
      },
    });
  } catch (error) {
    console.error("Error fetching Stripe products:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

