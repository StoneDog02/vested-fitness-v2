import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer';
import { getOrCreateStripeCustomer, attachPaymentMethod, detachPaymentMethod } from '~/utils/stripe.server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/lib/supabase';
import Stripe from 'stripe';

async function getUserAndCustomerId(request: Request) {
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
    throw new Response('Unauthorized', { status: 401 });
  }
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
    throw new Response('User not found', { status: 404 });
  }
  const customerId = await getOrCreateStripeCustomer({ userId: user.id, email: user.email });
  return { customerId };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { customerId } = await getUserAndCustomerId(request);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' });
    const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    return json({ paymentMethods: paymentMethods.data });
  } catch (error) {
    console.error('Error listing payment methods:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { customerId } = await getUserAndCustomerId(request);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' });
    if (request.method === 'POST') {
      // Add payment method (expects paymentMethodId in body)
      const { paymentMethodId, setAsDefault } = await request.json();
      if (!paymentMethodId) return json({ error: 'Missing paymentMethodId' }, { status: 400 });
      try {
        await attachPaymentMethod({ customerId, paymentMethodId });
        if (setAsDefault) {
          await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
        }
        return json({ success: true });
      } catch (err: any) {
        console.error('[POST] Error attaching payment method:', err);
        return json({ error: err.message || 'Failed to attach payment method', details: err }, { status: 400 });
      }
    } else if (request.method === 'DELETE') {
      // Remove payment method (expects paymentMethodId in body)
      const { paymentMethodId } = await request.json();
      if (!paymentMethodId) return json({ error: 'Missing paymentMethodId' }, { status: 400 });
      await detachPaymentMethod(paymentMethodId);
      return json({ success: true });
    } else if (request.method === 'PATCH') {
      // Set default payment method (expects paymentMethodId in body)
      const { paymentMethodId } = await request.json();
      if (!paymentMethodId) return json({ error: 'Missing paymentMethodId' }, { status: 400 });
      try {
        console.log('[PATCH] Set Default Payment Method:', { customerId, paymentMethodId });
        const result = await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
        console.log('[PATCH] Stripe update result:', result.invoice_settings);
        // Automatically pay the latest open invoice
        const invoices = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 });
        if (invoices.data.length > 0) {
          const invoiceId = invoices.data[0].id;
          if (typeof invoiceId === 'string') {
            try {
              const payResult = await stripe.invoices.pay(invoiceId);
              console.log('[PATCH] Paid invoice:', invoiceId, payResult.status);
            } catch (payErr: any) {
              console.error('[PATCH] Error paying invoice:', payErr);
            }
          }
        }
        return json({ success: true, invoice_settings: result.invoice_settings });
      } catch (err: any) {
        console.error('[PATCH] Stripe error:', err);
        return json({ error: err.message || 'Stripe error', details: err }, { status: 500 });
      }
    } else {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }
  } catch (error) {
    console.error('Error managing payment methods:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 