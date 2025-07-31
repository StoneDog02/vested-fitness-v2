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

  // Check if there's an active workout plan
  const hasActivePlan = workoutPlans?.some(plan => plan.is_active);

  // Fetch workout completions for this client for the week
  const { data: completions } = await supabase
    .from("workout_completions")
    .select("completed_at, completed_groups")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.format("YYYY-MM-DD"))
    .lt("completed_at", weekEnd.format("YYYY-MM-DD"));

  // Build complianceData: for each day, check if there's a completion
  const complianceData: number[] = [];
  
  for (let i = 0; i < 7; i++) {
    const day = weekStart.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD");
    
    // If there's no active plan, return -1 for all days
    if (!hasActivePlan) {
      complianceData.push(-1);
      continue;
    }
    
    // Check if this is the activation day for the currently active workout plan
    const activePlan = workoutPlans?.find(plan => {
      if (!plan.activated_at || !plan.is_active) return false;
      // Convert activation date to user timezone for comparison
      const activatedDate = toUserTimezone(plan.activated_at);
      const activatedStr = activatedDate.format("YYYY-MM-DD");
      return activatedStr === dayStr;
    });
    
    // Only show NABadge if this is the currently active plan's activation day
    if (activePlan && activePlan.is_active) {
      // Return -1 to indicate N/A for activation day of currently active plan
      complianceData.push(-1);
      continue;
    }
    
    // Check for workout completion (not rest day)
    const hasWorkoutCompletion = (completions || []).some((c: any) => 
      c.completed_at === dayStr && 
      c.completed_groups && 
      c.completed_groups.length > 0
    );
    complianceData.push(hasWorkoutCompletion ? 1 : 0);
  }

  return json({ complianceData, completions });
}; 