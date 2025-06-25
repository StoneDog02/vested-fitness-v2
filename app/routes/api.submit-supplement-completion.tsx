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
    const body = await request.json();
    const { supplementId, completed, date } = body;

    if (!supplementId || typeof completed !== "boolean") {
      return json({ error: "supplementId and completed (boolean) are required" }, { status: 400 });
    }

    // Use provided date or current date
    const completionDate = date ? new Date(date) : new Date();
    const dateString = completionDate.toISOString().split('T')[0];

    if (completed) {
      // Check if completion already exists for this supplement and date
      const { data: existingCompletion } = await supabase
        .from("supplement_completions")
        .select("id")
        .eq("user_id", user.id)
        .eq("supplement_id", supplementId)
        .gte("completed_at", dateString)
        .lt("completed_at", new Date(completionDate.getTime() + 86400000).toISOString().split('T')[0])
        .single();

      if (existingCompletion) {
        return json({ message: "Supplement already completed for this date", success: true });
      }

      // Insert new completion
      const { error: insertError } = await supabase
        .from("supplement_completions")
        .insert({
          user_id: user.id,
          supplement_id: supplementId,
          completed_at: completionDate.toISOString()
        });

      if (insertError) {
        return json({ error: insertError.message }, { status: 500 });
      }

      return json({ message: "Supplement completion recorded", success: true });
    } else {
      // Remove completion if unchecked
      const { error: deleteError } = await supabase
        .from("supplement_completions")
        .delete()
        .eq("user_id", user.id)
        .eq("supplement_id", supplementId)
        .gte("completed_at", dateString)
        .lt("completed_at", new Date(completionDate.getTime() + 86400000).toISOString().split('T')[0]);

      if (deleteError) {
        return json({ error: deleteError.message }, { status: 500 });
      }

      return json({ message: "Supplement completion removed", success: true });
    }
  } catch (error) {
    console.error("Error submitting supplement completion:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}; 