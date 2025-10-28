import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { Resend } from "resend";

// Create a Resend instance
const resend = new Resend(process.env.RESEND_API_KEY);

export async function action({ request }: ActionFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const formData = await request.formData();
  const instanceId = formData.get("instanceId")?.toString();
  const responsesJson = formData.get("responses")?.toString();

  if (!instanceId || !responsesJson) {
    return json({ error: "Instance ID and responses are required" }, { status: 400 });
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
      authId = undefined;
    }
  }

  if (!authId) {
    console.error("Authentication failed: No valid auth ID found");
    return json({ error: "Not authenticated - please log in again" }, { status: 401 });
  }

  // Get the client's user record
  const { data: clientUser, error: clientUserError } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (clientUserError) {
    console.error("Error fetching client user:", clientUserError);
    return json({ error: "Failed to verify user identity" }, { status: 500 });
  }

  if (!clientUser || clientUser.role !== 'client') {
    console.error("User is not a client:", { userId: clientUser?.id, role: clientUser?.role });
    return json({ error: "Only clients can submit form responses" }, { status: 403 });
  }

  try {
    // Parse responses
    let responses;
    try {
      responses = JSON.parse(responsesJson);
    } catch (parseError) {
      console.error("Error parsing responses JSON:", parseError);
      return json({ error: "Invalid form data format" }, { status: 400 });
    }

    // Verify the form instance exists and belongs to this client
    const { data: instance, error: instanceError } = await supabase
      .from("check_in_form_instances")
      .select(`
        id,
        form_id,
        client_id,
        coach_id,
        status,
        expires_at,
        check_in_forms!inner (
          title
        )
      `)
      .eq("id", instanceId)
      .eq("client_id", clientUser.id)
      .single();

    if (instanceError) {
      console.error("Error fetching form instance:", instanceError);
      return json({ error: "Form instance not found or not accessible" }, { status: 404 });
    }

    if (!instance) {
      console.error("Form instance not found:", { instanceId, clientId: clientUser.id });
      return json({ error: "Form instance not found or not accessible" }, { status: 404 });
    }

    // Check if form is already completed
    if (instance.status === 'completed') {
      return json({ error: "This form has already been completed" }, { status: 400 });
    }

    // Check if form is expired
    if (instance.expires_at && new Date(instance.expires_at) < new Date()) {
      return json({ error: "This form has expired" }, { status: 400 });
    }

    // Fetch questions for this form
    const { data: questions, error: questionsError } = await supabase
      .from("check_in_form_questions")
      .select(`
        id,
        question_text,
        question_type,
        is_required,
        options
      `)
      .eq("form_id", instance.form_id)
      .order("order_index");

    if (questionsError) {
      console.error("Error fetching questions:", questionsError);
      return json({ error: "Failed to load form questions" }, { status: 500 });
    }

    // Validate that all required questions are answered
    const requiredQuestions = questions?.filter((q: any) => q.is_required) || [];
    
    for (const question of requiredQuestions) {
      const response = responses[question.id];
      if (!response || 
          (typeof response === 'string' && !response.trim()) ||
          (Array.isArray(response) && response.length === 0)) {
        return json({ 
          error: `Required question "${question.question_text}" is not answered` 
        }, { status: 400 });
      }
    }

    // Insert responses
    const responsesToInsert = Object.entries(responses).map(([questionId, response]) => {
      const question = questions?.find((q: any) => q.id === questionId);
      if (!question) {
        console.error("Question not found for response:", { questionId, availableQuestions: questions?.map(q => q.id) });
        return null;
      }

      const responseData: any = {
        instance_id: instanceId,
        question_id: questionId,
      };

      // Handle different response types
      if (question.question_type === 'number') {
        const numValue = parseFloat(response as string);
        if (isNaN(numValue)) {
          console.error("Invalid number response:", { questionId, response });
          return null;
        }
        responseData.response_number = numValue;
      } else if (question.question_type === 'checkbox') {
        responseData.response_options = response;
      } else {
        responseData.response_text = response;
      }

      return responseData;
    }).filter(Boolean);

    if (responsesToInsert.length > 0) {
      console.log("Inserting responses:", { count: responsesToInsert.length, instanceId });
      const { error: responsesError } = await supabase
        .from("check_in_form_responses")
        .insert(responsesToInsert);

      if (responsesError) {
        console.error("Error inserting responses:", responsesError);
        return json({ error: "Failed to save responses: " + responsesError.message }, { status: 500 });
      }
    } else {
      console.warn("No valid responses to insert:", { responses, questions: questions?.map(q => ({ id: q.id, type: q.question_type })) });
    }

    // Mark the instance as completed
    const { error: updateError } = await supabase
      .from("check_in_form_instances")
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq("id", instanceId);

    if (updateError) {
      console.error("Error updating instance:", updateError);
      return json({ error: "Failed to complete form" }, { status: 500 });
    }

    // Send email notification to coach
    try {
      // Get the client's name
      const { data: clientInfo } = await supabase
        .from("users")
        .select("name")
        .eq("id", instance.client_id)
        .single();

      // Get the coach's email and notification preferences
      const { data: coachInfo } = await supabase
        .from("users")
        .select("name, email, email_notifications")
        .eq("id", instance.coach_id)
        .single();

      if (coachInfo?.email_notifications && coachInfo.email && clientInfo?.name) {
        await resend.emails.send({
          from: "Kava Training <noreply@kavatraining.com>",
          to: coachInfo.email,
          subject: `${clientInfo.name} submitted a check-in form!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 24px; font-weight: bold;">New Check-In Form Submitted!</h1>
              </div>
              
              <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
                <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">Hi ${coachInfo.name},</p>
                
                <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                  Your client <strong>${clientInfo.name}</strong> has submitted a check-in form!
                </p>
                
                <div style="background: #f3f4f6; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #374151; font-weight: 500;">Form: ${instance.check_in_forms[0]?.title || 'Check-in Form'}</p>
                </div>
                
                <p style="margin: 20px 0; color: #374151; font-size: 16px;">
                  Log in to your Kava Training dashboard to review their responses.
                </p>
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/dashboard/coach-access" 
                     style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    Review Form
                  </a>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; text-align: center;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">
                    Keep up the great work coaching! 👊
                  </p>
                </div>
              </div>
            </div>
          `,
        });
        console.log(`[CHECK-IN FORM] Coach notification email sent to ${coachInfo.email} for form submission by ${clientInfo.name}`);
      } else {
        console.log(`[CHECK-IN FORM] Coach notification skipped - email notifications disabled or coach/client not found`);
      }
    } catch (emailError) {
      // Don't fail the submission if email fails
      console.error("Error sending email notification to coach:", emailError);
    }

    return json({ 
      success: true,
      message: `Form "${instance.check_in_forms[0]?.title || 'Check-in Form'}" completed successfully`
    });
  } catch (error) {
    console.error("Error submitting form responses:", error);
    return json({ error: "Failed to submit responses" }, { status: 500 });
  }
} 