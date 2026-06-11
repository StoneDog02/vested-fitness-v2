import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getAuthIdFromRequest,
} from "~/lib/chat-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const supabase = createServiceClient();
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    return json({ error: "clientId is required" }, { status: 400 });
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
    return json({ error: "Only coaches can view schedules" }, { status: 403 });
  }

  const { data: schedules, error } = await supabase
    .from("check_in_form_schedules")
    .select(
      "id, form_id, frequency, day_of_week, day_of_month, time_of_day, next_send_at, title, expires_in_days"
    )
    .eq("client_id", clientId)
    .eq("coach_id", coachUser.id)
    .eq("is_active", true)
    .order("next_send_at", { ascending: true });

  if (error) {
    console.error("Error fetching schedules:", error);
    return json({ error: "Failed to fetch schedules" }, { status: 500 });
  }

  return json({ schedules: schedules || [] });
}
