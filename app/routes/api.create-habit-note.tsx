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
    const { data: user } = await supabase.from("users").select("id, role, coach_id").eq("auth_id", authId).single();
    if (!user) return json({ error: "User not found" }, { status: 404 });

    const body = await request.json();
    const { clientId, clientHabitId, content } = body as {
      clientId?: string;
      clientHabitId?: string | null;
      content?: string;
    };
    if (!content || typeof content !== "string" || !content.trim()) {
      return json({ error: "Content is required" }, { status: 400 });
    }

    let coachId: string;
    let noteClientId: string;
    let authorRole: "coach" | "client";

    if (user.role === "coach") {
      if (!clientId) return json({ error: "clientId is required for coach notes" }, { status: 400 });
      const { data: client } = await supabase
        .from("users")
        .select("id, coach_id")
        .eq("id", clientId)
        .single();
      if (!client || client.coach_id !== user.id) {
        return json({ error: "Client not found or access denied" }, { status: 404 });
      }
      coachId = user.id;
      noteClientId = clientId;
      authorRole = "coach";
    } else {
      coachId = user.coach_id!;
      noteClientId = user.id;
      authorRole = "client";
    }

    const { data: note, error } = await supabase
      .from("habit_notes")
      .insert({
        client_id: noteClientId,
        coach_id: coachId,
        client_habit_id: clientHabitId && clientHabitId.trim() ? clientHabitId : null,
        author_role: authorRole,
        content: content.trim(),
      })
      .select("id, content, author_role, client_habit_id, created_at")
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ note });
  } catch (e) {
    console.error("create-habit-note:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
