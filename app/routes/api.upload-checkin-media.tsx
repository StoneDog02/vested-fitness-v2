import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

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
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      const [access] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
    } catch (e) {
      console.error("Error parsing auth cookie in upload:", e);
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
      console.error("Error decoding JWT token in upload:", e);
    }
  }

  if (!authId) {
    console.error("Authentication failed in upload: No valid auth ID found");
    return json({ error: "Not authenticated - please log in again" }, { status: 401 });
  }

  // Get user row
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (userError) {
    console.error("Error fetching user in upload:", userError);
    return json({ error: "Failed to verify user identity" }, { status: 500 });
  }

  if (!user) {
    console.error("User not found in upload:", { authId });
    return json({ error: "User not found" }, { status: 404 });
  }

  // Only coaches can upload media
  if (user.role !== "coach") {
    console.error("Non-coach user attempted upload:", { userId: user.id, role: user.role });
    return json({ error: "Unauthorized - only coaches can upload media" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const clientId = formData.get("clientId") as string;
    const recordingType = formData.get("recordingType") as string;
    const duration = formData.get("duration") as string;
    const transcript = formData.get("transcript") as string;

    console.log('Upload request received:', {
      fileType: file?.type,
      fileSize: file?.size,
      clientId,
      recordingType,
      duration,
      hasTranscript: !!transcript,
      transcriptLength: transcript?.length,
      transcriptPreview: transcript?.substring(0, 100)
    });

    if (!file || !clientId || !recordingType) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = recordingType === 'video' 
      ? ['video/webm', 'video/mp4', 'video/quicktime']
      : ['audio/webm', 'audio/mp3', 'audio/wav', 'audio/m4a'];

    if (!allowedTypes.includes(file.type)) {
      return json({ error: "Invalid file type" }, { status: 400 });
    }

    // Validate file size (50MB max for video, 10MB for audio)
    const maxSize = recordingType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return json({ error: "File too large" }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'webm';
    const fileName = `checkin-${clientId}-${timestamp}.${fileExtension}`;
    const filePath = `checkins/${user.id}/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('checkin-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('checkin-media')
      .getPublicUrl(filePath);

    // Generate thumbnail for video (if needed)
    let thumbnailUrl = null;
    if (recordingType === 'video') {
      // For now, we'll use a placeholder thumbnail
      // In a production app, you might want to generate actual thumbnails
      thumbnailUrl = urlData.publicUrl; // Placeholder
    }

    // Get client name for better recording label
    const { data: client } = await supabase
      .from("users")
      .select("name")
      .eq("id", clientId)
      .single();

    const clientName = client?.name || 'Client';
    const firstName = clientName.split(' ')[0]; // Get just the first name
    const recordingLabel = transcript && transcript.trim() 
      ? transcript 
      : `${firstName}'s Check In`;

    // Create check-in record
    const checkInData = {
      client_id: clientId,
      coach_id: user.id,
      notes: recordingLabel,
      recording_type: recordingType,
      recording_duration: duration ? parseInt(duration) : null,
      recording_thumbnail_url: thumbnailUrl,
      transcript: transcript && transcript.trim() ? transcript.trim() : null,
      ...(recordingType === 'video' && { video_url: urlData.publicUrl }),
      ...(recordingType === 'audio' && { audio_url: urlData.publicUrl }),
      ...(recordingType === 'video_audio' && { 
        video_url: urlData.publicUrl,
        audio_url: urlData.publicUrl 
      })
    };

    console.log('Saving check-in data:', {
      ...checkInData,
      transcript: checkInData.transcript ? `${checkInData.transcript.substring(0, 50)}...` : null
    });

    const { data: checkIn, error: checkInError } = await supabase
      .from("check_ins")
      .insert(checkInData)
      .select()
      .single();

    if (checkInError) {
      console.error('Check-in creation error:', checkInError);
      return json({ error: "Failed to create check-in" }, { status: 500 });
    }

    console.log('Check-in created successfully:', {
      id: checkIn.id,
      transcript: checkIn.transcript ? `${checkIn.transcript.substring(0, 50)}...` : null
    });

    return json({ 
      success: true, 
      checkIn,
      mediaUrl: urlData.publicUrl 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 