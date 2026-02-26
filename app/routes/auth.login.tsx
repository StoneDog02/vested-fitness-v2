import { Form, Link, useActionData } from "@remix-run/react";
import {
  json,
  type ActionFunction,
  type MetaFunction,
  redirect,
  createCookie,
} from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { getSupabaseCookieName } from "~/lib/supabase";
import jwt from "jsonwebtoken";
import { parse } from "cookie";

export const meta: MetaFunction = () => {
  return [
    { title: "Login | Kava Training" },
    { name: "description", content: "Log in to your Kava Training account" },
  ];
};

type ActionData = {
  error?: string;
  fields?: {
    email: string;
    password: string;
  };
};

// Cookie name will be set dynamically in the action

export const action: ActionFunction = async ({ request }) => {
  // First, clear any existing auth cookies to prevent conflicts
  const cookies = parse(request.headers.get("cookie") || "");
  const authCookieKeys = Object.keys(cookies).filter(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return json<ActionData>({
      error: "Email and password are required",
      fields: { email: email || "", password: password || "" },
    });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Sign in with Supabase Auth
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData.user) {
    return json<ActionData>({
      error: signInError?.message || "Invalid email or password.",
      fields: { email, password },
    });
  }

  // Get user from users table by auth_id
  const authId = signInData.user.id;
  console.log("Login attempt - Auth user ID:", authId);
  
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("role, status")
    .eq("auth_id", authId);

  console.log("Login query result:", { 
    userRow, 
    userError, 
    rowCount: userRow?.length || 0,
    authId: authId
  });
  
  // Also check what auth_id is in the database for this email
  const { data: userByEmail, error: emailError } = await supabase
    .from("users")
    .select("id, auth_id, email, name")
    .eq("email", email);
  console.log("User by email query:", { userByEmail, emailError, count: userByEmail?.length || 0 });
  
  // Also check ALL users to see what's in the database
  const { data: allUsers, error: allUsersError } = await supabase
    .from("users")
    .select("id, auth_id, email, name")
    .limit(10);
  console.log("Sample of users in database:", { allUsers, allUsersError, count: allUsers?.length || 0 });

  // Handle the query result
  if (userError) {
    console.error("Login error querying users table:", userError);
    return json<ActionData>({
      error: userError.message || "Database error occurred.",
      fields: { email, password },
    });
  }

  if (!userRow || userRow.length === 0) {
    console.error("Login error: No user found with auth_id:", authId);
    return json<ActionData>({
      error: "User not found in database. Please contact support.",
      fields: { email, password },
    });
  }

  if (userRow.length > 1) {
    console.error("Login error: Multiple users found with auth_id:", authId);
    return json<ActionData>({
      error: "Multiple user accounts found. Please contact support.",
      fields: { email, password },
    });
  }

  const user = userRow[0];

  // Check if user is inactive - block login if so
  if (user.status === "inactive") {
    return json<ActionData>({
      error: "Your account has been deactivated. Please contact your coach for assistance.",
      fields: { email, password },
    });
  }

  // Set the Supabase session cookie
  if (signInData.session) {
    const cookieName = getSupabaseCookieName();
    console.log("Setting cookie with name:", cookieName);
    console.log("Token auth_id:", authId);
    
    // Verify the token auth_id matches
    try {
      const decoded = jwt.decode(signInData.session.access_token) as Record<string, unknown> | null;
      const tokenAuthId = decoded && typeof decoded === "object" && "sub" in decoded ? decoded.sub : undefined;
      console.log("Token auth_id from access_token:", tokenAuthId);
      if (tokenAuthId !== authId) {
        console.error("⚠️ WARNING: Token auth_id mismatch!", { tokenAuthId, expectedAuthId: authId });
      }
    } catch (e) {
      console.error("Error decoding token:", e);
    }
    
    const supabaseSession = createCookie(cookieName, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    const setCookie = await supabaseSession.serialize(
      JSON.stringify([
        signInData.session.access_token,
        signInData.session.refresh_token,
      ])
    );
    
    // Clear any old cookies that might have different auth_id values
    // We need to clear all possible cookie names (in case there are multiple)
    const headers = new Headers();
    headers.set("Set-Cookie", setCookie);
    
    // Clear ALL existing auth cookies to prevent conflicts
    for (const oldCookieKey of authCookieKeys) {
      if (oldCookieKey !== cookieName) {
        const oldCookie = createCookie(oldCookieKey, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 0, // Expire immediately
        });
        const clearOldCookie = await oldCookie.serialize("");
        headers.append("Set-Cookie", clearOldCookie);
      }
    }
    
    // Redirect based on role with Set-Cookie header
    if (user.role === "coach") {
      return redirect("/dashboard", { headers });
    } else if (user.role === "client") {
      return redirect("/dashboard", { headers });
    }
  }

  return json<ActionData>({
    error: "Unknown user role or missing session.",
    fields: { email, password },
  });
};

export default function Login() {
  const actionData = useActionData<ActionData>();
  const formError = actionData?.error || "";

  return (
    <div className="light">
      <div className="min-h-screen bg-gray-lightest flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-bold text-secondary">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-dark">
            Or{" "}
            <Link
              to="/auth/register"
              className="font-medium text-primary hover:text-primary-dark"
            >
              create a new account
            </Link>
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <Form method="post" className="space-y-6">
              {formError && (
                <div className="rounded-md bg-red-50 p-4 mb-4">
                  <div className="flex">
                    <div className="text-sm text-red-700">{formError}</div>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-secondary"
                >
                  Email address
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    defaultValue={actionData?.fields?.email}
                    className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary bg-white text-black"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-secondary"
                >
                  Password
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary bg-white text-black"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember_me"
                    name="remember_me"
                    type="checkbox"
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-light rounded"
                  />
                  <label
                    htmlFor="remember_me"
                    className="ml-2 block text-sm text-gray-dark"
                  >
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <Link
                    to="/auth/reset-password"
                    className="font-medium text-primary hover:text-primary-dark"
                  >
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Sign in
                </button>
              </div>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
