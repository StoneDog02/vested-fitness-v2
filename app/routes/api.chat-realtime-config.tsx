import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getAuthIdFromRequest } from "~/lib/chat-auth.server";
import { parse } from "cookie";
import { Buffer } from "buffer";

function getAccessTokenFromRequest(request: Request): string | undefined {
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  if (!supabaseAuthCookieKey) return undefined;

  try {
    const cookieValue = cookies[supabaseAuthCookieKey];
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
    let parsed: unknown = JSON.parse(decoded);
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authId = getAuthIdFromRequest(request);
  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const accessToken = getAccessTokenFromRequest(request);
  if (!accessToken) {
    return json({ error: "No access token" }, { status: 401 });
  }

  return json({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
    accessToken,
  });
}
