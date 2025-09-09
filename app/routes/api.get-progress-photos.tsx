import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export async function loader({ request }: { request: Request }) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user from cookie
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
      /* ignore */
    }
  }

  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user row
  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }

  // Parse query parameters
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "5", 10);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    return json({ error: "Missing clientId parameter" }, { status: 400 });
  }

  // Verify access permissions
  if (user.role === "client") {
    // Clients can only view their own photos
    if (user.id !== clientId) {
      return json({ error: "Unauthorized" }, { status: 403 });
    }
  } else if (user.role === "coach") {
    // Coaches can view photos for their clients
    const { data: client } = await supabase
      .from("users")
      .select("coach_id")
      .eq("id", clientId)
      .single();
    
    if (!client || client.coach_id !== user.id) {
      return json({ error: "Unauthorized" }, { status: 403 });
    }
  } else {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  // Calculate offset
  const offset = (page - 1) * pageSize;

  try {
    // Fetch paginated progress photos
    const { data: photos, error, count } = await supabase
      .from("progress_photos")
      .select("id, photo_url, notes, created_at", { count: "exact" })
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching progress photos:', error);
      return json({ error: "Failed to fetch progress photos" }, { status: 500 });
    }

    const totalPhotos = count || 0;
    const hasMore = offset + pageSize < totalPhotos;

    return json({
      photos: photos || [],
      page,
      pageSize,
      totalPhotos,
      hasMore,
    });

  } catch (error) {
    console.error('Error fetching progress photos:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 