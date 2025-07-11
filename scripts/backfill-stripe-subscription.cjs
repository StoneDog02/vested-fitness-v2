// Usage: node scripts/backfill-stripe-subscription.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-06-30.basil' });

// Set your price ID here
const PRICE_ID = 'price_1RiNciJvda6rmtQRI6KDxRYj';

(async () => {
  try {
    // 1. Fetch the only user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .limit(1)
      .single();
    if (error || !user) throw new Error('User not found');
    if (!user.stripe_customer_id) throw new Error('User has no stripe_customer_id');

    // 2. Calculate the last day of the current month (UTC)
    const now = new Date();
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const lastDayTimestamp = Math.floor(lastDay.getTime() / 1000);

    // 3. Create Stripe subscription with proration and anchor
    const subscription = await stripe.subscriptions.create({
      customer: user.stripe_customer_id,
      items: [{ price: PRICE_ID }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      billing_cycle_anchor: lastDayTimestamp,
      proration_behavior: 'create_prorations',
    });
    console.log('Created subscription:', subscription.id, 'for user:', user.id);

    // 4. Fetch the latest invoice to show the prorated amount
    let invoiceId = subscription.latest_invoice;
    if (invoiceId && typeof invoiceId === 'object') {
      invoiceId = invoiceId.id;
    }
    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      const amount = (invoice.amount_due / 100).toFixed(2);
      const currency = invoice.currency.toUpperCase();
      // Set your full plan price here (in USD)
      const fullPlanPrice = 200.00;
      const isProrated = parseFloat(amount) < fullPlanPrice;
      if (isProrated) {
        console.log(`\nThe first invoice is prorated: $${amount} ${currency}`);
        console.log('This is a prorated charge for the remainder of this month.');
        console.log('The next invoice (on the last day of next month) will be for the full plan price.');
      } else {
        console.log(`\nThe first invoice is $${amount} ${currency} (full price).`);
      }
    }
  } catch (err) {
    console.error('Error creating subscription:', err);
    process.exit(1);
  }
})(); 