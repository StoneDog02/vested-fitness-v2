import { json, ActionFunctionArgs } from "@remix-run/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

// Create a Resend instance
const resend = new Resend(process.env.RESEND_API_KEY);

// Generate a unique invitation code
function generateInviteCode(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

export async function action({ request }: ActionFunctionArgs) {
  // Parse the form data
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const name = formData.get("name")?.toString();
  const coach_id = formData.get("coach_id")?.toString();

  // Validate the form data
  if (!email || !name || !coach_id) {
    return json(
      {
        error: "Email, name, and coach_id are required",
        success: false,
      },
      { status: 400 }
    );
  }

  try {
    // Generate a unique invitation code
    const inviteCode = generateInviteCode();

    // Store the invite in Supabase
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { error: dbError } = await supabase
      .from("client_invitations")
      .insert({
        email,
        name,
        coach_id,
        token: inviteCode,
        accepted: false,
        created_at: new Date().toISOString(),
      });
    if (dbError) {
      console.error("Error storing invite in DB:", dbError);
      return json(
        {
          error: "Failed to store invitation in database",
          success: false,
        },
        { status: 500 }
      );
    }

    // Create the signup URL with the invitation code
    const signupUrl = new URL("/auth/register", request.url);
    signupUrl.searchParams.append("invite", inviteCode);
    signupUrl.searchParams.append("email", email);
    signupUrl.searchParams.append("name", name);
    signupUrl.searchParams.append("type", "client");

    // Send the invitation email
    const { error } = await resend.emails.send({
      from: "Kava Training <noreply@kavatraining.com>",
      to: email,
      subject: `${name}, you've been invited to Kava Training`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6366F1;">Welcome to Kava Training!</h2>
          <p>Hello ${name},</p>
          <p>You've been invited to join Kava Training as a client. Your coach is ready to help you achieve your fitness goals!</p>
          <p>To get started, click the button below to create your account:</p>
          <a href="${signupUrl}" style="display: inline-block; background-color: #6366F1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Create Your Account
          </a>
          <p>This link will expire in 7 days.</p>
          <p>If you have any questions, please contact support@vestedfitness.com.</p>
          <p>Looking forward to your fitness journey,<br />The Kava Training Team</p>
        </div>
      `,
    });

    if (error) {
      console.error("Error sending email:", error);
      return json(
        {
          error: "Failed to send invitation email",
          success: false,
        },
        { status: 500 }
      );
    }

    return json({
      success: true,
      email,
      message: "Invitation sent successfully",
    });
  } catch (error) {
    console.error("Error:", error);
    return json(
      {
        error: "An unexpected error occurred",
        success: false,
      },
      { status: 500 }
    );
  }
}
