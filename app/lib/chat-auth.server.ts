import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export interface ChatUser {
  id: string;
  role: "coach" | "client";
  coach_id: string | null;
  name: string;
  avatar_url: string | null;
}

export function getAuthIdFromRequest(request: Request): string | undefined {
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  let accessToken: string | undefined;
  if (supabaseAuthCookieKey) {
    try {
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      const [access] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
    } catch {
      accessToken = undefined;
    }
  }

  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      if (decoded && typeof decoded === "object" && "sub" in decoded) {
        return decoded.sub as string;
      }
    } catch {
      // fall through
    }
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.decode(token) as Record<string, unknown> | null;
      if (decoded && typeof decoded === "object" && "sub" in decoded) {
        return decoded.sub as string;
      }
    } catch {
      // fall through
    }
  }

  return undefined;
}

export function createServiceClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function getChatUserFromRequest(
  request: Request
): Promise<ChatUser | null> {
  const authId = getAuthIdFromRequest(request);
  if (!authId) return null;

  const supabase = createServiceClient();
  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role, coach_id, name, avatar_url")
    .eq("auth_id", authId)
    .single();

  if (!userRecord || (userRecord.role !== "coach" && userRecord.role !== "client")) {
    return null;
  }

  return {
    id: userRecord.id,
    role: userRecord.role,
    coach_id: userRecord.coach_id,
    name: userRecord.name,
    avatar_url: userRecord.avatar_url ?? null,
  };
}

export async function verifyCoachOwnsClient(
  coachId: string,
  clientId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .eq("role", "client")
    .single();
  return !!data;
}

export async function verifyGroupAccess(
  user: ChatUser,
  groupId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  if (user.role === "coach") {
    const { data } = await supabase
      .from("chat_groups")
      .select("id")
      .eq("id", groupId)
      .eq("coach_id", user.id)
      .single();
    return !!data;
  }
  const { data } = await supabase
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("client_id", user.id)
    .single();
  return !!data;
}
