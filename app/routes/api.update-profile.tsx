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
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get user ID from auth_id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", authId)
      .single();

    if (!user) {
      return json({ error: "User not found" }, { status: 404 });
    }

    // Parse request body
    const { name, email, email_notifications, app_notifications, chat_bubble_color } = await request.json();

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (email_notifications !== undefined) updateData.email_notifications = email_notifications;
    if (app_notifications !== undefined) updateData.app_notifications = app_notifications;
    if (chat_bubble_color !== undefined) updateData.chat_bubble_color = chat_bubble_color;

    // Update user in database
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return json({ error: "Failed to update profile" }, { status: 500 });
    }

    // If email is being updated, update it in Supabase Auth as well
    if (email !== undefined) {
      // For security, we might want to require re-authentication for email changes
      // For now, we'll just update it in our database
      // In production, you might want to send a verification email
    }

    return json({ success: true, profile: data });
  } catch (error) {
    console.error("Unexpected error updating profile:", error);
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}; 