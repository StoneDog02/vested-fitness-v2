import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const formId = params.formId;

  if (!formId) {
    return json({ error: "Form ID is required" }, { status: 400 });
  }

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

  const { data: coachUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== "coach") {
    return json({ error: "Only coaches can access forms" }, { status: 403 });
  }

  try {
    const { data: form, error } = await supabase
      .from("check_in_forms")
      .select(
        `
          id,
          title,
          description,
          created_at,
          updated_at,
          is_active,
          coach_id,
          questions:check_in_form_questions (
            id,
            question_text,
            question_type,
            is_required,
            options,
            order_index
          )
        `
      )
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .eq("is_active", true)
      .single();

    if (error || !form) {
      return json({ error: "Form not found or not accessible" }, { status: 404 });
    }

    const sortedQuestions = Array.isArray(form.questions)
      ? [...form.questions].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      : [];

    return json({
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        created_at: form.created_at,
        updated_at: form.updated_at,
        question_count: sortedQuestions.length,
        questions: sortedQuestions.map((question) => ({
          id: question.id,
          question_text: question.question_text,
          question_type: question.question_type,
          is_required: question.is_required,
          options: question.options ?? [],
          order_index: question.order_index ?? 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching check-in form:", error);
    return json({ error: "Failed to fetch form" }, { status: 500 });
  }
}

