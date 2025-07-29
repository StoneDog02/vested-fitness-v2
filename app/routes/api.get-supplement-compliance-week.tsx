import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import dayjs from "dayjs";
import { USER_TIMEZONE, getCurrentDate } from "~/lib/timezone";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const clientIdParam = url.searchParams.get("clientId");

  if (!weekStartParam || !clientIdParam) {
    return json({ error: "Missing weekStart or clientId parameter" }, { status: 400 });
  }

  // Find client by slug or id (parallel)
  const [initialClientResult, clientByIdResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, created_at")
      .eq("slug", clientIdParam)
      .single(),
    supabase
      .from("users")
      .select("id, created_at")
      .eq("id", clientIdParam)
      .single(),
  ]);
  
  const client = initialClientResult.data || clientByIdResult.data;
  if (!client) {
    return json({ error: "Client not found" }, { status: 404 });
  }
  
  const clientId = client.id;
  const clientSignupDate = dayjs(client.created_at).tz(USER_TIMEZONE).startOf("day");



  // Use the same week start calculation as the frontend
  const weekStart = dayjs.tz(weekStartParam, USER_TIMEZONE).startOf("day");
  const weekEnd = weekStart.add(7, "day");

  // Fetch all supplements for this client
  const { data: supplementsRaw, error: supplementsError } = await supabase
    .from("supplements")
    .select("id, created_at, active_from")
    .eq("user_id", clientId);

  if (supplementsError) {
    console.error("Error fetching supplements:", supplementsError);
    return json({ error: "Failed to fetch supplements" }, { status: 500 });
  }

  // Fetch all supplement completions for this user for the week
  const { data: completionsRaw, error: completionsError } = await supabase
    .from("supplement_completions")
    .select("supplement_id, completed_at")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.format("YYYY-MM-DD"))
    .lt("completed_at", weekEnd.format("YYYY-MM-DD"));

  if (completionsError) {
    console.error("Error fetching completions:", completionsError);
    return json({ error: "Failed to fetch completions" }, { status: 500 });
  }



  // Build complianceData: for each day, percent of supplements completed
  const complianceData: number[] = [];
  const hasSupplementsAssigned = (supplementsRaw || []).length > 0;
    const today = getCurrentDate();

  for (let i = 0; i < 7; i++) {
    const day = weekStart.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD"); // Get YYYY-MM-DD format
    
    // If no supplements are assigned, handle past vs future days differently
    if (!hasSupplementsAssigned) {
      if (day.isBefore(today)) {
        // Past days with no supplements: show -2 (no supplements assigned)
        complianceData.push(-2);
      } else if (day.isSame(today, "day")) {
        // Today with no supplements: check if it's end of day (after 11:59 PM)
        const now = dayjs().tz(USER_TIMEZONE);
        const endOfDay = today.endOf("day");
        
        if (now.isAfter(endOfDay)) {
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
    
    // Check if this day is before the client was signed up
    if (day.isBefore(clientSignupDate)) {
      // Client wasn't signed up yet on this day
      complianceData.push(-3); // Use -3 to indicate "Client was not signed up yet"
      continue;
    }
    
    // Check if this day is before any supplements were assigned
    const earliestSupplementDate = (supplementsRaw || []).reduce((earliest: dayjs.Dayjs | null, supplement) => {
      if (!supplement.created_at) return earliest;
      const supplementDate = dayjs(supplement.created_at).tz(USER_TIMEZONE).startOf("day");
      return earliest ? (supplementDate.isBefore(earliest) ? supplementDate : earliest) : supplementDate;
    }, null as dayjs.Dayjs | null);
    
    if (earliestSupplementDate && day.isBefore(earliestSupplementDate)) {
      // Supplements weren't assigned yet on this day
      complianceData.push(-2); // Use -2 to indicate "No supplements assigned by coach"
      continue;
    }
    
    // Get supplements that are active for this specific day
    const activeSupplementsForDay = (supplementsRaw || []).filter(supplement => {
      if (!supplement.active_from) return false;
      
      // Check if this supplement is active for this day
      const activeFromDate = supplement.active_from;
      const isActiveForDay = activeFromDate <= dayStr;
      
      return isActiveForDay;
    });
    
    // If no supplements are active for this day, show -2 (no supplements assigned)
    if (activeSupplementsForDay.length === 0) {
      complianceData.push(-2);
      continue;
    }
    
    // Check if any supplements were created on this specific day
    const supplementsCreatedOnThisDay = (supplementsRaw || []).filter(supplement => {
      if (!supplement.created_at) return false;
      
      const createdDate = supplement.created_at.split('T')[0]; // Get YYYY-MM-DD from timestamp
      const isCreatedOnThisDay = createdDate === dayStr;
      
      return isCreatedOnThisDay;
    });
    
    // If supplements were created on this day AND no supplements are active yet, show -1
    // This indicates "supplements added today - compliance starts tomorrow"
    if (supplementsCreatedOnThisDay.length > 0 && activeSupplementsForDay.length === 0) {
      complianceData.push(-1);
      continue;
    }
    
    // For each active supplement, check if a completion exists for this day
    const activeSupplementIds = activeSupplementsForDay.map((s) => s.id);
    let completedCount = 0;
    for (const supplementId of activeSupplementIds) {
      const found = (completionsRaw || []).find((c) => {
        return (
          c.completed_at.startsWith(dayStr) &&
          c.supplement_id === supplementId
        );
      });
      if (found) completedCount++;
    }
    const percent =
      activeSupplementIds.length > 0 ? completedCount / activeSupplementIds.length : 0;
    complianceData.push(percent);
  }

  // Build data about newly created supplements for each day
  const newlyCreatedSupplements: { [day: string]: string[] } = {};
  
  for (let i = 0; i < 7; i++) {
    const day = weekStart.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD");
    
    // Get supplements that are active for this specific day
    const activeSupplementsForDay = (supplementsRaw || []).filter(supplement => {
      if (!supplement.active_from) return false;
      const activeFromDate = supplement.active_from;
      const isActiveForDay = activeFromDate <= dayStr;
      return isActiveForDay;
    });
    
    const supplementsCreatedOnThisDay = (supplementsRaw || []).filter(supplement => {
      if (!supplement.created_at) return false;
      const createdDate = supplement.created_at.split('T')[0];
      return createdDate === dayStr;
    });
    
    // Only show newly created supplements if no supplements were active on that day
    if (supplementsCreatedOnThisDay.length > 0 && activeSupplementsForDay.length === 0) {
      newlyCreatedSupplements[dayStr] = supplementsCreatedOnThisDay.map(s => s.id);
    }
  }

  return json({ 
    complianceData,
    newlyCreatedSupplements 
  });
}; 