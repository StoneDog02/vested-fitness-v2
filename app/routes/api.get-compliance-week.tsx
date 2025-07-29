import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import dayjs from "dayjs";
import { USER_TIMEZONE, toUserTimezone } from "~/lib/timezone";

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const clientId = url.searchParams.get("clientId");

  if (!weekStartParam || !clientId) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Parse the date string as if it's in the user's timezone, not UTC
  // The weekStartParam is in YYYY-MM-DD format, so we need to parse it as local date
  const weekStart = dayjs.tz(weekStartParam + "T00:00:00", USER_TIMEZONE).startOf("day");
  const weekEnd = weekStart.add(7, "day");
  


  // Fetch workout plans for the client to check activation dates
  const { data: workoutPlans } = await supabase
    .from("workout_plans")
    .select("id, activated_at, created_at, is_active")
    .eq("user_id", clientId)
    .eq("is_template", false);

  // Fetch workout completions for this client for the week
  const { data: completions } = await supabase
    .from("workout_completions")
    .select("completed_at")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.format("YYYY-MM-DD"))
    .lt("completed_at", weekEnd.format("YYYY-MM-DD"));

  // Build complianceData: for each day, check if there's a completion
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = weekStart.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD");
    
    // Check if this is the activation day for the currently active workout plan
    const activePlan = workoutPlans?.find(plan => {
      if (!plan.activated_at || !plan.is_active) return false;
      // Convert activation date to user timezone for comparison
      const activatedDate = toUserTimezone(plan.activated_at);
      const activatedStr = activatedDate.format("YYYY-MM-DD");
      return activatedStr === dayStr;
    });
    
    // Check if this is the first plan for this client (to handle immediate activation)
    // A plan is considered the first if it's the only plan or if it's the earliest created plan
    const isFirstPlan = workoutPlans && activePlan && (
      workoutPlans.length === 1 || 
      workoutPlans.every(p => p.id === activePlan.id || p.activated_at === null) ||
      workoutPlans.every(p => p.id === activePlan.id || toUserTimezone(p.created_at).isAfter(toUserTimezone(activePlan.created_at)))
    );
    
    // Check if plan was created today (for immediate activation)
    const isCreatedToday = activePlan && toUserTimezone(activePlan.created_at).format("YYYY-MM-DD") === dayStr;
    
    if (activePlan && (isFirstPlan || toUserTimezone(activePlan.activated_at).format("YYYY-MM-DD") === dayStr || isCreatedToday)) {
      // Return -1 to indicate N/A for activation/creation day
      complianceData.push(-1);
      continue;
    }
    
    const hasCompletion = (completions || []).some((c: any) => c.completed_at === dayStr);
    complianceData.push(hasCompletion ? 1 : 0);
  }

  return json({ complianceData, completions });
}; 