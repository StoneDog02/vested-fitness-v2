import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer';
import { getOrCreateStripeCustomer, getSubscriptionInfo, getBillingHistory, getCurrentOpenInvoice } from '~/utils/stripe.server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/lib/supabase';

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer({ userId: user.id, email: user.email });
    // Fetch subscription info, billing history, and current open invoice
    const subscription = await getSubscriptionInfo(customerId);
    const billingHistory = await getBillingHistory(customerId);
    const currentInvoice = await getCurrentOpenInvoice(customerId);
    return json({ subscription, billingHistory, currentInvoice });
  } catch (error) {
    console.error('Error fetching subscription info:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 