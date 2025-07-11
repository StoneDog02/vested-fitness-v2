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
import { UserContext } from "~/context/UserContext";

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
      .select("id, name, email, role, avatar_url, font_size, access_status, stripe_customer_id, chat_bubble_color")
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
  // Defensive: always return these fields, even if null
  return json({ role: role ?? null, user: user ?? null, currentInvoice: currentInvoice ?? null });
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

  return (
    <UserContext.Provider value={user && role ? {
      id: user.id,
      role: role as 'coach' | 'client',
      chat_bubble_color: user.chat_bubble_color
    } : undefined}>
      <DashboardLayout userRole={role as UserRole} user={user as { id: string; name: string; email: string; avatar_url?: string; font_size?: string; access_status?: string } | null}>
        <Outlet />
      </DashboardLayout>
    </UserContext.Provider>
  );
}
