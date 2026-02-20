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
    if (!user || user.role !== "client") return json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const payload = body as { date: string; completions?: { client_habit_id: string; date: string; value?: number }[] };
    const dateStr = payload?.date;
    const items = Array.isArray(payload?.completions) ? payload.completions : (Array.isArray(body) ? body : []);
    if (!dateStr || typeof dateStr !== "string") {
      return json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    const clientHabitIds = items.length > 0 ? [...new Set(items.map((i) => i.client_habit_id))] : [];
    if (clientHabitIds.length > 0) {
      const { data: owned } = await supabase
        .from("client_habits")
        .select("id")
        .eq("client_id", user.id)
        .in("id", clientHabitIds);
      const ownedIds = new Set((owned || []).map((r) => r.id));
      for (const item of items) {
        if (!ownedIds.has(item.client_habit_id)) {
          return json({ error: "Access denied to one or more habits" }, { status: 403 });
        }
      }
    }

    const { data: allOwned } = await supabase
      .from("client_habits")
      .select("id")
      .eq("client_id", user.id);
    const allIds = (allOwned || []).map((r) => r.id);
    if (allIds.length > 0) {
      await supabase
        .from("habit_completions")
        .delete()
        .in("client_habit_id", allIds)
        .eq("completed_at", dateStr);
    }

    if (items.length === 0) {
      return json({ success: true });
    }

    const byKey = new Map<string, { client_habit_id: string; value: number | null }>();
    for (const item of items) {
      const key = item.client_habit_id;
      byKey.set(key, {
        client_habit_id: item.client_habit_id,
        value: typeof item.value === "number" ? item.value : null,
      });
    }
    const rows: Database["public"]["Tables"]["habit_completions"]["Insert"][] = Array.from(byKey.values()).map(
      (r) => ({
        client_habit_id: r.client_habit_id,
        completed_at: dateStr,
        value: r.value,
      })
    );

    const { error } = await supabase.from("habit_completions").insert(rows);

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ success: true });
  } catch (e) {
    console.error("submit-habit-completions:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
