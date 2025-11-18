import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const action = async ({ request }: { request: Request }) => {
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const clientId = formData.get("clientId") as string;
    const notes = formData.get("notes") as string;

    if (!file || !clientId) {
      return json({ error: "Missing file or clientId" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      console.error("Invalid file type:", { 
        fileType: file.type, 
        fileName: file.name, 
        fileSize: file.size,
        clientId 
      });
      return json({ 
        error: "Invalid file type. Please upload an image file (JPEG, PNG, GIF, or WebP).",
        fileType: file.type 
      }, { status: 400 });
    }

    // Validate file size (max 10MB - matching frontend validation)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      console.error("File too large:", { 
        fileSize: file.size, 
        maxSize: MAX_FILE_SIZE,
        fileName: file.name,
        clientId 
      });
      return json({ 
        error: `File size exceeds the 10MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB. Please compress or resize the image.`,
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE
      }, { status: 400 });
    }

    console.log("Uploading progress photo:", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      clientId,
      userId: user.id
    });

    // Verify user has access to this client
    if (user.role === "client") {
      // Clients can only upload their own photos
      if (clientId !== user.id) {
        return json({ error: "Unauthorized" }, { status: 403 });
      }
    } else if (user.role === "coach") {
      // Coaches can upload photos for their clients
      const { data: client } = await supabase
        .from("users")
        .select("id")
        .eq("id", clientId)
        .eq("coach_id", user.id)
        .single();

      if (!client) {
        return json({ error: "Client not found or unauthorized" }, { status: 403 });
      }
    } else {
      return json({ error: "Invalid user role" }, { status: 403 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `progress-photos/${clientId}/${timestamp}-${file.name}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars") // Using existing bucket
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", {
        error: uploadError,
        message: uploadError.message,
        fileName: filename,
        fileSize: buffer.length,
        clientId,
        userId: user.id
      });
      
      // Provide more specific error messages based on the error type
      let errorMessage = "Failed to upload file";
      if (uploadError.message?.includes("size") || uploadError.message?.includes("large")) {
        errorMessage = "File is too large. Please compress or resize the image and try again.";
      } else if (uploadError.message?.includes("permission") || uploadError.message?.includes("unauthorized")) {
        errorMessage = "Permission denied. Please check your access rights.";
      } else if (uploadError.message?.includes("quota") || uploadError.message?.includes("limit")) {
        errorMessage = "Storage quota exceeded. Please contact support.";
      }
      
      return json({ 
        error: errorMessage,
        details: uploadError.message 
      }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filename);

    // Save to database
    const { data: photoData, error: dbError } = await supabase
      .from("progress_photos")
      .insert({
        client_id: clientId,
        coach_id: user.id,
        photo_url: urlData.publicUrl,
        notes: notes || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", {
        error: dbError,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        clientId,
        userId: user.id,
        photoUrl: urlData.publicUrl
      });
      return json({ 
        error: "Failed to save photo data",
        details: dbError.message 
      }, { status: 500 });
    }

    return json({ 
      success: true, 
      photo: photoData,
      message: "Progress photo uploaded successfully" 
    });

  } catch (error) {
    console.error("Upload progress photo error:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "An unexpected error occurred"
    }, { status: 500 });
  }
};

export const loader = async () => {
  return json({ error: "Method not allowed" }, { status: 405 });
}; 