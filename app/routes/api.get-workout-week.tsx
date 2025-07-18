import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  
  if (!weekStartParam) {
    return json({ error: "Week start parameter is required" }, { status: 400 });
  }

  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  
  let accessToken;
  if (supabaseAuthCookieKey) {
    try {
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      const [access] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
    } catch (e) {
      accessToken = undefined;
    }
  }
  
  let userId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      userId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      userId = undefined;
    }
  }
  
  if (!userId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  // Get user row
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", userId)
    .single();
    
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }
  
  // Get the active workout plan (API should show all active plans, let client handle activation logic)
  const { data: workoutPlans } = await supabase
    .from("workout_plans")
    .select("id, title, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);
    
  if (!workoutPlans || workoutPlans.length === 0) {
    return json({ 
      workouts: {},
      completions: {},
      error: "No active workout plan found" 
    });
  }
  
  const planId = workoutPlans[0].id;
  
  // Get all workout days for this plan
  const { data: planDays } = await supabase
    .from("workout_days")
    .select("id, day_of_week, is_rest, workout_name, workout_type")
    .eq("workout_plan_id", planId);

  // Fetch all exercises for all non-rest days in one query
  const nonRestDayIds = (planDays || [])
    .filter(day => !day.is_rest)
    .map(day => day.id);
    
  const { data: exercisesRaw } = await supabase
    .from("workout_exercises")
    .select("workout_day_id, id, group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data")
    .in("workout_day_id", nonRestDayIds)
    .order("workout_day_id")
    .order("sequence_order", { ascending: true });

  // Parse week start date and get week range
  const weekStart = new Date(weekStartParam);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  
  // Get completion data for the week
  const { data: completionsRaw } = await supabase
    .from("workout_completions")
    .select("completed_at, completed_groups")
    .eq("user_id", user.id)
    .gte("completed_at", weekStart.toISOString().slice(0, 10))
    .lt("completed_at", weekEnd.toISOString().slice(0, 10));

  // Build workouts object for each day of the week
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const workouts: Record<string, any> = {};
  const completions: Record<string, string[]> = {};
  
  // TODO: In the future, use user-specific timezone from profile if available
  const userTz = "America/Denver"; // Northern Utah timezone
  const currentDate = dayjs().tz(userTz).startOf("day");
  const currentDateStr = currentDate.format("YYYY-MM-DD");
  

  
  // Process completions into a map by date
  const completionsByDate: Record<string, string[]> = {};
  (completionsRaw || []).forEach(completion => {
    completionsByDate[completion.completed_at] = completion.completed_groups || [];
  });
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = daysOfWeek[date.getDay()];
    

    
    // Find the workout day for this day of week
    const dayPlan = (planDays || []).find(day => day.day_of_week === dayOfWeek);
    
    if (!dayPlan || dayPlan.is_rest) {
      workouts[dateStr] = {
        id: null,
        name: "Rest Day",
        groups: [],
        allExercises: [],
        uniqueTypes: [],
        isRest: true,
        dayOfWeek: dayOfWeek
      };
    } else {
      // Get exercises for this workout day
      const dayExercises = (exercisesRaw || []).filter(ex => ex.workout_day_id === dayPlan.id);
      
      // Group exercises by their group type and sequence order
      const groupsMap = new Map();
      dayExercises.forEach((exercise) => {
        const groupKey = `${exercise.sequence_order}-${exercise.group_type}`;
        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, {
            id: groupKey,
            type: exercise.group_type,
            exercises: []
          });
        }
        
        // Parse sets data from JSONB
        const setsData = exercise.sets_data || [];
        
        groupsMap.get(groupKey).exercises.push({
          id: exercise.id,
          name: exercise.exercise_name,
          description: exercise.exercise_description,
          videoUrl: exercise.video_url,
          type: exercise.group_type,
          sets: setsData.map((set: any) => ({
            setNumber: set.set_number,
            reps: set.reps,
            completed: false,
          })),
        });
      });

      const groups = Array.from(groupsMap.values());
      const allExercises = groups.flatMap((g) => g.exercises);
      const uniqueTypes = Array.from(new Set(groups.map((g) => g.type)));

      workouts[dateStr] = {
        id: dayPlan.id,
        name: dayPlan.workout_name || "Workout",
        groups,
        allExercises,
        uniqueTypes,
        isRest: false,
        dayOfWeek: dayOfWeek
      };
    }
    
    // Add completion data
    completions[dateStr] = completionsByDate[dateStr] || [];
  }


  
  return json({
    workouts,
    completions
  });
}; 