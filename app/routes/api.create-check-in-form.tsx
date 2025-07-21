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
  const title = formData.get("title")?.toString();
  const description = formData.get("description")?.toString();
  const questionsJson = formData.get("questions")?.toString();

  if (!title) {
    return json({ error: "Title is required" }, { status: 400 });
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
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== 'coach') {
    return json({ error: "Only coaches can create forms" }, { status: 403 });
  }

  try {
    // Parse questions
    const questions = questionsJson ? JSON.parse(questionsJson) : [];

    // Create the form
    const { data: form, error: formError } = await supabase
      .from("check_in_forms")
      .insert({
        coach_id: coachUser.id,
        title,
        description: description || null,
      })
      .select()
      .single();

    if (formError || !form) {
      console.error("Error creating form:", formError);
      return json({ error: "Failed to create form" }, { status: 500 });
    }

    // Create questions if any
    if (questions.length > 0) {
      const questionsToInsert = questions.map((q: any, index: number) => ({
        form_id: form.id,
        question_text: q.question_text,
        question_type: q.question_type,
        is_required: q.is_required,
        options: q.options && q.options.length > 0 ? q.options : null,
        order_index: index,
      }));

      const { error: questionsError } = await supabase
        .from("check_in_form_questions")
        .insert(questionsToInsert);

      if (questionsError) {
        console.error("Error creating questions:", questionsError);
        // Delete the form if questions fail
        await supabase.from("check_in_forms").delete().eq("id", form.id);
        return json({ error: "Failed to create questions" }, { status: 500 });
      }
    }

    return json({ form });
  } catch (error) {
    console.error("Error creating check-in form:", error);
    return json({ error: "Failed to create form" }, { status: 500 });
  }
} 