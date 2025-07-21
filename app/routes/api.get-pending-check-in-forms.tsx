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

  // Get the client's user record
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!clientUser || clientUser.role !== 'client') {
    console.log('Client user check failed:', { clientUser, authId });
    return json({ error: "Only clients can view their forms" }, { status: 403 });
  }



  try {
    // Get pending check-in form instances for this client
    const { data: instances, error: instancesError } = await supabase
      .from("check_in_form_instances")
      .select(`
        id,
        form_id,
        sent_at,
        expires_at,
        status,
        check_in_forms!inner (
          id,
          title,
          description
        )
      `)
      .eq("client_id", clientUser.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false });

    if (instancesError) {
      console.error("Error fetching form instances:", instancesError);
      return json({ error: "Failed to fetch forms" }, { status: 500 });
    }

    // Filter out expired forms
    const now = new Date();
    const validInstances = instances?.filter(instance => {
      if (!instance.expires_at) return true;
      return new Date(instance.expires_at) > now;
    }) || [];

    // Transform the data to match the expected format
    const forms = validInstances.map(instance => {
      
      return {
        id: instance.id,
        form_id: instance.form_id,
        sent_at: instance.sent_at,
        expires_at: instance.expires_at,
        status: instance.status,
        form: {
          title: instance.check_in_forms?.[0]?.title || 'Untitled Form',
          description: instance.check_in_forms?.[0]?.description,
        },
      };
    });

    // Fetch questions for each form
    const formsWithQuestions = await Promise.all(
      forms.map(async (form) => {
        const { data: questions, error: questionsError } = await supabase
          .from("check_in_form_questions")
          .select(`
            id,
            question_text,
            question_type,
            is_required,
            options,
            order_index
          `)
          .eq("form_id", form.form_id)
          .order("order_index");

        if (questionsError) {
          console.error("Error fetching questions for form:", form.form_id, questionsError);
          return { ...form, questions: [] };
        }

        return {
          ...form,
          questions: questions || [],
        };
      })
    );


    return json({ forms: formsWithQuestions });
  } catch (error) {
    console.error("Error in get-pending-check-in-forms:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 