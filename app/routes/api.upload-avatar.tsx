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
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get user ID from auth_id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", authId)
      .single();

    if (!user) {
      return json({ error: "User not found" }, { status: 404 });
    }

    // Parse JSON request body for base64 image data
    const { imageData, fileName, contentType } = await request.json();

    if (!imageData || !fileName || !contentType) {
      return json({ error: "Missing image data, file name, or content type" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    
    if (!allowedTypes.includes(contentType)) {
      return json({ error: "Invalid file type. Please upload an image file." }, { status: 400 });
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const fileBuffer = Buffer.from(base64Data, "base64");

    // Generate unique filename
    const timestamp = Date.now();
    const extension = fileName.split('.').pop();
    const uniqueFileName = `avatar-${user.id}-${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(uniqueFileName, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(uniqueFileName);

    const avatarUrl = publicUrlData.publicUrl;

    // Update user's avatar_url in database
    const { data: updateData, error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating user avatar:", updateError);
      return json({ error: "Failed to update profile picture" }, { status: 500 });
    }

    return json({ 
      success: true, 
      avatarUrl,
      message: "Profile picture updated successfully"
    });
  } catch (error) {
    console.error("Unexpected error uploading avatar:", error);
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}; 