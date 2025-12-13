import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

/**
 * This endpoint generates a signed URL for direct client-side upload to Supabase Storage.
 * This bypasses Netlify's 6MB body size limit by uploading directly to Supabase.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

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
      const cookieValue = cookies[supabaseAuthCookieKey];
      const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
      
      let parsed;
      try {
        parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) {
          accessToken = parsed[0];
        } else {
          parsed = JSON.parse(parsed);
          accessToken = Array.isArray(parsed) ? parsed[0] : parsed;
        }
      } catch (parseError) {
        accessToken = decoded;
      }
    } catch (e) {
      console.error("Error parsing auth cookie:", e);
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
      console.error("Error decoding JWT token:", e);
    }
  }

  if (!authId) {
    return json({ error: "Not authenticated - please log in again" }, { status: 401 });
  }

  // Get user row
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (userError || !user) {
    return json({ error: "Failed to verify user identity" }, { status: 500 });
  }

  // Only coaches can upload media
  if (user.role !== "coach") {
    return json({ error: "Unauthorized - only coaches can upload media" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const clientId = formData.get("clientId") as string;
    const recordingType = formData.get("recordingType") as string;
    const fileExtension = formData.get("fileExtension") as string;

    if (!clientId || !recordingType) {
      return json({ error: "Missing required fields: clientId and recordingType" }, { status: 400 });
    }

    // Validate client exists and belongs to this coach (also get name for notifications)
    const { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, coach_id, name")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return json({ error: "Client not found" }, { status: 404 });
    }

    if (client.coach_id !== user.id) {
      return json({ error: "Unauthorized - client does not belong to this coach" }, { status: 403 });
    }

    // Check if storage bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'checkin-media');
    
    if (!bucketExists) {
      return json({ error: "Storage bucket not configured. Please contact support." }, { status: 500 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const ext = fileExtension || 'webm';
    const fileName = `checkin-${clientId}-${timestamp}-${randomId}.${ext}`;
    const filePath = `checkins/${user.id}/${fileName}`;

    // Generate signed URL for upload (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('checkin-media')
      .createSignedUploadUrl(filePath, {
        upsert: false
      });

    if (signedUrlError || !signedUrlData) {
      console.error('Error creating signed upload URL:', signedUrlError);
      return json({ 
        error: `Failed to generate upload URL: ${signedUrlError?.message || 'Unknown error'}` 
      }, { status: 500 });
    }

    return json({ 
      signedUrl: signedUrlData.signedUrl,
      path: signedUrlData.path,
      token: signedUrlData.token,
      filePath: filePath,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      clientName: client.name || 'Client' // Include client name for notifications
    });

  } catch (error) {
    console.error('Error generating upload URL:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

