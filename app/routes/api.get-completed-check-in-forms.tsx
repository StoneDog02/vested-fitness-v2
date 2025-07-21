import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export async function loader({ request }: LoaderFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

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
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== 'coach') {
    return json({ error: "Only coaches can view form responses" }, { status: 403 });
  }

  // Get query params
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;

  // Resolve client ID if it's a slug
  let resolvedClientId = clientId;
  if (clientId && !clientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // This looks like a slug, not a UUID - try to find the client
    const { data: clientBySlug } = await supabase
      .from("users")
      .select("id")
      .eq("slug", clientId)
      .single();
    
    if (clientBySlug) {
      resolvedClientId = clientBySlug.id;
    } else {
      return json({ error: "Client not found" }, { status: 404 });
    }
  }

  try {
    let query = supabase
      .from("check_in_form_instances")
      .select(`
        id,
        form_id,
        client_id,
        sent_at,
        completed_at,
        status,
        expires_at
      `)
      .eq("coach_id", coachUser.id)
      .in("status", ["completed", "expired"])
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by client if specified
    if (resolvedClientId) {
      query = query.eq("client_id", resolvedClientId);
    }

    const { data: instances, error: instancesError } = await query;

    if (instancesError) {
      console.error("Error fetching completed form instances:", instancesError);
      return json({ error: "Failed to fetch forms" }, { status: 500 });
    }

    // Get responses for each instance
    const formsWithResponses = await Promise.all(
      (instances || []).map(async (instance) => {
        // Fetch form data
        const { data: formData, error: formError } = await supabase
          .from("check_in_forms")
          .select("id, title, description")
          .eq("id", instance.form_id)
          .single();

        if (formError) {
          console.error("Error fetching form data:", formError);
          return null;
        }

        // Fetch client data
        const { data: clientData, error: clientError } = await supabase
          .from("users")
          .select("id, name")
          .eq("id", instance.client_id)
          .single();

        // Fetch responses
        const { data: responses, error: responsesError } = await supabase
          .from("check_in_form_responses")
          .select(`
            id,
            question_id,
            response_text,
            response_number,
            response_options
          `)
          .eq("instance_id", instance.id);

        if (responsesError) {
          console.error("Error fetching responses:", responsesError);
          return {
            ...instance,
            form: {
              title: formData?.title || 'Untitled Form',
              description: formData?.description,
            },
            client: {
              name: clientData?.name || 'Unknown',
            },
            responses: [],
          };
        }

        // Fetch questions for responses
        const responsesWithQuestions = await Promise.all(
          (responses || []).map(async (response) => {
            const { data: questionData, error: questionError } = await supabase
              .from("check_in_form_questions")
              .select("id, question_text, question_type")
              .eq("id", response.question_id)
              .single();

            if (questionError) {
              console.error("Error fetching question data:", questionError);
              return {
                id: response.id,
                question_id: response.question_id,
                response_text: response.response_text,
                response_number: response.response_number,
                response_options: response.response_options,
                question: {
                  question_text: 'Unknown Question',
                  question_type: 'text',
                },
              };
            }

            return {
              id: response.id,
              question_id: response.question_id,
              response_text: response.response_text,
              response_number: response.response_number,
              response_options: response.response_options,
              question: {
                question_text: questionData.question_text,
                question_type: questionData.question_type,
              },
            };
          })
        );

        return {
          id: instance.id,
          form_id: instance.form_id,
          client_id: instance.client_id,
          coach_id: coachUser.id,
          sent_at: instance.sent_at,
          completed_at: instance.completed_at,
          status: instance.status,
          expires_at: instance.expires_at,
          form: {
            title: formData?.title || 'Untitled Form',
            description: formData?.description,
          },
          client: {
            name: clientData?.name || 'Unknown',
          },
          responses: responsesWithQuestions,
        };
      })
    );

    // Filter out any null results
    const validForms = formsWithResponses.filter(form => form !== null);

    return json({ forms: validForms });
  } catch (error) {
    console.error("Error in get-completed-check-in-forms:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 