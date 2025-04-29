import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-03-31.basil",
  typescript: true,
});

export async function createStripeCustomer(email: string, name: string) {
  return stripe.customers.create({
    email,
    name,
  });
}

export async function createSubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function createPaymentIntent(
  amount: number,
  currency: string = "usd"
) {
  return stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: {
      enabled: true,
    },
  });
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function listPaymentMethods(customerId: string) {
  return stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });
}

export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string
) {
  return stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
}

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
) {
  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}
