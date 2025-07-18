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
import { USER_TIMEZONE } from "~/lib/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  
  if (!date) {
    return json({ error: "Date parameter is required" }, { status: 400 });
  }

  // Get user from auth cookie
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

  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      authId = undefined;
    }
  }

  if (!authId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .single();

  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }

  const requestedDate = dayjs(date).tz(USER_TIMEZONE).startOf("day");
  const requestedDateStr = requestedDate.format("YYYY-MM-DD");
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = daysOfWeek[requestedDate.day()];

  // Get ALL workout plans for this user (both active and recently deactivated)
  const { data: allPlans } = await supabase
    .from("workout_plans")
    .select("id, title, activated_at, deactivated_at, is_active")
    .eq("user_id", user.id)
    .eq("is_template", false)
    .order("activated_at", { ascending: false, nullsFirst: false });

  // Find the plan that should be active for the requested date:
  // 1. Show active plans activated before or on the requested date
  // 2. Show plans deactivated on the requested date (were active until that day)
  let activePlanId = null;
  if (allPlans && allPlans.length > 0) {
    // First try to find an active plan activated before or on the requested date
    let planToShow = allPlans.find(plan => {
      if (!plan.is_active) return false;
      if (!plan.activated_at) return true; // Legacy plans without activation date
      const activatedDate = plan.activated_at.slice(0, 10);
      return activatedDate <= requestedDateStr;
    });
    
    // If no active plan found, look for plan deactivated on requested date
    if (!planToShow) {
      planToShow = allPlans.find(plan => {
        if (!plan.deactivated_at) return false;
        const deactivatedDate = plan.deactivated_at.slice(0, 10);
        return deactivatedDate === requestedDateStr; // Deactivated on requested date
      });
    }
    
    if (planToShow) {
      activePlanId = planToShow.id;
    }
  }

  if (!activePlanId) {
    return json({ 
      todaysWorkout: {
        id: null,
        name: "No Active Plan",
        groups: [],
        allExercises: [],
        uniqueTypes: [],
        isRest: false
      },
      todaysCompletedGroups: []
    });
  }

  // Get workout day for this plan and day of week
  const { data: planDays } = await supabase
    .from("workout_days")
    .select("id, day_of_week, is_rest, workout_name, workout_type")
    .eq("workout_plan_id", activePlanId)
    .eq("day_of_week", dayOfWeek)
    .limit(1);

  if (!planDays || planDays.length === 0 || planDays[0].is_rest) {
    return json({ 
      todaysWorkout: {
        id: null,
        name: "Rest Day",
        groups: [],
        allExercises: [],
        uniqueTypes: [],
        isRest: true
      },
      todaysCompletedGroups: []
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

  // Get completion data for the requested date
  const { data: completion } = await supabase
    .from("workout_completions")
    .select("completed_groups")
    .eq("user_id", user.id)
    .eq("completed_at", requestedDateStr)
    .single();

  return json({
    todaysWorkout: {
      id: workoutDay.id,
      name: workoutDay.workout_name || "Today's Workout",
      groups,
      allExercises,
      uniqueTypes,
      isRest: false
    },
    todaysCompletedGroups: completion?.completed_groups || [],
  });
}; 