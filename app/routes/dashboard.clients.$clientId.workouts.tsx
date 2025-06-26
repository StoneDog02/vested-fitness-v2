import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import ViewWorkoutPlanModal from "~/components/coach/ViewWorkoutPlanModal";
import CreateWorkoutModal from "~/components/coach/CreateWorkoutModal";
import { useState, useEffect, useCallback } from "react";
import Modal from "~/components/ui/Modal";
import { TrashIcon, PencilIcon } from "@heroicons/react/24/outline";
import { json, redirect } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { ActionFunctionArgs } from "@remix-run/node";
import type {
  DayPlan,
  WorkoutType,
  WorkoutGroup,
} from "~/components/coach/CreateWorkoutModal";
import ViewWorkoutPlanLibraryModal from "~/components/coach/ViewWorkoutPlanLibraryModal";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

interface Group {
  type: WorkoutType;
  notes?: string;
  exercises: Array<{
    name: string;
    videoUrl?: string;
    sets: number;
    reps: number;
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
  days: WorkoutPlanDay[];
}

export const meta: MetaFunction = () => {
  return [
    { title: "Client Workouts | Vested Fitness" },
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
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Try to find client by slug first
  const { data: initialClient, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("slug", params.clientId)
    .single();
  let client = initialClient;
  if (error || !client) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", params.clientId)
      .single();
    client = clientById;
  }
  if (!client)
    return json({
      workoutPlans: [],
      libraryPlans: [],
      client: null,
      complianceData: [0, 0, 0, 0, 0, 0, 0],
      weekStart: null,
    });

  // --- Workout Compliance Calendar Logic ---
  // Get week start from query param, default to current week
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam);
    weekStart.setHours(0, 0, 0, 0);
  } else {
    weekStart = new Date();
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Fetch workout completions for this client for the week
  const dbStart = performance.now();
  const { data: completions } = await supabase
    .from("workout_completions")
    .select("completed_at")
    .eq("user_id", client.id)
    .gte("completed_at", weekStart.toISOString().slice(0, 10))
    .lt("completed_at", weekEnd.toISOString().slice(0, 10));
  console.log(`DB Query took: ${performance.now() - dbStart}ms`);

  // Build complianceData: for each day, check if there's a completion
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);
    
