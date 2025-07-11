// Usage: node scripts/update-subscription-anchor.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-06-30.basil' });

(async () => {
  try {
    // 1. Fetch the only user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, stripe_customer_id, email')
      .limit(1)
      .single();
    if (error || !user) throw new Error('User not found');
    if (!user.stripe_customer_id) throw new Error('User has no Stripe customer ID');

    // 2. Find their active subscription
    const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, limit: 1 });
    if (!subs.data.length) throw new Error('No subscription found for user');
    const subscription = subs.data[0];
    console.log('Current subscription:', subscription.id, 'Current anchor:', subscription.billing_cycle_anchor);

    // 3. Calculate the last day of the current month (UTC)
    const now = new Date();
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const lastDayTimestamp = Math.floor(lastDay.getTime() / 1000);

    // 4. Update the subscription
    const updated = await stripe.subscriptions.update(subscription.id, {
      billing_cycle_anchor: lastDayTimestamp,
      proration_behavior: 'create_prorations',
    });
    console.log('Updated subscription:', updated.id, 'New anchor:', updated.billing_cycle_anchor);
    console.log('Success!');
  } catch (err) {
    console.error('Error updating subscription anchor:', err);
    process.exit(1);
  }
})(); 