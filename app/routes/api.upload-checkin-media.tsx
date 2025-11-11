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
      console.error('Missing required fields:', { hasFile: !!file, hasClientId: !!clientId, hasRecordingType: !!recordingType });
      return json({ error: "Missing required fields: file, clientId, and recordingType are required" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = recordingType === 'video' 
      ? ['video/webm', 'video/mp4', 'video/quicktime']
      : ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/mp4'];

    const fileType = file.type || '';
    const baseMimeType = fileType.split(';')[0];
    const isAllowedType = allowedTypes.includes(fileType) || allowedTypes.includes(baseMimeType);

    if (!isAllowedType) {
      console.error('Invalid file type:', { fileType, baseMimeType, recordingType, allowedTypes });
      return json({ error: `Invalid file type. Expected ${allowedTypes.join(', ')} but got ${fileType || 'unknown type'}` }, { status: 400 });
    }

    // Validate file size (50MB max for video, 10MB for audio)
    const maxSize = recordingType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      const fileSizeMB = Math.round(file.size / 1024 / 1024);
      console.error('File too large:', { fileSize: file.size, maxSize, fileSizeMB, maxSizeMB });
      return json({ error: `File too large. Maximum size is ${maxSizeMB}MB, but file is ${fileSizeMB}MB` }, { status: 400 });
    }

    // Validate client exists and belongs to this coach (also get name for later use)
    const { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, coach_id, name")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      console.error('Client validation error:', clientError);
      return json({ error: "Client not found" }, { status: 404 });
    }

    if (client.coach_id !== user.id) {
      console.error('Client does not belong to coach:', { clientId, clientCoachId: client.coach_id, userId: user.id });
      return json({ error: "Unauthorized - client does not belong to this coach" }, { status: 403 });
    }

    // Generate unique filename with random component to avoid collisions
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const fileExtension = file.name.split('.').pop() || 'webm';
    const fileName = `checkin-${clientId}-${timestamp}-${randomId}.${fileExtension}`;
    const filePath = `checkins/${user.id}/${fileName}`;

    console.log('Uploading file to storage:', { filePath, fileSize: file.size, fileType: file.type });

    // Upload to Supabase Storage with better error handling
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('checkin-media')
      .upload(filePath, fileBuffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      console.error('Storage upload error:', {
        error: uploadError,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        errorCode: uploadError.error,
        filePath
      });
      
      // Provide more specific error messages
      if (uploadError.message?.includes('already exists') || uploadError.statusCode === '409') {
        return json({ error: "File already exists. Please try again." }, { status: 409 });
      }
      
      if (uploadError.message?.includes('bucket') || uploadError.statusCode === '404') {
        return json({ error: "Storage bucket not found. Please contact support." }, { status: 500 });
      }
      
      if (uploadError.statusCode === '413' || uploadError.message?.includes('too large')) {
        return json({ error: "File is too large for upload" }, { status: 413 });
      }
      
      return json({ error: `Upload failed: ${uploadError.message || 'Unknown error'}` }, { status: 500 });
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

    // Use client name from validation query above
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

    console.log('Creating check-in record:', {
      clientId,
      coachId: user.id,
      recordingType,
      hasVideoUrl: !!checkInData.video_url,
      hasAudioUrl: !!checkInData.audio_url,
      hasTranscript: !!checkInData.transcript
    });

    const { data: checkIn, error: checkInError } = await supabase
      .from("check_ins")
      .insert(checkInData)
      .select()
      .single();

    if (checkInError) {
      console.error('Check-in creation error:', {
        error: checkInError,
        message: checkInError.message,
        code: checkInError.code,
        details: checkInError.details,
        hint: checkInError.hint,
        checkInData
      });
      
      // Try to clean up the uploaded file if check-in creation fails
      try {
        await supabase.storage
          .from('checkin-media')
          .remove([filePath]);
        console.log('Cleaned up uploaded file after check-in creation failure');
      } catch (cleanupError) {
        console.error('Failed to clean up file after error:', cleanupError);
      }
      
      return json({ 
        error: `Failed to create check-in: ${checkInError.message || 'Database error'}` 
      }, { status: 500 });
    }

    console.log('Check-in created successfully:', {
      id: checkIn.id,
      transcript: checkIn.transcript ? `${checkIn.transcript.substring(0, 50)}...` : null
    });

    // Create an automatic coach update notification
    const updateMessage = recordingType === 'video' 
      ? '📹 Check-in video received from coach!'
      : '🎤 Check-in audio received from coach!';

    const { error: updateError } = await supabase
      .from("coach_updates")
      .insert({
        coach_id: user.id,
        client_id: clientId,
        message: updateMessage,
      });

    if (updateError) {
      console.error('Error creating automatic update notification:', updateError);
      // Don't fail the whole request if the notification fails
    }

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