    const hasCompletion = (completions || []).some((c: any) => c.completed_at === dayStr);
    complianceData.push(hasCompletion ? 1 : 0);
  }

  // Fetch all workout plans for the client
  const { data: plansRaw } = await supabase
    .from("workout_plans")
    .select(
      "id, title, description, is_active, created_at, activated_at, deactivated_at"
    )
    .eq("user_id", client.id)
    .eq("is_template", false)
    .order("created_at", { ascending: false });

  // Fetch library workout plans (templates)
  const { data: libraryPlansRaw } = await supabase
    .from("workout_plans")
    .select(
      "id, title, description, is_active, created_at, activated_at, deactivated_at"
    )
    .eq("is_template", true)
    .order("created_at", { ascending: false });

  // For each plan, fetch days and workouts (for both client and library plans)
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const fetchDaysAndWorkouts = async (plans: any[]) => {
    return Promise.all(
      (plans || []).map(async (plan: any) => {
        // Fetch days for this plan using new workout_days table
        const { data: daysRaw } = await supabase
          .from("workout_days")
          .select("id, day_of_week, is_rest, workout_name, workout_type")
          .eq("workout_plan_id", plan.id);
        
        // For each day, fetch workout details if not rest
        const days = await Promise.all(
          daysOfWeek.map(async (day) => {
            const dayRow = (daysRaw || []).find((d) => d.day_of_week === day);
            if (!dayRow) return { day, isRest: true, workout: null };
            if (dayRow.is_rest) {
              return { day, isRest: true, workout: null };
            }
            
            // Fetch exercises for this workout day using new workout_exercises table
            const { data: exercisesRaw } = await supabase
              .from("workout_exercises")
              .select("id, group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data, group_notes")
              .eq("workout_day_id", dayRow.id)
              .order("sequence_order", { ascending: true });
            
            // Group exercises by their sequence order and group type
            const groupsMap = new Map();
            (exercisesRaw || []).forEach((exercise) => {
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
                id: dayRow.id, // Using workout_day id instead of old workout id
                title: dayRow.workout_name || `${plan.title} - ${day}`,
                createdAt: plan.created_at, // Use plan creation date
                exercises: groups,
              },
            };
          })
        );
        
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          createdAt: plan.created_at,
          isActive: plan.is_active,
          activatedAt: plan.activated_at,
          deactivatedAt: plan.deactivated_at,
          days,
        };
      })
    );
  };

  const workoutPlans = await fetchDaysAndWorkouts(plansRaw || []);
  const libraryPlans = await fetchDaysAndWorkouts(libraryPlansRaw || []);

  return json({
    workoutPlans,
    libraryPlans,
    client,
    complianceData,
    weekStart: weekStart.toISOString(),
  });
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
    // Set all other plans inactive
    await supabase
      .from("workout_plans")
      .update({ is_active: false })
      .eq("user_id", client.id)
      .neq("id", planId);
    // Set selected plan active
    await supabase
      .from("workout_plans")
      .update({ is_active: true, activated_at: new Date().toISOString() })
      .eq("id", planId);
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
      .select("*")
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
            .select("*")
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
          workout_name: dayPlan && dayPlan.mode === "workout" ? `${planName} - ${day}` : null,
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
          workout_name: dayPlan && dayPlan.mode === "workout" ? `${planName} - ${day}` : null,
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
          workout_name: dayPlan && dayPlan.mode === "workout" ? `${planName} - ${day}` : null,
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
  const week: { [day: string]: DayPlan } = {};
  for (const dayObj of plan.days) {
    if (dayObj.isRest) {
      week[dayObj.day] = { mode: "rest" };
    } else if (dayObj.workout) {
      // Now, exercises is actually Group[]
      const groups = dayObj.workout.exercises || [];
      

      
      const dayPlan = {
        mode: "workout" as const,
        type:
          (groups.length > 0 && groups[0].type) || ("Single" as WorkoutType),
        groups,
      };
      week[dayObj.day] = dayPlan;
    } else {
      week[dayObj.day] = { mode: "rest" };
    }
  }
  return week;
}

