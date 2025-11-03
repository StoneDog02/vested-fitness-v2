import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/lib/supabase';
import Stripe from 'stripe';

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Authenticate user
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
    // Get user and Stripe customer ID
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase
      .from('users')
      .select('id, stripe_customer_id')
      .eq('auth_id', authId)
      .single();
    if (!user || !user.stripe_customer_id) {
      return json({ error: 'Stripe customer not found' }, { status: 404 });
    }
    const customerId = user.stripe_customer_id;
    // Find latest open invoice
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' });
    const invoices = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 });
    if (!invoices.data.length) {
      return json({ error: 'No open invoices to pay.' }, { status: 400 });
    }
    const invoice = invoices.data[0];
    // Attempt to pay the invoice
    if (!invoice.id || typeof invoice.id !== 'string') {
      return json({ error: 'Invalid invoice ID.' }, { status: 400 });
    }
    try {
      const payResult = await stripe.invoices.pay(invoice.id);
      if (payResult.status === 'paid') {
        return json({ success: true, status: 'paid' });
      } else {
        return json({ error: `Invoice payment status: ${payResult.status}` }, { status: 400 });
      }
    } catch (err: any) {
      return json({ error: err.message || 'Stripe payment error', details: err }, { status: 400 });
    }
  } catch (error: any) {
    return json({ error: error.message || 'Internal server error', details: error }, { status: 500 });
  }
}; 