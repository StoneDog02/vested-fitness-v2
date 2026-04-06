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
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  let accessToken: string | undefined;
  if (supabaseAuthCookieKey) {
    try {
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      const [access] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
    } catch {
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
    } catch {
      /* ignore */
    }
  }
  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .single();
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }

  let body: { id?: string; weight?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { id, weight: rawWeight } = body;
  if (!id || typeof id !== "string") {
    return json({ error: "Log id is required" }, { status: 400 });
  }
  const num =
    typeof rawWeight === "string"
      ? parseFloat(rawWeight)
      : Number(rawWeight);
  if (!Number.isFinite(num) || num <= 0) {
    return json({ error: "Valid weight is required" }, { status: 400 });
  }

  const { data: existing, error: selectError } = await supabase
    .from("weight_logs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError || !existing) {
    return json({ error: "Weight log not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("weight_logs")
    .update({ weight: num })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return json({ error: "Failed to update weight" }, { status: 500 });
  }

  const { data: ordered } = await supabase
    .from("weight_logs")
    .select("weight")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: true });

  if (ordered && ordered.length > 0) {
    const first = Number(ordered[0].weight);
    const last = Number(ordered[ordered.length - 1].weight);
    await supabase
      .from("users")
      .update({ starting_weight: first, current_weight: last })
      .eq("id", user.id);
  }

  return json({ success: true });
};
