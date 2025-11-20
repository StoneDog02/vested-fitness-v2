import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { useMatches, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import Button from "~/components/ui/Button";
import CreateSubscriptionModal from "~/components/coach/CreateSubscriptionModal";
import Card from "~/components/ui/Card";
import dayjs from "dayjs";
import { CheckCircleIcon, ClockIcon, CreditCardIcon, CalendarIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import Tooltip from "~/components/ui/Tooltip";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Subscription | Kava Training" },
    { name: "description", content: "Manage client subscription" },
  ];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const clientId = params.clientId;
  if (!clientId) {
    return json({ error: "Missing clientId" }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const response = await fetch(`${origin}/api/client-subscription-info?clientId=${clientId}`, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    // Try to parse response even if not ok - might have useful error data
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      // If we can't parse the response, return fallback data
      console.error("Error parsing subscription info response:", parseError);
      return json({ subscription: null, paymentMethods: [], client: null });
    }

    // If response is ok, return the data
    if (response.ok) {
      return json(data);
    }

    // If response is not ok but we have data, check if it's a 404 or similar
    // For 404, we can still return the data structure with null values
    if (response.status === 404 || response.status === 403) {
      // These are expected errors - return fallback data
      return json({ subscription: null, paymentMethods: [], client: null });
    }

    // For other errors, log and return fallback data
    console.error("Error fetching subscription info:", data.error || `HTTP ${response.status}`);
    return json({ subscription: null, paymentMethods: [], client: null });
  } catch (error) {
    console.error("Error fetching subscription info:", error);
    return json({ subscription: null, paymentMethods: [], client: null });
  }
};

export default function ClientSubscription() {
  const matches = useMatches();
  const loaderData = useLoaderData<typeof loader>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Find the parent route with client loader data for avatar/name
  const parentData = matches.find(
    (m) => m.data && typeof m.data === "object" && m.data !== null && "client" in m.data
  )?.data as {
    client: { id: string; name?: string; email?: string; created_at?: string } | null;
  };

  // Defensive: handle missing client
  if (!parentData?.client) {
    return (
      <ClientDetailLayout>
        <div className="p-6 text-center text-red-600">
          Client not found or unavailable.
        </div>
      </ClientDetailLayout>
    );
  }

  const client = parentData.client;
  const subscription = loaderData.subscription;
  const paymentMethods = loaderData.paymentMethods || [];
  const paymentIntentDetails = loaderData.paymentIntentDetails || null;
  const hasPaymentMethod = paymentMethods.length > 0;
  
  // Debug: Log payment intent details when subscription is incomplete
  if (subscription && (subscription as any).status === 'incomplete') {
    console.log('[UI] Incomplete subscription - paymentIntentDetails:', paymentIntentDetails);
  }
  
  // Get the last 4 digits of the first payment method
  const paymentMethodLast4 = paymentMethods.length > 0 && paymentMethods[0]?.card?.last4 
    ? paymentMethods[0].card.last4 
    : undefined;

  // Format currency helper
  const formatCurrency = (amount: number | null, currency: string = "usd") => {
    if (amount == null) return "$0.00";
    return (amount / 100).toLocaleString(undefined, {
      style: "currency",
      currency: currency.toLowerCase(),
    });
  };

  // Format date helper
  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return "N/A";
    return dayjs.unix(timestamp).format("MMM D, YYYY");
  };

  // Get subscription details
  const getSubscriptionDetails = () => {
    if (!subscription) return null;
    
    const sub = subscription as any;
    const price = sub.items?.data?.[0]?.price;
    const plan = sub.plan || price;
    const amount = plan?.unit_amount || plan?.amount || 0;
    const currency = plan?.currency || "usd";
    const interval = plan?.interval || price?.recurring?.interval || "month";
    const productName = sub.productName || plan?.product?.name || "Subscription";
    const status = sub.status || "unknown";
    
    // Extract period dates - Stripe returns these as Unix timestamps
    // For future-dated subscriptions, these might not be set yet
    let currentPeriodStart = sub.current_period_start ?? null;
    let currentPeriodEnd = sub.current_period_end ?? null;
    const billingCycleAnchor = sub.billing_cycle_anchor ?? null;
    
    // If period dates aren't set but we have a billing cycle anchor, use that
    // This happens for subscriptions scheduled to start in the future
    if (!currentPeriodStart && billingCycleAnchor) {
      currentPeriodStart = billingCycleAnchor;
      // Calculate end date based on interval
      if (interval === "month") {
        currentPeriodEnd = dayjs.unix(billingCycleAnchor).add(1, "month").unix();
      } else if (interval === "year") {
        currentPeriodEnd = dayjs.unix(billingCycleAnchor).add(1, "year").unix();
      } else if (interval === "week") {
        currentPeriodEnd = dayjs.unix(billingCycleAnchor).add(1, "week").unix();
      } else {
        // Default to 1 month
        currentPeriodEnd = dayjs.unix(billingCycleAnchor).add(1, "month").unix();
      }
    }
    
    const notes = sub.metadata?.notes;
    const cancellationReason = sub.cancellationReason;

    return {
      id: sub.id,
      status,
      productName,
      amount,
      currency,
      interval,
      currentPeriodStart,
      currentPeriodEnd,
      billingCycleAnchor,
      notes,
      cancellationReason,
    };
  };

  const subscriptionDetails = getSubscriptionDetails();

  // Get initials for avatar
  const getInitials = (name: string): string => {
    const parts = name.trim().split(" ");
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Helper function to get user-friendly decline code messages
  const getDeclineCodeMessage = (declineCode: string): string => {
    const messages: Record<string, string> = {
      'insufficient_funds': 'Insufficient funds',
      'card_declined': 'Card declined',
      'expired_card': 'Expired card',
      'incorrect_cvc': 'Incorrect CVC',
      'incorrect_number': 'Incorrect card number',
      'processing_error': 'Processing error',
      'generic_decline': 'Card declined',
      'lost_card': 'Lost card',
      'stolen_card': 'Stolen card',
      'pickup_card': 'Card pickup',
      'restricted_card': 'Restricted card',
      'security_violation': 'Security violation',
      'service_not_allowed': 'Service not allowed',
      'stop_payment_order': 'Stop payment order',
      'testmode_decline': 'Test mode decline',
      'withdrawal_count_limit_exceeded': 'Withdrawal limit exceeded',
    };
    return messages[declineCode] || declineCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        {/* Header with avatar */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-lg">
            {getInitials(client.name || "C")}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
              Subscription for {client.name || "Client"}
            </h1>
            <p className="text-sm text-gray-dark dark:text-gray-light">
              {client.email}
            </p>
          </div>
        </div>

        {/* No Active Subscription State */}
        {!subscription && (
          <div className="bg-white dark:bg-night rounded-lg shadow-sm border border-gray-light dark:border-davyGray p-12 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-davyGray flex items-center justify-center mb-6">
              <span className="text-4xl font-bold text-gray-400 dark:text-gray-500">$</span>
            </div>
            <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4">
              No Active Subscription
            </h2>
            <p className="text-gray-dark dark:text-gray-light mb-8 max-w-md">
              {client.name || "This client"} has completed their profile setup but doesn't have an active subscription yet.
            </p>
            <Button
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
            >
              Create Subscription
            </Button>
          </div>
        )}

        {/* Active Subscription State */}
        {subscription && subscriptionDetails && (
          <div className="space-y-6">
            {/* Subscription Overview Card */}
            <Card title="Active Subscription">
              <div className="space-y-6">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    subscriptionDetails.status === "active" 
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : subscriptionDetails.status === "trialing"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      : subscriptionDetails.status === "incomplete"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : subscriptionDetails.status === "past_due"
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                      : subscriptionDetails.status === "canceled" || subscriptionDetails.status === "unpaid"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}>
                    {subscriptionDetails.status === "active" && (
                      <span className="flex items-center gap-1">
                        <CheckCircleIcon className="w-4 h-4" />
                        Active
                      </span>
                    )}
                    {subscriptionDetails.status === "trialing" && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-4 h-4" />
                        Trial
                      </span>
                    )}
                    {subscriptionDetails.status === "past_due" && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-4 h-4" />
                        Past Due
                      </span>
                    )}
                    {subscriptionDetails.status === "canceled" && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-4 h-4" />
                        Canceled
                      </span>
                    )}
                    {subscriptionDetails.status === "unpaid" && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-4 h-4" />
                        Unpaid
                      </span>
                    )}
                    {subscriptionDetails.status === "incomplete" && (
                      <Tooltip
                        content={
                          paymentIntentDetails
                            ? (() => {
                                const reason = paymentIntentDetails.decline_code
                                  ? getDeclineCodeMessage(paymentIntentDetails.decline_code)
                                  : paymentIntentDetails.message?.replace(/^Your /i, 'Client ') || "Payment failed";
                                return (
                                  <div>
                                    <div className="font-semibold mb-1">Incomplete: {paymentIntentDetails.message?.replace(/^Your /i, 'Client ') || "Payment failed"}</div>
                                    <div className="text-xs opacity-90">
                                      <div className="mb-1"><strong>Reason:</strong> {reason}</div>
                                      <div>Stripe will automatically retry payment over the next 3 days. If payment succeeds, the subscription will become active automatically.</div>
                                    </div>
                                  </div>
                                );
                              })()
                            : "Payment is pending. Stripe will automatically retry payment over the next 3 days."
                        }
                      >
                        <span className="flex items-center gap-1 cursor-help">
                          <ClockIcon className="w-4 h-4" />
                          Incomplete
                        </span>
                      </Tooltip>
                    )}
                    {!["active", "trialing", "past_due", "canceled", "unpaid", "incomplete"].includes(subscriptionDetails.status) && (
                      <span className="capitalize">{subscriptionDetails.status}</span>
                    )}
                  </div>
                </div>

                {/* Incomplete Subscription with Payment Error Details */}
                {subscriptionDetails.status === "incomplete" && paymentIntentDetails && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <InformationCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                          Incomplete: {paymentIntentDetails.message ? paymentIntentDetails.message.replace(/^Your /i, 'Client ') : "Payment failed"}
                        </div>
                        <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                          {paymentIntentDetails.decline_code && (
                            <p>
                              <strong>Reason:</strong> {getDeclineCodeMessage(paymentIntentDetails.decline_code)}
                            </p>
                          )}
                          <p>
                            Stripe will automatically retry payment over the next 3 days. If payment succeeds, the subscription will become active automatically.
                          </p>
                          {paymentIntentDetails.advice_code === 'try_again_later' && (
                            <p className="text-xs italic">
                              Tip: The client should ensure their payment method has sufficient funds.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cancellation/Payment Failure Reason */}
                {subscriptionDetails.cancellationReason && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <InformationCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                          Subscription Inactive
                        </div>
                        <div className="text-sm text-red-700 dark:text-red-300">
                          {subscriptionDetails.cancellationReason}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Plan Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-dark dark:text-gray-light mb-2">
                        Plan Details
                      </h3>
                      <div className="bg-gray-50 dark:bg-davyGray rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-dark dark:text-gray-light">Product:</span>
                          <span className="text-sm font-medium text-secondary dark:text-alabaster">
                            {subscriptionDetails.productName}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-dark dark:text-gray-light">Price:</span>
                          <span className="text-sm font-medium text-secondary dark:text-alabaster">
                            {formatCurrency(subscriptionDetails.amount, subscriptionDetails.currency)}
                            {subscriptionDetails.interval && ` / ${subscriptionDetails.interval}`}
                          </span>
                        </div>
                        {subscriptionDetails.billingCycleAnchor && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-dark dark:text-gray-light">Billing Date:</span>
                            <span className="text-sm font-medium text-secondary dark:text-alabaster">
                              {formatDate(subscriptionDetails.billingCycleAnchor)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Payment Method */}
                    {hasPaymentMethod && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-dark dark:text-gray-light mb-2">
                          Payment Method
                        </h3>
                        <div className="bg-gray-50 dark:bg-davyGray rounded-lg p-4">
                          <div className="flex items-center gap-3">
                            <CreditCardIcon className="w-5 h-5 text-gray-dark dark:text-gray-light" />
                            <div>
                              <div className="text-sm font-medium text-secondary dark:text-alabaster">
                                {paymentMethods[0]?.card?.brand?.toUpperCase() || "Card"} ending in {paymentMethodLast4 || "----"}
                              </div>
                              {paymentMethods[0]?.card?.exp_month && paymentMethods[0]?.card?.exp_year && (
                                <div className="text-xs text-gray-dark dark:text-gray-light">
                                  Expires {paymentMethods[0].card.exp_month}/{paymentMethods[0].card.exp_year}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {/* Billing Period */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-dark dark:text-gray-light mb-2">
                        Billing Period
                      </h3>
                      <div className="bg-gray-50 dark:bg-davyGray rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <CalendarIcon className="w-5 h-5 text-gray-dark dark:text-gray-light mt-0.5" />
                          <div className="flex-1">
                            <div className="text-xs text-gray-dark dark:text-gray-light mb-1">Current Period</div>
                            <div className="text-sm font-medium text-secondary dark:text-alabaster">
                              {formatDate(subscriptionDetails.currentPeriodStart)} - {formatDate(subscriptionDetails.currentPeriodEnd)}
                            </div>
                          </div>
                        </div>
                        {subscriptionDetails.currentPeriodStart && (
                          <div className="flex items-start gap-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <ClockIcon className="w-5 h-5 text-gray-dark dark:text-gray-light mt-0.5" />
                            <div className="flex-1">
                              {(() => {
                                const now = dayjs();
                                const periodStart = dayjs.unix(subscriptionDetails.currentPeriodStart);
                                const periodEnd = subscriptionDetails.currentPeriodEnd 
                                  ? dayjs.unix(subscriptionDetails.currentPeriodEnd)
                                  : null;
                                
                                // If period hasn't started yet, show "First Billing Date"
                                if (now.isBefore(periodStart)) {
                                  return (
                                    <>
                                      <div className="text-xs text-gray-dark dark:text-gray-light mb-1">First Billing Date</div>
                                      <div className="text-sm font-medium text-secondary dark:text-alabaster">
                                        {formatDate(subscriptionDetails.currentPeriodStart)}
                                      </div>
                                    </>
                                  );
                                }
                                
                                // If period has started, show "Next Billing Date" (which is the period end)
                                if (periodEnd) {
                                  return (
                                    <>
                                      <div className="text-xs text-gray-dark dark:text-gray-light mb-1">Next Billing Date</div>
                                      <div className="text-sm font-medium text-secondary dark:text-alabaster">
                                        {formatDate(subscriptionDetails.currentPeriodEnd)}
                                      </div>
                                    </>
                                  );
                                }
                                
                                return null;
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {subscriptionDetails.notes && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-dark dark:text-gray-light mb-2">
                          Notes
                        </h3>
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <div className="flex items-start gap-2">
                            <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                              {subscriptionDetails.notes}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        <CreateSubscriptionModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          clientId={client.id}
          clientName={client.name || "Client"}
          clientEmail={client.email || ""}
          hasPaymentMethod={hasPaymentMethod}
          paymentMethodLast4={paymentMethodLast4}
        />
      </div>
    </ClientDetailLayout>
  );
}

