// Usage: node scripts/backfill-stripe-customer.cjs
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
      .select('id, email, stripe_customer_id')
      .limit(1)
      .single();
    if (error || !user) throw new Error('User not found');
    if (user.stripe_customer_id) {
      console.log('User already has a stripe_customer_id:', user.stripe_customer_id);
      return;
    }
    // 2. Create Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    // 3. Update user record
    const { error: updateError } = await supabase
      .from('users')
      .update({ stripe_customer_id: customer.id })
      .eq('id', user.id);
    if (updateError) throw new Error('Failed to update user with stripe_customer_id');
    console.log('Backfilled stripe_customer_id for user:', user.id, '->', customer.id);
  } catch (err) {
    console.error('Error backfilling stripe_customer_id:', err);
    process.exit(1);
  }
})(); 