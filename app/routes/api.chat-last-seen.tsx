import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { getCurrentTimestampISO } from "~/lib/timezone";

function getUserIdFromRequest(request: Request): string | undefined {
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
  let userId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      userId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      userId = undefined;
    }
  }
  return userId;
}

// POST: Update last_seen_at for the current user in a chat
export async function action({ request }: ActionFunctionArgs) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }
  const formData = await request.formData();
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) {
    return json({ error: "clientId is required" }, { status: 400 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Find the user's record (coach or client)
  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role, coach_id")
    .eq("auth_id", userId)
    .single();
  if (!userRecord) {
    return json({ error: "User not found" }, { status: 404 });
  }

  let coachId, clientIdForQuery;
  if (userRecord.role === "coach") {
    coachId = userRecord.id;
    clientIdForQuery = clientId;
  } else if (userRecord.role === "client") {
    coachId = userRecord.coach_id;
    clientIdForQuery = userRecord.id;
  } else {
    return json({ error: "Invalid user role" }, { status: 403 });
  }

  // Upsert last_seen_at for this user in this chat
  const now = getCurrentTimestampISO();
  const { error } = await supabase
    .from("chat_last_seen")
    .upsert({
      user_id: userRecord.id,
      coach_id: coachId,
      client_id: clientIdForQuery,
      last_seen_at: now,
    }, { onConflict: "user_id,coach_id,client_id" });
  if (error) {
    return json({ error: error.message }, { status: 500 });
  }
  return json({ success: true, last_seen_at: now });
}
