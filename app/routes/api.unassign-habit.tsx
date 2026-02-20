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
    const clientHabitId = (body as { clientHabitId?: string }).clientHabitId;
    if (!clientHabitId) return json({ error: "clientHabitId is required" }, { status: 400 });

    const { data: row } = await supabase
      .from("client_habits")
      .select("id, coach_id")
      .eq("id", clientHabitId)
      .single();
    if (!row || row.coach_id !== user.id) {
      return json({ error: "Assignment not found or access denied" }, { status: 404 });
    }

    const { error } = await supabase.from("client_habits").delete().eq("id", clientHabitId);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ success: true });
  } catch (e) {
    console.error("unassign-habit:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
