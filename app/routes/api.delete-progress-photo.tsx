import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
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

    // Parse request body
    const body = await request.json();
    const { photoId } = body;

    if (!photoId) {
      return json({ error: "Missing photo ID" }, { status: 400 });
    }

    // Get the photo to verify ownership and get file path
    const { data: photo, error: photoError } = await supabase
      .from("progress_photos")
      .select("id, photo_url, client_id, coach_id")
      .eq("id", photoId)
      .single();

    if (photoError || !photo) {
      return json({ error: "Photo not found" }, { status: 404 });
    }

    // Verify ownership: coaches can delete any photo, clients can only delete their own
    if (user.role === "coach") {
      // Coaches can delete any photo they own
      if (photo.coach_id !== user.id) {
        return json({ error: "Unauthorized" }, { status: 403 });
      }
    } else {
      // Clients can only delete their own photos
      if (photo.client_id !== user.id) {
        return json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // Extract file path from URL for storage deletion
    const urlParts = photo.photo_url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = `progress-photos/${user.id}/${fileName}`;

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('checkin-media')
      .remove([filePath]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from("progress_photos")
      .delete()
      .eq("id", photoId);

    if (deleteError) {
      console.error('Database deletion error:', deleteError);
      return json({ error: "Failed to delete photo" }, { status: 500 });
    }



    return json({ 
      success: true, 
      deletedPhotoId: photoId 
    });

  } catch (error) {
    console.error('Delete error:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}; 