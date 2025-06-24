import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const action = async ({ request }: { request: Request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  // Get user from cookie
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
      /* ignore */
    }
  }
  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }
  // Get user row
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .single();
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }
  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { completedMealIds, date } = body;
  if (!Array.isArray(completedMealIds) || !date) {
    return json({ error: "Missing completedMealIds or date" }, { status: 400 });
  }
  // Insert meal completions (avoid duplicates)
  for (const mealId of completedMealIds) {
    // Check if already exists
    const { data: existing } = await supabase
      .from("meal_completions")
      .select("id")
      .eq("user_id", user.id)
      .eq("meal_id", mealId)
      .eq("completed_at", date)
      .single();
    if (!existing) {
      const { error: insertError, data: insertData } = await supabase.from("meal_completions").insert({
        user_id: user.id,
        meal_id: mealId,
        completed_at: date,
      });
      if (insertError) {
        return json({ error: insertError.message }, { status: 500 });
      }
    }
  }
  return json({ success: true });
};

export const loader = async () => json({ error: "Not found" }, { status: 404 }); 