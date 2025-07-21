import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export async function loader({ request }: LoaderFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user from auth cookie
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

  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      authId = undefined;
    }
  }

  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get the coach's user record
  const { data: coachUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== 'coach') {
    return json({ error: "Only coaches can access forms" }, { status: 403 });
  }

  try {
    // Fetch forms created by this coach
    const { data: forms, error } = await supabase
      .from("check_in_forms")
      .select("id, title, description, created_at")
      .eq("coach_id", coachUser.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching forms:", error);
      return json({ error: "Failed to fetch forms" }, { status: 500 });
    }

    return json({ forms: forms || [] });
  } catch (error) {
    console.error("Error fetching check-in forms:", error);
    return json({ error: "Failed to fetch forms" }, { status: 500 });
  }
} 