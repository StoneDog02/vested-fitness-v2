import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer';
import { getOrCreateStripeCustomer } from '~/utils/stripe.server';
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
      .select('id, email')
      .eq('auth_id', authId)
      .single();
    if (!user) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    // Create or fetch Stripe customer
    const customerId = await getOrCreateStripeCustomer({ userId: user.id, email: user.email });
    return json({ success: true, customerId });
  } catch (error) {
    console.error('Error creating/fetching Stripe customer:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 