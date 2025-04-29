import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { stripe } from "~/utils/stripe.server";

export async function action({ request }: ActionFunctionArgs) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return json(
      { error: "Missing signature or webhook secret" },
      { status: 400 }
    );
  }

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // Handle different event types
    switch (event.type) {
      case "customer.subscription.created":
        // Handle subscription creation
        break;
      case "customer.subscription.updated":
        // Handle subscription updates
        break;
      case "customer.subscription.deleted":
        // Handle subscription cancellation
        break;
      case "invoice.paid":
        // Handle successful payments
        break;
      case "invoice.payment_failed":
        // Handle failed payments
        break;
    }

    return json({ received: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }
}
