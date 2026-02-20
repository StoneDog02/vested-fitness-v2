import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const clientIdParam = url.searchParams.get("clientId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!startDate || !endDate) {
      return json({ error: "startDate and endDate are required" }, { status: 400 });
    }

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
    const { data: user } = await supabase.from("users").select("id, role, coach_id").eq("auth_id", authId).single();
    if (!user) return json({ error: "User not found" }, { status: 404 });

    let targetClientId: string;
    if (clientIdParam && user.role === "coach") {
      const { data: client } = await supabase
        .from("users")
        .select("id, coach_id")
        .eq("id", clientIdParam)
        .single();
      if (!client || client.coach_id !== user.id) {
        return json({ error: "Client not found or access denied" }, { status: 404 });
      }
      targetClientId = clientIdParam;
    } else if (user.role === "client") {
      targetClientId = user.id;
    } else {
      return json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: assigned } = await supabase
      .from("client_habits")
      .select("id")
      .eq("client_id", targetClientId);
    const clientHabitIds = (assigned || []).map((r) => r.id);
    if (clientHabitIds.length === 0) {
      return json({ completions: [] });
    }

    const { data: completions, error } = await supabase
      .from("habit_completions")
      .select("id, client_habit_id, completed_at, value")
      .in("client_habit_id", clientHabitIds)
      .gte("completed_at", startDate)
      .lt("completed_at", endDate)
      .order("completed_at", { ascending: false });

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ completions: completions || [] });
  } catch (e) {
    console.error("get-habit-completions:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
