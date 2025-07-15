import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer';
import { getOrCreateStripeCustomer, createStripeSubscription } from '~/utils/stripe.server';
import { stripe } from '~/utils/stripe.server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/lib/supabase';

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Get user from auth cookie
    const cookies = parse(request.headers.get('cookie') || '');
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
    );
    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          'base64'
        ).toString('utf-8');
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch (e) {
        accessToken = undefined;
      }
    }
    let authId: string | undefined;
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
        authId =
          decoded && typeof decoded === 'object' && 'sub' in decoded
            ? (decoded.sub as string)
            : undefined;
      } catch (e) {
        authId = undefined;
      }
    }
    if (!authId) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Get user info from Supabase
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .eq('auth_id', authId)
      .single();
    if (!user) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    // Parse priceId, paymentMethodId, and customerId from request body
    const { priceId, paymentMethodId, customerId: providedCustomerId } = await request.json();
    if (!priceId) {
      return json({ error: 'Missing priceId' }, { status: 400 });
    }
    // Use provided customerId if present, otherwise get or create
    const customerId = providedCustomerId || await getOrCreateStripeCustomer({ userId: user.id, email: user.email });
    // Create subscription with payment method if provided
    const subscription = await createStripeSubscription({ customerId, priceId, paymentMethodId });
    // Get client_secret for payment intent (if present)
    let clientSecret = null;
    let invoice = subscription.latest_invoice;
    if (
      invoice &&
      typeof invoice === 'object' &&
      'payment_intent' in invoice &&
      invoice.payment_intent &&
      typeof invoice.payment_intent === 'object' &&
      'client_secret' in invoice.payment_intent
    ) {
      clientSecret = invoice.payment_intent.client_secret;
    } else if (invoice && typeof invoice === 'object' && 'id' in invoice && typeof invoice.id === 'string') {
      // Fallback: fetch the invoice with expand
      let fetchedInvoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ['payment_intent'],
      });
      const fetchedAny = fetchedInvoice as any;
      if (
        fetchedAny.payment_intent &&
        typeof fetchedAny.payment_intent === 'object' &&
        'client_secret' in fetchedAny.payment_intent
      ) {
        clientSecret = fetchedAny.payment_intent.client_secret;
      } else {
        // Attempt to pay the invoice to trigger PaymentIntent creation
        try {
          await stripe.invoices.pay(invoice.id);
          // Fetch again
          fetchedInvoice = await stripe.invoices.retrieve(invoice.id, {
            expand: ['payment_intent'],
          });
          const fetchedAny2 = fetchedInvoice as any;
          if (
            fetchedAny2.payment_intent &&
            typeof fetchedAny2.payment_intent === 'object' &&
            'client_secret' in fetchedAny2.payment_intent
          ) {
            clientSecret = fetchedAny2.payment_intent.client_secret;
          }
        } catch (err) {
          // It's okay if pay fails (e.g., no payment method), just continue
        }
      }
    }
    return json({ success: true, subscription, clientSecret });
  } catch (error) {
    console.error('Error creating Stripe subscription:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 