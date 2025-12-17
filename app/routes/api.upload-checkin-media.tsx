import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user from cookie with improved error handling
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  
  let accessToken;
  if (supabaseAuthCookieKey) {
    try {
      const cookieValue = cookies[supabaseAuthCookieKey];
      const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
      
      // Handle different cookie formats
      let parsed;
      try {
        parsed = JSON.parse(decoded);
        // If it's already an array, use it directly
        if (Array.isArray(parsed)) {
          accessToken = parsed[0];
        } else {
          // If it's a string that needs another parse
          parsed = JSON.parse(parsed);
          accessToken = Array.isArray(parsed) ? parsed[0] : parsed;
        }
      } catch (parseError) {
        // Try direct access if it's already a string
        accessToken = decoded;
      }
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
    console.error("Authentication failed in upload: No valid auth ID found", {
      hasCookie: !!supabaseAuthCookieKey,
      hasAccessToken: !!accessToken,
      cookieKeys: Object.keys(cookies)
    });
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
    // Support both FormData (old flow) and JSON (new flow for direct uploads)
    const contentType = request.headers.get("content-type") || "";
    let file: File | null = null;
    let filePath: string | null = null;
    let clientId: string | null = null;
    let recordingType: string | null = null;
    let duration: string | null = null;
    let transcript: string | null = null;
    let notes: string | null = null;
    
    if (contentType.includes("application/json")) {
      // New flow: JSON payload (for direct uploads)
      const body = await request.json();
      filePath = body.filePath || null;
      clientId = body.clientId || null;
      recordingType = body.recordingType || null;
      duration = body.duration || null;
      transcript = body.transcript || null;
      notes = body.notes || null;
    } else {
      // Old flow: FormData (for backward compatibility)
      const formData = await request.formData();
      file = formData.get("file") as File;
      filePath = formData.get("filePath") as string;
      clientId = formData.get("clientId") as string;
      recordingType = formData.get("recordingType") as string;
      duration = formData.get("duration") as string;
      transcript = formData.get("transcript") as string;
      notes = formData.get("notes") as string;
    }

    console.log('Upload request received:', {
      clientId,
      recordingType,
      duration,
      hasFile: !!file,
      hasFilePath: !!filePath,
      file: file ? {
        type: file.type,
        size: file.size,
        name: file.name
      } : null,
      hasTranscript: !!transcript,
      transcriptLength: transcript?.length,
      hasNotes: !!notes,
      notesLength: notes?.length
    });

    // Support both old flow (file upload) and new flow (file already uploaded via direct storage)
    if (!filePath && (!file || !clientId || !recordingType)) {
      console.error('Missing required fields:', { hasFile: !!file, hasFilePath: !!filePath, hasClientId: !!clientId, hasRecordingType: !!recordingType });
      return json({ error: "Missing required fields: either file or filePath, plus clientId and recordingType are required" }, { status: 400 });
    }

    if (filePath && (!clientId || !recordingType)) {
      console.error('Missing required fields for filePath flow:', { hasFilePath: !!filePath, hasClientId: !!clientId, hasRecordingType: !!recordingType });
      return json({ error: "Missing required fields: filePath, clientId, and recordingType are required" }, { status: 400 });
    }

    // Validate file if provided (old flow)
    if (file && !filePath) {
      // Validate file is not empty or corrupted
      if (file.size === 0) {
        console.error('Empty file uploaded');
        return json({ error: "File is empty. Please record again." }, { status: 400 });
      }

      // Validate file type - handle codec variants
      const allowedTypes = recordingType === 'video' 
        ? ['video/webm', 'video/mp4', 'video/quicktime']
        : ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/mp4'];

      const fileType = file.type || '';
      const baseMimeType = fileType.split(';')[0].trim();
      
      // Check if base mime type matches (ignoring codec parameters)
      const isAllowedType = allowedTypes.some(allowed => {
        const allowedBase = allowed.split(';')[0].trim();
        return baseMimeType === allowedBase || fileType.includes(allowedBase);
      });

      if (!isAllowedType && baseMimeType) {
        console.error('Invalid file type:', { fileType, baseMimeType, recordingType, allowedTypes });
        return json({ error: `Invalid file type. Expected ${allowedTypes.map(t => t.split(';')[0]).join(', ')} but got ${baseMimeType || 'unknown type'}` }, { status: 400 });
      }

      // Validate file size (50MB max for video, 10MB for audio)
      const maxSize = recordingType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / 1024 / 1024);
        const fileSizeMB = Math.round(file.size / 1024 / 1024);
        console.error('File too large:', { fileSize: file.size, maxSize, fileSizeMB, maxSizeMB });
        return json({ error: `File too large. Maximum size is ${maxSizeMB}MB, but file is ${fileSizeMB}MB` }, { status: 400 });
      }
    }

    // Check if storage bucket exists
    const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'checkin-media');
    
    if (!bucketExists) {
      console.error('Storage bucket checkin-media does not exist');
      return json({ error: "Storage bucket not configured. Please contact support." }, { status: 500 });
    }

    // Validate client exists and belongs to this coach (also get name and email for notifications)
    const { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, coach_id, name, email, email_notifications")
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

    let finalFilePath = filePath;

    // If file is provided (old flow), upload it to storage
    if (file && !filePath) {
      // Generate unique filename with random component to avoid collisions
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 9);
      const fileExtension = file.name.split('.').pop() || 'webm';
      const fileName = `checkin-${clientId}-${timestamp}-${randomId}.${fileExtension}`;
      finalFilePath = `checkins/${user.id}/${fileName}`;

      console.log('Uploading file to storage:', { filePath: finalFilePath, fileSize: file.size, fileType: file.type });

      // Upload to Supabase Storage with better error handling
      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from('checkin-media')
        .upload(finalFilePath, fileBuffer, {
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
          filePath: finalFilePath,
          fileInfo: {
            type: file?.type,
            size: file?.size
          }
        });
        
        // Provide more specific error messages
        if (uploadError.message?.includes('already exists') || uploadError.statusCode === '409') {
          return json({ error: "File already exists. Please try again." }, { status: 409 });
        }
        
        if (uploadError.message?.includes('bucket') || uploadError.statusCode === '404') {
          return json({ error: "Storage bucket not found. Please contact support." }, { status: 500 });
        }
        
        if (
          uploadError.statusCode === '413' ||
          uploadError.message?.includes('too large') ||
          uploadError.message?.toLowerCase().includes('payload too large')
        ) {
          const maxSizeMB = recordingType === 'video' ? 50 : 10;
          return json({ error: `File is too large. Maximum size is ${maxSizeMB}MB.` }, { status: 413 });
        }
        
        return json({ 
          error: `Upload failed: ${uploadError.message || 'Unknown error'}` 
        }, { status: 500 });
      }
    } else if (filePath) {
      // New flow: file already uploaded, just verify it exists
      console.log('File already uploaded, verifying existence:', { filePath: finalFilePath });
      const { data: fileData, error: fileCheckError } = await supabase.storage
        .from('checkin-media')
        .list(finalFilePath.split('/').slice(0, -1).join('/'), {
          search: finalFilePath.split('/').pop()
        });

      if (fileCheckError || !fileData || fileData.length === 0) {
        console.error('File not found in storage:', { filePath: finalFilePath, error: fileCheckError });
        return json({ error: "Uploaded file not found. Please try uploading again." }, { status: 404 });
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('checkin-media')
      .getPublicUrl(finalFilePath);

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
    
    // Prioritize: notes > transcript > default label
    let recordingLabel: string;
    if (notes && notes.trim()) {
      recordingLabel = notes.trim();
    } else if (transcript && transcript.trim()) {
      recordingLabel = transcript.trim();
    } else {
      recordingLabel = `${firstName}'s Check In`;
    }

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
      hasTranscript: !!checkInData.transcript,
      filePath: finalFilePath
    });

    // Check if a check-in with this file path already exists (prevent duplicates)
    const videoUrl = checkInData.video_url;
    const audioUrl = checkInData.audio_url;
    
    if (videoUrl || audioUrl) {
      // Build the OR query properly
      let orQuery = '';
      if (videoUrl && audioUrl) {
        orQuery = `video_url.eq.${videoUrl},audio_url.eq.${audioUrl}`;
      } else if (videoUrl) {
        orQuery = `video_url.eq.${videoUrl}`;
      } else if (audioUrl) {
        orQuery = `audio_url.eq.${audioUrl}`;
      }
      
      const { data: existingCheckIn } = await supabase
        .from("check_ins")
        .select("id")
        .eq("client_id", clientId)
        .eq("coach_id", user.id)
        .or(orQuery)
        .maybeSingle();
      
      if (existingCheckIn) {
        console.log('Check-in with this file already exists, skipping duplicate creation:', {
          existingCheckInId: existingCheckIn.id,
          filePath: finalFilePath,
          videoUrl,
          audioUrl
        });
        return json({ 
          success: true, 
          checkIn: existingCheckIn,
          message: "Check-in already exists" 
        }, { status: 200 });
      }
    }

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
          .remove([finalFilePath]);
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

    // Send email notification if client has email notifications enabled
    if (client?.email_notifications && client.email) {
      try {
        const coachName = user.name || 'Your coach';
        await resend.emails.send({
          from: "Kava Training <noreply@kavatraining.com>",
          to: client.email,
          subject: `${client.name}'s Check In has uploaded`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 24px; font-weight: bold;">Check-In Upload Complete!</h1>
              </div>
              
              <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
                <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">Hi ${coachName},</p>
                
                <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                  ${client.name}'s check-in ${recordingType === 'video' ? 'video' : 'audio'} has been successfully uploaded!
                </p>
                
                <p style="margin: 20px 0; color: #374151; font-size: 16px;">
                  Log in to your Kava Training dashboard to view the check-in.
                </p>
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${process.env.SUPABASE_EMAIL_REDIRECT_TO || 'https://kavatraining.com'}/dashboard/clients/${clientId}" 
                     style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    View Check-In
                  </a>
                </div>
              </div>
            </div>
          `,
        });
        console.log(`Email notification sent to ${client.email} for ${client.name}'s check-in upload`);
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't fail the whole request if email fails
      }
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