export default function ClientWorkouts() {
  const { workoutPlans, libraryPlans, client, complianceData: initialComplianceData, weekStart } = useLoaderData<{
    workoutPlans: WorkoutPlan[];
    libraryPlans: WorkoutPlan[];
    client: { id: string; name: string } | null;
    complianceData: number[];
    weekStart: string;
  }>();
  const fetcher = useFetcher();
  const complianceFetcher = useFetcher<{ complianceData: number[] }>();
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
  const [, setSearchParams] = useSearchParams();
  const [complianceData, setComplianceData] = useState<number[]>(initialComplianceData);
  const [currentWeekStart, setCurrentWeekStart] = useState(weekStart);

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

  // For visible plans, just show all plans (or filter as needed)
  const sortedPlans = [...workoutPlans].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  


  const handleEdit = (plan: WorkoutPlan) => {
    const weekData = buildWeekFromPlan(plan);
    setSelectedWorkout(plan);
    setIsEditModalOpen(true);
  };

  const handleUpdateWorkout = (updated: {
    planName: string;
    week: { [day: string]: DayPlan };
  }) => {
    if (!selectedWorkout) return;
    const form = new FormData();
    form.append("intent", "edit");
    form.append("workoutPlanId", selectedWorkout.id);
    form.append("planName", updated.planName);
    form.append("week", JSON.stringify(updated.week));
    fetcher.submit(form, { method: "post" });
    setIsEditModalOpen(false);
    setSelectedWorkout(null);
  };

  const handleCreateWorkout = (workoutData: {
    planName: string;
    week: { [day: string]: DayPlan };
  }) => {
    const form = new FormData();
    form.append("intent", "create");
    form.append("planName", workoutData.planName);
    form.append("week", JSON.stringify(workoutData.week));
    fetcher.submit(form, { method: "post" });
    setIsCreateModalOpen(false);
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
    params.set("weekStart", prev.toISOString());
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
    params.set("weekStart", next.toISOString());
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
                            <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                              Active
                            </span>
                          ) : (
                            <fetcher.Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="setActive"
                              />
                              <input
                                type="hidden"
                                name="workoutPlanId"
                                value={workout.id}
                              />
                              <button
                                type="submit"
                                className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                                title="Set Active"
                              >
                                Set Active
                              </button>
                            </fetcher.Form>
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
              <div className="space-y-4">
                {sortedPlans.length === 0 ? (
                  <div className="text-center text-gray-dark dark:text-gray-light">
                    No workouts in history.
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
                            <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                              Active
                            </span>
                          ) : (
                            <fetcher.Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="setActive"
                              />
                              <input
                                type="hidden"
                                name="workoutPlanId"
                                value={workout.id}
                              />
                              <button
                                type="submit"
                                className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                                title="Set Active"
                              >
                                Set Active
                              </button>
                            </fetcher.Form>
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
                  // Determine if this is today or future/past
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const thisDate = new Date(calendarStart);
                  thisDate.setDate(calendarStart.getDate() + i);
                  thisDate.setHours(0, 0, 0, 0);
                  const isToday = thisDate.getTime() === today.getTime();
                  const isFuture = thisDate.getTime() > today.getTime();
                  
                  // Determine percentage for display
                  const percentage = Math.round((complianceData[i] || 0) * 100);
                  let displayPercentage = percentage;
                  
                  // For pending days, show 0% in the bar but don't show percentage text
                  if (isFuture || (isToday && complianceData[i] === 0)) {
                    displayPercentage = 0;
                  }
                  
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-10 text-left flex-shrink-0">
                        {label}
                      </span>
                      <div className="flex-1" />
                      <div className="flex items-center w-1/3 min-w-[80px] max-w-[180px]">
                        <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="absolute left-0 top-0 h-2 rounded-full"
                            style={{
                              width: `${displayPercentage}%`,
                              background: displayPercentage > 0 ? getBarColor(complianceData[i] || 0) : 'transparent',
                              transition: "width 0.3s, background 0.3s",
                            }}
                          />
                        </div>
                        <span
                          className={`ml-3 text-xs font-medium text-right ${
                            isToday && complianceData[i] === 0 
                              ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20' 
                              : isFuture || (isToday && complianceData[i] === 0)
                              ? 'text-gray-500 min-w-[32px]'
                              : 'min-w-[32px]'
                          }`}
                          style={{ 
                            color: !(isFuture || (isToday && complianceData[i] === 0)) 
                              ? getBarColor(complianceData[i] || 0)
                              : undefined
                          }}
                        >
                          {isFuture || (isToday && complianceData[i] === 0) ? 'Pending' : `${percentage}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
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
                      sets: Array.from({ length: ex.sets }).map((_, i) => ({
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
          initialValues={{
            planName: "",
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
            initialValues={{
              planName: selectedWorkout.title,
              week: buildWeekFromPlan(selectedWorkout),
            }}
            title="Edit Workout Plan"
            submitLabel="Save Changes"
          />
        )}

        <ViewWorkoutPlanLibraryModal
          isOpen={isLibraryModalOpen}
          onClose={() => setIsLibraryModalOpen(false)}
          libraryPlans={libraryPlans.map((plan) => ({
            ...plan,
            days: plan.days.map((day) => ({
              ...day,
              workout: day.workout
                ? {
                    ...day.workout,
                    exercises: (day.workout.exercises || []).flatMap((group: any) =>
                      (group.exercises || []).map((ex: any) => ({
                        name: ex.name,
                        sets: typeof ex.sets === "number" ? ex.sets : 3,
                        reps: typeof ex.reps === "number" ? ex.reps : 10,
                      }))
                    ),
                  }
                : null,
            })),
          }))}
        />
      </div>
    </ClientDetailLayout>
  );
}
