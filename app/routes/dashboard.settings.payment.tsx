import { useState, useEffect } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Modal from "~/components/ui/Modal";
import { useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { stripe, getBillingHistory } from "~/utils/stripe.server";
import type { Database } from "~/lib/supabase";

export const meta: MetaFunction = () => {
  return [
    { title: "Payment Settings | Vested Fitness" },
    {
      name: "description",
      content: "Manage your payment methods and subscription",
    },
  ];
};

// In-memory cache for user payment settings (expires after 30s)
const userPaymentCache: Record<string, { data: any; expires: number }> = {};

// Mock payment data
const mockPaymentMethods = [
  {
    id: "pm_1",
    type: "card",
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2025,
    isDefault: true,
  },
  {
    id: "pm_2",
    type: "card",
    brand: "mastercard",
    last4: "5555",
    expMonth: 3,
    expYear: 2026,
    isDefault: false,
  },
];

const mockSubscription = {
  plan: "Premium Coaching",
  amount: 149.99,
  interval: "month",
  status: "active",
  nextBillingDate: "2023-06-15",
};

const mockBillingHistory = [
  {
    id: "inv_1",
    date: "2023-05-15",
    amount: 149.99,
    status: "paid",
    description: "Premium Coaching - Monthly",
  },
  {
    id: "inv_2",
    date: "2023-04-15",
    amount: 149.99,
    status: "paid",
    description: "Premium Coaching - Monthly",
  },
  {
    id: "inv_3",
    date: "2023-03-15",
    amount: 149.99,
    status: "paid",
    description: "Premium Coaching - Monthly",
  },
];

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

export const loader: LoaderFunction = async ({ request }) => {
  // Get user from auth cookie
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
    throw new Response("Unauthorized", { status: 401 });
  }
  // Get user info from Supabase
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, role, coach_id")
    .eq("auth_id", authId)
    .single();
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }
  if (user.role === "coach") {
    // Fetch all clients for this coach
    const { data: clients } = await supabase
      .from("users")
      .select("id, name, email, stripe_customer_id")
      .eq("coach_id", user.id)
      .eq("role", "client");
    // For each client, fetch their most recent invoice from Stripe
    const clientBilling = await Promise.all(
      (clients || []).map(async (client) => {
        let invoice = null;
        if (client.stripe_customer_id) {
          try {
            const invoices = await stripe.invoices.list({ customer: client.stripe_customer_id, limit: 1 });
            invoice = invoices.data[0] || null;
          } catch (e) {
            invoice = null;
          }
        }
        return {
          id: client.id,
          name: client.name,
          email: client.email,
          invoice,
        };
      })
    );
    return json({
      isCoach: true,
      clientBilling,
    });
  }
  // Use absolute URLs for internal fetch
  const url = new URL(request.url);
  const origin = url.origin;
  // Fetch payment methods from backend
  const paymentMethodsRes = await fetch(`${origin}/api/payment-methods`, {
    headers: { cookie: request.headers.get("cookie") || "" },
  });
  const paymentMethodsData = await paymentMethodsRes.json();
  // Fetch subscription and billing history from backend
  const subscriptionRes = await fetch(`${origin}/api/subscription-info`, {
    headers: { cookie: request.headers.get("cookie") || "" },
  });
  const subscriptionData = await subscriptionRes.json();
  // Compose result
  return json({
    isCoach: false,
    paymentMethods: paymentMethodsData.paymentMethods || [],
    subscription: subscriptionData.subscription || null,
    billingHistory: subscriptionData.billingHistory || [],
    currentInvoice: subscriptionData.currentInvoice || null,
  });
};

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (!stripe || !elements) {
      setError("Stripe is not loaded");
      setLoading(false);
      return;
    }
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not found");
      setLoading(false);
      return;
    }
    const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
    });
    if (stripeError) {
      setError(stripeError.message || "Failed to create payment method");
      setLoading(false);
      return;
    }
    // Call backend to attach payment method
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: paymentMethod.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || data.details?.message || "Failed to attach payment method");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="card-element" className="block text-sm font-medium text-secondary mb-1">
          Card Details
        </label>
        <div id="card-element" className="block w-full border border-gray-light rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary focus:border-primary bg-white dark:bg-eerieBlack">
          <CardElement options={{ hidePostalCode: false }} />
        </div>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <div className="flex space-x-3">
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "Adding..." : "Add Card"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function PaymentSettings() {
  const data = useLoaderData<any>();
  // Always declare hooks at the top level
  // Coach view hooks
  const [tab, setTab] = useState<'all' | 'paid' | 'unpaid'>('all');
  // Client view hooks (declare but only use if needed)
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadingDefault, setLoadingDefault] = useState<string | null>(null);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [invoiceLimit, setInvoiceLimit] = useState(10);
  const [loadingMoreInvoices, setLoadingMoreInvoices] = useState(false);
  const invoicesContainerRef = useRef<HTMLDivElement>(null);
  const [commitment, setCommitment] = useState<{ count: number }>({ count: 0 });
  const [loadingCommitment, setLoadingCommitment] = useState(true);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  // Only use these for client UI
  let paymentMethods = [];
  let subscription = null;
  let billingHistory = [];
  let currentInvoice = null;
  if (!data.isCoach) {
    paymentMethods = data.paymentMethods;
    subscription = data.subscription;
    billingHistory = data.billingHistory;
    currentInvoice = data.currentInvoice;
  }

  // Helper functions and sortedInvoices (must be before any logic/JSX that uses them)
  const getInvoiceDate = (inv: any) => inv.created || inv.date;
  const getInvoiceAmount = (inv: any) => inv.amount_due ?? inv.amount;
  const getInvoiceCurrency = (inv: any) => inv.currency ?? 'usd';
  const sortedInvoices = [...(billingHistory || [])].sort((a, b) => (getInvoiceDate(b) || 0) - (getInvoiceDate(a) || 0));
  const mostRecentInvoice = sortedInvoices[0];

  // Fix: Move all useEffect calls to the top level
  useEffect(() => {
    // Reset invoice limit when modal opens
    if (showAllInvoices) setInvoiceLimit(10);
  }, [showAllInvoices]);

  useEffect(() => {
    // Infinite scroll handler
    if (!showAllInvoices) return;
    const handleScroll = () => {
      const container = invoicesContainerRef.current;
      if (!container) return;
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 20 && !loadingMoreInvoices && invoiceLimit < (billingHistory?.length || 0)) {
        setLoadingMoreInvoices(true);
        setTimeout(() => {
          setInvoiceLimit((prev) => Math.min(prev + 10, billingHistory.length));
          setLoadingMoreInvoices(false);
        }, 300); // Simulate async load
      }
    };
    const container = invoicesContainerRef.current;
    if (container) container.addEventListener('scroll', handleScroll);
    return () => {
      if (container) container.removeEventListener('scroll', handleScroll);
    };
  }, [showAllInvoices, invoiceLimit, loadingMoreInvoices, billingHistory?.length]);

  useEffect(() => {
    // Commitment progress fetch (only for clients)
    if (data.isCoach) return;
    async function fetchCommitment() {
      setLoadingCommitment(true);
      setCommitmentError(null);
      try {
        const res = await fetch("/api/subscription-info");
        const data = await res.json();
        if (data && Array.isArray(data.billingHistory)) {
          const uniquePaidPeriods = new Set();
          const paidInvoices = data.billingHistory.filter((inv: any) =>
            inv.status === "paid" &&
            (inv.billing_reason === "subscription_cycle" || inv.billing_reason === "subscription_create") &&
            inv.lines && inv.lines.data && inv.lines.data[0] && inv.lines.data[0].period && inv.lines.data[0].period.end &&
            !uniquePaidPeriods.has(inv.lines.data[0].period.end) &&
            uniquePaidPeriods.add(inv.lines.data[0].period.end)
          );
          setCommitment({ count: paidInvoices.length });
        } else {
          setCommitment({ count: 0 });
        }
      } catch (err) {
        setCommitmentError("Could not load commitment progress.");
      } finally {
        setLoadingCommitment(false);
      }
    }
    fetchCommitment();
  }, [data.isCoach]);

  // Find the default payment method ID from the payment methods or subscription
  let defaultPaymentMethodId: string | undefined = undefined;
  if (subscription && (subscription as any).default_payment_method) {
    defaultPaymentMethodId = (subscription as any).default_payment_method;
  } else if (paymentMethods.length > 0) {
    // fallback: use the first card as default if not specified
    defaultPaymentMethodId = paymentMethods.find((m: any) => m.isDefault)?.id || paymentMethods[0].id;
  }

  const formatCardBrand = (brand: string | undefined) => {
    if (!brand || typeof brand !== "string") return "Unknown";
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const formatDate = (dateInput: string | number | undefined | null) => {
    if (!dateInput) return "N/A";
    let date: Date;
    if (typeof dateInput === "number") {
      // Assume Stripe Unix timestamp (seconds)
      date = new Date(dateInput * 1000);
    } else {
      date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  // Helper to normalize date to YYYY-MM-DD
  const getDateKey = (dateInput: string | number | undefined | null) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    return isNaN(date.getTime())
      ? String(dateInput)
      : date.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  // Group billing history by normalized description and date
  const groupedBillingHistory = Object.values(
    billingHistory.reduce((acc: any, invoice: any) => {
      let description = (invoice.lines?.data?.[0]?.description || invoice.description || invoice.id || "")
        .replace(/\s*\(at \$[\d,.]+ \/ month\)/, "")
        .trim()
        .toUpperCase();
      // Remove leading quantity and '×' (e.g., '1 × PREMIUM' -> 'PREMIUM')
      description = description.replace(/^\d+\s*×\s*/i, "");
      const dateKey = getDateKey(invoice.date || invoice.created);
      const key = `${description}|${dateKey}`;
      if (!acc[key]) {
        acc[key] = {
          ...invoice,
          count: 1,
          allStatuses: [invoice.status],
          date: dateKey,
          description,
        };
      } else {
        acc[key].count += 1;
        acc[key].allStatuses.push(invoice.status);
      }
      return acc;
    }, {})
  );

  // Add a currency formatter
  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  }

  // Hardcode or extract the priceId for testing
  const testPriceId = (typeof subscription?.plan === 'object' && (subscription.plan as any).id) || 'price_1RiNciJvda6rmtQRI6KDxRYj';

  // Determine if the Pay Now button should be enabled
  const isInvoicePayable =
    currentInvoice &&
    (currentInvoice.status === 'open' ||
      currentInvoice.status === 'unpaid' ||
      currentInvoice.status === 'past_due');

  // Helper to get the plan/product name for display
  const getPlanName = () => {
    if (!subscription) return "Subscription";
    if (typeof subscription.plan === "string") return subscription.plan;
    // Check for productName only if it exists
    if (typeof (subscription as any).productName === "string") return (subscription as any).productName;
    if (subscription.plan && typeof subscription.plan === "object") {
      const planObj = subscription.plan as { nickname?: string; id?: string };
      if (typeof planObj.nickname === "string") return planObj.nickname;
      if (typeof planObj.id === "string") return planObj.id;
    }
    return "Subscription";
  };

  // Coach UI: render tabbed client billing table if isCoach
  if (data.isCoach) {
    const clients = data.clientBilling || [];
    // Helper to get status
    const getStatus = (invoice: any) => {
      if (!invoice) return 'No Invoice';
      if (invoice.status === 'paid') return 'Paid';
      if (invoice.status === 'open' || invoice.status === 'unpaid' || invoice.status === 'past_due') return 'Unpaid/Late';
      return invoice.status;
    };
    // Filter by tab
    const filtered = clients.filter((c: any) => {
      if (tab === 'all') return true;
      if (tab === 'paid') return c.invoice && c.invoice.status === 'paid';
      if (tab === 'unpaid') return c.invoice && (c.invoice.status === 'open' || c.invoice.status === 'unpaid' || c.invoice.status === 'past_due');
      return true;
    });
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Client Billing Overview</h1>
        <div className="flex space-x-4 mb-4">
          <button className={`px-4 py-2 rounded ${tab === 'all' ? 'bg-primary text-white' : 'bg-gray-100'}`} onClick={() => setTab('all')}>All</button>
          <button className={`px-4 py-2 rounded ${tab === 'paid' ? 'bg-primary text-white' : 'bg-gray-100'}`} onClick={() => setTab('paid')}>Paid</button>
          <button className={`px-4 py-2 rounded ${tab === 'unpaid' ? 'bg-primary text-white' : 'bg-gray-100'}`} onClick={() => setTab('unpaid')}>Unpaid/Late</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white dark:bg-eerieBlack border rounded shadow">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Client Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.email}</td>
                  <td className="px-4 py-2">{c.invoice ? `$${(c.invoice.amount_due / 100).toFixed(2)}` : '-'}</td>
                  <td className="px-4 py-2">{c.invoice ? new Date(c.invoice.created * 1000).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatus(c.invoice) === 'Paid' ? 'bg-green-100 text-green-800' : getStatus(c.invoice) === 'Unpaid/Late' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-700'}`}>{getStatus(c.invoice)}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-4 text-gray-500">No clients found for this tab.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Commitment Progress Banner (only for clients, less than 4 payments) */}
      {typeof window !== 'undefined' && window.location.pathname.includes('/dashboard/settings/payment') && (
        loadingCommitment ? (
          <div className="bg-blue-100 text-blue-800 rounded px-4 py-2 text-sm font-medium mb-4">Loading commitment progress...</div>
        ) : commitmentError ? (
          <div className="bg-red-100 text-red-800 rounded px-4 py-2 text-sm font-medium mb-4">{commitmentError}</div>
        ) : (typeof commitment.count === "number" && commitment.count < 4) ? (
          <div className="bg-green-100 text-green-900 rounded px-4 py-2 text-sm font-medium mb-4">
            Commitment: {commitment.count} of 4 payments completed. You must complete 4 monthly payments before you can cancel your account.
          </div>
        ) : null
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Settings
        </h1>
      </div>

      <div className="flex border-b border-gray-light dark:border-davyGray mb-6">
        <Link
          to="/dashboard/settings"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          General
        </Link>
        <Link
          to="/dashboard/settings/payment"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-primary text-primary dark:text-primary"
        >
          Payment Method
        </Link>
        <Link
          to="/dashboard/settings/terms"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          Terms & Conditions
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <Card title="Payment Methods">
          <div className="space-y-4">
            {paymentMethods.map((method: any) => {
              // Type guard for Stripe data
              let brand, last4, expMonth, expYear;
              if ('card' in method && method.card) {
                brand = method.card.brand;
                last4 = method.card.last4;
                expMonth = method.card.exp_month;
                expYear = method.card.exp_year;
              } else {
                brand = method.brand;
                last4 = method.last4;
                expMonth = method.expMonth;
                expYear = method.expYear;
              }
              const isDefault = method.id === defaultPaymentMethodId;
              const handleSetDefault = async () => {
                setLoadingDefault(method.id);
                try {
                  const res = await fetch("/api/payment-methods", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentMethodId: method.id }),
                  });
                  if (res.ok) {
                    setRefreshKey((k) => k + 1); // trigger reload
                  }
                } finally {
                  setLoadingDefault(null);
                }
              };
              return (
                <div
                  key={method.id}
                  className="flex justify-between items-center p-3 border border-gray-light rounded-md"
                >
                  <div className="flex items-center">
                    <div className="w-10 h-8 bg-gray-light flex items-center justify-center rounded mr-3">
                      {brand === "visa" ? (
                        <span className="text-blue-600 font-bold">VISA</span>
                      ) : brand === "mastercard" ? (
                        <span className="text-red-600 font-bold">MC</span>
                      ) : (
                        <span>{formatCardBrand(brand)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-secondary dark:text-alabaster">
                        {formatCardBrand(brand)} ending in {last4 || "----"}
                      </p>
                      <p className="text-xs text-gray-dark dark:text-gray-300">
                        Expires {expMonth || "--"}/{expYear || "----"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {isDefault && (
                      <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded mr-2">
                        Default
                      </span>
                    )}
                    {!isDefault && (
                      <button
                        className="text-sm text-gray-dark dark:text-gray-300 hover:text-primary dark:hover:text-primary"
                        onClick={handleSetDefault}
                        disabled={loadingDefault === method.id}
                      >
                        {loadingDefault === method.id ? "Setting..." : "Set Default"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {showAddCardForm ? (
              <Elements stripe={stripePromise}>
                <AddCardForm
                  onSuccess={() => {
                    setShowAddCardForm(false);
                    setRefreshKey((k) => k + 1);
                  }}
                  onCancel={() => setShowAddCardForm(false)}
                />
              </Elements>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowAddCardForm(true)}
              >
                Add Payment Method
              </Button>
            )}
          </div>
        </Card>

        {/* Subscription Info */}
        <Card title="Subscription">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-secondary dark:text-alabaster">
                  {(subscription as any)?.productName ||
                    (typeof subscription?.plan === "object" && (subscription.plan as any).nickname) ||
                    "Subscription"}
                </h3>
                <p className="text-sm text-gray-dark dark:text-gray-300">
                  {currentInvoice
                    ? formatCurrency(currentInvoice.amount_due, currentInvoice.currency)
                    : (typeof subscription?.plan === "object" && typeof (subscription.plan as any).amount === "number"
                        ? formatCurrency((subscription.plan as any).amount, (subscription.plan as any).currency || "usd")
                        : typeof subscription?.amount === "number"
                        ? formatCurrency(subscription.amount * 100, "usd")
                        : "$0.00")}
                  /
                  {typeof subscription?.plan === "object"
                    ? (subscription.plan as any).interval || "month"
                    : subscription?.interval || "month"}
                </p>
              </div>
              {/* Subscription status pill logic */}
              {(() => {
                const status = subscription?.status;
                let pill = null;
                if (status === "active") {
                  pill = <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">Active</span>;
                } else if (status === "inactive" || status === "past_due" || status === "unpaid") {
                  pill = <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded">{status === "inactive" ? "Inactive" : status === "past_due" ? "Past Due" : "Unpaid"}</span>;
                } else if (status === "trialing") {
                  pill = <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded">Trialing</span>;
                }
                return pill;
              })()}
            </div>

            <div className="border-t border-gray-light pt-4">
              <h3 className="text-sm font-medium text-secondary dark:text-alabaster mb-2">
                Next Billing Date
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-300">
                {currentInvoice && currentInvoice.period_end
                  ? formatDate(currentInvoice.period_end)
                  : (subscription && (subscription as any).current_period_end)
                  ? formatDate((subscription as any).current_period_end)
                  : "N/A"}
              </p>
            </div>

            <div className="border-t border-gray-light pt-4">
              <h3 className="text-sm font-medium text-secondary dark:text-alabaster mb-2">
                Billing History
              </h3>
              <div className="space-y-2">
                {mostRecentInvoice ? (
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <p className="text-gray-dark dark:text-alabaster font-semibold">
                        {getPlanName()}
                      </p>
                      <p className="text-xs text-gray-dark dark:text-gray-300">
                        {formatDate(getInvoiceDate(mostRecentInvoice))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-dark dark:text-alabaster">
                        {formatCurrency(getInvoiceAmount(mostRecentInvoice), getInvoiceCurrency(mostRecentInvoice))}
                      </p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${mostRecentInvoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {mostRecentInvoice.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">No billing history found.</p>
                )}
                {billingHistory.length > 1 && (
                  <button
                    className="text-primary underline text-xs mt-2"
                    onClick={() => setShowAllInvoices(true)}
                    type="button"
                  >
                    Load All Invoices
                  </button>
                )}
              </div>
              <Modal isOpen={showAllInvoices} onClose={() => setShowAllInvoices(false)} title="All Invoices">
                <div ref={invoicesContainerRef} style={{ maxHeight: 400, overflowY: 'auto' }} className="space-y-4">
                  {sortedInvoices.slice(0, invoiceLimit).map((invoice: any) => (
                    <div key={invoice.id} className="flex justify-between items-center text-sm border-b pb-2">
                      <div>
                        <p className="text-gray-dark dark:text-alabaster font-semibold">
                          {getPlanName()}
                        </p>
                        <p className="text-xs text-gray-dark dark:text-gray-300">
                          {formatDate(getInvoiceDate(invoice))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-dark dark:text-alabaster">
                          {formatCurrency(getInvoiceAmount(invoice), getInvoiceCurrency(invoice))}
                        </p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {loadingMoreInvoices && (
                    <div className="text-center py-2 text-gray-500 text-xs">Loading more...</div>
                  )}
                  {invoiceLimit >= sortedInvoices.length && sortedInvoices.length > 10 && (
                    <div className="text-center py-2 text-gray-400 text-xs">All invoices loaded</div>
                  )}
                </div>
              </Modal>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
