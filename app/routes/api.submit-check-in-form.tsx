import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

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



    return json({ 
      success: true,
      message: `Form "${instance.check_in_forms[0]?.title || 'Check-in Form'}" completed successfully`
    });
  } catch (error) {
    console.error("Error submitting form responses:", error);
    return json({ error: "Failed to submit responses" }, { status: 500 });
  }
} 