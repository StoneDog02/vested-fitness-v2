import {
  loadStripe,
  StripeElements,
  StripeCardElement,
} from "@stripe/stripe-js";

if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  throw new Error(
    "VITE_STRIPE_PUBLISHABLE_KEY is not set in environment variables"
  );
}

export const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
);

export async function confirmPayment(
  clientSecret: string,
  elements: StripeElements
) {
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error("Stripe failed to initialize");
  }
  return stripe.confirmPayment({
    elements,
    clientSecret,
    confirmParams: {
      return_url: `${window.location.origin}/payment/complete`,
    },
  });
}

export async function confirmCardSetup(clientSecret: string) {
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error("Stripe failed to initialize");
  }
  return stripe.confirmCardSetup(clientSecret);
}

export async function createPaymentMethod(cardElement: StripeCardElement) {
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error("Stripe failed to initialize");
  }
  return stripe.createPaymentMethod({
    type: "card",
    card: cardElement,
  });
}
