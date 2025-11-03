import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { extractAuthFromCookie, getSupabaseCookieName } from "~/lib/supabase";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = parse(request.headers.get("cookie") || "");
  const { accessToken, refreshToken } = extractAuthFromCookie(cookies);
  
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId = decoded && typeof decoded === "object" && "sub" in decoded
        ? (decoded.sub as string)
        : undefined;
    } catch (e) {
      console.error("Failed to decode token:", e);
    }
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  let userData = null;
  let userError = null;
  let authUsers = null;
  
  if (authId) {
    // Check users table
    const userResult = await supabase
      .from("users")
      .select("*")
      .eq("auth_id", authId)
      .single();
    
    userData = userResult.data;
    userError = userResult.error;

    // Also check auth.users table (read-only, but we can see if user exists in auth)
    try {
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(authId);
      authUsers = authErr ? { error: authErr.message } : { user: authData?.user };
    } catch (e) {
      authUsers = { error: String(e) };
    }
  }

  // Get all cookies for debugging
  const allCookies = Object.keys(cookies).map(key => ({
    name: key,
    value: key.includes("auth") ? "***REDACTED***" : cookies[key],
    isAuthCookie: key.startsWith("sb-") && key.endsWith("-auth-token")
  }));

  return json({
    cookieName: getSupabaseCookieName(),
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    authId,
    userData,
    userError: userError ? {
      message: userError.message,
      code: userError.code,
      details: userError.details,
      hint: userError.hint
    } : null,
    authUsers,
    allCookies,
    supabaseUrl: process.env.SUPABASE_URL?.substring(0, 30) + "..." // Partial URL for security
  });
};

export default function DebugAuth() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug Info</h1>
      
      <div className="space-y-6">
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-2">Cookie Information</h2>
          <p><strong>Cookie Name:</strong> {data.cookieName}</p>
          <p><strong>Has Access Token:</strong> {data.hasAccessToken ? "Yes" : "No"}</p>
          <p><strong>Has Refresh Token:</strong> {data.hasRefreshToken ? "Yes" : "No"}</p>
          <p><strong>Auth ID:</strong> {data.authId || "Not found"}</p>
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-2">All Cookies</h2>
          <pre className="text-xs overflow-auto">{JSON.stringify(data.allCookies, null, 2)}</pre>
        </div>

        {data.authId && (
          <>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
              <h2 className="font-semibold mb-2">Users Table Query</h2>
              {data.userError ? (
                <div className="bg-red-100 dark:bg-red-900 p-3 rounded mb-2">
                  <p className="text-red-800 dark:text-red-200"><strong>Error:</strong> {data.userError.message}</p>
                  <p className="text-red-800 dark:text-red-200"><strong>Code:</strong> {data.userError.code}</p>
                  {data.userError.details && <p className="text-red-800 dark:text-red-200"><strong>Details:</strong> {data.userError.details}</p>}
                  {data.userError.hint && <p className="text-red-800 dark:text-red-200"><strong>Hint:</strong> {data.userError.hint}</p>}
                </div>
              ) : null}
              {data.userData ? (
                <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                  <p className="text-green-800 dark:text-green-200"><strong>User Found:</strong></p>
                  <pre className="text-xs overflow-auto mt-2">{JSON.stringify(data.userData, null, 2)}</pre>
                </div>
              ) : (
                <div className="bg-yellow-100 dark:bg-yellow-900 p-3 rounded">
                  <p className="text-yellow-800 dark:text-yellow-200">No user found in users table with auth_id: {data.authId}</p>
                </div>
              )}
            </div>

            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
              <h2 className="font-semibold mb-2">Auth Users Table</h2>
              <pre className="text-xs overflow-auto">{JSON.stringify(data.authUsers, null, 2)}</pre>
            </div>
          </>
        )}

        {!data.authId && (
          <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded">
            <p className="text-yellow-800 dark:text-yellow-200">No auth ID found. You may not be logged in, or the cookie is not being read correctly.</p>
          </div>
        )}

        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-2">Environment</h2>
          <p><strong>Supabase URL:</strong> {data.supabaseUrl}</p>
        </div>
      </div>
    </div>
  );
}

