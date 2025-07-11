import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import DashboardLayout from "~/components/layout/DashboardLayout";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { UserRole } from "~/lib/supabase";
import React from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
  let role = "coach";
  let user = null;
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      /* ignore */
    }
  }
  let currentInvoice = null;
  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: userData } = await supabase
      .from("users")
      .select("id, name, email, role, avatar_url, font_size, access_status, stripe_customer_id")
      .eq("auth_id", authId)
      .single();
    if (userData) {
      role = userData.role;
      user = userData;
      if (userData.stripe_customer_id) {
        const stripeModule = await import("~/utils/stripe.server");
        currentInvoice = await stripeModule.getCurrentOpenInvoice(userData.stripe_customer_id);
      }
    }
  }
  return json({ role, user, currentInvoice });
};

export default function Dashboard() {
  const { role, user, currentInvoice } = useLoaderData<typeof loader>();

  // Move hooks to top level
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Move functions to top level
  function formatCurrency(amount: number, currency: string | null | undefined) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency ?? 'usd'),
    }).format(amount / 100);
  }

  // Handler for Pay button (fallback)
  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pay-latest-invoice', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Payment failed.');
      } else {
        window.location.reload();
      }
    } catch (e) {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  if (user && user.access_status === 'payment_required') {
    // Next Billing Date logic
    let nextBillingDate = (currentInvoice && currentInvoice.period_end)
      ? new Date(currentInvoice.period_end * 1000).toLocaleDateString()
      : 'N/A';

    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Payment Required</h1>
        <p className="mb-4">Your account has been restricted due to failed payment attempts. Please update your payment method to regain access.</p>
        {/* Main price and next billing date */}
        <div className="mb-4 p-3 border border-gray-light bg-white rounded w-full max-w-md">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-secondary">Current Amount Due</span>
            <span className="font-bold text-lg">
              {currentInvoice
                ? formatCurrency(currentInvoice.amount_due, currentInvoice.currency)
                : '$0.00'}
            </span>
          </div>
          <div className="mb-2">
            <span className="text-sm text-gray-700">Next Billing Date: </span>
            <span className="text-sm text-gray-900">{nextBillingDate}</span>
          </div>
          {/* Pay Now button */}
          {currentInvoice && currentInvoice.hosted_invoice_url ? (
            <a
              href={currentInvoice.hosted_invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded disabled:opacity-50 inline-block text-center w-full"
            >
              Pay Now
            </a>
          ) : (
            <button
              onClick={handlePay}
              disabled={loading}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded disabled:opacity-50 w-full"
            >
              {loading ? 'Paying...' : 'Pay Now'}
            </button>
          )}
          {error && <p className="text-red-600 mt-2">{error}</p>}
        </div>
        <a href="/dashboard/settings/payment" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 mb-4">Update Payment Method</a>
      </div>
    );
  }

  return (
    <DashboardLayout userRole={role as UserRole} user={user as { id: string; name: string; email: string; avatar_url?: string; font_size?: string; access_status?: string } | null}>
      <Outlet />
    </DashboardLayout>
  );
}
