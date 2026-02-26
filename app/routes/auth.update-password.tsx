import { useEffect, useState } from "react";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";

export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  });
}

type PageState =
  | "reading_hash"
  | "invalid"
  | "ready"
  | "submitting"
  | "success"
  | "error";

export default function UpdatePassword() {
  const { supabaseUrl, supabaseAnonKey } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>("reading_hash");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tokens, setTokens] = useState<{ access_token: string; refresh_token: string } | null>(null);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setState("invalid");
      setErrorMessage("Configuration error. Please try again later.");
      return;
    }
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");

    if (type !== "recovery" || !access_token || !refresh_token) {
      setState("invalid");
      return;
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(() => {
        setTokens({ access_token, refresh_token });
        setState("ready");
      })
      .catch(() => {
        setState("invalid");
        setErrorMessage("This link is invalid or has expired.");
      });
  }, [supabaseUrl, supabaseAnonKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password should be at least 6 characters.");
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey || !tokens) {
      setState("invalid");
      return;
    }
    setState("submitting");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setState("error");
      setErrorMessage(updateError.message ?? "Failed to update password.");
      return;
    }
    const res = await fetch("/api/set-supabase-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      }),
      credentials: "include",
    });
    if (!res.ok) {
      setState("error");
      setErrorMessage("Session could not be saved. Please sign in again.");
      return;
    }
    setState("success");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    navigate("/dashboard", { replace: true });
  }

  if (state === "reading_hash") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alabaster dark:bg-night p-4">
        <div className="max-w-md w-full text-center text-secondary dark:text-alabaster">
          Verifying...
        </div>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alabaster dark:bg-night p-4">
        <div className="max-w-md w-full space-y-8 bg-white dark:bg-davyGray p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-secondary dark:text-alabaster">
            Invalid or expired link
          </h2>
          <p className="text-gray dark:text-gray-light">
            {errorMessage ||
              "This password reset link is invalid or has expired. Please request a new one."}
          </p>
          <div>
            <Link
              to="/auth/reset-password"
              className="inline-block text-primary hover:text-primary-dark"
            >
              Request a new reset link
            </Link>
          </div>
          <div>
            <Link
              to="/auth/login"
              className="text-sm text-primary hover:text-primary-dark"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alabaster dark:bg-night p-4">
        <div className="max-w-md w-full text-center text-secondary dark:text-alabaster">
          Password updated. Redirecting...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-alabaster dark:bg-night p-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-davyGray p-8 rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-secondary dark:text-alabaster">
            Set new password
          </h2>
          <p className="mt-2 text-sm text-gray dark:text-gray-light">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {errorMessage && (
            <div className="text-red-500 text-sm text-center" role="alert">
              {errorMessage}
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-secondary dark:text-alabaster"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-night dark:text-alabaster dark:border-davyGray"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-secondary dark:text-alabaster"
            >
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-night dark:text-alabaster dark:border-davyGray"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state === "submitting" ? "Updating..." : "Update password"}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/auth/login"
              className="text-sm text-primary hover:text-primary-dark"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
