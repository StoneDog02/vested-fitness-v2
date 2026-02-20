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
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );
    let accessToken: string | undefined;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(cookies[supabaseAuthCookieKey], "base64").toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch {
        accessToken = undefined;
      }
    }
    let authId: string | undefined;
    if (accessToken) {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId = decoded && typeof decoded === "object" && "sub" in decoded ? (decoded.sub as string) : undefined;
    }
    if (!authId) return json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase.from("users").select("id, role").eq("auth_id", authId).single();
    if (!user || user.role !== "coach") return json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { name, description } = body as { name?: string; description?: string };
    if (!name || typeof name !== "string" || !name.trim()) {
      return json({ error: "Habit name is required" }, { status: 400 });
    }

    const { data: preset, error } = await supabase
      .from("habit_presets")
      .insert({
        coach_id: user.id,
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        preset_type: "custom",
        target_default: null,
        target_unit: null,
      })
      .select("id, name, description, preset_type, target_default, target_unit, created_at")
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ preset });
  } catch (e) {
    console.error("create-habit-preset:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
