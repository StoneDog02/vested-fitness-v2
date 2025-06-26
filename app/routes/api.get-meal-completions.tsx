import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

function getDatesInRange(start: string, end: string): string[] {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const userIdParam = url.searchParams.get("userId");
  if (!date && !(start && end)) {
    return json({ error: "Missing date or start/end parameter" }, { status: 400 });
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
    .select("id, role")
    .eq("auth_id", authId)
    .single();
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }
  let targetUserId = user.id;
  if (userIdParam && user.role === "coach") {
    targetUserId = userIdParam;
  }
  if (start && end) {
    // Get completions for the date range
    const { data: completions } = await supabase
      .from("meal_completions")
      .select("meal_id, completed_at")
      .eq("user_id", targetUserId)
      .gte("completed_at", start)
      .lte("completed_at", end);
    // Map: date -> [meal_id]
    const result: Record<string, string[]> = {};
    const current = new Date().toISOString().slice(0, 10);
    for (const d of getDatesInRange(start, end)) {
      result[d] = [];
    }
    (completions || []).forEach(row => {
      const dateKey = row.completed_at ? row.completed_at.slice(0, 10) : null;
      if (dateKey && result[dateKey]) {
        result[dateKey].push(row.meal_id);
      }
    });
    return json({ completionsByDate: result });
  } else if (date) {
    // Get completed meal IDs for the date
    const { data: completions } = await supabase
      .from("meal_completions")
      .select("meal_id")
      .eq("user_id", targetUserId)
      .eq("completed_at", date);
    const completedMealIds = (completions || []).map((row) => row.meal_id);
    return json({ completedMealIds });
  }
};

export const action = async () => json({ error: "Not found" }, { status: 404 }); 