import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import Stripe from 'stripe';
import { incrementPaymentFailedAttempts, resetPaymentFailedAttempts } from '~/utils/stripe.server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/lib/supabase';

export const action = async ({ request }: ActionFunctionArgs) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' });
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
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

  try {
    // Handle subscription lifecycle events
    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('[WEBHOOK] Subscription created:', subscription.id);
      console.log('[WEBHOOK] Subscription metadata:', subscription.metadata);
      console.log('[WEBHOOK] Subscription status:', subscription.status);
      
      // Extract user_id from metadata
      const userId = subscription.metadata.userId || subscription.metadata.user_id;
      
      if (!userId) {
        console.error('[WEBHOOK] WARNING: No userId found in subscription metadata for subscription:', subscription.id);
        console.error('[WEBHOOK] Subscription customer:', subscription.customer);
        // Try to find user by stripe_customer_id as fallback
        if (typeof subscription.customer === 'string') {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', subscription.customer)
            .single();
          
          if (user) {
            console.log('[WEBHOOK] Found user by stripe_customer_id:', user.id);
            // Use the found user_id
            const userIdFromCustomer = user.id;
            
            // Create database record for recurring subscription
            const { error } = await supabase
              .from('recurring_subscriptions')
              .insert({
                user_id: userIdFromCustomer,
                stripe_subscription_id: subscription.id,
                price_id: subscription.items.data[0]?.price.id,
                status: subscription.status,
                current_period_start: new Date((subscription as any).current_period_start * 1000),
                current_period_end: new Date((subscription as any).current_period_end * 1000)
              });
            
            if (error) {
              // Check if it's a duplicate key error (subscription already exists)
              if (error.code === '23505') {
                console.log('[WEBHOOK] Subscription record already exists, updating instead');
                const { error: updateError } = await supabase
                  .from('recurring_subscriptions')
                  .update({
                    status: subscription.status,
                    current_period_start: new Date((subscription as any).current_period_start * 1000),
                    current_period_end: new Date((subscription as any).current_period_end * 1000),
                    updated_at: new Date()
                  })
                  .eq('stripe_subscription_id', subscription.id);
                
                if (updateError) {
                  console.error('[WEBHOOK] Failed to update existing subscription record:', updateError);
                } else {
                  console.log('[WEBHOOK] Updated existing subscription record for:', subscription.id);
                }
              } else {
                console.error('[WEBHOOK] Failed to create subscription record:', error);
              }
            } else {
              console.log('[WEBHOOK] Created subscription record for:', subscription.id);
            }
          } else {
            console.error('[WEBHOOK] Could not find user by stripe_customer_id:', subscription.customer);
          }
        }
      } else {
        // Create database record for recurring subscription
        const { error } = await supabase
          .from('recurring_subscriptions')
          .insert({
            user_id: userId,
            stripe_subscription_id: subscription.id,
            price_id: subscription.items.data[0]?.price.id,
            status: subscription.status,
            current_period_start: new Date((subscription as any).current_period_start * 1000),
            current_period_end: new Date((subscription as any).current_period_end * 1000)
          });
        
        if (error) {
          // Check if it's a duplicate key error (subscription already exists)
          if (error.code === '23505') {
            console.log('[WEBHOOK] Subscription record already exists, updating instead');
            const { error: updateError } = await supabase
              .from('recurring_subscriptions')
              .update({
                status: subscription.status,
                current_period_start: new Date((subscription as any).current_period_start * 1000),
                current_period_end: new Date((subscription as any).current_period_end * 1000),
                updated_at: new Date()
              })
              .eq('stripe_subscription_id', subscription.id);
            
            if (updateError) {
              console.error('[WEBHOOK] Failed to update existing subscription record:', updateError);
            } else {
              console.log('[WEBHOOK] Updated existing subscription record for:', subscription.id);
            }
          } else {
            console.error('[WEBHOOK] Failed to create subscription record:', error);
          }
        } else {
          console.log('[WEBHOOK] Created subscription record for:', subscription.id, 'user_id:', userId);
        }
      }
    }
    
    else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('[WEBHOOK] Subscription updated:', subscription.id);
      
      // Update database record
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({
          status: subscription.status,
          current_period_start: new Date((subscription as any).current_period_start * 1000),
          current_period_end: new Date((subscription as any).current_period_end * 1000),
          updated_at: new Date()
        })
        .eq('stripe_subscription_id', subscription.id);
      
      if (error) {
        console.error('[WEBHOOK] Failed to update subscription record:', error);
      } else {
        const customerId = subscription.customer;
        if (
          typeof customerId === 'string' &&
          (subscription.status === 'active' || subscription.status === 'trialing')
        ) {
          try {
            await resetPaymentFailedAttempts(customerId);
            console.log(
              `[WEBHOOK] Reset payment attempts for customer ${customerId} after subscription status ${subscription.status}`
            );
          } catch (err) {
            console.error(
              '[WEBHOOK] Failed to reset payment attempts after subscription became active:',
              err
            );
          }
        }
      }
    }
    
    else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('[WEBHOOK] Subscription deleted:', subscription.id);
      
      // Mark as cancelled in database
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({
          status: 'cancelled',
          updated_at: new Date()
        })
        .eq('stripe_subscription_id', subscription.id);
      
      if (error) {
        console.error('[WEBHOOK] Failed to update deleted subscription:', error);
      }
    }
    
    // Handle payment failed and paid events
    else if (event.type === 'invoice.payment_failed') {
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
    } 
    
    else if (event.type === 'invoice.paid') {
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
    
    // Handle successful payments for recurring subscriptions
    else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      if ((invoice as any).subscription && typeof (invoice as any).subscription === 'string') {
        console.log('[WEBHOOK] Payment succeeded for subscription:', (invoice as any).subscription);
        
        // Update subscription period dates if this is a renewal
        const { error } = await supabase
          .from('recurring_subscriptions')
          .update({
            current_period_start: new Date(invoice.period_start * 1000),
            current_period_end: new Date(invoice.period_end * 1000),
            updated_at: new Date()
          })
          .eq('stripe_subscription_id', (invoice as any).subscription);
        
        if (error) {
          console.error('[WEBHOOK] Failed to update subscription period:', error);
        }
      }
    }

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    // Don't return error - we want to acknowledge receipt
  }

  return json({ received: true });
}; 