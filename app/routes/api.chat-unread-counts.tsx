import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

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

// GET: Fetch unread chat counts for all clients for the current coach
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Find the user's record (must be coach)
  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", userId)
    .single();
  if (!userRecord || userRecord.role !== "coach") {
    return json({ error: "User is not a coach" }, { status: 403 });
  }
  const coachId = userRecord.id;

  // Get all active clients for this coach
  const { data: clients } = await supabase
    .from("users")
    .select("id")
    .eq("coach_id", coachId)
    .eq("role", "client");
  if (!clients) {
    return json({ error: "No clients found" }, { status: 404 });
  }

  // For each client, get last_seen_at for coach and count unread messages
  const result: Record<string, number> = {};
  for (const client of clients) {
    // Get last_seen_at for coach in this chat
    const { data: lastSeenRow } = await supabase
      .from("chat_last_seen")
      .select("last_seen_at")
      .eq("user_id", coachId)
      .eq("coach_id", coachId)
      .eq("client_id", client.id)
      .single();
    const lastSeenAt = lastSeenRow?.last_seen_at;
    // Count unread messages (sent by client after last_seen_at)
    let query = supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("client_id", client.id)
      .eq("sender", "client");
    if (lastSeenAt) {
      query = query.gt("timestamp", lastSeenAt);
    }
    const { count: unreadCount } = await query;
    result[client.id] = unreadCount ?? 0;
  }
  return json({ unreadCounts: result });
}
