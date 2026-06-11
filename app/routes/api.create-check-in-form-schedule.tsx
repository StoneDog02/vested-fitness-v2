import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getAuthIdFromRequest,
} from "~/lib/chat-auth.server";
import {
  computeNextSendAt,
  parseSnapshotQuestions,
  type ScheduleFrequency,
} from "~/lib/checkInForms.server";
import { USER_TIMEZONE } from "~/lib/timezone";

export async function action({ request }: ActionFunctionArgs) {
  const supabase = createServiceClient();

  const formData = await request.formData();
  const formId = formData.get("formId")?.toString();
  const clientId = formData.get("clientId")?.toString();
  const frequency = formData.get("frequency")?.toString() as ScheduleFrequency | undefined;
  const dayOfWeekRaw = formData.get("dayOfWeek")?.toString();
  const dayOfMonthRaw = formData.get("dayOfMonth")?.toString();
  const timeOfDay = formData.get("timeOfDay")?.toString();
  const expiresInDays = parseInt(formData.get("expiresInDays")?.toString() || "7", 10);
  const title = formData.get("title")?.toString()?.trim();
  const description = formData.get("description")?.toString()?.trim() || null;
  const questionsJson = formData.get("questions")?.toString();

  if (!formId || !clientId || !frequency || !timeOfDay || !title) {
    return json(
      { error: "Form ID, client ID, frequency, time, and title are required" },
      { status: 400 }
    );
  }

  if (!["daily", "weekly", "monthly"].includes(frequency)) {
    return json({ error: "Invalid frequency" }, { status: 400 });
  }

  const dayOfWeek =
    dayOfWeekRaw !== undefined && dayOfWeekRaw !== ""
      ? parseInt(dayOfWeekRaw, 10)
      : null;
  const dayOfMonth =
    dayOfMonthRaw !== undefined && dayOfMonthRaw !== ""
      ? parseInt(dayOfMonthRaw, 10)
      : null;

  if (frequency === "weekly" && (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6)) {
    return json({ error: "Day of week is required for weekly schedules" }, { status: 400 });
  }

  if (
    frequency === "monthly" &&
    (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 28)
  ) {
    return json({ error: "Day of month (1–28) is required for monthly schedules" }, { status: 400 });
  }

  const authId = getAuthIdFromRequest(request);
  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: coachUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== "coach") {
    return json({ error: "Only coaches can create schedules" }, { status: 403 });
  }

  try {
    const { data: form, error: formError } = await supabase
      .from("check_in_forms")
      .select("id")
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .eq("is_active", true)
      .single();

    if (formError || !form) {
      return json({ error: "Form not found or not accessible" }, { status: 404 });
    }

    const { data: clientUser, error: clientError } = await supabase
      .from("users")
      .select("id")
      .eq("id", clientId)
      .eq("coach_id", coachUser.id)
      .single();

    if (clientError || !clientUser) {
      return json({ error: "Client not found or not accessible" }, { status: 404 });
    }

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

    const normalizedTime =
      timeOfDay.length === 5 ? `${timeOfDay}:00` : timeOfDay;

    const nextSendAt = computeNextSendAt({
      frequency,
      timeOfDay: normalizedTime,
      timezone: USER_TIMEZONE,
      dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
      dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
    });

    await supabase
      .from("check_in_form_schedules")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("form_id", formId)
      .eq("is_active", true);

    const { data: schedule, error: scheduleError } = await supabase
      .from("check_in_form_schedules")
      .insert({
        coach_id: coachUser.id,
        client_id: clientId,
        form_id: formId,
        frequency,
        day_of_week: frequency === "weekly" ? dayOfWeek : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        time_of_day: normalizedTime,
        timezone: USER_TIMEZONE,
        expires_in_days: expiresInDays,
        title,
        description,
        questions_snapshot: snapshotQuestions,
        is_active: true,
        next_send_at: nextSendAt,
      })
      .select()
      .single();

    if (scheduleError || !schedule) {
      console.error("Error creating schedule:", scheduleError);
      return json({ error: "Failed to create schedule" }, { status: 500 });
    }

    return json({ schedule });
  } catch (error) {
    console.error("Error creating check-in form schedule:", error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to create schedule" },
      { status: 500 }
    );
  }
}
