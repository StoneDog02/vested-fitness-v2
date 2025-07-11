import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

// Helper to get userId from request cookies
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

// GET: Fetch chat messages between coach and client
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

  // Determine coach_id and client_id for the chat
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

  // Fetch messages
  const { data: messages, error } = await supabase
    .from("chats")
    .select("id, coach_id, client_id, sender, content, timestamp")
    .eq("coach_id", coachId)
    .eq("client_id", clientIdForQuery)
    .order("timestamp", { ascending: true });

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json({ messages });
}

// POST: Send a new chat message
export async function action({ request }: ActionFunctionArgs) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const clientId = formData.get("clientId")?.toString();
  const content = formData.get("content")?.toString();
  if (!clientId || !content) {
    return json({ error: "clientId and content are required" }, { status: 400 });
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

  let coachId, clientIdForInsert, sender;
  if (userRecord.role === "coach") {
    coachId = userRecord.id;
    clientIdForInsert = clientId;
    sender = "coach";
  } else if (userRecord.role === "client") {
    coachId = userRecord.coach_id;
    clientIdForInsert = userRecord.id;
    sender = "client";
  } else {
    return json({ error: "Invalid user role" }, { status: 403 });
  }

  // Insert the message
  const { data, error } = await supabase
    .from("chats")
    .insert({
      coach_id: coachId,
      client_id: clientIdForInsert,
      sender,
      content,
    })
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json({ message: data });
} 