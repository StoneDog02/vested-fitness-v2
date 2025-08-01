import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import ViewWorkoutPlanModal from "~/components/coach/ViewWorkoutPlanModal";
import CreateWorkoutModal from "~/components/coach/CreateWorkoutModal";
import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "~/components/ui/Modal";
import { TrashIcon, PencilIcon } from "@heroicons/react/24/outline";
import ActivationDateModal from "~/components/coach/ActivationDateModal";
import { json, redirect , ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { useLoaderData, useFetcher, useSearchParams, useRevalidator } from "@remix-run/react";
import type {
  DayPlan,
  WorkoutType,
  WorkoutGroup,
} from "~/components/coach/CreateWorkoutModal";
import ViewWorkoutPlanLibraryModal from "~/components/coach/ViewWorkoutPlanLibraryModal";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import NABadge from "../components/ui/NABadge";
import { getCurrentDate, USER_TIMEZONE, getStartOfWeek } from "~/lib/timezone";
import dayjs from "dayjs";

// Helper function to determine activation status for coaches
const getActivationStatus = (plan: { isActive: boolean; activatedAt: string | null }) => {
  if (!plan.isActive) return null;
  
  if (!plan.activatedAt) return "Active"; // Legacy plans without activation date
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const activatedDateStr = plan.activatedAt.slice(0, 10);
  
  if (activatedDateStr <= todayStr) {
    return "Active"; // Activated before today or today (immediate activation)
  } else {
    // Format the activation date and time for display
    const activationDate = new Date(plan.activatedAt);
    const formattedDate = activationDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = activationDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `Will Activate ${formattedDate} at ${formattedTime}`;
  }
};

interface Group {
  type: WorkoutType;
  notes?: string;
  exercises: Array<{
    name: string;
    videoUrl?: string;
    sets: string;
    reps: string;
    notes?: string;
  }>;
}

interface WorkoutPlanDay {
  day: string;
  isRest: boolean;
  workout: {
    id: string;
    title: string;
    createdAt: string;
    exercises: Group[];
  } | null;
}

interface WorkoutPlan {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  builderMode?: 'week' | 'day';
  workoutDaysPerWeek?: number;
  days: WorkoutPlanDay[];
}

// In-memory cache for client workout plans (expires after 30s)
const clientWorkoutsCache: Record<string, { data: any; expires: number }> = {};

export const meta: MetaFunction = () => {
  return [
    { title: "Client Workouts | Kava Training" },
    { name: "description", content: "Manage client workout plans" },
  ];
};

export const loader = async ({
  params,
  request,
}: {
  params: { clientId: string };
  request: Request;
}) => {
  const clientIdParam = params.clientId;
  // Check cache (per client)
  if (clientIdParam && clientWorkoutsCache[clientIdParam] && clientWorkoutsCache[clientIdParam].expires > Date.now()) {
    return json(clientWorkoutsCache[clientIdParam].data);
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Try to find client by slug first, then by id
  let client: { id: string; name: string; created_at?: string } | null = null;
  const [initialClientResult, clientByIdResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, created_at")
      .eq("slug", clientIdParam)
      .single(),
    supabase
      .from("users")
      .select("id, name, created_at")
      .eq("id", clientIdParam)
      .single(),
  ]);
  client = initialClientResult.data || clientByIdResult.data;
  if (!client)
    return json({
      workoutPlans: [],
      libraryPlans: [],
      client: null,
      complianceData: [0, 0, 0, 0, 0, 0, 0],
      weekStart: null,
    });

  // Get coachId from auth cookie
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
  let coachId = null;
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      /* ignore */
    }
  }
  if (authId) {
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
  }

  // Get week start from query param, default to current week
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  let weekStart: Date;
  if (weekStartParam) {
    // Parse the date string as if it's in the user's timezone
    const weekStartDayjs = dayjs.tz(weekStartParam, USER_TIMEZONE).startOf("day");
    weekStart = weekStartDayjs.toDate();
  } else {
    // Use timezone-aware week start calculation
    const weekStartDayjs = getStartOfWeek();
    weekStart = weekStartDayjs.toDate();
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Pagination for workout plans and library plans
  const workoutPlansPage = parseInt(url.searchParams.get("workoutPlansPage") || "1", 10);
  const workoutPlansPageSize = parseInt(url.searchParams.get("workoutPlansPageSize") || "10", 10);
  const workoutPlansOffset = (workoutPlansPage - 1) * workoutPlansPageSize;
  const libraryPlansPage = parseInt(url.searchParams.get("libraryPlansPage") || "1", 10);
  const libraryPlansPageSize = parseInt(url.searchParams.get("libraryPlansPageSize") || "10", 10);
  const libraryPlansOffset = (libraryPlansPage - 1) * libraryPlansPageSize;

  // Fetch paginated plans
  const [plansRaw, libraryPlansRaw, plansCountRaw, libraryPlansCountRaw, completionsRaw] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("id, title, description, is_active, created_at, activated_at, deactivated_at, builder_mode, workout_days_per_week", { count: "exact" })
      .eq("user_id", client.id)
      .eq("is_template", false)
      .order("created_at", { ascending: false })
      .range(workoutPlansOffset, workoutPlansOffset + workoutPlansPageSize - 1),
    supabase
      .from("workout_plans")
      .select("id, title, description, is_active, created_at, activated_at, deactivated_at, builder_mode, workout_days_per_week", { count: "exact" })
      .eq("is_template", true)
      .eq("user_id", coachId)
      .order("created_at", { ascending: false })
      .range(libraryPlansOffset, libraryPlansOffset + libraryPlansPageSize - 1),
    supabase
      .from("workout_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", client.id)
      .eq("is_template", false),
    supabase
      .from("workout_plans")
      .select("id", { count: "exact", head: true })
      .eq("is_template", true)
      .eq("user_id", coachId),
    supabase
      .from("workout_completions")
      .select("completed_at, completed_groups")
      .eq("user_id", client.id)
      .gte("completed_at", weekStart.toISOString().slice(0, 10))
      .lt("completed_at", weekEnd.toISOString().slice(0, 10)),
  ]);

  // Collect all plan ids for this page
  const workoutPlanIds = (plansRaw?.data?.map((p: any) => p.id) || []);
  const libraryPlanIds = (libraryPlansRaw?.data?.map((p: any) => p.id) || []);

  // Step 2: Fetch all days for all plans
  const { data: daysRawData } = await supabase
    .from("workout_days")
    .select("id, workout_plan_id, day_of_week, is_rest, workout_name, workout_type")
    .in("workout_plan_id", workoutPlanIds.length > 0 ? workoutPlanIds : [""]);

  // Step 3: Fetch all exercises for all days
  const allDayIds = (daysRawData || []).map((d: any) => d.id);
  const { data: exercisesRawData } = await supabase
    .from("workout_exercises")
    .select("id, workout_day_id, group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data, group_notes")
    .in("workout_day_id", allDayIds.length > 0 ? allDayIds : [""]);

  // Group exercises by workout_day_id
  const exercisesByDay: Record<string, any[]> = {};
  (exercisesRawData || []).forEach((ex: any) => {
    if (!exercisesByDay[ex.workout_day_id]) exercisesByDay[ex.workout_day_id] = [];
    exercisesByDay[ex.workout_day_id].push(ex);
  });

  // Group days by plan
  const daysByPlan: Record<string, any[]> = {};
  (daysRawData || []).forEach((day: any) => {
    if (!daysByPlan[day.workout_plan_id]) daysByPlan[day.workout_plan_id] = [];
    daysByPlan[day.workout_plan_id].push(day);
  });

  // Helper to build days array for a plan
  const buildDays = (planId: string, planTitle: string, planCreatedAt: string) => {
    const daysOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const planDays = daysByPlan[planId] || [];
    return daysOfWeek.map((day) => {
      const dayRow = planDays.find((d: any) => d.day_of_week === day);
      if (!dayRow) return { day, isRest: true, workout: null };
      if (dayRow.is_rest) return { day, isRest: true, workout: null };
      // Group exercises for this day
      const exercisesRaw = exercisesByDay[dayRow.id] || [];
      const groupsMap = new Map();
      (exercisesRaw || []).forEach((exercise: any) => {
        const groupKey = `${exercise.sequence_order}-${exercise.group_type}`;
        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, {
            type: exercise.group_type,
            notes: exercise.group_notes,
            exercises: []
          });
        }
        // Parse sets data from JSONB
        const setsData = exercise.sets_data || [];
        const setsCount = setsData.length || 3;
        const reps = setsData.length > 0 ? (setsData[0].reps || 10) : 10;
        groupsMap.get(groupKey).exercises.push({
          name: exercise.exercise_name,
          videoUrl: exercise.video_url,
          sets: setsCount,
          reps: reps,
          notes: exercise.exercise_description || undefined,
        });
      });
      const groups = Array.from(groupsMap.values());
      return {
        day,
        isRest: false,
        workout: {
          id: dayRow.id,
          title: dayRow.workout_name || `${planTitle} - ${day}`,
          createdAt: planCreatedAt,
          exercises: groups,
        },
      };
    });
  };

  // Attach days to plans
  const workoutPlans = (plansRaw?.data || []).map((plan: any) => ({
    id: plan.id,
    title: plan.title,
    description: plan.description,
    createdAt: plan.created_at,
    isActive: plan.is_active,
    activatedAt: plan.activated_at,
    deactivatedAt: plan.deactivated_at,
    builderMode: plan.builder_mode,
    workoutDaysPerWeek: plan.workout_days_per_week,
    days: buildDays(plan.id, plan.title, plan.created_at),
  }));
  const libraryPlans = (libraryPlansRaw?.data || []).map((plan: any) => ({
    id: plan.id,
    title: plan.title,
    description: plan.description,
    createdAt: plan.created_at,
    isActive: plan.is_active,
    activatedAt: plan.activated_at,
    deactivatedAt: plan.deactivated_at,
    builderMode: plan.builder_mode,
    workoutDaysPerWeek: plan.workout_days_per_week,
    days: buildDays(plan.id, plan.title, plan.created_at),
  }));

  // Pagination info
  const workoutPlansTotal = plansCountRaw.count || 0;
  const workoutPlansHasMore = workoutPlansOffset + workoutPlans.length < workoutPlansTotal;
  const libraryPlansTotal = libraryPlansCountRaw.count || 0;
  const libraryPlansHasMore = libraryPlansOffset + libraryPlans.length < libraryPlansTotal;

  // Build complianceData: for each day, check if there's a workout completion (not rest day)
  const completions = completionsRaw?.data || [];
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);
    const hasWorkoutCompletion = completions.some((c: any) => 
      c.completed_at === dayStr && 
      c.completed_groups && 
      c.completed_groups.length > 0
    );
    complianceData.push(hasWorkoutCompletion ? 1 : 0);
  }

  const result = {
    workoutPlans,
    libraryPlans,
    workoutPlansHasMore,
    workoutPlansTotal,
    workoutPlansPage,
    workoutPlansPageSize,
    libraryPlansHasMore,
    libraryPlansTotal,
    libraryPlansPage,
    libraryPlansPageSize,
    client,
    complianceData,
    weekStart: weekStart.toISOString(),
  };
  // Cache result
  if (clientIdParam) {
    clientWorkoutsCache[clientIdParam] = { data: result, expires: Date.now() + 30_000 };
  }
  return json(result);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Get coachId from auth cookie (same as meals)
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
  let coachId = null;
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      /* ignore */
    }
  }
  if (authId) {
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
  }

  // Find client
  const { data: initialClient, error } = await supabase
    .from("users")
    .select("id")
    .eq("slug", params.clientId)
    .single();
  let client = initialClient;
  if (error || !client) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id")
      .eq("id", params.clientId)
      .single();
    client = clientById;
  }
  if (!client) return json({ error: "Client not found" }, { status: 400 });

  // Move these variable declarations up so they're available for all action branches
  const planName = formData.get("planName") as string;
  const description = formData.get("description") as string | null;
  const weekJson = formData.get("week") as string;
  const week = weekJson ? JSON.parse(weekJson) : null;
  const planId = formData.get("workoutPlanId") as string | null;
  const builderMode = formData.get("builderMode") as 'week' | 'day' || 'week';
  const workoutDaysPerWeek = formData.get("workoutDaysPerWeek") ? Number(formData.get("workoutDaysPerWeek")) : 4;
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  if (intent === "delete") {
    // Get all workout days for this plan
    const { data: days } = await supabase
      .from("workout_days")
      .select("id")
      .eq("workout_plan_id", planId);
    
    // Delete all workout exercises for these days
    if (days) {
      for (const day of days) {
        await supabase
          .from("workout_exercises")
          .delete()
          .eq("workout_day_id", day.id);
      }
    }
    
    // Delete the workout days
    await supabase
      .from("workout_days")
      .delete()
      .eq("workout_plan_id", planId);
    
    // Delete the workout plan
    await supabase
      .from("workout_plans")
      .delete()
      .eq("id", planId);
    
    return redirect(request.url);
  }

  if (intent === "setActive") {
    const planId = formData.get("workoutPlanId") as string;
    const activationDate = formData.get("activationDate") as string;
    
    // Set all other plans inactive
    await supabase
      .from("workout_plans")
      .update({ is_active: false })
      .eq("user_id", client.id)
      .neq("id", planId);
    
    // Set selected plan active with the chosen activation date
    await supabase
      .from("workout_plans")
      .update({ is_active: true, activated_at: activationDate })
      .eq("id", planId);
    
    // Clear cache to force refresh of compliance data
    if (params.clientId && clientWorkoutsCache[params.clientId]) {
      delete clientWorkoutsCache[params.clientId];
    }
    
    return redirect(request.url);
  }

  if (intent === "useTemplate") {
    const templateId = formData.get("templateId") as string;
    // Get template plan
    const { data: template } = await supabase
      .from("workout_plans")
      .select("title, description")
      .eq("id", templateId)
      .single();
    if (!template) {
      return json({ error: "Template not found" }, { status: 400 });
    }
    // Create new plan from template for client
    const { data: newPlan, error: planError } = await supabase
      .from("workout_plans")
      .insert({
        user_id: client.id,
        title: template.title,
        description: template.description,
        is_active: false,
        is_template: false,
        template_id: templateId,
      })
      .select()
      .single();
    if (planError || !newPlan) {
      return json({ error: "Failed to create plan from template" }, { status: 500 });
    }
    // Get template days
    const { data: templateDays } = await supabase
      .from("workout_days")
      .select("id, day_of_week, is_rest, workout_name, workout_type")
      .eq("workout_plan_id", templateId);
    
    // Copy days and exercises
    if (templateDays) {
      for (const day of templateDays) {
        // Insert new workout day for client plan
        const { data: newDay } = await supabase
          .from("workout_days")
          .insert({
            workout_plan_id: newPlan.id,
            day_of_week: day.day_of_week,
            is_rest: day.is_rest,
            workout_name: day.workout_name,
            workout_type: day.workout_type,
          })
          .select()
          .single();
        
        if (!day.is_rest && newDay) {
          // Copy exercises for this day
          const { data: templateExercises } = await supabase
            .from("workout_exercises")
            .select("group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data, group_notes")
            .eq("workout_day_id", day.id);
          
          if (templateExercises) {
            for (const exercise of templateExercises) {
              await supabase
                .from("workout_exercises")
                .insert({
                  workout_day_id: newDay.id,
                  group_type: exercise.group_type,
                  sequence_order: exercise.sequence_order,
                  exercise_name: exercise.exercise_name,
                  exercise_description: exercise.exercise_description,
                  video_url: exercise.video_url,
                  sets_data: exercise.sets_data,
                  group_notes: exercise.group_notes,
                });
            }
          }
        }
      }
    }
    return redirect(request.url);
  }

  if (intent === "deleteTemplate") {
    const templateId = formData.get("templateId") as string;
    
    // Verify this is a template owned by the coach
    const { data: template, error: templateError } = await supabase
      .from("workout_plans")
      .select("id, is_template, user_id")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.is_template || template.user_id !== coachId) {
      return json({ error: "Unauthorized to delete this template" }, { status: 403 });
    }

    // Get all workout days for this template
    const { data: days } = await supabase
      .from("workout_days")
      .select("id")
      .eq("workout_plan_id", templateId);
    
    // Delete all workout exercises for these days
    if (days) {
      for (const day of days) {
        await supabase
          .from("workout_exercises")
          .delete()
          .eq("workout_day_id", day.id);
      }
    }
    
    // Delete the workout days
    await supabase
      .from("workout_days")
      .delete()
      .eq("workout_plan_id", templateId);
    
    // Delete the workout plan template
    await supabase
      .from("workout_plans")
      .delete()
      .eq("id", templateId);
    
    return redirect(`${request.url}?deletedTemplate=${templateId}`);
  }

  if (intent === "create") {
    // First, create template plan
    const { data: newTemplate, error: templateError } = await supabase
      .from("workout_plans")
      .insert({
        user_id: coachId,
        title: planName,
        description: description || null,
        is_active: false,
        is_template: true,
        builder_mode: builderMode,
        workout_days_per_week: workoutDaysPerWeek,
      })
      .select()
      .single();
    if (templateError || !newTemplate) {
      return json({ error: "Failed to create template" }, { status: 500 });
    }
    // Then, create client plan referencing template
    const { data: newPlan, error: planError } = await supabase
      .from("workout_plans")
      .insert({
        user_id: client.id,
        title: planName,
        description: description || null,
        is_active: false,
        is_template: false,
        template_id: newTemplate.id,
        builder_mode: builderMode,
        workout_days_per_week: workoutDaysPerWeek,
      })
      .select()
      .single();
    if (planError || !newPlan) {
      return json({ error: "Failed to create client plan" }, { status: 500 });
    }
    // For each day, insert for both template and client plan
    for (const day of daysOfWeek) {
      const dayPlan = week[day];
      
      // Template day
      const { data: templateDay } = await supabase
        .from("workout_days")
        .insert({
          workout_plan_id: newTemplate.id,
          day_of_week: day,
          is_rest: !dayPlan || dayPlan.mode === "rest",
          workout_name: dayPlan && dayPlan.mode === "workout" ? (dayPlan.dayLabel || `${planName} - ${day}`) : null,
          workout_type: dayPlan && dayPlan.mode === "workout" ? (dayPlan.type || "Single") : null,
        })
        .select()
        .single();
      
      // Insert exercises for template if not rest day
      if (dayPlan && dayPlan.mode === "workout" && dayPlan.groups && dayPlan.groups.length > 0 && templateDay) {
        let sequenceOrder = 0;
        for (const group of dayPlan.groups) {
          for (const exercise of group.exercises || []) {
            if (exercise.name) {
              // Create sets data
              const setsData = Array.from({ length: exercise.sets || 3 }, (_, i) => ({
                set_number: i + 1,
                weight: null,
                reps: exercise.reps || 10,
                completed: false,
                notes: exercise.notes || null,
              }));
              
              await supabase
                .from("workout_exercises")
                .insert({
                  workout_day_id: templateDay.id,
                  group_type: group.type,
                  sequence_order: sequenceOrder,
                  exercise_name: exercise.name,
                  exercise_description: exercise.notes || "",
                  video_url: exercise.videoUrl,
                  sets_data: setsData,
                  group_notes: group.notes || null,
                });
              sequenceOrder++;
            }
          }
        }
      }
      
      // Client day
      const { data: clientDay } = await supabase
        .from("workout_days")
        .insert({
          workout_plan_id: newPlan.id,
          day_of_week: day,
          is_rest: !dayPlan || dayPlan.mode === "rest",
          workout_name: dayPlan && dayPlan.mode === "workout" ? (dayPlan.dayLabel || `${planName} - ${day}`) : null,
          workout_type: dayPlan && dayPlan.mode === "workout" ? (dayPlan.type || "Single") : null,
        })
        .select()
        .single();
      
      // Insert exercises for client if not rest day
      if (dayPlan && dayPlan.mode === "workout" && dayPlan.groups && dayPlan.groups.length > 0 && clientDay) {
        let sequenceOrder = 0;
        for (const group of dayPlan.groups) {
          for (const exercise of group.exercises || []) {
            if (exercise.name) {
              // Create sets data
              const setsData = Array.from({ length: exercise.sets || 3 }, (_, i) => ({
                set_number: i + 1,
                weight: null,
                reps: exercise.reps || 10,
                completed: false,
                notes: exercise.notes || null,
              }));
              
              await supabase
                .from("workout_exercises")
                .insert({
                  workout_day_id: clientDay.id,
                  group_type: group.type,
                  sequence_order: sequenceOrder,
                  exercise_name: exercise.name,
                  exercise_description: exercise.notes || "",
                  video_url: exercise.videoUrl,
                  sets_data: setsData,
                  group_notes: group.notes || null,
                });
              sequenceOrder++;
            }
          }
        }
      }
    }
    return redirect(request.url);
  }

  if (intent === "edit") {
    // Update workout_plans row
    if (!planId) return json({ error: "Missing plan id" }, { status: 400 });
    await supabase
      .from("workout_plans")
      .update({
        title: planName,
        description: description || null,
        builder_mode: builderMode,
        workout_days_per_week: workoutDaysPerWeek,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId);

    // --- DELETE ALL OLD DATA FOR THIS PLAN ---
    // Fetch all days for this plan
    const { data: oldDays } = await supabase
      .from("workout_days")
      .select("id")
      .eq("workout_plan_id", planId);
    
    if (oldDays) {
      for (const day of oldDays) {
        // Delete all exercises for this workout day
        await supabase
          .from("workout_exercises")
          .delete()
          .eq("workout_day_id", day.id);
      }
      // Delete all workout days
      await supabase
        .from("workout_days")
        .delete()
        .eq("workout_plan_id", planId);
    }

    // --- INSERT NEW WEEK STRUCTURE ---
    for (const day of daysOfWeek) {
      const dayPlan = week[day];
      
      // Insert workout day
      const { data: workoutDay, error: dayError } = await supabase
        .from("workout_days")
        .insert({
          workout_plan_id: planId,
          day_of_week: day,
          is_rest: !dayPlan || dayPlan.mode === "rest",
          workout_name: dayPlan && dayPlan.mode === "workout" ? (dayPlan.dayLabel || `${planName} - ${day}`) : null,
          workout_type: dayPlan && dayPlan.mode === "workout" ? (dayPlan.type || "Single") : null,
        })
        .select()
        .single();
      
      if (dayError) {
        console.error(`[ACTION] Day insert error for ${day}:`, dayError);
        continue;
      }
      
      // Insert exercises if not rest day
      if (
        dayPlan &&
        dayPlan.mode === "workout" &&
        dayPlan.groups &&
        dayPlan.groups.length > 0 &&
        dayPlan.groups.some((g: WorkoutGroup) => g.exercises && g.exercises.length > 0) &&
        workoutDay
      ) {

        let sequenceOrder = 0;
        
        for (const group of dayPlan.groups) {
          for (const exercise of group.exercises || []) {
            if (exercise.name) {
              // Create sets data
              const setsData = Array.from({ length: exercise.sets || 3 }, (_, i) => ({
                set_number: i + 1,
                weight: null,
                reps: exercise.reps || 10,
                completed: false,
                notes: exercise.notes || null,
              }));
              
              const exerciseInsert = {
                workout_day_id: workoutDay.id,
                group_type: group.type,
                sequence_order: sequenceOrder,
                exercise_name: exercise.name,
                exercise_description: exercise.notes || "",
                video_url: exercise.videoUrl,
                sets_data: setsData,
                group_notes: group.notes || null,
              };
              

              
              const { error: exerciseError } = await supabase
                .from("workout_exercises")
                .insert(exerciseInsert);
              
              if (exerciseError) {
                console.error(`[ACTION] Exercise insert error for ${day}:`, exerciseError);
              }
              
              sequenceOrder++;
            }
          }
        }
      } else {

      }
    }
    return redirect(request.url);
  }

  return json({ error: "Invalid action intent" }, { status: 400 });
};

