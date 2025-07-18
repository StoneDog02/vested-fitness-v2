import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { getCurrentTimestampISO } from "~/lib/timezone";

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
    const { supplementIds, date } = await request.json();

    if (!Array.isArray(supplementIds) || !date) {
      return json({ error: "supplementIds (array) and date are required" }, { status: 400 });
    }

    const completionDate = new Date(date);
    const dateString = completionDate.toISOString().split('T')[0];

    // First, delete all existing completions for this date
    const { error: deleteError } = await supabase
      .from("supplement_completions")
      .delete()
      .eq("user_id", user.id)
      .gte("completed_at", `${dateString}T00:00:00.000Z`)
      .lt("completed_at", `${dateString}T23:59:59.999Z`);

    if (deleteError) {
      return json({ error: deleteError.message }, { status: 500 });
    }

    // Then, insert new completions for checked supplements
    if (supplementIds.length > 0) {
      const completions = supplementIds.map(supplementId => ({
        user_id: user.id,
        supplement_id: supplementId,
        completed_at: getCurrentTimestampISO() // Use current timestamp instead of date
      }));

      const { error: insertError } = await supabase
        .from("supplement_completions")
        .insert(completions);

      if (insertError) {
        return json({ error: insertError.message }, { status: 500 });
      }
    }

    return json({ 
      message: `Supplement completions recorded for ${supplementIds.length} supplements`, 
      success: true 
    });
  } catch (error) {
    console.error("Error submitting supplement completions:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}; 