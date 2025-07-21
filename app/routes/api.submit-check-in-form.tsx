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

  // Get the client's user record
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!clientUser || clientUser.role !== 'client') {
    return json({ error: "Only clients can submit form responses" }, { status: 403 });
  }

  try {
    // Parse responses
    const responses = JSON.parse(responsesJson);

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

    if (instanceError || !instance) {
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
      if (!question) return null;

      let responseData: any = {
        instance_id: instanceId,
        question_id: questionId,
      };

      // Handle different response types
      if (question.question_type === 'number') {
        responseData.response_number = parseFloat(response as string);
      } else if (question.question_type === 'checkbox') {
        responseData.response_options = response;
      } else {
        responseData.response_text = response;
      }

      return responseData;
    }).filter(Boolean);

    if (responsesToInsert.length > 0) {
      const { error: responsesError } = await supabase
        .from("check_in_form_responses")
        .insert(responsesToInsert);

      if (responsesError) {
        console.error("Error inserting responses:", responsesError);
        return json({ error: "Failed to save responses" }, { status: 500 });
      }
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