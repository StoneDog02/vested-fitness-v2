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
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .single();
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }
  const { weight } = await request.json();
  if (!weight) {
    return json({ error: "Weight is required" }, { status: 400 });
  }
  // Insert into weight_logs
  await supabase.from("weight_logs").insert([
    {
      user_id: user.id,
      weight,
      logged_at: new Date().toISOString(),
    },
  ]);
  // Update user's starting_weight and current_weight
  await supabase
    .from("users")
    .update({ starting_weight: weight, current_weight: weight })
    .eq("id", user.id);
  return json({ success: true });
}; 