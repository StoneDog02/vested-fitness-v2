import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import Stripe from 'stripe';
import { incrementPaymentFailedAttempts, resetPaymentFailedAttempts } from '~/utils/stripe.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-06-30.basil' });
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return json({ error: 'Webhook secret not set' }, { status: 500 });
  }

  let event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Log the event for now
  console.log('Received Stripe webhook event:', event.type, event.id);

  // Handle payment failed and paid events
  if (event.type === 'invoice.payment_failed') {
    const customerId = event.data.object.customer;
    if (typeof customerId === 'string') {
      try {
        const { newAttempts, access_status } = await incrementPaymentFailedAttempts(customerId);
        console.log(`Incremented failed attempts for customer ${customerId}: now ${newAttempts}`);
        if (access_status === 'payment_required') {
          console.log(`Access status set to payment_required for customer ${customerId}`);
        }
      } catch (err) {
        console.error('Failed to increment payment attempts:', err);
      }
    }
  } else if (event.type === 'invoice.paid') {
    const customerId = event.data.object.customer;
    if (typeof customerId === 'string') {
      try {
        await resetPaymentFailedAttempts(customerId);
        console.log(`Reset failed attempts for customer ${customerId}`);
      } catch (err) {
        console.error('Failed to reset payment attempts:', err);
      }
    }
  }

  // TODO: Add logic for handling subscription, invoice, payment events

  return json({ received: true });
}; 