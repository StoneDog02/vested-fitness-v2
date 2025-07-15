import Stripe from "stripe";
import { createClient } from '@supabase/supabase-js';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-06-30.basil',
  typescript: true,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Create or fetch a Stripe customer for a user
export async function getOrCreateStripeCustomer({ userId, email }: { userId: string; email: string }) {
  // Fetch user from Supabase
  const { data: user, error } = await supabase
    .from('users')
    .select('id, stripe_customer_id')
    .eq('id', userId)
    .single();
  if (error || !user) throw new Error('User not found');
  if (user.stripe_customer_id) {
    // Already has a Stripe customer
    return user.stripe_customer_id;
  }
  // Create Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  // Save to Supabase
  await supabase
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);
  return customer.id;
}

// Create a subscription for a user
export async function createStripeSubscription({ customerId, priceId, paymentMethodId }: { customerId: string; priceId: string; paymentMethodId?: string }) {
  // Calculate the last day of the current month (UTC)
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const lastDayTimestamp = Math.floor(lastDay.getTime() / 1000);
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice', 'latest_invoice.payment_intent'],
    billing_cycle_anchor: lastDayTimestamp,
    proration_behavior: 'create_prorations',
    ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
  });
  return subscription;
}

// Attach a payment method to a customer
export async function attachPaymentMethod({ customerId, paymentMethodId }: { customerId: string; paymentMethodId: string }) {
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
}

// Detach a payment method
export async function detachPaymentMethod(paymentMethodId: string) {
  await stripe.paymentMethods.detach(paymentMethodId);
}

// Fetch subscription info
export async function getSubscriptionInfo(customerId: string) {
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 1 });
  const subscription = subscriptions.data[0] || null;
  if (
    subscription &&
    typeof subscription === "object" &&
    subscription !== null &&
    Object.prototype.hasOwnProperty.call(subscription, "plan") &&
    (subscription as any).plan &&
    Object.prototype.hasOwnProperty.call((subscription as any).plan, "product") &&
    (subscription as any).plan.product
  ) {
    try {
      const product = await stripe.products.retrieve((subscription as any).plan.product as string);
      return { ...subscription, productName: (product as Stripe.Product).name };
    } catch (e) {
      return subscription;
    }
  }
  return subscription;
}

// Fetch billing history (invoices)
export async function getBillingHistory(customerId: string) {
  const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 });
  return invoices.data;
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

// Update payment_failed_attempts and access_status for a user by stripe_customer_id
export async function incrementPaymentFailedAttempts(stripeCustomerId: string) {
  // Get user by stripe_customer_id
  const { data: user, error } = await supabase
    .from('users')
    .select('id, payment_failed_attempts')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();
  if (error || !user) throw new Error('User not found');
  const newAttempts = (user.payment_failed_attempts || 0) + 1;
  let access_status = undefined;
  if (newAttempts >= 3) {
    access_status = 'payment_required';
  }
  const { error: updateError } = await supabase
    .from('users')
    .update({ payment_failed_attempts: newAttempts, ...(access_status ? { access_status } : {}) })
    .eq('id', user.id);
  if (updateError) throw new Error('Failed to update user payment attempts');
  return { newAttempts, access_status };
}

export async function resetPaymentFailedAttempts(stripeCustomerId: string) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();
  if (error || !user) throw new Error('User not found');
  const { error: updateError } = await supabase
    .from('users')
    .update({ payment_failed_attempts: 0, access_status: 'active' })
    .eq('id', user.id);
  if (updateError) throw new Error('Failed to reset user payment attempts');
  return true;
}

export async function setAccessStatus(stripeCustomerId: string, status: string) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();
  if (error || !user) throw new Error('User not found');
  const { error: updateError } = await supabase
    .from('users')
    .update({ access_status: status })
    .eq('id', user.id);
  if (updateError) throw new Error('Failed to update user access status');
  return true;
}

// Fetch the current open invoice for a customer
export async function getCurrentOpenInvoice(customerId: string) {
  const invoices = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 });
  return invoices.data[0] || null;
}
