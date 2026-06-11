import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { Resend } from "resend";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { USER_TIMEZONE } from "~/lib/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const resend = new Resend(process.env.RESEND_API_KEY);

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type SnapshotQuestion = {
  question_text: string;
  question_type: string;
  is_required: boolean;
  options?: string[] | null;
  order_index: number;
  source_question_id?: string | null;
};

export type SnapshotQuestionInput = {
  id?: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  options?: string[];
  order_index: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** habits convention: 0=Mon … 6=Sun → JS day(): 0=Sun, 1=Mon … */
function habitsDayToJsDay(habitsDay: number): number {
  return habitsDay === 6 ? 0 : habitsDay + 1;
}

export function parseSnapshotQuestions(
  questionsJson: string | undefined,
  formId: string,
  supabase: SupabaseClient<Database>
): Promise<SnapshotQuestion[]>;
export function parseSnapshotQuestions(
  parsed: SnapshotQuestionInput[]
): SnapshotQuestion[];
export async function parseSnapshotQuestions(
  questionsOrJson: string | SnapshotQuestionInput[] | undefined,
  formId?: string,
  supabase?: SupabaseClient<Database>
): Promise<SnapshotQuestion[]> {
  if (Array.isArray(questionsOrJson)) {
    return questionsOrJson
      .filter((q) => q.question_text?.trim())
      .map((q, index) => ({
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        is_required: q.is_required ?? false,
        options: q.options ?? null,
        order_index: index,
        source_question_id:
          q.id && UUID_PATTERN.test(q.id) ? q.id : null,
      }));
  }

  if (questionsOrJson) {
    try {
      const parsed = JSON.parse(questionsOrJson) as SnapshotQuestionInput[];
      return parseSnapshotQuestions(parsed);
    } catch {
      throw new Error("Invalid questions format");
    }
  }

  if (!formId || !supabase) {
    return [];
  }

  const { data: masterQuestions, error } = await supabase
    .from("check_in_form_questions")
    .select("id, question_text, question_type, is_required, options, order_index")
    .eq("form_id", formId)
    .order("order_index");

  if (error) {
    throw new Error("Failed to load form questions");
  }

  return (masterQuestions || []).map((q) => ({
    question_text: q.question_text,
    question_type: q.question_type,
    is_required: q.is_required,
    options: q.options,
    order_index: q.order_index,
    source_question_id: q.id,
  }));
}

export function computeNextSendAt({
  frequency,
  timeOfDay,
  timezone: tz = USER_TIMEZONE,
  fromDate,
  dayOfWeek,
  dayOfMonth,
}: {
  frequency: ScheduleFrequency;
  timeOfDay: string;
  timezone?: string;
  fromDate?: dayjs.Dayjs | string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
}): string {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const now = fromDate ? dayjs(fromDate).tz(tz) : dayjs().tz(tz);
  let candidate = now
    .tz(tz)
    .hour(hours)
    .minute(minutes)
    .second(0)
    .millisecond(0);

  if (frequency === "daily") {
    if (!candidate.isAfter(now)) {
      candidate = candidate.add(1, "day");
    }
    return candidate.toISOString();
  }

  if (frequency === "weekly") {
    const targetJsDay = habitsDayToJsDay(dayOfWeek ?? 0);
    let daysToAdd = (targetJsDay - candidate.day() + 7) % 7;
    if (daysToAdd === 0 && !candidate.isAfter(now)) {
      daysToAdd = 7;
    }
    candidate = candidate.add(daysToAdd, "day");
    return candidate.toISOString();
  }

  if (frequency === "monthly") {
    const dom = dayOfMonth ?? 1;
    candidate = candidate.date(dom);
    if (!candidate.isAfter(now)) {
      candidate = candidate.add(1, "month").date(dom);
    }
    return candidate.toISOString();
  }

  throw new Error("Invalid frequency");
}

export async function sendCheckInFormInstance({
  supabase,
  coachId,
  clientId,
  formId,
  title,
  description,
  questions,
  expiresInDays = 7,
  sendEmail = true,
}: {
  supabase: SupabaseClient<Database>;
  coachId: string;
  clientId: string;
  formId: string;
  title: string;
  description?: string | null;
  questions: SnapshotQuestion[];
  expiresInDays?: number;
  sendEmail?: boolean;
}) {
  const { data: coachUser, error: coachError } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", coachId)
    .single();

  if (coachError || !coachUser) {
    throw new Error("Coach not found");
  }

  const { data: clientUser, error: clientError } = await supabase
    .from("users")
    .select("id, name, email, email_notifications")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .single();

  if (clientError || !clientUser) {
    throw new Error("Client not found or not accessible");
  }

  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: instance, error: instanceError } = await supabase
    .from("check_in_form_instances")
    .insert({
      form_id: formId,
      client_id: clientId,
      coach_id: coachId,
      expires_at: expiresAt,
      title,
      description: description || null,
    })
    .select()
    .single();

  if (instanceError || !instance) {
    console.error("Error creating form instance:", instanceError);
    throw new Error("Failed to send form");
  }

  if (questions.length > 0) {
    const questionsToInsert = questions.map((q) => ({
      instance_id: instance.id,
      question_text: q.question_text,
      question_type: q.question_type,
      is_required: q.is_required,
      options: q.options,
      order_index: q.order_index,
      source_question_id: q.source_question_id,
    }));

    const { error: snapshotError } = await supabase
      .from("check_in_form_instance_questions")
      .insert(questionsToInsert);

    if (snapshotError) {
      console.error("Error snapshotting questions:", snapshotError);
      await supabase.from("check_in_form_instances").delete().eq("id", instance.id);
      throw new Error("Failed to send form");
    }
  }

  const { error: updateError } = await supabase.from("coach_updates").insert({
    coach_id: coachId,
    client_id: clientId,
    message: `${title} sent!`,
  });

  if (updateError) {
    console.error("Error creating coach update:", updateError);
  }

  if (sendEmail && clientUser.email_notifications && clientUser.email) {
    try {
      await resend.emails.send({
        from: "Kava Training <noreply@kavatraining.com>",
        to: clientUser.email,
        subject: `New Check-In Form: ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">New Check-In Form Available</h2>
            <p>Hi ${clientUser.name},</p>
            <p>Your coach ${coachUser.name} has sent you a new check-in form: <strong>${title}</strong></p>
            ${description ? `<p>${description}</p>` : ""}
            <p>Please log into your Kava Training dashboard to complete this form.</p>
            <p>This form will expire on ${new Date(expiresAt).toLocaleDateString()}.</p>
            <br>
            <p>Best regards,<br>The Kava Training Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }
  }

  return {
    instance,
    clientName: clientUser.name,
    message: `Check-in form "${title}" sent successfully to ${clientUser.name}`,
  };
}

export async function hasPendingFormInstance(
  supabase: SupabaseClient<Database>,
  clientId: string,
  formId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("check_in_form_instances")
    .select("id")
    .eq("client_id", clientId)
    .eq("form_id", formId)
    .eq("status", "sent")
    .is("completed_at", null)
    .gt("expires_at", now)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
