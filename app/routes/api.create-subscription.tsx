import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer';
import { getOrCreateStripeCustomer, createStripeSubscription , stripe } from '~/utils/stripe.server';
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
    console.log('[API] Received subscription creation request:', { priceId, paymentMethodId, providedCustomerId });
    if (!priceId) {
      return json({ error: 'Missing priceId' }, { status: 400 });
    }
    // Use provided customerId if present, otherwise get or create
    const customerId = providedCustomerId || await getOrCreateStripeCustomer({ userId: user.id, email: user.email });

    // Retrieve the price from Stripe to determine if it's recurring or one_time
    const price = await stripe.prices.retrieve(priceId);
    console.log('[API] Stripe price type:', price.type, 'id:', price.id, 'amount:', price.unit_amount);

    // Check if this is a free product (unit_amount === 0)
    if (price.unit_amount === 0) {
      console.log('[API] Free product detected, skipping payment creation');
      
      if (price.type === 'recurring') {
        // Create subscription for free recurring product
        const subscription = await createStripeSubscription({ 
          customerId, 
          priceId, 
          paymentMethodId, 
          userId: user.id 
        });
        console.log('[API] Created free subscription:', subscription && subscription.id, 'for customer:', customerId);
        return json({ 
          success: true, 
          subscription, 
          free: true, 
          message: "Free plan activated successfully" 
        });
      } else if (price.type === 'one_time') {
        // For free one-time products, just return success without PaymentIntent
        console.log('[API] Free one-time product, no payment required');
        return json({ 
          success: true, 
          free: true, 
          message: "Free product activated successfully" 
        });
      }
    }

    if (price.type === 'recurring') {
      // Create subscription with payment method if provided
      const subscription = await createStripeSubscription({ 
        customerId, 
        priceId, 
        paymentMethodId, 
        userId: user.id 
      });
      console.log('[API] Created subscription:', subscription.id, 'for customer:', customerId);
      console.log('[API] Subscription status:', (subscription as any).status);
      
      // Check subscription status first
      const subscriptionStatus = (subscription as any).status;
      const invoice = subscription.latest_invoice;
      
      // If subscription is already active, payment succeeded immediately
      if (subscriptionStatus === 'active') {
        console.log('[API] Subscription is active - payment succeeded immediately');
        return json({ 
          success: true, 
          subscription, 
          clientSecret: null,
          paymentSucceeded: true
        });
      }
      
      // If subscription is incomplete, we need to get clientSecret for payment confirmation
      if (subscriptionStatus === 'incomplete' || subscriptionStatus === 'incomplete_expired') {
        console.log('[API] Subscription is incomplete - extracting clientSecret for payment confirmation');
        let clientSecret = null;
        
        // Try to extract clientSecret from the invoice's payment intent
        if (invoice && typeof invoice === 'object') {
          // First, try to get it from the expanded invoice
          if ('payment_intent' in invoice && invoice.payment_intent) {
            if (typeof invoice.payment_intent === 'object' && 'client_secret' in invoice.payment_intent) {
              clientSecret = (invoice.payment_intent as any).client_secret;
              console.log('[API] Found clientSecret from expanded invoice');
            } else if (typeof invoice.payment_intent === 'string') {
              // Payment intent is just an ID, need to retrieve it
              try {
                const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
                clientSecret = paymentIntent.client_secret;
                console.log('[API] Retrieved clientSecret from payment intent ID');
              } catch (err) {
                console.error('[API] Error retrieving payment intent:', err);
              }
            }
          }
          
          // If still no clientSecret, fetch the invoice with expand
          if (!clientSecret && 'id' in invoice && typeof invoice.id === 'string') {
            try {
              const fetchedInvoice = await stripe.invoices.retrieve(invoice.id, {
                expand: ['payment_intent'],
              });
              const fetchedAny = fetchedInvoice as any;
              if (
                fetchedAny.payment_intent &&
                typeof fetchedAny.payment_intent === 'object' &&
                'client_secret' in fetchedAny.payment_intent
              ) {
                clientSecret = fetchedAny.payment_intent.client_secret;
                console.log('[API] Found clientSecret from fetched invoice');
              } else if (
                fetchedAny.payment_intent &&
                typeof fetchedAny.payment_intent === 'string'
              ) {
                // Payment intent is just an ID, retrieve it
                try {
                  const paymentIntent = await stripe.paymentIntents.retrieve(fetchedAny.payment_intent);
                  clientSecret = paymentIntent.client_secret;
                  console.log('[API] Retrieved clientSecret from fetched invoice payment intent ID');
                } catch (err) {
                  console.error('[API] Error retrieving payment intent from fetched invoice:', err);
                }
              }
            } catch (err) {
              console.error('[API] Error fetching invoice:', err);
            }
          }
          
          // If we still don't have a clientSecret and have a payment method, try to pay the invoice
          if (!clientSecret && paymentMethodId && 'id' in invoice && typeof invoice.id === 'string') {
            console.log('[API] Attempting to pay invoice with payment method');
            try {
              const paidInvoice = await stripe.invoices.pay(invoice.id, {
                payment_method: paymentMethodId,
              });
              console.log('[API] Invoice payment attempt result:', paidInvoice.status);
              
              // If payment succeeded, subscription should now be active
              if (paidInvoice.status === 'paid') {
                console.log('[API] Invoice paid successfully - subscription should be active');
                // Re-fetch subscription to get updated status
                const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id);
                if ((updatedSubscription as any).status === 'active') {
                  return json({ 
                    success: true, 
                    subscription: updatedSubscription, 
                    clientSecret: null,
                    paymentSucceeded: true
                  });
                }
              }
              
              // If payment requires action, get the clientSecret
              const fetchedAfterPay = await stripe.invoices.retrieve(invoice.id, {
                expand: ['payment_intent'],
              });
              const fetchedAfterPayAny = fetchedAfterPay as any;
              if (
                fetchedAfterPayAny.payment_intent &&
                typeof fetchedAfterPayAny.payment_intent === 'object' &&
                'client_secret' in fetchedAfterPayAny.payment_intent
              ) {
                clientSecret = fetchedAfterPayAny.payment_intent.client_secret;
                console.log('[API] Found clientSecret after invoice pay attempt');
              } else if (
                fetchedAfterPayAny.payment_intent &&
                typeof fetchedAfterPayAny.payment_intent === 'string'
              ) {
                try {
                  const paymentIntent = await stripe.paymentIntents.retrieve(fetchedAfterPayAny.payment_intent);
                  clientSecret = paymentIntent.client_secret;
                  console.log('[API] Retrieved clientSecret after invoice pay attempt');
                } catch (err) {
                  console.error('[API] Error retrieving payment intent after pay attempt:', err);
                }
              }
            } catch (err: any) {
              // Log the error but don't fail - we'll return what we have
              console.error('[API] Error attempting to pay invoice:', err.message || err);
              // If it's a payment error that requires action, try to extract clientSecret
              if (err.type === 'StripeCardError' || err.code === 'card_declined' || err.payment_intent) {
                try {
                  const paymentIntentId = err.payment_intent?.id || (invoice as any).payment_intent;
                  if (paymentIntentId && typeof paymentIntentId === 'string') {
                    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                    clientSecret = paymentIntent.client_secret;
                    console.log('[API] Extracted clientSecret from payment error');
                  }
                } catch (retrieveErr) {
                  console.error('[API] Error retrieving payment intent from error:', retrieveErr);
                }
              }
            }
          }
        }
        
        if (!clientSecret) {
          console.error('[API] WARNING: Could not extract clientSecret for incomplete subscription');
          console.error('[API] Subscription ID:', subscription.id);
          console.error('[API] Invoice ID:', invoice && typeof invoice === 'object' && 'id' in invoice ? invoice.id : 'N/A');
          console.error('[API] Payment Method ID:', paymentMethodId || 'N/A');
        }
        
        return json({ 
          success: true, 
          subscription, 
          clientSecret,
          paymentSucceeded: false
        });
      }
      
      // For any other status, return what we have
      console.log('[API] Subscription status is:', subscriptionStatus, '- returning as-is');
      return json({ 
        success: true, 
        subscription, 
        clientSecret: null,
        paymentSucceeded: false
      });
    } else if (price.type === 'one_time') {
      // Create a one-time PaymentIntent
      if (price.unit_amount == null) {
        return json({ error: 'Price unit_amount is null for one_time price' }, { status: 400 });
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price.unit_amount,
        currency: price.currency,
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        description: `One-time payment for price ${priceId}`,
      });
      console.log('[API] Created one-time PaymentIntent:', paymentIntent.id, 'for customer:', customerId);
      return json({ success: true, paymentIntent, clientSecret: paymentIntent.client_secret });
    } else {
      return json({ error: 'Unsupported price type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error creating Stripe subscription:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 