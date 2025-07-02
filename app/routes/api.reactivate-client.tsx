import { json, type ActionFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const clientId = formData.get("clientId") as string;
    const email = formData.get("email") as string;

    if (!clientId || !email) {
      return json({ error: "Client ID and email are required" }, { status: 400 });
    }

    // Get the coach's auth token from cookies
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
        return json({ error: "Authentication required" }, { status: 401 });
      }
    }

    if (!accessToken) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    // Decode the JWT to get the coach's auth ID
    let coachAuthId: string;
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      coachAuthId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : "";
      if (!coachAuthId) {
        return json({ error: "Invalid authentication" }, { status: 401 });
      }
    } catch (e) {
      return json({ error: "Invalid authentication" }, { status: 401 });
    }

    // Create admin client for user operations
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Verify the coach exists and get their ID
    const { data: coach, error: coachError } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("auth_id", coachAuthId)
      .single();

    if (coachError || !coach || coach.role !== "coach") {
      return json({ error: "Coach not found or invalid permissions" }, { status: 403 });
    }

    // Get the inactive client and verify they belong to this coach
    const { data: client, error: clientError } = await supabaseAdmin
      .from("users")
      .select("id, name, email, status, coach_id")
      .eq("id", clientId)
      .eq("coach_id", coach.id)
      .eq("status", "inactive")
      .single();

    if (clientError || !client) {
      return json({ error: "Inactive client not found or access denied" }, { status: 404 });
    }

    // Verify the provided email matches (security check)
    if (client.email.toLowerCase() !== email.toLowerCase()) {
      return json({ error: "Email does not match client record" }, { status: 400 });
    }

    // Handle auth account creation - check if user already exists
    const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!"; // Generate secure temp password
    
    let authUser = null;
    let authUserId = null;

    // First, try to create a new auth user
    const { data: newAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
    });

    if (newAuthUser?.user) {
      // Success - new auth user created
      authUser = newAuthUser.user;
      authUserId = newAuthUser.user.id;
    } else if (createAuthError?.message?.includes("already been registered")) {
      // User already exists - try to get the existing user
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error("Error listing existing users:", listError);
        return json({ error: "Failed to check existing auth accounts" }, { status: 500 });
      }

      // Find the existing user by email
      const existingUser = existingUsers.users.find(u => u.email === email);
      
      if (existingUser) {
        // Update the existing user's password
        const { data: updatedUser, error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { 
            password: tempPassword,
            email_confirm: true 
          }
        );

        if (updateAuthError) {
          console.error("Error updating existing auth user:", updateAuthError);
          return json({ error: "Failed to update existing auth account" }, { status: 500 });
        }

        authUser = updatedUser.user;
        authUserId = existingUser.id;
      } else {
        console.error("User should exist but not found in list");
        return json({ error: "Failed to locate existing auth account" }, { status: 500 });
      }
    } else {
      // Other error occurred
      console.error("Error creating auth user:", createAuthError);
      return json({ error: "Failed to create auth account: " + (createAuthError?.message || "Unknown error") }, { status: 500 });
    }

    if (!authUserId) {
      return json({ error: "Failed to get auth user ID" }, { status: 500 });
    }

    // Update the existing user record to link to auth account and reactivate
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        auth_id: authUserId,
        status: 'active',
        inactive_since: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", client.id);

    if (updateError) {
      console.error("Error updating user record:", updateError);
      // Clean up the auth user we created (only if it's new)
      if (newAuthUser?.user) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return json({ error: "Failed to reactivate client" }, { status: 500 });
    }

    // Send password reset email so client can set their own password
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    console.log("Password reset attempt:", { 
      email, 
      success: !resetError, 
      error: resetError?.message,
      hasResetLink: !!resetData?.properties?.action_link 
    });

    if (resetError) {
      console.error("Error sending password reset:", resetError);
      // Provide temp password as fallback
      return json({ 
        success: true, 
        message: `${client.name} has been reactivated. Email delivery failed - using temporary password below.`,
        tempPassword: tempPassword,
        emailError: resetError.message,
        instructions: `Email delivery failed (${resetError.message}). The client can sign in with the temporary password below, then change it in settings.`
      });
    }

    // Always provide temp password as fallback due to email delivery issues
    const emailSent = resetData?.properties?.action_link && !resetError;
    
    if (emailSent) {
      return json({ 
        success: true, 
        message: `${client.name} has been reactivated successfully! Password reset email sent.`,
        instructions: `A password reset email has been sent to ${email}. If not received within 5 minutes, check spam/junk folder or use the temporary password below as backup.`,
        tempPassword: tempPassword, // Always provide backup
        resetLink: resetData.properties.action_link // Include for debugging
      });
    } else {
      // No reset link or error occurred
      return json({ 
        success: true, 
        message: `${client.name} has been reactivated. Email delivery failed - using temporary password.`,
        tempPassword: tempPassword,
        instructions: `Email delivery failed. The client can sign in with the temporary password below, then change it in settings.`,
        emailError: (resetError as any)?.message || "No reset link generated"
      });
    }

  } catch (error) {
    console.error("Client reactivation error:", error);
    return json({ error: "Failed to reactivate client" }, { status: 500 });
  }
}; 