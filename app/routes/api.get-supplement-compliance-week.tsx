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
    .select("id, created_at")
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

  console.log('🔍 [SUPPLEMENT COMPLIANCE] Week range:', {
    weekStartParam,
    weekStart: weekStart.format('YYYY-MM-DD HH:mm:ss'),
    weekEnd: weekEnd.format('YYYY-MM-DD HH:mm:ss'),
    today: today.format('YYYY-MM-DD HH:mm:ss')
  });
  

  
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
    
    // Check if any supplements were created on this specific day
    const supplementsCreatedOnThisDay = (supplementsRaw || []).some(supplement => {
      if (!supplement.created_at) return false;
      
      // Try direct date comparison without timezone conversion
      const supplementCreatedDate = supplement.created_at.split('T')[0]; // Get YYYY-MM-DD from UTC timestamp
      const isCreatedOnThisDay = supplementCreatedDate === dayStr;
      
      // Debug logging for supplement creation dates
      if (i === 0) { // Only log for first day to avoid spam
        console.log('🔍 [SUPPLEMENT COMPLIANCE] Debug supplement dates:', {
          dayStr: dayStr,
          supplementCreatedAt: supplement.created_at,
          supplementCreatedDate: supplementCreatedDate,
          isCreatedOnThisDay
        });
      }
      
      return isCreatedOnThisDay;
    });
    
    // If supplements were created on this day, show -1 (supplements added today - compliance starts tomorrow)
    if (supplementsCreatedOnThisDay) {
      console.log('📅 [SUPPLEMENT COMPLIANCE] Setting -1 for day:', dayStr);
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