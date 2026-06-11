import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getAuthIdFromRequest,
} from "~/lib/chat-auth.server";
import { parseSnapshotQuestions, sendCheckInFormInstance } from "~/lib/checkInForms.server";

export async function action({ request }: ActionFunctionArgs) {
  const supabase = createServiceClient();

  const userAgent = request.headers.get("user-agent") || "";
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent
  );
  console.log("API: Send check-in form request:", {
    userAgent,
    isMobile,
    contentType: request.headers.get("content-type"),
    hasCookie: !!request.headers.get("cookie"),
  });

  const formData = await request.formData();
  const formId = formData.get("formId")?.toString();
  const clientId = formData.get("clientId")?.toString();
  const expiresInDays = parseInt(formData.get("expiresInDays")?.toString() || "7", 10);
  const customTitle = formData.get("title")?.toString();
  const customDescription = formData.get("description")?.toString();
  const questionsJson = formData.get("questions")?.toString();

  if (!formId || !clientId) {
    return json({ error: "Form ID and Client ID are required" }, { status: 400 });
  }

  const authId = getAuthIdFromRequest(request);
  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: coachUser } = await supabase
    .from("users")
    .select("id, role, name")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== "coach") {
    return json({ error: "Only coaches can send forms" }, { status: 403 });
  }

  try {
    const { data: form, error: formError } = await supabase
      .from("check_in_forms")
      .select("id, title, description")
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .eq("is_active", true)
      .single();

    if (formError || !form) {
      return json({ error: "Form not found or not accessible" }, { status: 404 });
    }

    const instanceTitle = customTitle?.trim() || form.title;
    const instanceDescription = customDescription?.trim() || form.description || null;

    let snapshotQuestions;
    try {
      snapshotQuestions = await parseSnapshotQuestions(
        questionsJson,
        formId,
        supabase
      );
    } catch {
      return json({ error: "Invalid questions format" }, { status: 400 });
    }

    const result = await sendCheckInFormInstance({
      supabase,
      coachId: coachUser.id,
      clientId,
      formId,
      title: instanceTitle,
      description: instanceDescription,
      questions: snapshotQuestions,
      expiresInDays,
    });

    return json({
      instance: result.instance,
      message: result.message,
    });
  } catch (error) {
    console.error("Error sending check-in form:", error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to send form" },
      { status: 500 }
    );
  }
}
