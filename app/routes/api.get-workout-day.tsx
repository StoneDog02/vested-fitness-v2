import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  
  if (!dateParam) {
    return json({ error: "Date parameter is required" }, { status: 400 });
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
  
  // Get active workout plan
  const { data: workoutPlans } = await supabase
    .from("workout_plans")
    .select("id, title, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);
    
  if (!workoutPlans || workoutPlans.length === 0) {
    return json({ 
      workout: null, 
      error: "No active workout plan found" 
    });
  }
  
  const planId = workoutPlans[0].id;
  
  // Parse the date and get day of week (handle timezone correctly)
  // Split the date string and create date in local timezone
  const [year, month, day] = dateParam.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day); // month is 0-indexed
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = daysOfWeek[targetDate.getDay()];

  // Get workout day for the specified day of week
  const { data: planDays } = await supabase
    .from("workout_days")
    .select("id, day_of_week, is_rest, workout_name, workout_type")
    .eq("workout_plan_id", planId)
    .eq("day_of_week", dayOfWeek)
    .limit(1);

  if (!planDays || planDays.length === 0 || planDays[0].is_rest) {
    // Rest day
    return json({
      workout: {
        id: null,
        name: "Rest Day",
        groups: [],
        allExercises: [],
        uniqueTypes: [],
        isRest: true,
        dayOfWeek: dayOfWeek
      }
    });
  }

  const workoutDay = planDays[0];

  // Fetch exercises for this workout day
  const { data: exercisesRaw } = await supabase
    .from("workout_exercises")
    .select("id, group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data")
    .eq("workout_day_id", workoutDay.id)
    .order("sequence_order", { ascending: true });

  // Group exercises by their group type and sequence order
  const groupsMap = new Map();
  (exercisesRaw || []).forEach((exercise) => {
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
  
  // Flatten all exercises for the table
  const allExercises = groups.flatMap((g) => g.exercises);
  
  // Get all unique types
  const uniqueTypes = Array.from(new Set(groups.map((g) => g.type)));

  // Get completion data for this specific date
  const dateStr = targetDate.toISOString().slice(0, 10);
  const { data: completionData } = await supabase
    .from("workout_completions")
    .select("completed_groups")
    .eq("user_id", user.id)
    .eq("completed_at", dateStr)
    .single();

  return json({
    workout: {
      id: workoutDay.id,
      name: workoutDay.workout_name || "Workout",
      groups,
      allExercises,
      uniqueTypes,
      isRest: false,
      dayOfWeek: dayOfWeek
    },
    completedGroups: completionData?.completed_groups || []
  });
}; 