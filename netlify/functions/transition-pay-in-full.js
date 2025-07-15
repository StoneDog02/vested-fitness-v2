/* eslint-env node */
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { Resend } = require('resend');
const dayjs = require('dayjs');
require('dayjs/plugin/utc');
require('dayjs/plugin/timezone');

dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-06-30.basil' });
const resend = new Resend(process.env.RESEND_API_KEY);

const SENDER_EMAIL = 'noreply@kavatraining.com';
const PREMIUM_PRODUCT_NAME = 'PREMIUM';
const NOTIFY_DAYS_BEFORE = 7;

async function getPremiumPriceId() {
  const prices = await stripe.prices.list({ active: true, expand: ['data.product'] });
  const premium = prices.data.find(
    (price) => typeof price.product === 'object' && price.product && price.product.name === PREMIUM_PRODUCT_NAME
  );
  if (!premium) throw new Error('PREMIUM monthly plan price not found');
  return premium.id;
}

async function sendNotification(email, name, endDate) {
  const formattedDate = dayjs(endDate).tz('America/Denver').format('MMMM D, YYYY');
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: 'Your Kava Training plan is about to renew',
    html: `<p>Hi${name ? ' ' + name : ''},</p><p>Your 4-month Kava Training plan will automatically renew to a monthly subscription on <b>${formattedDate}</b>. If you have any questions or wish to make changes, please contact support before this date.</p><p>Thank you!</p>`
  });
  console.log(`Notification sent to ${email}`);
}

async function createMonthlySubscription(stripeCustomerId, priceId) {
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent']
  });
  return subscription.id;
}

exports.handler = async function () {
  try {
    const today = dayjs().tz('America/Denver');
    const notifyDate = today.add(NOTIFY_DAYS_BEFORE, 'day').startOf('day');
    const { data: subs, error } = await supabase
      .from('pay_in_full_subscriptions')
      .select('id, user_id, end_date, transitioned_to_monthly')
      .eq('transitioned_to_monthly', false);
    if (error) throw error;
    if (!subs || subs.length === 0) {
      console.log('No pay-in-full subscriptions to process.');
      return { statusCode: 200, body: 'No subscriptions to process.' };
    }
    const premiumPriceId = await getPremiumPriceId();
    for (const sub of subs) {
      const endDate = dayjs(sub.end_date).tz('America/Denver');
      // Fetch user info
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, name, stripe_customer_id')
        .eq('id', sub.user_id)
        .single();
      if (userError || !user) {
        console.error(`User not found for subscription ${sub.id}`);
        continue;
      }
      // 1. Send notification if 7 days before end_date
      if (endDate.isSame(notifyDate, 'day')) {
        await sendNotification(user.email, user.name, endDate);
      }
      // 2. Transition if end_date has passed
      if (endDate.isBefore(today, 'day')) {
        if (!user.stripe_customer_id) {
          console.error(`User ${user.id} has no stripe_customer_id, cannot create subscription.`);
          continue;
        }
        try {
          const newSubId = await createMonthlySubscription(user.stripe_customer_id, premiumPriceId);
          await supabase
            .from('pay_in_full_subscriptions')
            .update({ transitioned_to_monthly: true, updated_at: new Date().toISOString() })
            .eq('id', sub.id);
          console.log(`Transitioned user ${user.id} to monthly subscription (${newSubId})`);
        } catch (err) {
          console.error(`Failed to create monthly subscription for user ${user.id}:`, err);
        }
      }
    }
    return { statusCode: 200, body: 'Transition job completed.' };
  } catch (err) {
    console.error('Error in transition function:', err);
    return { statusCode: 500, body: 'Error in transition function.' };
  }
};

// Schedule: every day at 2am Mountain Time (America/Denver)
exports.schedule = '0 8 * * *'; // 8am UTC = 2am MDT 