// Add a helper function for date formatting
function formatDateMMDDYYYY(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// Helper to build week object from plan.days
function buildWeekFromPlan(plan: WorkoutPlan) {
  // For flexible schedule plans, we need to extract workout templates
  if (plan.builderMode === 'day') {
    const week: { [day: string]: DayPlan } = {};
    
    // Extract workout templates from the plan's days
    const workoutTemplates: DayPlan[] = [];
    for (const dayObj of plan.days) {
      if (!dayObj.isRest && dayObj.workout) {
        const groups = dayObj.workout.exercises || [];
        workoutTemplates.push({
          mode: "workout" as const,
          type: (groups.length > 0 && groups[0].type) || ("Single" as WorkoutType),
          groups,
          dayLabel: dayObj.workout.title || `Workout ${workoutTemplates.length + 1}`
        });
      }
    }
    
    // For flexible schedule, we store the templates in a special format
    // We'll use the first few days to store the templates
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    // Store templates in the first N days (where N is the number of templates)
    for (let i = 0; i < workoutTemplates.length; i++) {
      week[daysOfWeek[i]] = workoutTemplates[i];
    }
    
    // Fill remaining days with rest
    for (let i = workoutTemplates.length; i < 7; i++) {
      week[daysOfWeek[i]] = { mode: "rest" };
    }
    
    return week;
  } else {
    // For fixed schedule plans, use the original logic
    const week: { [day: string]: DayPlan } = {};
    for (const dayObj of plan.days) {
      if (dayObj.isRest) {
        week[dayObj.day] = { mode: "rest" };
      } else if (dayObj.workout) {
        const groups = dayObj.workout.exercises || [];
        const dayPlan = {
          mode: "workout" as const,
          type: (groups.length > 0 && groups[0].type) || ("Single" as WorkoutType),
          groups,
        };
        week[dayObj.day] = dayPlan;
      } else {
        week[dayObj.day] = { mode: "rest" };
      }
    }
    return week;
  }
}

export default function ClientWorkouts() {
  const loaderData = useLoaderData<{
    workoutPlans: WorkoutPlan[];
    libraryPlans: WorkoutPlan[];
    client: { name: string, id: string, created_at?: string } | null;
    complianceData: number[];
    weekStart: string;
    workoutPlansHasMore?: boolean;
  }>();
  const { workoutPlans, libraryPlans: initialLibraryPlans, client, complianceData: initialComplianceData, weekStart, workoutPlansHasMore: loaderWorkoutPlansHasMore } = loaderData;
  const fetcher = useFetcher();
  const complianceFetcher = useFetcher<{ complianceData: number[]; completions: any[] }>();
  const revalidator = useRevalidator();
  
  // State for library plans
  const [libraryPlans, setLibraryPlans] = useState(initialLibraryPlans);

  // Refresh page data when workout plan form submission completes successfully
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Form submission completed successfully, revalidate the page data and close modals
      revalidator.revalidate();
      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setSelectedWorkout(null);
    }
  }, [fetcher.state, fetcher.data, revalidator]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutPlan | null>(
    null
  );
  const [viewWorkoutPlan, setViewWorkoutPlan] = useState<WorkoutPlan | null>(
    null
  );
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);
  const [planToActivate, setPlanToActivate] = useState<WorkoutPlan | null>(null);
  const [, setSearchParams] = useSearchParams();
  const [complianceData, setComplianceData] = useState<number[]>(initialComplianceData);
  const [currentWeekStart, setCurrentWeekStart] = useState(weekStart);
  const [historyWorkoutPlans, setHistoryWorkoutPlans] = useState(workoutPlans);
  const [workoutPlansPage, setWorkoutPlansPage] = useState(1);
  const [hasMoreWorkoutPlans, setHasMoreWorkoutPlans] = useState(loaderWorkoutPlansHasMore ?? true);
  const historyModalRef = useRef<HTMLDivElement>(null);
  const historyFetcher = useFetcher();

  // Initial API call to get real-time compliance data
  useEffect(() => {
    if (client?.id) {
      const params = new URLSearchParams();
      // Convert ISO string to YYYY-MM-DD format to avoid timezone issues
      const weekStartDate = currentWeekStart ? currentWeekStart.split('T')[0] : '';
      params.set("weekStart", weekStartDate);
      params.set("clientId", client.id);
      // Add timestamp to force refresh and avoid caching
      params.set("_t", Date.now().toString());
      complianceFetcher.load(`/api/get-compliance-week?${params.toString()}`);
    }
  }, [client?.id, currentWeekStart]);

  // Update compliance data when fetcher returns
  useEffect(() => {
    if (complianceFetcher.data?.complianceData) {
      setComplianceData(complianceFetcher.data.complianceData);
    }
  }, [complianceFetcher.data]);

  // Update when initial loader data changes
  useEffect(() => {
    setComplianceData(initialComplianceData);
    setCurrentWeekStart(weekStart);
  }, [initialComplianceData, weekStart]);

  // Listen for workout completion events to refresh compliance data
  useEffect(() => {
    const handleWorkoutCompleted = () => {
      if (client?.id) {
        const params = new URLSearchParams();
        const weekStartDate = currentWeekStart ? currentWeekStart.split('T')[0] : '';
        params.set("weekStart", weekStartDate);
        params.set("clientId", client.id);
        params.set("_t", Date.now().toString());
        complianceFetcher.load(`/api/get-compliance-week?${params.toString()}`);
      }
    };

    window.addEventListener("workouts:completed", handleWorkoutCompleted);
    return () => {
      window.removeEventListener("workouts:completed", handleWorkoutCompleted);
    };
  }, [client?.id, currentWeekStart, complianceFetcher]);

  // Infinite scroll for history modal
  useEffect(() => {
    if (!isHistoryModalOpen) return;
    const handleScroll = () => {
      if (!historyModalRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = historyModalRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 40 && hasMoreWorkoutPlans && historyFetcher.state === "idle") {
        const nextPage = workoutPlansPage + 1;
        setWorkoutPlansPage(nextPage);
        historyFetcher.load(`${window.location.pathname}?workoutPlansPage=${nextPage}`);
      }
    };
    const el = historyModalRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => {
        el.removeEventListener("scroll", handleScroll);
      };
    }
    return undefined;
  }, [isHistoryModalOpen, hasMoreWorkoutPlans, workoutPlansPage, historyFetcher.state]);

  // Append new plans when fetcher loads more
  useEffect(() => {
    if (historyFetcher.data && historyFetcher.state === "idle") {
      const { workoutPlans: newPlans = [], workoutPlansHasMore = false } = historyFetcher.data as any;
      setHistoryWorkoutPlans((prev) => [...prev, ...newPlans]);
      setHasMoreWorkoutPlans(workoutPlansHasMore);
    }
  }, [historyFetcher.data, historyFetcher.state]);

  // Reset on open
  useEffect(() => {
    if (isHistoryModalOpen) {
      setHistoryWorkoutPlans(workoutPlans);
      setWorkoutPlansPage(1);
      setHasMoreWorkoutPlans(loaderWorkoutPlansHasMore ?? true);
    }
  }, [isHistoryModalOpen, workoutPlans, loaderWorkoutPlansHasMore]);

  // For visible plans, just show all plans (or filter as needed)
  const sortedPlans = [...workoutPlans].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  


  const handleEdit = (plan: WorkoutPlan) => {
    const weekData = buildWeekFromPlan(plan);
    setSelectedWorkout(plan);
    setIsEditModalOpen(true);
  };

  const handleSetActive = (plan: WorkoutPlan) => {
    setPlanToActivate(plan);
    setIsActivationModalOpen(true);
  };

  const handleActivationConfirm = (activationDate: string) => {
    if (!planToActivate) return;
    
    const formData = new FormData();
    formData.append("intent", "setActive");
    formData.append("workoutPlanId", planToActivate.id);
    formData.append("activationDate", activationDate);
    
    fetcher.submit(formData, { method: "post" });
    setIsActivationModalOpen(false);
    setPlanToActivate(null);
  };

  const handleUpdateWorkout = (updated: {
    planName: string;
    builderMode: 'week' | 'day';
    workoutDaysPerWeek?: number;
    week: { [day: string]: DayPlan };
  }) => {
    if (!selectedWorkout) return;
    const form = new FormData();
    form.append("intent", "edit");
    form.append("workoutPlanId", selectedWorkout.id);
    form.append("planName", updated.planName);
    form.append("builderMode", updated.builderMode);
    if (updated.workoutDaysPerWeek) {
      form.append("workoutDaysPerWeek", updated.workoutDaysPerWeek.toString());
    }
    form.append("week", JSON.stringify(updated.week));
    fetcher.submit(form, { method: "post" });
    // Don't close modal immediately - let the useEffect handle it after successful submission
  };

  const handleCreateWorkout = (workoutData: {
    planName: string;
    builderMode: 'week' | 'day';
    workoutDaysPerWeek?: number;
    week: { [day: string]: DayPlan };
  }) => {
    const form = new FormData();
    form.append("intent", "create");
    form.append("planName", workoutData.planName);
    form.append("builderMode", workoutData.builderMode);
    if (workoutData.workoutDaysPerWeek) {
      form.append("workoutDaysPerWeek", workoutData.workoutDaysPerWeek.toString());
    }
    form.append("week", JSON.stringify(workoutData.week));
    fetcher.submit(form, { method: "post" });
    // Don't close modal immediately - let the useEffect handle it after successful submission
  };

  // Add day labels and color logic (copied from meals page)
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Bright color scaling from theme green to red with smooth transitions
  function getBarColor(percent: number) {
    const percentage = percent * 100; // Convert to percentage
    if (percentage >= 95) return "#00CC03"; // Theme green - perfect
    if (percentage >= 90) return "#00E804"; // Bright theme green - excellent
    if (percentage >= 85) return "#32E135"; // Theme light green - very good
    if (percentage >= 80) return "#65E668"; // Lighter green - good
    if (percentage >= 75) return "#98EB9B"; // Very light green - above average
    if (percentage >= 70) return "#B8F0BA"; // Pale green - decent
    if (percentage >= 65) return "#D4F5D6"; // Very pale green - okay
    if (percentage >= 60) return "#F0FAF0"; // Almost white green - needs improvement
    if (percentage >= 55) return "#FFF8DC"; // Cream - concerning
    if (percentage >= 50) return "#FFE135"; // Bright yellow - poor
    if (percentage >= 45) return "#FFD700"; // Gold - very poor
    if (percentage >= 40) return "#FFA500"; // Orange - critical
    if (percentage >= 35) return "#FF6347"; // Tomato - very critical
    if (percentage >= 30) return "#FF4500"; // Red orange - extremely poor
    if (percentage >= 25) return "#FF0000"; // Pure red - critical
    if (percentage >= 20) return "#DC143C"; // Crimson - very critical
    if (percentage >= 15) return "#B22222"; // Fire brick - extremely poor
    if (percentage >= 10) return "#8B0000"; // Dark red - needs immediate attention
    return "#660000"; // Very dark red - emergency
  }

  // Week navigation state
  const calendarStart = currentWeekStart
    ? new Date(currentWeekStart)
    : (() => {
        const now = new Date();
        const day = now.getDay();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - day);
        sunday.setHours(0, 0, 0, 0);
        return sunday;
      })();
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarStart.getDate() + 6);
  function formatDateShort(date: Date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  function handlePrevWeek() {
    const prev = new Date(calendarStart);
    prev.setDate(prev.getDate() - 7);
    prev.setHours(0, 0, 0, 0);
    setCurrentWeekStart(prev.toISOString());
    
    // Use fetcher for fast data loading
    const params = new URLSearchParams();
    params.set("weekStart", prev.toISOString().split('T')[0]); // Use YYYY-MM-DD format
    params.set("clientId", client?.id || "");
    complianceFetcher.load(`/api/get-compliance-week?${params.toString()}`);
  }
  function handleNextWeek() {
    const next = new Date(calendarStart);
    next.setDate(next.getDate() + 7);
    next.setHours(0, 0, 0, 0);
    setCurrentWeekStart(next.toISOString());
    
    // Use fetcher for fast data loading
    const params = new URLSearchParams();
    params.set("weekStart", next.toISOString().split('T')[0]); // Use YYYY-MM-DD format
    params.set("clientId", client?.id || "");
    complianceFetcher.load(`/api/get-compliance-week?${params.toString()}`);
  }

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            {client ? `${client.name}'s Workouts` : "Client's Workouts"}
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left side - Workout History */}
          <div>
            <Card
              title="Workout History"
              action={
                <div className="w-full flex flex-row justify-between items-center gap-3">
                  <button
                    className="text-primary text-xs font-medium hover:underline px-1"
                    onClick={() => setIsLibraryModalOpen(true)}
                    style={{ background: "none", border: "none" }}
                  >
                    Library
                  </button>
                  <button
                    className="text-primary text-xs font-medium hover:underline px-1"
                    onClick={() => setIsHistoryModalOpen(true)}
                    style={{ background: "none", border: "none" }}
                  >
                    History
                  </button>
                  <button
                    className="bg-primary text-white px-4 py-2 rounded text-sm"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    + Create Plan
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {sortedPlans.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-dark dark:text-gray-light">
                      Create workouts to be shown here
                    </p>
                  </div>
                ) : (
                  sortedPlans.map((workout) => (
                    <div
                      key={workout.id}
                      className={`p-4 border rounded-lg ${
                        workout.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-secondary dark:text-alabaster">
                            {workout.title}
                          </h3>
                          {workout.isActive ? (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              getActivationStatus(workout) === "Will Activate Tomorrow" 
                                ? "bg-orange-500 text-white" 
                                : "bg-primary text-white"
                            }`}>
                              {getActivationStatus(workout)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetActive(workout)}
                              className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                              title="Set Active"
                            >
                              Set Active
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {workout.description}
                        </p>
                        <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                          Created: {formatDateMMDDYYYY(workout.createdAt)}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex gap-2">
                            <button
                              className="text-green-600 hover:text-green-700 text-sm hover:underline flex items-center gap-1"
                              onClick={() => handleEdit(workout)}
                            >
                              <PencilIcon className="h-4 w-4" /> Edit
                            </button>
                          </div>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="delete" />
                            <input
                              type="hidden"
                              name="workoutPlanId"
                              value={workout.id}
                            />
                            <button
                              type="submit"
                              className="text-red-500 hover:text-red-600"
                              title="Delete Plan"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </fetcher.Form>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
            {/* History Modal */}
            <Modal
              isOpen={isHistoryModalOpen}
              onClose={() => setIsHistoryModalOpen(false)}
              title="Workout History"
            >
              <div className="space-y-4" ref={historyModalRef}>
                {historyWorkoutPlans.length === 0 ? (
                  <div className="text-center text-gray-dark dark:text-gray-light">
                    No workouts in history.
                  </div>
                ) : (
                  historyWorkoutPlans.map((workout) => (
                    <div
                      key={workout.id}
                      className={`p-4 border rounded-lg ${
                        workout.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-secondary dark:text-alabaster">
                            {workout.title}
                          </h3>
                          {workout.isActive ? (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              getActivationStatus(workout) === "Will Activate Tomorrow" 
                                ? "bg-orange-500 text-white" 
                                : "bg-primary text-white"
                            }`}>
                              {getActivationStatus(workout)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetActive(workout)}
                              className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                              title="Set Active"
                            >
                              Set Active
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {workout.description}
                        </p>
                        <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                          Created: {formatDateMMDDYYYY(workout.createdAt)}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex gap-2">
                            <button
                              className="text-green-600 hover:text-green-700 text-sm hover:underline flex items-center gap-1"
                              onClick={() => handleEdit(workout)}
                            >
                              <PencilIcon className="h-4 w-4" /> Edit
                            </button>
                          </div>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="delete" />
                            <input
                              type="hidden"
                              name="workoutPlanId"
                              value={workout.id}
                            />
                            <button
                              type="submit"
                              className="text-red-500 hover:text-red-600"
                              title="Delete Plan"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </fetcher.Form>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {hasMoreWorkoutPlans && historyFetcher.state === "loading" && (
                  <div className="flex justify-center py-4">
                    <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
            </Modal>
          </div>

          {/* Right side - Active Plan & Calendar */}
          <div className="space-y-6">
            {/* Active Workout Plan */}
            <Card title="Active Workout Plan">
              {sortedPlans.find((p) => p.isActive) ? (
                <div>
                  <h3 className="font-medium text-secondary dark:text-alabaster text-lg">
                    {sortedPlans.find((p) => p.isActive)!.title}
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                    {sortedPlans.find((p) => p.isActive)!.description}
                  </p>
                  <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                    Created:{" "}
                    {formatDateMMDDYYYY(
                      sortedPlans.find((p) => p.isActive)!.createdAt
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-dark dark:text-gray-light mb-4">
                    No active workout plan
                  </p>
                </div>
              )}
            </Card>

            {/* Workout Compliance Calendar */}
            <Card>
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg font-semibold">
                  Workout Compliance Calendar
                </span>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <button
                    className="p-1 rounded hover:bg-gray-100"
                    onClick={handlePrevWeek}
                    aria-label="Previous week"
                    type="button"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <span>
                    Week of {formatDateShort(calendarStart)} -{" "}
                    {formatDateShort(calendarEnd)}
                  </span>
                  <button
                    className="p-1 rounded hover:bg-gray-100"
                    onClick={handleNextWeek}
                    aria-label="Next week"
                    type="button"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {dayLabels.map((label, i) => {
                  // Determine if this is today or future/past using dayjs consistently
                  const today = getCurrentDate().startOf("day");
                  const thisDate = dayjs(calendarStart).tz(USER_TIMEZONE).add(i, "day").startOf("day");
                  
                  const isToday = thisDate.isSame(today, "day");
                  const isFuture = thisDate.isAfter(today, "day");
                  

                  
                  // --- Check if this is a rest day in the active plan ---
                  const activePlan = sortedPlans.find((p) => p.isActive);
                  let isRestDay = false;
                  
                  if (activePlan && Array.isArray(activePlan.days) && activePlan.days[i]) {
                    if (activePlan.builderMode === 'day') {
                      // For flexible schedule plans, check if client has chosen rest for this day
                      // A rest day completion is indicated by a completion record with empty completed_groups
                      const dayStr = thisDate.format("YYYY-MM-DD");
                      
                      // First check if there's a workout completion (takes priority)
                      const hasWorkoutCompletion = complianceFetcher.data?.completions?.some((c: any) => 
                        c.completed_at === dayStr && 
                        c.completed_groups && 
                        c.completed_groups.length > 0
                      );
                      
                      // Only mark as rest day if there's no workout completion and there's a rest day completion
                      const hasRestCompletion = complianceFetcher.data?.completions?.some((c: any) => 
                        c.completed_at === dayStr && 
                        (!c.completed_groups || c.completed_groups.length === 0)
                      );
                      
                      isRestDay = !hasWorkoutCompletion && hasRestCompletion;
                    } else {
                      // For fixed schedule plans, use the predetermined rest days
                      isRestDay = !!activePlan.days[i].isRest;
                    }
                  }
                  // --- END ---
                  
                  // Determine percentage for display
                  const percentage = Math.round((complianceData[i] || 0) * 100);
                  let displayPercentage = percentage;
                  let displayText = `${percentage}%`;
                  let barColor = getBarColor(complianceData[i] || 0);
                  
                  // Check for N/A conditions first
                  const signupDate = client?.created_at ? dayjs(client.created_at).tz(USER_TIMEZONE).startOf("day") : null;
                  const isBeforeSignup = signupDate && thisDate.isBefore(signupDate, "day");
                  
                  // Find if a plan exists for this day
                  const planForDay = workoutPlans.find((p) => {
                    const activated = p.activatedAt ? dayjs(p.activatedAt).tz(USER_TIMEZONE).startOf("day") : null;
                    const deactivated = p.deactivatedAt ? dayjs(p.deactivatedAt).tz(USER_TIMEZONE).startOf("day") : null;
                    const dayStr = thisDate.format("YYYY-MM-DD");
                    const activatedStr = activated ? activated.format("YYYY-MM-DD") : null;
                    return (
                      activated && activatedStr && activatedStr <= dayStr && (!deactivated || deactivated.isAfter(thisDate, "day"))
                    );
                  });
                  const isNoPlan = !planForDay;
                  
                  // Handle N/A cases - these should show gray bars
                  if (isBeforeSignup || complianceData[i] === -1 || isNoPlan) {
                    displayPercentage = 0;
                    displayText = "N/A";
                    barColor = '#E5E7EB'; // Gray bar for N/A
                  } else if (isRestDay) {
                    // If rest day, show no bar and "Rest" text
                    displayPercentage = 0;
                    displayText = "Rest";
                    barColor = 'transparent';
                  } else if (isFuture) {
                    displayPercentage = 0;
                    displayText = "Pending";
                    barColor = 'transparent';
                  } else if (isToday && complianceData[i] === 0) {
                    displayPercentage = 0;
                    displayText = "Pending";
                    barColor = 'transparent';
                  }
                  
                  return (
                    <div key={label} className="flex items-center gap-4">
                      <span className="text-xs text-gray-500 w-10 text-left flex-shrink-0">
                        {label}
                      </span>
                      <div className="flex-1" />
                      <div className="flex items-center min-w-[120px] max-w-[200px] w-2/5">
                        {!isRestDay ? (
                          <div className="relative flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute left-0 top-0 h-2 rounded-full"
                              style={{
                                width: `${displayPercentage}%`,
                                background: barColor,
                                transition: "width 0.3s, background 0.3s",
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex-1" />
                        )}
                        <span className="ml-4 text-xs font-medium text-right whitespace-nowrap min-w-[40px]">
                          {isBeforeSignup ? (
                            <NABadge reason="Client was not signed up yet" />
                                                      ) : complianceData[i] === -1 ? (
                              <NABadge reason="Plan added today - compliance starts tomorrow" />
                          ) : isRestDay ? (
                            <span className="text-gray-600 dark:text-gray-400 font-medium">Rest</span>
                          ) : isToday && complianceData[i] === 0 ? (
                            <span className="bg-primary/10 dark:bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/20">Pending</span>
                          ) : isFuture ? (
                            <span className="text-gray-500">Pending</span>
                          ) : isNoPlan ? (
                            <NABadge reason="Plan hasn't been created for client yet" />
                          ) : (
                            `${percentage}%`
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        {/* New Workout Templates Container */}
        {sortedPlans.find((p) => p.isActive) && (
          <div className="mt-6 space-y-6">
            {(() => {
              const activePlan = sortedPlans.find((p) => p.isActive);
              if (!activePlan) return null;

              // For flexible schedule, show rest day usage and workout templates together
              if (activePlan.builderMode === 'day') {
                return (
                  <Card title="Workout Completions">
                    <div className="space-y-4">
                      {/* Rest Day Usage */}
                      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-medium text-secondary dark:text-alabaster">Rest Day</h3>
                            <p className="text-sm text-gray-dark dark:text-gray-light">Take time to recover and recharge</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-secondary dark:text-alabaster">
                            {(() => {
                              // Count rest day completions for this week
                              const weekStart = dayjs(calendarStart).tz(USER_TIMEZONE).startOf("day");
                              const weekEnd = weekStart.add(7, "day");
                                                             const restDaysUsed = complianceFetcher.data?.completions?.filter((c: any) => {
                                 const completionDate = dayjs(c.completed_at).tz(USER_TIMEZONE);
                                 return completionDate.isAfter(weekStart) && 
                                        completionDate.isBefore(weekEnd) && 
                                        // Rest day detection: no completed groups
                                        (!c.completed_groups || c.completed_groups.length === 0);
                               }).length || 0;
                              
                              const restDaysAllowed = activePlan.workoutDaysPerWeek ? 7 - activePlan.workoutDaysPerWeek : 3;
                              return `${restDaysUsed} of ${restDaysAllowed} used`;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Workout Templates Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(() => {
                          // Extract unique workout templates for flexible schedule
                          const templatesMap = new Map();
                          activePlan.days.forEach((day, index) => {
                            if (!day.isRest && day.workout) {
                              const templateKey = day.workout.title || `Workout ${index + 1}`;
                              if (!templatesMap.has(templateKey)) {
                                templatesMap.set(templateKey, {
                                  id: `template-${index}`,
                                  name: templateKey,
                                  dayLabel: day.workout.title.includes(' - ') ? 
                                    day.workout.title.split(' - ')[1] : undefined,
                                  groups: day.workout.exercises || [],
                                });
                              }
                            }
                          });
                          const workoutTemplates = Array.from(templatesMap.values());

                          // Check completion status for each template
                          const weekStart = dayjs(calendarStart).tz(USER_TIMEZONE).startOf("day");
                          const weekEnd = weekStart.add(7, "day");
                          
                          return workoutTemplates.map((template) => {
                            // Check if this template was completed this week
                            // For now, we'll show completion if any workout was completed this week
                            // TODO: In the future, we could match specific template groups to completion groups
                            const isCompleted = complianceFetcher.data?.completions?.some((c: any) => {
                              const completionDate = dayjs(c.completed_at).tz(USER_TIMEZONE);
                              return completionDate.isAfter(weekStart) && 
                                     completionDate.isBefore(weekEnd) && 
                                     c.completed_groups && 
                                     c.completed_groups.length > 0;
                            }) || false;
                            
                            // For debugging: only show completion for the first template to avoid confusion
                            const isFirstTemplate = workoutTemplates.indexOf(template) === 0;
                            const shouldShowCompleted = isCompleted && isFirstTemplate;

                            return (
                              <div
                                key={template.id}
                                className={`bg-white dark:bg-secondary-light/5 rounded-xl border-2 transition-all duration-200 p-4 ${
                                  shouldShowCompleted
                                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                    : "border-gray-200 dark:border-gray-700"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-semibold text-secondary dark:text-alabaster">
                                        {template.name}
                                      </h4>
                                      {template.dayLabel && (
                                        <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                                          {template.dayLabel}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-dark dark:text-gray-light">
                                      {template.groups.reduce((total, group) => total + (group.exercises?.length || 0), 0)} exercises • {template.groups.length} groups
                                    </p>
                                  </div>
                                  {shouldShowCompleted && (
                                    <div className="flex-shrink-0">
                                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-gray-dark dark:text-gray-light">
                                  {shouldShowCompleted ? (
                                    <span className="text-green-600 font-medium">Completed this week</span>
                                  ) : (
                                    <span className="text-gray-500">Not completed yet</span>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* No templates message */}
                      {(() => {
                        const hasTemplates = activePlan.days.some(day => !day.isRest && day.workout);
                        if (!hasTemplates) {
                          return (
                            <div className="text-center py-8 text-gray-dark dark:text-gray-light">
                              <p>No workout templates found in the active plan.</p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </Card>
                );
              } else {
                // For fixed schedule, show rest days and workout days as separate containers
                const restDays = activePlan.days.filter(day => day.isRest);
                const workoutDays = activePlan.days.filter(day => !day.isRest && day.workout);
                const weekStart = dayjs(calendarStart).tz(USER_TIMEZONE).startOf("day");
                const weekEnd = weekStart.add(7, "day");

                return (
                  <>
                    {/* Rest Days Container */}
                    {restDays.length > 0 && (
                      <Card title="Rest Days">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {restDays.map((day, index) => {
                                                         // Check if this rest day was completed this week
                             const isCompleted = complianceFetcher.data?.completions?.some((c: any) => {
                               const completionDate = dayjs(c.completed_at).tz(USER_TIMEZONE);
                               return completionDate.isAfter(weekStart) && 
                                      completionDate.isBefore(weekEnd) && 
                                      // Rest day detection: no completed groups
                                      (!c.completed_groups || c.completed_groups.length === 0);
                             }) || false;

                            return (
                              <div
                                key={`rest-${index}`}
                                className={`bg-white dark:bg-secondary-light/5 rounded-xl border-2 transition-all duration-200 p-4 ${
                                  isCompleted
                                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                    : "border-gray-200 dark:border-gray-700"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-semibold text-secondary dark:text-alabaster">
                                        Rest Day
                                      </h4>
                                      <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full">
                                        {day.day}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-dark dark:text-gray-light">
                                      Take time to recover and recharge
                                    </p>
                                  </div>
                                  {isCompleted && (
                                    <div className="flex-shrink-0">
                                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-gray-dark dark:text-gray-light">
                                  {isCompleted ? (
                                    <span className="text-green-600 font-medium">Completed this week</span>
                                  ) : (
                                    <span className="text-gray-500">Not completed yet</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {/* Workout Days Container */}
                    {workoutDays.length > 0 && (
                      <Card title="Workout Days">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {workoutDays.map((day, index) => {
                                                         // Check if this workout was completed this week
                             const isCompleted = complianceFetcher.data?.completions?.some((c: any) => {
                               const completionDate = dayjs(c.completed_at).tz(USER_TIMEZONE);
                               return completionDate.isAfter(weekStart) && 
                                      completionDate.isBefore(weekEnd) && 
                                      c.completed_groups && 
                                      c.completed_groups.length > 0;
                             }) || false;

                            return (
                              <div
                                key={`workout-${index}`}
                                className={`bg-white dark:bg-secondary-light/5 rounded-xl border-2 transition-all duration-200 p-4 ${
                                  isCompleted
                                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                    : "border-gray-200 dark:border-gray-700"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-semibold text-secondary dark:text-alabaster">
                                        {day.workout?.title || `${activePlan.title} - ${day.day}`}
                                      </h4>
                                      <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                                        {day.day}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-dark dark:text-gray-light">
                                      {day.workout?.exercises?.reduce((total: number, group: any) => total + (group.exercises?.length || 0), 0) || 0} exercises • {day.workout?.exercises?.length || 0} groups
                                    </p>
                                  </div>
                                  {isCompleted && (
                                    <div className="flex-shrink-0">
                                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-gray-dark dark:text-gray-light">
                                  {isCompleted ? (
                                    <span className="text-green-600 font-medium">Completed this week</span>
                                  ) : (
                                    <span className="text-gray-500">Not completed yet</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {/* No content message */}
                    {restDays.length === 0 && workoutDays.length === 0 && (
                      <Card title="Plan Overview">
                        <div className="text-center py-8 text-gray-dark dark:text-gray-light">
                          <p>No workout or rest days found in the active plan.</p>
                        </div>
                      </Card>
                    )}
                  </>
                );
              }
            })()}
          </div>
        )}

        {viewWorkoutPlan && (
          <ViewWorkoutPlanModal
            isOpen={!!viewWorkoutPlan}
            onClose={() => setViewWorkoutPlan(null)}
            workoutPlan={{
              ...viewWorkoutPlan,
              exercises: viewWorkoutPlan.days
                .filter((d) => d.workout)
                .flatMap((d) =>
                  d.workout!.exercises.flatMap((g, groupIdx) =>
                    g.exercises.map((ex, exIdx) => ({
                      id: `${groupIdx}-${exIdx}`,
                      name: ex.name,
                      description: ex.notes || "",
                      sets: Array.from({ length: typeof ex.sets === "number" ? ex.sets : parseInt(ex.sets) || 1 }).map((_, i) => ({
                        setNumber: i + 1,
                        reps: ex.reps,
                        weight: undefined,
                        completed: false,
                        notes: ex.notes,
                      })),
                    }))
                  )
                ),
            }}
          />
        )}

        <CreateWorkoutModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreateWorkout}
          isLoading={fetcher.state !== "idle"}
          initialValues={{
            planName: "",
            builderMode: 'week',
            workoutDaysPerWeek: 4,
            week: [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ].reduce<{ [day: string]: DayPlan }>(
              (acc: { [day: string]: DayPlan }, day: string) => {
                acc[day] = { mode: "rest" };
                return acc;
              },
              {}
            ),
          }}
        />

        {isEditModalOpen && selectedWorkout && (
          <CreateWorkoutModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedWorkout(null);
            }}
            onSubmit={handleUpdateWorkout}
            isLoading={fetcher.state !== "idle"}
            initialValues={{
              planName: selectedWorkout.title,
              builderMode: selectedWorkout.builderMode || 'week',
              workoutDaysPerWeek: selectedWorkout.workoutDaysPerWeek || 4,
              week: buildWeekFromPlan(selectedWorkout),
            }}
            title="Edit Workout Plan"
            submitLabel="Save Changes"
          />
        )}

        <ViewWorkoutPlanLibraryModal
          isOpen={isLibraryModalOpen}
          onClose={() => setIsLibraryModalOpen(false)}
          libraryPlans={libraryPlans}
          onTemplateDeleted={(templateId) => {
            // Update the local library plans state
            setLibraryPlans(prev => prev.filter(plan => plan.id !== templateId));
          }}
        />

        <ActivationDateModal
          isOpen={isActivationModalOpen}
          onClose={() => {
            setIsActivationModalOpen(false);
            setPlanToActivate(null);
          }}
          onConfirm={handleActivationConfirm}
          planName={planToActivate?.title || ""}
          isLoading={fetcher.state !== "idle"}
        />
      </div>
    </ClientDetailLayout>
  );
}
