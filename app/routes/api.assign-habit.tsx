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
    const {
      clientId,
      habitPresetId,
      customName,
      customDescription,
      targetValue,
      targetUnit,
      frequency = "daily",
      timesPerWeek,
      scheduleDays,
    } = body as {
      clientId?: string;
      habitPresetId?: string;
      customName?: string;
      customDescription?: string;
      targetValue?: number;
      targetUnit?: string;
      frequency?: string;
      timesPerWeek?: number;
      scheduleDays?: number[];
    };
    if (!clientId || !habitPresetId) {
      return json({ error: "clientId and habitPresetId are required" }, { status: 400 });
    }

    const { data: client } = await supabase
      .from("users")
      .select("id, coach_id")
      .eq("id", clientId)
      .single();
    if (!client || client.coach_id !== user.id) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    const freq =
      ["daily", "weekly", "flexible", "times_per_week"].includes(frequency) ? frequency : "daily";
    const insert: Database["public"]["Tables"]["client_habits"]["Insert"] = {
      client_id: clientId,
      habit_preset_id: habitPresetId,
      coach_id: user.id,
      custom_name: typeof customName === "string" && customName.trim() ? customName.trim() : null,
      custom_description:
        typeof customDescription === "string" && customDescription.trim() ? customDescription.trim() : null,
      target_value: typeof targetValue === "number" ? targetValue : null,
      target_unit: typeof targetUnit === "string" && targetUnit.trim() ? targetUnit.trim() : null,
      frequency: freq,
      times_per_week:
        freq === "times_per_week" && typeof timesPerWeek === "number" && timesPerWeek >= 2 && timesPerWeek <= 7
          ? timesPerWeek
          : null,
      schedule_days:
        Array.isArray(scheduleDays) && scheduleDays.length > 0
          ? scheduleDays.filter((d) => typeof d === "number" && d >= 0 && d <= 6)
          : null,
    };

    const { data: assigned, error } = await supabase
      .from("client_habits")
      .insert(insert)
      .select("id, client_id, habit_preset_id, frequency, assigned_at")
      .single();

    if (error) {
      if (error.code === "23505") return json({ error: "Habit already assigned to this client" }, { status: 409 });
      return json({ error: error.message }, { status: 500 });
    }
    return json({ assigned });
  } catch (e) {
    console.error("assign-habit:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
