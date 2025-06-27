import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
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

    if (!accessToken) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return json({ error: "Current password and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return json({ error: "New password must be at least 6 characters long" }, { status: 400 });
    }

    // Get user ID from JWT token
    let authId: string | undefined;
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId = decoded && typeof decoded === "object" && "sub" in decoded
        ? (decoded.sub as string)
        : undefined;
    } catch (e) {
      return json({ error: "Invalid token" }, { status: 401 });
    }

    if (!authId) {
      return json({ error: "Unable to get user ID from token" }, { status: 401 });
    }

    // Create Supabase client with user's access token to get user info
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    // Get the current user's email
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return json({ error: "Unable to verify current user" }, { status: 401 });
    }

    // Verify current password by attempting to sign in
    const supabaseAuth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (signInError) {
      return json({ error: "Current password is incorrect" }, { status: 400 });
    }

    // Use Admin API to update password
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return json({ error: "Failed to update password" }, { status: 500 });
    }

    return json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Unexpected error changing password:", error);
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}; 