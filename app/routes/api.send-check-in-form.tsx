 import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { Resend } from "resend";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function action({ request }: ActionFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const formData = await request.formData();
  const formId = formData.get("formId")?.toString();
  const clientId = formData.get("clientId")?.toString();
  const expiresInDays = formData.get("expiresInDays")?.toString();

  if (!formId || !clientId) {
    return json({ error: "Form ID and Client ID are required" }, { status: 400 });
  }

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
    .select("id, role, name")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== 'coach') {
    return json({ error: "Only coaches can send forms" }, { status: 403 });
  }

  try {
    // Verify the form belongs to this coach
    const { data: form, error: formError } = await supabase
      .from("check_in_forms")
      .select("id, title, description")
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .eq("is_active", true)
      .single();

    if (formError || !form) {
      return json({ error: "Form not found or not accessible" }, { status: 404 });
    }

    // Verify the client exists and belongs to this coach
    const { data: clientUser, error: clientError } = await supabase
      .from("users")
      .select("id, name, email, email_notifications")
      .eq("id", clientId)
      .eq("coach_id", coachUser.id)
      .single();

    if (clientError || !clientUser) {
      return json({ error: "Client not found or not accessible" }, { status: 404 });
    }

    // Check if there's already a pending instance for this form and client
    const { data: existingInstance } = await supabase
      .from("check_in_form_instances")
      .select("id")
      .eq("form_id", formId)
      .eq("client_id", clientId)
      .eq("status", "sent")
      .single();

    if (existingInstance) {
      return json({ error: "This form has already been sent to this client" }, { status: 400 });
    }

    // Calculate expiration date
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Default 7 days

    // Create the form instance
    const { data: instance, error: instanceError } = await supabase
      .from("check_in_form_instances")
      .insert({
        form_id: formId,
        client_id: clientId,
        coach_id: coachUser.id,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (instanceError || !instance) {
      console.error("Error creating form instance:", instanceError);
      return json({ error: "Failed to send form" }, { status: 500 });
    }

    // Create an automatic coach update
    const { data: update, error: updateError } = await supabase
      .from("coach_updates")
      .insert({
        coach_id: coachUser.id,
        client_id: clientId,
        message: `${form.title} sent!`,
      })
      .select()
      .single();

    if (updateError) {
      console.error("Error creating coach update:", updateError);
      // Don't fail the whole operation if the update fails
    }

    // Send email notification if client has email notifications enabled
    if (clientUser.email_notifications && clientUser.email) {
      try {
        await resend.emails.send({
          from: "Kava Training <noreply@kavatraining.com>",
          to: clientUser.email,
          subject: `New Check-In Form: ${form.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">New Check-In Form Available</h2>
              <p>Hi ${clientUser.name},</p>
              <p>Your coach ${coachUser.name} has sent you a new check-in form: <strong>${form.title}</strong></p>
              ${form.description ? `<p>${form.description}</p>` : ''}
              <p>Please log into your Kava Training dashboard to complete this form.</p>
              <p>This form will expire on ${new Date(expiresAt).toLocaleDateString()}.</p>
              <br>
              <p>Best regards,<br>The Kava Training Team</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Error sending email notification:", emailError);
        // Don't fail the whole operation if email fails
      }
    }

    return json({ 
      instance,
      message: `Check-in form "${form.title}" sent successfully to ${clientUser.name}`
    });
  } catch (error) {
    console.error("Error sending check-in form:", error);
    return json({ error: "Failed to send form" }, { status: 500 });
  }
} 