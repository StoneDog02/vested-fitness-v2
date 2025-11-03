import { json } from "@remix-run/node";
import Stripe from "stripe";

export const loader = async () => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-04-30.basil" });
    const prices = await stripe.prices.list({ active: true, expand: ["data.product"] });
    return json({
      plans: prices.data.map(price => {
        let name = "Unknown Plan";
        if (typeof price.product === "object" && price.product && !('deleted' in price.product && price.product.deleted)) {
          name = price.product.name;
        }
        return {
          id: price.id,
          name,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
        };
      }),
    });
  } catch (error) {
    console.error("Stripe plans API error:", error);
    return new Response("Stripe plans API error", { status: 500 });
  }
}; 