import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getAuthIdFromRequest,
} from "~/lib/chat-auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const supabase = createServiceClient();

  const formData = await request.formData();
  const scheduleId = formData.get("scheduleId")?.toString();

  if (!scheduleId) {
    return json({ error: "Schedule ID is required" }, { status: 400 });
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
    return json({ error: "Only coaches can cancel schedules" }, { status: 403 });
  }

  const { data: schedule, error: fetchError } = await supabase
    .from("check_in_form_schedules")
    .select("id, coach_id, is_active")
    .eq("id", scheduleId)
    .eq("coach_id", coachUser.id)
    .single();

  if (fetchError || !schedule) {
    return json({ error: "Schedule not found" }, { status: 404 });
  }

  if (!schedule.is_active) {
    return json({ message: "Schedule already inactive" });
  }

  const { error: updateError } = await supabase
    .from("check_in_form_schedules")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  if (updateError) {
    console.error("Error canceling schedule:", updateError);
    return json({ error: "Failed to cancel schedule" }, { status: 500 });
  }

  return json({ message: "Schedule canceled" });
}
