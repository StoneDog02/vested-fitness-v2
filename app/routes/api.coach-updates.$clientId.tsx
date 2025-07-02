import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { Resend } from "resend";

// Create a Resend instance
const resend = new Resend(process.env.RESEND_API_KEY);

export async function action({ request, params }: ActionFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY! // Use service key for admin operations
  );

  const formData = await request.formData();
  const message = formData.get("message")?.toString();

  if (!message) {
    return json({ error: "Message is required" }, { status: 400 });
  }

  // Get the current user's ID from regular supabase client
  const regularSupabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
  } = await regularSupabase.auth.getUser();
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get the coach's user record
  const { data: coachUser } = await supabase
    .from("users")
    .select("id, name")
    .eq("auth_id", user.id)
    .single();

  if (!coachUser) {
    return json({ error: "Coach not found" }, { status: 404 });
  }

  // Get the client's information including email notification preference
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, name, email, email_notifications")
    .eq("id", params.clientId)
    .single();

  if (!clientUser) {
    return json({ error: "Client not found" }, { status: 404 });
  }

  // Insert the update
  const { data, error } = await supabase
    .from("coach_updates")
    .insert({
      coach_id: coachUser.id,
      client_id: params.clientId,
      message,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating update:", error);
    return json({ error: "Failed to create update" }, { status: 500 });
  }

  // Send email notification if client has email notifications enabled
  if (clientUser.email_notifications && clientUser.email) {
    try {
      await resend.emails.send({
        from: "Vested Fitness <updates@resend.dev>",
        to: clientUser.email,
        subject: `New update from your coach ${coachUser.name}!`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 24px; font-weight: bold;">New Update from Your Coach!</h1>
            </div>
            
            <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">Hi ${clientUser.name},</p>
              
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                Your coach <strong>${coachUser.name}</strong> has sent you a new update!
              </p>
              
              <div style="background: #f3f4f6; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #374151; font-style: italic;">"${message}"</p>
              </div>
              
              <p style="margin: 20px 0; color: #374151; font-size: 16px;">
                Log in to your Vested Fitness dashboard to see this update and respond to your coach.
              </p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/dashboard" 
                   style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  View Update
                </a>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; text-align: center;">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">
                  Keep crushing your fitness goals! 💪
                </p>
                <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">
                  You can manage your notification preferences in your dashboard settings.
                </p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      // Log the email error but don't fail the request
      console.error("Failed to send email notification:", emailError);
      // The coach update was still created successfully
    }
  }

  return json({ update: data });
}
