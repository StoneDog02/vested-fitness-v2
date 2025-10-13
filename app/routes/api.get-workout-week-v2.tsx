import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import { Buffer } from "buffer";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const USER_TIMEZONE = "America/Denver";

// New simplified workout week API using the v2 structure
export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  
  if (!weekStartParam) {
    return json({ error: "Week start parameter is required" }, { status: 400 });
  }

  // Get user authentication
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
      return json({ error: "Invalid authentication" }, { status: 401 });
    }
  } else {
    return json({ error: "No authentication found" }, { status: 401 });
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

  try {
    // Get user row
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", userId)
      .single();
      
    if (!user) {
      return json({ error: "User not found" }, { status: 404 });
    }

    // Get user's active workout plan assignment
    const { data: userAssignment } = await supabase
      .from("user_workout_assignments_v2")
      .select(`
        id,
        is_active,
        plan_id,
        workout_plans_v2!inner(
          id,
          title,
          description,
          builder_mode,
          workout_data,
          is_template,
          created_by
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!userAssignment) {
      return json({ 
        workouts: {},
        completions: {},
        isFlexibleSchedule: false,
        workoutTemplates: [],
        availableTemplates: [],
        restDaysAllowed: 0,
        restDaysUsed: 0,
        error: "No active workout plan found" 
      });
    }

    const plan = userAssignment.workout_plans_v2;
    const isFlexibleSchedule = plan.builder_mode === 'day';

    // Parse week start date and get week range
    const weekStart = dayjs(weekStartParam).tz(USER_TIMEZONE).startOf("day");
    const weekEnd = weekStart.add(7, "day");

    // Get completion data for the week
    const { data: completionsRaw } = await supabase
      .from("workout_completions")
      .select("completed_at, completed_groups")
      .eq("user_id", user.id)
      .gte("completed_at", weekStart.format("YYYY-MM-DD"))
      .lt("completed_at", weekEnd.format("YYYY-MM-DD"));

    if (isFlexibleSchedule) {
      // FLEXIBLE SCHEDULE: Return workout templates and rest day info
      const workoutData = plan.workout_data;
      const workoutDays = workoutData.days || [];

      // Create workout templates from the JSONB data
      const workoutTemplates = workoutDays
        .filter(day => !day.is_rest)
        .map((day, index) => ({
          id: `${plan.id}-${day.day_of_week}`, // Unique ID for each template
          name: plan.title,
          dayLabel: day.workout_name || `${day.day_of_week} Workout`,
          groups: day.exercises ? day.exercises.map(exercise => ({
            id: `${exercise.sequence_order}-${exercise.group_type}`,
            type: exercise.group_type,
            exercises: [{
              id: `${plan.id}-${exercise.sequence_order}`,
              name: exercise.exercise_name,
              description: exercise.exercise_description,
              videoUrl: exercise.video_url,
              type: exercise.group_type,
              sets: exercise.sets_data || [],
            }]
          })) : [],
          allExercises: day.exercises ? day.exercises.map(exercise => ({
            id: `${plan.id}-${exercise.sequence_order}`,
            name: exercise.exercise_name,
            description: exercise.exercise_description,
            videoUrl: exercise.video_url,
            type: exercise.group_type,
            sets: exercise.sets_data || [],
          })) : [],
          uniqueTypes: day.exercises ? [...new Set(day.exercises.map(ex => ex.group_type))] : [],
          isRest: false,
          templateIndex: index
        }));

      // Calculate rest day limits
      const workoutDaysPerWeek = workoutData.workout_days_per_week || 4;
      const restDaysAllowed = 7 - workoutDaysPerWeek;
      
      // Count rest days used this week (completions with empty completed_groups)
      const restDaysUsed = (completionsRaw || []).filter(completion => 
        !completion.completed_groups || completion.completed_groups.length === 0
      ).length;

      // Track completed templates to remove from available options
      const completedTemplateIds = new Set();
      
      // For flexible schedules, we need to match completed groups to template groups
      (completionsRaw || []).forEach(completion => {
        if (completion.completed_groups && completion.completed_groups.length > 0) {
          // Find which template has matching groups
          workoutTemplates.forEach(template => {
            const templateGroupIds = template.groups.map((group: any) => group.id).sort();
            const completedGroupIds = [...completion.completed_groups].sort();
            
            // If the groups match exactly, this template is completed
            if (templateGroupIds.length === completedGroupIds.length &&
                templateGroupIds.every((id, index) => id === completedGroupIds[index])) {
              completedTemplateIds.add(template.id);
            }
          });
        }
      });

      // Available templates are all templates minus completed ones
      const availableTemplates = workoutTemplates.filter(template => 
        !completedTemplateIds.has(template.id)
      );
      
      // Add completion status to each template for UI display
      const templatesWithCompletionStatus = workoutTemplates.map(template => ({
        ...template,
        isCompleted: completedTemplateIds.has(template.id)
      }));

      // Process completions into a map by date for flexible schedules
      const completionsByDate: Record<string, string[]> = {};
      (completionsRaw || []).forEach(completion => {
        completionsByDate[completion.completed_at] = completion.completed_groups || [];
      });

      return json({
        workouts: {}, // Empty for flexible schedules - client handles day assignment
        completions: completionsByDate, // Include completions data for flexible schedules
        isFlexibleSchedule: true,
        workoutTemplates: templatesWithCompletionStatus, // Include completion status
        availableTemplates,
        restDaysAllowed,
        restDaysUsed,
        workoutDaysPerWeek
      });

    } else {
      // FIXED SCHEDULE: Original logic for week-based plans
      const workoutData = plan.workout_data;
      const workoutDays = workoutData.days || [];

      // Build workouts object for fixed schedule
      const workouts: Record<string, any> = {};
      
      for (let i = 0; i < 7; i++) {
        const currentDay = weekStart.add(i, "day");
        const dayName = currentDay.format("dddd");
        const dayStr = currentDay.format("YYYY-MM-DD");
        
        const dayData = workoutDays.find(day => day.day_of_week === dayName);
        
        if (!dayData || dayData.is_rest) {
          workouts[dayStr] = {
            id: `${plan.id}-${dayName}`,
            name: "Rest Day",
            groups: [],
            allExercises: [],
            uniqueTypes: [],
            isRest: true
          };
        } else {
          const groups = dayData.exercises ? dayData.exercises.map(exercise => ({
            id: `${exercise.sequence_order}-${exercise.group_type}`,
            type: exercise.group_type,
            exercises: [{
              id: `${plan.id}-${exercise.sequence_order}`,
              name: exercise.exercise_name,
              description: exercise.exercise_description,
              videoUrl: exercise.video_url,
              type: exercise.group_type,
              sets: exercise.sets_data || [],
            }]
          })) : [];

          const allExercises = dayData.exercises ? dayData.exercises.map(exercise => ({
            id: `${plan.id}-${exercise.sequence_order}`,
            name: exercise.exercise_name,
            description: exercise.exercise_description,
            videoUrl: exercise.video_url,
            type: exercise.group_type,
            sets: exercise.sets_data || [],
          })) : [];

          const uniqueTypes = dayData.exercises ? [...new Set(dayData.exercises.map(ex => ex.group_type))] : [];

          workouts[dayStr] = {
            id: `${plan.id}-${dayName}`,
            name: dayData.workout_name || `${dayName} Workout`,
            groups,
            allExercises,
            uniqueTypes,
            isRest: false
          };
        }
      }

      // Get completion data for fixed schedule
      const completions: Record<string, string[]> = {};
      (completionsRaw || []).forEach(completion => {
        completions[completion.completed_at] = completion.completed_groups || [];
      });

      return json({
        workouts,
        completions,
        isFlexibleSchedule: false,
        workoutTemplates: [],
        availableTemplates: [],
        restDaysAllowed: 0,
        restDaysUsed: 0,
        workoutDaysPerWeek: workoutData.workout_days_per_week || 7
      });
    }

  } catch (error) {
    console.error("Workout week API error:", error);
    return json({ error: "Failed to fetch workout data" }, { status: 500 });
  }
};
