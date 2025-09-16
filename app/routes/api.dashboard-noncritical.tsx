import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import { extractAuthFromCookie } from "~/lib/supabase";

export async function loader({ request }: LoaderFunctionArgs) {
  // Minimal auth gate: require cookie but return empty placeholders
  const cookies = parse(request.headers.get("cookie") || "");
  const { accessToken } = extractAuthFromCookie(cookies);
  if (!accessToken) return json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || 1);

  return json({
    recentClients: [],
    recentActivity: [],
    weightChange: 0,
    hasMore: false,
    page,
  });
}