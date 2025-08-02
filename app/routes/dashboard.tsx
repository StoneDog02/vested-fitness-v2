import { json, redirect , createCookie } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import DashboardLayout from "~/components/layout/DashboardLayout";
import { createClient } from "@supabase/supabase-js";
import type { Database , UserRole } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunctionArgs } from "@remix-run/node";
import React from "react";
import { UserContext } from "~/context/UserContext";
import { extractAuthFromCookie, validateAndRefreshToken } from "~/lib/supabase";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = parse(request.headers.get("cookie") || "");
  const { accessToken, refreshToken } = extractAuthFromCookie(cookies);
  
  let authId: string | undefined;
  let needsTokenRefresh = false;
  let newTokens: { accessToken: string; refreshToken: string } | null = null;
  
  if (accessToken && refreshToken) {
    // Validate and potentially refresh the token
    const validation = await validateAndRefreshToken(accessToken, refreshToken);
    
    if (validation.valid) {
      if (validation.newAccessToken && validation.newRefreshToken) {
        // Token was refreshed, we need to update the cookie
        needsTokenRefresh = true;
        newTokens = {
          accessToken: validation.newAccessToken,
          refreshToken: validation.newRefreshToken
        };
        
        // Extract authId from new token
        try {
          const decoded = jwt.decode(validation.newAccessToken) as Record<string, unknown> | null;
          authId = decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
        } catch (e) {
          console.error("Failed to decode refreshed token:", e);
        }
      } else {
        // Token is still valid, extract authId
        try {
          const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
          authId = decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
        } catch (e) {
          console.error("Failed to decode access token:", e);
        }
      }
    } else {
      console.error("Token validation failed:", validation.reason);
    }
  }
  
  // If no valid auth, redirect to login
  if (!authId) {
    return redirect("/auth/login");
  }
  
  let role = "coach";
  let user = null;
  let currentInvoice = null;
  
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  const { data: userData } = await supabase
    .from("users")
    .select("id, name, email, role, avatar_url, font_size, access_status, stripe_customer_id, chat_bubble_color, starting_weight, current_weight, created_at, coach_id")
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
  
  // Prepare response
  const responseData = { 
    role: role ?? null, 
    user: user ?? null, 
    currentInvoice: currentInvoice ?? null 
  };
  
  // If we need to refresh tokens, set the new cookie
  if (needsTokenRefresh && newTokens) {
    const supabaseSession = createCookie("sb-ckwcxmxbfffkknrnkdtk-auth-token", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    const setCookie = await supabaseSession.serialize(
      JSON.stringify([newTokens.accessToken, newTokens.refreshToken])
    );
    
    return json(responseData, {
      headers: { "Set-Cookie": setCookie }
    });
  }
  
  return json(responseData);
};

export function ErrorBoundary() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            Authentication Error
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your session has expired. Please log in again.
          </p>
          <div className="mt-6">
            <a
              href="/auth/login"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

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
