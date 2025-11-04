import Stripe from "stripe";
import { createClient } from '@supabase/supabase-js';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
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

// Create a subscription for a user with immediate billing
export async function createStripeSubscription({ customerId, priceId, paymentMethodId, userId }: { customerId: string; priceId: string; paymentMethodId?: string; userId?: string }) {
  // Get the price details
  const price = await stripe.prices.retrieve(priceId);
  
  const monthlyAmount = price.unit_amount || 0;
  
  console.log(`[SUBSCRIPTION] Creating subscription with immediate full payment (no proration):`);
  console.log(`  Monthly amount: $${(monthlyAmount / 100).toFixed(2)}`);
  console.log(`  Billing cycle: Starts immediately, renews monthly on signup date`);
  
  // Create subscription with immediate payment and user metadata
  // Let Stripe handle the billing cycle naturally based on signup date
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete', // This ensures immediate payment attempt
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice', 'latest_invoice.payment_intent'],
    // No billing_cycle_anchor - Stripe will use signup date as the billing anchor
    proration_behavior: 'none', // No proration - charge full monthly amount
    metadata: {
      userId: userId || 'unknown',
      createdVia: 'api'
    },
    ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
  });
  
  console.log(`[SUBSCRIPTION] Created subscription: ${subscription.id}`);
  console.log(`[SUBSCRIPTION] Status: ${subscription.status}`);
  
  // Type assertion to access subscription properties
  const subscriptionData = subscription as any;
  console.log(`[SUBSCRIPTION] Current period start: ${new Date(subscriptionData.current_period_start * 1000).toISOString()}`);
  console.log(`[SUBSCRIPTION] Current period end: ${new Date(subscriptionData.current_period_end * 1000).toISOString()}`);
  console.log(`[SUBSCRIPTION] Next billing date: ${new Date(subscriptionData.current_period_end * 1000).toISOString()}`);
  
  // The subscription will automatically attempt to charge the payment method
  // If successful, it will be marked as 'active'
  // If it fails, it will be marked as 'incomplete' and Stripe will retry
  // Future billing will occur on the same date each month (subscription timeline)
  
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

// Helper function to handle existing clients who were charged prorated amounts
export async function addProratedBalanceToNextInvoice(customerId: string, subscriptionId: string) {
  try {
    // Get the subscription to find the price and billing cycle
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const price = await stripe.prices.retrieve(subscription.items.data[0].price.id);
    
    // Calculate what the full monthly amount should have been
    const fullMonthlyAmount = price.unit_amount || 0;
    
    // Get the latest invoice to see what was actually charged
    const invoices = await stripe.invoices.list({ 
      customer: customerId, 
      subscription: subscriptionId,
      limit: 1 
    });
    
    if (invoices.data.length === 0) {
      console.log(`[PRORATION_FIX] No invoices found for subscription ${subscriptionId}`);
      return;
    }
    
    const latestInvoice = invoices.data[0];
    const actualAmountCharged = latestInvoice.amount_paid;
    
    // Calculate the difference (what should have been charged vs what was charged)
    const proratedDifference = fullMonthlyAmount - actualAmountCharged;
    
    if (proratedDifference <= 0) {
      console.log(`[PRORATION_FIX] No prorated difference found for subscription ${subscriptionId}`);
      return;
    }
    
    console.log(`[PRORATION_FIX] Adding prorated balance to next invoice:`);
    console.log(`  Full monthly amount: $${(fullMonthlyAmount / 100).toFixed(2)}`);
    console.log(`  Actual amount charged: $${(actualAmountCharged / 100).toFixed(2)}`);
    console.log(`  Prorated difference: $${(proratedDifference / 100).toFixed(2)}`);
    
    // Add the prorated difference to the next billing cycle
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: proratedDifference,
      currency: price.currency,
      description: 'Adjustment for prorated first month',
      // This will be charged on the next billing cycle
      period: {
        start: (subscription as any).current_period_end,
        end: (subscription as any).current_period_end + (30 * 24 * 60 * 60), // 30 days from current period end
      },
    });
    
    console.log(`[PRORATION_FIX] Successfully added prorated balance to next invoice for subscription ${subscriptionId}`);
    
  } catch (error) {
    console.error(`[PRORATION_FIX] Failed to add prorated balance:`, error);
    throw error;
  }
}

// Function to find and fix all prorated subscriptions
export async function fixAllProratedSubscriptions() {
  try {
    console.log('[PRORATION_FIX] Starting to fix all prorated subscriptions...');
    
    // Get all active subscriptions
    const subscriptions = await stripe.subscriptions.list({ 
      status: 'active',
      limit: 100 
    });
    
    let fixedCount = 0;
    
    for (const subscription of subscriptions.data) {
      try {
        // Check if this subscription was created before the proration fix
        const createdAt = subscription.created;
        const prorationFixDate = new Date('2025-01-27').getTime() / 1000; // Today's date
        
        if (createdAt < prorationFixDate) {
          console.log(`[PRORATION_FIX] Checking subscription ${subscription.id} created at ${new Date(createdAt * 1000).toISOString()}`);
          
          // Get the latest invoice to check if it was prorated
          const invoices = await stripe.invoices.list({ 
            customer: subscription.customer as string, 
            subscription: subscription.id,
            limit: 1 
          });
          
          if (invoices.data.length > 0) {
            const latestInvoice = invoices.data[0];
            const price = await stripe.prices.retrieve(subscription.items.data[0].price.id);
            const fullMonthlyAmount = price.unit_amount || 0;
            const actualAmountCharged = latestInvoice.amount_paid;
            
            // If the amount charged is less than the full monthly amount, it was prorated
            if (actualAmountCharged < fullMonthlyAmount) {
              console.log(`[PRORATION_FIX] Found prorated subscription: ${subscription.id}`);
              await addProratedBalanceToNextInvoice(subscription.customer as string, subscription.id);
              fixedCount++;
            }
          }
        }
      } catch (error) {
        console.error(`[PRORATION_FIX] Error processing subscription ${subscription.id}:`, error);
      }
    }
    
    console.log(`[PRORATION_FIX] Completed! Fixed ${fixedCount} prorated subscriptions.`);
    return fixedCount;
    
  } catch (error) {
    console.error('[PRORATION_FIX] Failed to fix prorated subscriptions:', error);
    throw error;
  }
}
