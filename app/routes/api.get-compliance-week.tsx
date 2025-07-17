import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

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

  const weekStart = new Date(weekStartParam);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Fetch workout plans for the client to check activation dates
  const { data: workoutPlans } = await supabase
    .from("workout_plans")
    .select("id, activated_at")
    .eq("user_id", clientId)
    .eq("is_template", false);

  // Fetch workout completions for this client for the week
  const { data: completions } = await supabase
    .from("workout_completions")
    .select("completed_at")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.toISOString().slice(0, 10))
    .lt("completed_at", weekEnd.toISOString().slice(0, 10));

  // Build complianceData: for each day, check if there's a completion
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);
    
    // Check if this is the activation day for any workout plan
    const activePlan = workoutPlans?.find(plan => {
      if (!plan.activated_at) return false;
      const activatedStr = plan.activated_at.slice(0, 10);
      return activatedStr === dayStr;
    });
    
    // Check if this is the first plan for this client (to handle immediate activation)
    const isFirstPlan = workoutPlans && workoutPlans.length === 1;
    
    if (activePlan && (isFirstPlan || activePlan.activated_at?.slice(0, 10) === dayStr)) {
      // Return -1 to indicate N/A for activation day
      complianceData.push(-1);
      continue;
    }
    
    const hasCompletion = (completions || []).some((c: any) => c.completed_at === dayStr);
    complianceData.push(hasCompletion ? 1 : 0);
  }

  return json({ complianceData });
}; 