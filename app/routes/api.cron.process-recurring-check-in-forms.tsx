import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { createServiceClient } from "~/lib/chat-auth.server";
import {
  computeNextSendAt,
  hasPendingFormInstance,
  sendCheckInFormInstance,
  type SnapshotQuestion,
  type ScheduleFrequency,
} from "~/lib/checkInForms.server";

function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  return authHeader.substring(7) === cronSecret;
}

async function processRecurringForms() {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: dueSchedules, error } = await supabase
    .from("check_in_form_schedules")
    .select("*")
    .eq("is_active", true)
    .lte("next_send_at", now)
    .order("next_send_at", { ascending: true });

  if (error) {
    console.error("Error fetching due schedules:", error);
    throw new Error("Failed to fetch schedules");
  }

  const results = {
    processed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const schedule of dueSchedules || []) {
    try {
      const questions = (schedule.questions_snapshot || []) as SnapshotQuestion[];
      const frequency = schedule.frequency as ScheduleFrequency;

      const advanceSchedule = async () => {
        const nextSendAt = computeNextSendAt({
          frequency,
          timeOfDay: schedule.time_of_day,
          timezone: schedule.timezone,
          fromDate: schedule.next_send_at,
          dayOfWeek: schedule.day_of_week,
          dayOfMonth: schedule.day_of_month,
        });

        await supabase
          .from("check_in_form_schedules")
          .update({
            last_sent_at: new Date().toISOString(),
            next_send_at: nextSendAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", schedule.id);
      };

      const pending = await hasPendingFormInstance(
        supabase,
        schedule.client_id,
        schedule.form_id
      );

      if (pending) {
        console.log(
          `Skipping schedule ${schedule.id}: client has pending form instance`
        );
        await advanceSchedule();
        results.skipped++;
        continue;
      }

      await sendCheckInFormInstance({
        supabase,
        coachId: schedule.coach_id,
        clientId: schedule.client_id,
        formId: schedule.form_id,
        title: schedule.title,
        description: schedule.description,
        questions,
        expiresInDays: schedule.expires_in_days,
      });

      await advanceSchedule();
      results.processed++;
    } catch (scheduleError) {
      const message =
        scheduleError instanceof Error
          ? scheduleError.message
          : "Unknown error";
      console.error(`Error processing schedule ${schedule.id}:`, scheduleError);
      results.errors.push(`${schedule.id}: ${message}`);
    }
  }

  return results;
}

export async function action({ request }: ActionFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await processRecurringForms();
    return json(results);
  } catch (error) {
    console.error("Cron processing failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await processRecurringForms();
    return json(results);
  } catch (error) {
    console.error("Cron processing failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
