import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

interface IncomingQuestion {
  id?: string;
  persistedId?: number | null;
  question_text: string;
  question_type: string;
  is_required: boolean;
  options?: string[] | null;
  order_index?: number;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const formId = params.formId;

  if (!formId) {
    return json({ error: "Form ID is required" }, { status: 400 });
  }

  const formData = await request.formData();
  const title = formData.get("title")?.toString();
  const description = formData.get("description")?.toString();
  const questionsJson = formData.get("questions")?.toString();

  if (!title) {
    return json({ error: "Title is required" }, { status: 400 });
  }

  let parsedQuestions: IncomingQuestion[] = [];
  if (questionsJson) {
    try {
      parsedQuestions = JSON.parse(questionsJson);
    } catch (error) {
      return json({ error: "Invalid questions payload" }, { status: 400 });
    }
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
    return json({ error: "Only coaches can update forms" }, { status: 403 });
  }

  try {
    const { data: existingForm, error: formFetchError } = await supabase
      .from("check_in_forms")
      .select("id, coach_id, is_active")
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .single();

    if (formFetchError || !existingForm || !existingForm.is_active) {
      return json({ error: "Form not found or not accessible" }, { status: 404 });
    }

    const { error: updateFormError } = await supabase
      .from("check_in_forms")
      .update({
        title,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formId);

    if (updateFormError) {
      console.error("Error updating form:", updateFormError);
      return json({ error: "Failed to update form" }, { status: 500 });
    }

    const sanitizedQuestions = parsedQuestions.map((question, index) => {
      const numericId =
        typeof question.persistedId === "number"
          ? question.persistedId
          : question.id && /^\d+$/.test(question.id)
          ? Number(question.id)
          : undefined;

      return {
        id: numericId,
      question_text: question.question_text,
      question_type: question.question_type,
      is_required: question.is_required,
      options:
        question.options && question.options.length > 0
          ? question.options
          : null,
      order_index: typeof question.order_index === "number" ? question.order_index : index,
      };
    });

    const existingQuestionIds = sanitizedQuestions
      .filter((q) => typeof q.id === "number")
      .map((q) => q.id as number);

    const { data: currentQuestions, error: currentQuestionsError } = await supabase
      .from("check_in_form_questions")
      .select("id")
      .eq("form_id", formId);

    if (currentQuestionsError) {
      console.error("Error fetching current questions:", currentQuestionsError);
      return json({ error: "Failed to update questions" }, { status: 500 });
    }

    const currentQuestionIds = (currentQuestions || []).map((q) => q.id);
    const questionIdsToDelete = currentQuestionIds.filter(
      (id) => !existingQuestionIds.includes(id)
    );

    if (questionIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("check_in_form_questions")
        .delete()
        .in("id", questionIdsToDelete);

      if (deleteError) {
        console.error("Error deleting removed questions:", deleteError);
        return json({ error: "Failed to update questions" }, { status: 500 });
      }
    }

    const questionsToUpdate = sanitizedQuestions.filter(
      (question) => typeof question.id === "number"
    );

    if (questionsToUpdate.length > 0) {
      const { error: upsertError } = await supabase
        .from("check_in_form_questions")
        .upsert(
          questionsToUpdate.map((question) => ({
            id: question.id,
            form_id: formId,
            question_text: question.question_text,
            question_type: question.question_type,
            is_required: question.is_required,
            options: question.options,
            order_index: question.order_index,
          })),
          { onConflict: "id" }
        );

      if (upsertError) {
        console.error("Error updating questions:", upsertError);
        return json({ error: "Failed to update questions" }, { status: 500 });
      }
    }

    const questionsToInsert = sanitizedQuestions.filter(
      (question) => typeof question.id !== "number"
    );

    if (questionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("check_in_form_questions")
        .insert(
          questionsToInsert.map((question) => ({
            form_id: formId,
            question_text: question.question_text,
            question_type: question.question_type,
            is_required: question.is_required,
            options: question.options,
            order_index: question.order_index,
          }))
        );

      if (insertError) {
        console.error("Error inserting questions:", insertError);
        return json({ error: "Failed to update questions" }, { status: 500 });
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("Error updating check-in form:", error);
    return json({ error: "Failed to update form" }, { status: 500 });
  }
}

