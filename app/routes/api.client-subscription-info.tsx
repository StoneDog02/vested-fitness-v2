import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { getSubscriptionInfo, listPaymentMethods, stripe } from "~/utils/stripe.server";
import type Stripe from "stripe";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Get coach from auth cookie
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );
    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          "base64"
        ).toString("utf-8");
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
          decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
      } catch (e) {
        authId = undefined;
      }
    }
    if (!authId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get coach user record
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: coachUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authId)
      .single();

    if (!coachUser || coachUser.role !== "coach") {
      return json({ error: "Only coaches can access this" }, { status: 403 });
    }

    // Get clientId from query params
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      return json({ error: "Missing clientId" }, { status: 400 });
    }

    // Verify client belongs to this coach
    // Try by slug first, then by id
    let { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, name, email, stripe_customer_id")
      .eq("slug", clientId)
      .eq("coach_id", coachUser.id)
      .single();
    
    // If not found by slug, try by id
    if (!client || clientError) {
      const { data: clientById, error: clientByIdError } = await supabase
        .from("users")
        .select("id, name, email, stripe_customer_id")
        .eq("id", clientId)
        .eq("coach_id", coachUser.id)
        .single();
      client = clientById;
      clientError = clientByIdError;
    }

    if (!client) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    // Fetch subscription info if customer exists
    let subscription = null;
    let paymentMethods: any[] = [];
    let paymentIntentDetails: any = null;
    let retryInfo: any = null;
    
    if (client.stripe_customer_id) {
      try {
        subscription = await getSubscriptionInfo(client.stripe_customer_id);
        
        // If subscription is incomplete, expired, or past_due, fetch payment intent details and retry information
        if (subscription && ((subscription as any).status === 'incomplete' || (subscription as any).status === 'incomplete_expired' || (subscription as any).status === 'past_due')) {
          const subscriptionData = subscription as any;
          
          // Calculate retry information for incomplete subscriptions
          // Note: past_due subscriptions don't have retry schedules, they're handled differently
          if (subscriptionData.status === 'incomplete') {
            // Get the latest invoice to check next_payment_attempt
            let latestInvoice = subscriptionData.latest_invoice;
            let invoiceId: string | null = null;
            
            if (latestInvoice) {
              if (typeof latestInvoice === 'string') {
                invoiceId = latestInvoice;
              } else if (typeof latestInvoice === 'object' && latestInvoice.id) {
                invoiceId = latestInvoice.id;
              }
            }
            
            // If we don't have the invoice expanded, retrieve it
            let invoiceObj: any = null;
            if (invoiceId && (typeof latestInvoice !== 'object' || !latestInvoice.next_payment_attempt)) {
              try {
                invoiceObj = await stripe.invoices.retrieve(invoiceId, {
                  expand: ['payment_intent', 'charge'],
                });
              } catch (err) {
                console.error('[API] Error retrieving invoice for retry info:', err);
              }
            } else if (typeof latestInvoice === 'object') {
              invoiceObj = latestInvoice;
            }
            
            // Get last payment attempt time for incomplete subscriptions
            let lastAttemptTime: number | null = null;
            let lastAttemptMessage = '';
            
            if (invoiceObj) {
              // Try to get last attempt from payment intent's last_payment_error
              const paymentIntent = (invoiceObj as any).payment_intent;
              if (paymentIntent) {
                const pi = typeof paymentIntent === 'string' 
                  ? await stripe.paymentIntents.retrieve(paymentIntent)
                  : paymentIntent;
                
                const lastError = (pi as any).last_payment_error;
                if (lastError && lastError.charge) {
                  try {
                    const charge = await stripe.charges.retrieve(lastError.charge);
                    if (charge.created) {
                      lastAttemptTime = charge.created * 1000;
                    }
                  } catch (err) {
                    // If we can't get the charge, use payment intent created time as fallback
                    if ((pi as any).created) {
                      lastAttemptTime = (pi as any).created * 1000;
                    }
                  }
                } else if ((pi as any).created) {
                  // Fallback to payment intent creation time
                  lastAttemptTime = (pi as any).created * 1000;
                }
              }
              
              // Alternative: Check invoice's attempt_count and created/updated dates
              if (!lastAttemptTime && invoiceObj.attempt_count) {
                // If there were attempts, use the invoice's updated_at or created date
                if (invoiceObj.updated) {
                  lastAttemptTime = invoiceObj.updated * 1000;
                } else if (invoiceObj.created) {
                  lastAttemptTime = invoiceObj.created * 1000;
                }
              }
              
              // Format last attempt time
              if (lastAttemptTime) {
                const lastAttemptDate = new Date(lastAttemptTime);
                const now = new Date();
                const daysDiff = Math.floor((now.getTime() - lastAttemptTime) / (1000 * 60 * 60 * 24));
                
                if (daysDiff === 0) {
                  // Today - show time
                  lastAttemptMessage = `Last attempt: Today at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                } else if (daysDiff === 1) {
                  // Yesterday
                  lastAttemptMessage = `Last attempt: Yesterday at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                } else if (daysDiff < 7) {
                  // This week - show day and time
                  lastAttemptMessage = `Last attempt: ${lastAttemptDate.toLocaleDateString('en-US', { weekday: 'long' })} at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                } else {
                  // Older - show full date and time
                  lastAttemptMessage = `Last attempt: ${lastAttemptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                }
              }
            }
            
            // Check if invoice has next_payment_attempt (Stripe's actual retry schedule)
            if (invoiceObj && invoiceObj.next_payment_attempt) {
              const nextRetryTime = invoiceObj.next_payment_attempt * 1000; // Convert to milliseconds
              const now = Date.now();
              const hoursUntilNextRetry = (nextRetryTime - now) / (1000 * 60 * 60);
              
              // Calculate which attempt this is based on subscription creation time
              // Stripe's retry schedule: ~1h, ~6h, ~12h, ~23h after subscription creation
              const subscriptionCreated = subscriptionData.created * 1000;
              const hoursSinceCreation = (now - subscriptionCreated) / (1000 * 60 * 60);
              
              // Estimate attempt number based on time since creation
              // Stripe retries at approximately: 1h, 6h, 12h, 23h
              let attemptNumber = 1;
              if (hoursSinceCreation >= 23) {
                attemptNumber = 4; // Final attempt
              } else if (hoursSinceCreation >= 12) {
                attemptNumber = 4; // Should be on final attempt
              } else if (hoursSinceCreation >= 6) {
                attemptNumber = 3;
              } else if (hoursSinceCreation >= 1) {
                attemptNumber = 2;
              } else {
                attemptNumber = 1; // First attempt
              }
              
              // Format time nicely
              let timeMessage = '';
              if (hoursUntilNextRetry > 0) {
                if (hoursUntilNextRetry < 1) {
                  const minutes = Math.round(hoursUntilNextRetry * 60);
                  timeMessage = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                } else if (hoursUntilNextRetry < 24) {
                  const hours = Math.round(hoursUntilNextRetry * 10) / 10;
                  timeMessage = `${hours} hour${hours !== 1 ? 's' : ''}`;
                } else {
                  const days = Math.round((hoursUntilNextRetry / 24) * 10) / 10;
                  timeMessage = `${days} day${days !== 1 ? 's' : ''}`;
                }
              }
              
              if (hoursUntilNextRetry > 0) {
                retryInfo = {
                  isRetrying: true,
                  retryAttempt: attemptNumber,
                  totalRetries: 4,
                  nextRetryTime: nextRetryTime,
                  hoursUntilNextRetry: hoursUntilNextRetry,
                  lastAttemptTime: lastAttemptTime,
                  lastAttemptMessage: lastAttemptMessage,
                  message: `Stripe will retry payment in approximately ${timeMessage} (attempt ${attemptNumber} of 4)`
                };
              } else {
                // Retry is happening now or very soon
                retryInfo = {
                  isRetrying: true,
                  retryAttempt: attemptNumber,
                  totalRetries: 4,
                  nextRetryTime: nextRetryTime,
                  hoursUntilNextRetry: 0,
                  lastAttemptTime: lastAttemptTime,
                  lastAttemptMessage: lastAttemptMessage,
                  message: `Stripe is currently retrying payment (attempt ${attemptNumber} of 4)`
                };
              }
            } else {
              // Fallback: Calculate based on subscription creation time
              const subscriptionCreated = subscriptionData.created * 1000;
              const now = Date.now();
              const hoursSinceCreation = (now - subscriptionCreated) / (1000 * 60 * 60);
              
              // Stripe retry schedule: ~1h, ~6h, ~12h, ~23h after creation
              const retrySchedule = [1, 6, 12, 23];
              const nextRetryIndex = retrySchedule.findIndex(hours => hoursSinceCreation < hours);
              
              if (nextRetryIndex !== -1) {
                const nextRetryHours = retrySchedule[nextRetryIndex];
                const nextRetryTime = subscriptionCreated + (nextRetryHours * 60 * 60 * 1000);
                const hoursUntilNextRetry = (nextRetryTime - now) / (1000 * 60 * 60);
                
                let timeMessage = '';
                if (hoursUntilNextRetry < 1) {
                  const minutes = Math.round(hoursUntilNextRetry * 60);
                  timeMessage = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                } else {
                  const hours = Math.round(hoursUntilNextRetry * 10) / 10;
                  timeMessage = `${hours} hour${hours !== 1 ? 's' : ''}`;
                }
                
                retryInfo = {
                  isRetrying: true,
                  retryAttempt: nextRetryIndex + 1,
                  totalRetries: 4,
                  nextRetryTime: nextRetryTime,
                  hoursUntilNextRetry: Math.max(0, hoursUntilNextRetry),
                  lastAttemptTime: lastAttemptTime,
                  lastAttemptMessage: lastAttemptMessage,
                  message: hoursUntilNextRetry > 0 
                    ? `Stripe will retry payment in approximately ${timeMessage} (attempt ${nextRetryIndex + 1} of 4)`
                    : `Stripe is currently retrying payment (attempt ${nextRetryIndex + 1} of 4)`
                };
              } else {
                // Past all retry attempts, should become expired soon
                retryInfo = {
                  isRetrying: false,
                  lastAttemptTime: lastAttemptTime,
                  lastAttemptMessage: lastAttemptMessage,
                  message: "All automatic retry attempts have been exhausted. Subscription will expire soon if payment doesn't succeed."
                };
              }
            }
          } else if (subscriptionData.status === 'past_due') {
            // For past_due subscriptions, check if Stripe is still attempting payment
            // Get the latest invoice to check next_payment_attempt and last attempt info
            let latestInvoice = subscriptionData.latest_invoice;
            let invoiceId: string | null = null;
            
            if (latestInvoice) {
              if (typeof latestInvoice === 'string') {
                invoiceId = latestInvoice;
              } else if (typeof latestInvoice === 'object' && latestInvoice.id) {
                invoiceId = latestInvoice.id;
              }
            }
            
            // If we don't have the invoice expanded, retrieve it
            let invoiceObj: any = null;
            if (invoiceId && (typeof latestInvoice !== 'object' || !latestInvoice.next_payment_attempt)) {
              try {
                invoiceObj = await stripe.invoices.retrieve(invoiceId, {
                  expand: ['payment_intent', 'charge'],
                });
              } catch (err) {
                console.error('[API] Error retrieving invoice for past_due retry info:', err);
              }
            } else if (typeof latestInvoice === 'object') {
              invoiceObj = latestInvoice;
            }
            
            // Get last payment attempt time
            let lastAttemptTime: number | null = null;
            let lastAttemptMessage = '';
            
            if (invoiceObj) {
              // Try to get last attempt from payment intent's last_payment_error
              const paymentIntent = (invoiceObj as any).payment_intent;
              if (paymentIntent) {
                const pi = typeof paymentIntent === 'string' 
                  ? await stripe.paymentIntents.retrieve(paymentIntent)
                  : paymentIntent;
                
                const lastError = (pi as any).last_payment_error;
                if (lastError && lastError.charge) {
                  try {
                    const charge = await stripe.charges.retrieve(lastError.charge);
                    if (charge.created) {
                      lastAttemptTime = charge.created * 1000;
                    }
                  } catch (err) {
                    // If we can't get the charge, use payment intent created time as fallback
                    if ((pi as any).created) {
                      lastAttemptTime = (pi as any).created * 1000;
                    }
                  }
                } else if ((pi as any).created) {
                  // Fallback to payment intent creation time
                  lastAttemptTime = (pi as any).created * 1000;
                }
              }
              
              // Alternative: Check invoice's attempt_count and created/updated dates
              if (!lastAttemptTime && invoiceObj.attempt_count) {
                // If there were attempts, use the invoice's updated_at or created date
                if (invoiceObj.updated) {
                  lastAttemptTime = invoiceObj.updated * 1000;
                } else if (invoiceObj.created) {
                  lastAttemptTime = invoiceObj.created * 1000;
                }
              }
              
              // Format last attempt time
              if (lastAttemptTime) {
                const lastAttemptDate = new Date(lastAttemptTime);
                const now = new Date();
                const daysDiff = Math.floor((now.getTime() - lastAttemptTime) / (1000 * 60 * 60 * 24));
                
                if (daysDiff === 0) {
                  // Today - show time
                  lastAttemptMessage = `Last attempt: Today at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                } else if (daysDiff === 1) {
                  // Yesterday
                  lastAttemptMessage = `Last attempt: Yesterday at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                } else if (daysDiff < 7) {
                  // This week - show day and time
                  lastAttemptMessage = `Last attempt: ${lastAttemptDate.toLocaleDateString('en-US', { weekday: 'long' })} at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                } else {
                  // Older - show full date and time
                  lastAttemptMessage = `Last attempt: ${lastAttemptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${lastAttemptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                }
              }
            }
            
            // Check if invoice has next_payment_attempt (Stripe is still trying)
            if (invoiceObj && invoiceObj.next_payment_attempt) {
              const nextRetryTime = invoiceObj.next_payment_attempt * 1000; // Convert to milliseconds
              const now = Date.now();
              const hoursUntilNextRetry = (nextRetryTime - now) / (1000 * 60 * 60);
              
              // Format time nicely
              let timeMessage = '';
              if (hoursUntilNextRetry > 0) {
                if (hoursUntilNextRetry < 1) {
                  const minutes = Math.round(hoursUntilNextRetry * 60);
                  timeMessage = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                } else if (hoursUntilNextRetry < 24) {
                  const hours = Math.round(hoursUntilNextRetry * 10) / 10;
                  timeMessage = `${hours} hour${hours !== 1 ? 's' : ''}`;
                } else {
                  const days = Math.round((hoursUntilNextRetry / 24) * 10) / 10;
                  timeMessage = `${days} day${days !== 1 ? 's' : ''}`;
                }
                
                retryInfo = {
                  isRetrying: true,
                  nextRetryTime: nextRetryTime,
                  hoursUntilNextRetry: hoursUntilNextRetry,
                  lastAttemptTime: lastAttemptTime,
                  lastAttemptMessage: lastAttemptMessage,
                  message: `Stripe will retry payment in approximately ${timeMessage}`
                };
              } else {
                // Retry is happening now or very soon
                retryInfo = {
                  isRetrying: true,
                  nextRetryTime: nextRetryTime,
                  hoursUntilNextRetry: 0,
                  lastAttemptTime: lastAttemptTime,
                  lastAttemptMessage: lastAttemptMessage,
                  message: "Stripe is currently retrying payment"
                };
              }
            } else {
              // No next_payment_attempt means Stripe has stopped trying
              retryInfo = {
                isRetrying: false,
                lastAttemptTime: lastAttemptTime,
                lastAttemptMessage: lastAttemptMessage,
                message: "Stripe is no longer attempting payment automatically. The subscription may become unpaid if payment is not collected manually."
              };
            }
          } else if (subscriptionData.status === 'incomplete_expired') {
            retryInfo = {
              isRetrying: false,
              message: "Subscription has expired. Stripe is no longer attempting payment. Use the Reactivate button to try again."
            };
          }
          try {
            const subscriptionId = (subscription as any).id;
            
            // First, try to get the payment intent from the already-expanded subscription object
            let paymentIntent: any = null;
            const latestInvoice = (subscription as any).latest_invoice;
            
            if (latestInvoice) {
              // Check if invoice is expanded (object) or just an ID (string)
              if (typeof latestInvoice === 'object' && latestInvoice.payment_intent) {
                // Payment intent is already expanded in the subscription
                paymentIntent = latestInvoice.payment_intent;
              } else {
                // Invoice is not expanded, need to retrieve it
                const invoiceId = typeof latestInvoice === 'string' ? latestInvoice : latestInvoice.id;
                if (invoiceId) {
                  const invoiceWithPI = await stripe.invoices.retrieve(invoiceId, {
                    expand: ['payment_intent'],
                  });
                  paymentIntent = (invoiceWithPI as any).payment_intent;
                }
              }
            }
            
            // If we still don't have a payment intent, try listing invoices
            if (!paymentIntent) {
              const invoices = await stripe.invoices.list({
                customer: client.stripe_customer_id,
                subscription: subscriptionId,
                limit: 1,
              });
              
              if (invoices.data.length > 0) {
                const invoiceWithPI = await stripe.invoices.retrieve(invoices.data[0].id, {
                  expand: ['payment_intent'],
                });
                paymentIntent = (invoiceWithPI as any).payment_intent;
              }
            }
            
            // Extract payment intent details
            if (paymentIntent) {
              const pi = typeof paymentIntent === 'string' 
                ? await stripe.paymentIntents.retrieve(paymentIntent)
                : paymentIntent;
              
              // Extract helpful information
              const lastError = (pi as any).last_payment_error;
              if (lastError) {
                paymentIntentDetails = {
                  decline_code: lastError.decline_code,
                  code: lastError.code,
                  message: lastError.message,
                  type: lastError.type,
                  advice_code: lastError.advice_code,
                };
                console.log('[API] Found payment intent error details:', paymentIntentDetails);
              } else if ((pi as any).status === 'requires_payment_method') {
                // Payment intent exists but needs a payment method
                paymentIntentDetails = {
                  status: 'requires_payment_method',
                  message: 'Payment method required',
                };
              } else {
                // Check the payment intent status
                const piStatus = (pi as any).status;
                if (piStatus) {
                  paymentIntentDetails = {
                    status: piStatus,
                    message: `Payment intent status: ${piStatus}`,
                  };
                }
              }
            } else {
              console.log('[API] No payment intent found for incomplete subscription:', subscriptionId);
            }
          } catch (piError) {
            // If we can't fetch payment intent details, log but continue
            console.error("Error fetching payment intent details:", piError);
          }
        }
        
        // Fetch attached payment methods
        const pmList = await listPaymentMethods(client.stripe_customer_id);
        paymentMethods = pmList.data || [];
        
        // Also check for default payment method set on customer
        // This is important because Stripe can have a default payment method
        // that's not explicitly attached (e.g., saved during setup)
        const customer = await stripe.customers.retrieve(client.stripe_customer_id);
        
        if (customer && !customer.deleted) {
          const defaultPaymentMethodId = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
          
          if (defaultPaymentMethodId && typeof defaultPaymentMethodId === 'string') {
            // Check if this payment method is already in our list
            const alreadyInList = paymentMethods.some(pm => pm.id === defaultPaymentMethodId);
            
            if (!alreadyInList) {
              // Fetch the default payment method and add it to the list
              try {
                const defaultPm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);
                if (defaultPm) {
                  paymentMethods.push(defaultPm);
                }
              } catch (pmError) {
                // If we can't retrieve the payment method, that's ok
                // It might have been deleted or is invalid
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching subscription info:", error);
        // Continue with null subscription and empty payment methods
        // This handles cases where Stripe API fails but client exists
        subscription = null;
        paymentMethods = [];
      }
    }
    // If no stripe_customer_id, subscription and paymentMethods remain null/empty - that's ok

    // Always return 200 OK with valid data structure for valid clients
    return json({
      subscription,
      paymentMethods,
      paymentIntentDetails, // Include payment intent details for incomplete subscriptions
      retryInfo, // Include retry information for incomplete subscriptions
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        stripe_customer_id: client.stripe_customer_id,
      },
    });
  } catch (error) {
    console.error("Error in client-subscription-info loader:", error);
    // Only return error status for actual errors (auth, etc.)
    // For other errors, return 200 OK with null values to prevent breaking the UI
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    return json({
      subscription: null,
      paymentMethods: [],
      client: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

