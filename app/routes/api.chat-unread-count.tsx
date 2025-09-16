import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

// Helper to get userId from request cookies or Bearer token (for mobile)
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
  
  // Fallback: Try Bearer token authentication for mobile
  if (!userId) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.decode(token) as Record<string, unknown> | null;
        userId =
          decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
      } catch (e) {
        userId = undefined;
      }
    }
  }
  
  return userId;
}

// GET: Fetch unread chat count for the current user in a chat
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) {
    return json({ error: "clientId is required" }, { status: 400 });
  }

  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return json({ error: "Not authenticated" }, { status: 401 });
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

  let coachId, clientIdForQuery, isCoach;
  if (userRecord.role === "coach") {
    coachId = userRecord.id;
    clientIdForQuery = clientId;
    isCoach = true;
  } else if (userRecord.role === "client") {
    coachId = userRecord.coach_id;
    clientIdForQuery = userRecord.id;
    isCoach = false;
  } else {
    return json({ error: "Invalid user role" }, { status: 403 });
  }

  // Get last seen timestamp for this user in this chat
  const { data: lastSeenRow } = await supabase
    .from("chat_last_seen")
    .select("last_seen_at")
    .eq("user_id", userRecord.id)
    .eq("coach_id", coachId)
    .eq("client_id", clientIdForQuery)
    .single();
  const lastSeenAt = lastSeenRow?.last_seen_at;

  // Count unread messages (sent by the other party after last_seen_at)
  const senderToCheck = isCoach ? "client" : "coach";
  let query = supabase
    .from("chats")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .eq("client_id", clientIdForQuery)
    .eq("sender", senderToCheck);
  if (lastSeenAt) {
    query = query.gt("timestamp", lastSeenAt);
  }
  const { count: unreadCount } = await query;

  return json({ unreadCount: unreadCount ?? 0 });
} 