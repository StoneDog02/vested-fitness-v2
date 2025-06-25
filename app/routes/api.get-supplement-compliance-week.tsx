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
    .select("id")
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
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    
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