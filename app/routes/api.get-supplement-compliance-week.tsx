import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const clientId = url.searchParams.get("clientId");

  if (!weekStartParam || !clientId) {
    return json({ error: "Missing weekStart or clientId parameter" }, { status: 400 });
  }

  const weekStart = new Date(weekStartParam);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Fetch all supplements for this client
  const { data: supplementsRaw } = await supabase
    .from("supplements")
    .select("id, created_at")
    .eq("user_id", clientId);

  // Fetch all supplement completions for this user for the week
  const { data: completionsRaw } = await supabase
    .from("supplement_completions")
    .select("supplement_id, completed_at")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.toISOString())
    .lt("completed_at", weekEnd.toISOString());

  // Build complianceData: for each day, percent of supplements completed
  const complianceData: number[] = [];
  const hasSupplementsAssigned = (supplementsRaw || []).length > 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    day.setHours(0, 0, 0, 0);
    
    // If no supplements are assigned, handle past vs future days differently
    if (!hasSupplementsAssigned) {
      if (day < today) {
        // Past days with no supplements: show -2 (no supplements assigned)
        complianceData.push(-2);
      } else if (day.getTime() === today.getTime()) {
        // Today with no supplements: check if it's end of day (after 11:59 PM)
        const now = new Date();
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        
        if (now > endOfDay) {
          // End of day with no supplements: show -2 (no supplements assigned)
          complianceData.push(-2);
        } else {
          // Today during the day with no supplements: show 0 (pending - supplements might be added)
          complianceData.push(0);
        }
      } else {
        // Future days with no supplements: show 0 (pending - supplements might be added by coach)
        complianceData.push(0);
      }
      continue;
    }
    
    // Check if any supplements were created today
    const supplementsCreatedToday = (supplementsRaw || []).some(supplement => {
      if (!supplement.created_at) return false;
      const createdStr = supplement.created_at.slice(0, 10);
      return createdStr === dayStr;
    });
    
    if (supplementsCreatedToday) {
      // Return -1 to indicate N/A for creation day
      complianceData.push(-1);
      continue;
    }
    
    // For each supplement, check if a completion exists for this day
    const supplementIds = (supplementsRaw || []).map((s) => s.id);
    let completedCount = 0;
    for (const supplementId of supplementIds) {
      const found = (completionsRaw || []).find((c) => {
        return (
          c.completed_at.startsWith(dayStr) &&
          c.supplement_id === supplementId
        );
      });
      if (found) completedCount++;
    }
    const percent =
      supplementIds.length > 0 ? completedCount / supplementIds.length : 0;
    complianceData.push(percent);
  }

  return json({ complianceData });
}; 