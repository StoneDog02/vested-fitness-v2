import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import ViewWorkoutPlanModal from "~/components/coach/ViewWorkoutPlanModal";
import CreateWorkoutModal from "~/components/coach/CreateWorkoutModal";
import { useState } from "react";
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

  // Fetch all exercise_sets for this client for the week
  // 1. Find all workouts for this client in the week
  const { data: workoutsRaw } = await supabase
    .from("workouts")
    .select("id, date")
    .eq("user_id", client.id)
    .gte("date", weekStart.toISOString().slice(0, 10))
    .lt("date", weekEnd.toISOString().slice(0, 10));
  const workoutIds = (workoutsRaw || []).map((w) => w.id);

  // 2. Find all exercises for those workouts
  let exerciseIds: string[] = [];
  if (workoutIds.length > 0) {
    const { data: exercisesRaw } = await supabase
      .from("exercises")
      .select("id, workout_id")
      .in("workout_id", workoutIds);
    exerciseIds = (exercisesRaw || []).map((e) => e.id);
  }

  // 3. Fetch all sets for those exercises
  let setsRaw: {
    id: string;
    exercise_id: string;
    completed: boolean;
    created_at: string;
  }[] = [];
  if (exerciseIds.length > 0) {
    const { data: sets } = await supabase
      .from("exercise_sets")
      .select("id, exercise_id, completed, created_at")
      .in("exercise_id", exerciseIds);
    setsRaw = sets || [];
  }

  // 4. Build complianceData: for each day, percent of sets completed
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    day.setHours(0, 0, 0, 0);
    // Find workouts for this day
    const workoutIdsForDay = (workoutsRaw || [])
      .filter((w) => {
        const d = new Date(w.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === day.getTime();
      })
      .map((w) => w.id);
    if (workoutIdsForDay.length === 0) {
      complianceData.push(0);
      continue;
    }
    // Find exercises for these workouts
    const exerciseIdsForDay =
      exerciseIds.length > 0 && workoutsRaw
        ? (
            await supabase
              .from("exercises")
              .select("id, workout_id")
              .in("workout_id", workoutIdsForDay)
          ).data?.map((e) => e.id) || []
        : [];
    // Find sets for these exercises
    const setsForDay = setsRaw.filter((s) =>
      exerciseIdsForDay.includes(s.exercise_id)
    );
    if (setsForDay.length === 0) {
      complianceData.push(0);
      continue;
    }
    const completedCount = setsForDay.filter((s) => s.completed).length;
    complianceData.push(
      setsForDay.length > 0 ? completedCount / setsForDay.length : 0
    );
  }

  // Fetch all workout plans for the client
  const { data: plansRaw } = await supabase
    .from("workout_plans")
    .select(
      "id, title, description, is_active, created_at, activated_at, deactivated_at"
    )
    .eq("user_id", client.id)
    .order("created_at", { ascending: false });
  console.log("[WORKOUTS LOADER] plansRaw:", plansRaw);

  // For each plan, fetch days and workouts
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const workoutPlans = await Promise.all(
    (plansRaw || []).map(async (plan) => {
      // Fetch days for this plan
      const { data: daysRaw } = await supabase
        .from("workout_plan_days")
        .select("id, day_of_week, is_rest, workout_id")
        .eq("workout_plan_id", plan.id);
      console.log(`[WORKOUTS LOADER] daysRaw for plan ${plan.id}:`, daysRaw);
      // For each day, fetch workout details if not rest
      const days = await Promise.all(
        daysOfWeek.map(async (day) => {
          const dayRow = (daysRaw || []).find((d) => d.day_of_week === day);
          if (!dayRow) return { day, isRest: true, workout: null };
          if (dayRow.is_rest || !dayRow.workout_id) {
            return { day, isRest: true, workout: null };
          }
          // Fetch workout details
          const { data: workout } = await supabase
            .from("workouts")
            .select("id, name, date, created_at, type")
            .eq("id", dayRow.workout_id)
            .single();
          let groups: WorkoutGroup[] = [];
          if (workout) {
            const { data: groupsRaw } = await supabase
              .from("exercise_groups")
              .select("id, group_type, sequence_order, notes")
              .eq("workout_id", workout.id)
              .order("sequence_order", { ascending: true });
            groups = [];
            for (const group of groupsRaw || []) {
              const { data: exercisesRaw } = await supabase
                .from("exercises")
                .select(
                  "id, name, description, video_url, sequence_order, group_id"
                )
                .eq("group_id", group.id)
                .order("sequence_order", { ascending: true });
              const exercises = await Promise.all(
                (exercisesRaw || []).map(async (exercise) => {
                  const { data: sets } = await supabase
                    .from("exercise_sets")
                    .select("id, set_number, weight, reps, completed, notes")
                    .eq("exercise_id", exercise.id)
                    .order("set_number", { ascending: true });
                  return { ...exercise, sets: sets || [] };
                })
              );
              groups.push({
                type: group.group_type,
                exercises: exercises.map((ex) => ({
                  name: ex.name,
                  videoUrl: ex.video_url,
                  sets: ex.sets ? ex.sets.length : 3,
                  reps: ex.sets && ex.sets[0] ? ex.sets[0].reps : 10,
                  notes: ex.description || undefined,
                })),
              });
            }
            console.log(
              `[WORKOUTS LOADER] groups for workout ${workout.id}:`,
              groups
            );
          }
          return {
            day,
            isRest: false,
            workout: workout
              ? {
                  id: workout.id,
                  title: workout.name,
                  createdAt: workout.created_at,
                  exercises: groups,
                }
              : null,
          };
        })
      );
      // Map plan fields to match WorkoutPlan interface for buildWeekFromPlan
      const planForWeek = {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        isActive: plan.is_active,
        createdAt: plan.created_at,
        activatedAt: plan.activated_at,
        deactivatedAt: plan.deactivated_at,
        days,
      };
      const week = buildWeekFromPlan(planForWeek);
      console.log(`[WORKOUTS LOADER] week for plan ${plan.id}:`, week);
      return {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        isActive: plan.is_active,
        createdAt: plan.created_at,
        activatedAt: plan.activated_at,
        deactivatedAt: plan.deactivated_at,
        days,
        week, // Attach for debugging
      };
    })
  );

  return json({
    workoutPlans,
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

  if (intent === "delete") {
    const planId = formData.get("workoutPlanId") as string;
    // Delete the plan (cascade deletes days)
    await supabase.from("workout_plans").delete().eq("id", planId);
    // Optionally, delete all workouts linked to this plan's days
    const { data: days } = await supabase
      .from("workout_plan_days")
      .select("workout_id")
      .eq("workout_plan_id", planId);
    if (days) {
      for (const day of days) {
        if (day.workout_id) {
          // Delete exercises/sets for this workout
          const { data: exercises } = await supabase
            .from("exercises")
            .select("id")
            .eq("workout_id", day.workout_id);
          if (exercises) {
            for (const exercise of exercises) {
              await supabase
                .from("exercise_sets")
                .delete()
                .eq("exercise_id", exercise.id);
            }
            await supabase
              .from("exercises")
              .delete()
              .eq("workout_id", day.workout_id);
          }
          await supabase.from("workouts").delete().eq("id", day.workout_id);
        }
      }
    }
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

  const planName = formData.get("planName") as string;
  const description = formData.get("description") as string | null;
  const weekJson = formData.get("week") as string;
  const week = weekJson ? JSON.parse(weekJson) : null;
  const planId = formData.get("workoutPlanId") as string | null;

  if (!week || typeof week !== "object") {
    return json({ error: "Invalid week data" }, { status: 400 });
  }

  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  if (intent === "create") {
    // Insert workout_plans row
    const { data: newPlan, error: planError } = await supabase
      .from("workout_plans")
      .insert({
        user_id: client.id,
        title: planName,
        description: description || null,
        is_active: false,
      })
      .select()
      .single();
    if (planError || !newPlan) {
      return json({ error: "Failed to create plan" }, { status: 500 });
    }
    // For each day, insert workout_plan_days
    for (const day of daysOfWeek) {
      const dayPlan = week[day];
      console.log(`[ACTION] Processing day: ${day}`, dayPlan);
      if (!dayPlan || dayPlan.mode === "rest") {
        console.log(`[ACTION] Inserting rest day for ${day}`);
        await supabase.from("workout_plan_days").insert({
          workout_plan_id: newPlan.id,
          day_of_week: day,
          is_rest: true,
          workout_id: null,
        });
      } else if (
        dayPlan.mode === "workout" &&
        dayPlan.groups &&
        dayPlan.groups.length > 0 &&
        dayPlan.groups.some(
          (g: WorkoutGroup) => g.exercises && g.exercises.length > 0
        )
      ) {
        console.log(`[ACTION] Inserting workout for ${day}`);
        const workoutInsert = {
          user_id: client.id,
          name: planName + " - " + day,
          is_active: false,
          date: new Date().toISOString().slice(0, 10),
          type: dayPlan.type || "Single",
        };
        console.log(
          `[ACTION] Workout insert object for ${day}:`,
          workoutInsert
        );
        const { data: workout, error: workoutError } = await supabase
          .from("workouts")
          .insert(workoutInsert)
          .select()
          .single();
        if (workoutError)
          console.error(
            `[ACTION] Workout insert error for ${day}:`,
            workoutError
          );
        if (workout) {
          let groupOrder = 0;
          for (const group of dayPlan.groups) {
            // Insert group into exercise_groups
            const { data: groupRow, error: groupError } = await supabase
              .from("exercise_groups")
              .insert({
                workout_id: workout.id,
                group_type: group.type,
                sequence_order: groupOrder,
                notes: group.notes || null,
              })
              .select()
              .single();
            if (groupError) {
              console.error(
                `[ACTION] Group insert error for ${day}:`,
                groupError
              );
              continue;
            }
            for (const exercise of group.exercises || []) {
              const exerciseInsert = {
                workout_id: workout.id,
                group_id: groupRow.id,
                name: exercise.name,
                description: exercise.notes || "",
                video_url: exercise.videoUrl,
                sequence_order: 0, // You can add ordering if needed
              };
              console.log(
                `[ACTION] Exercise insert object for ${day}:`,
                exerciseInsert
              );
              const { data: exerciseRow, error: exerciseError } = await supabase
                .from("exercises")
                .insert(exerciseInsert)
                .select()
                .single();
              if (exerciseError)
                console.error(
                  `[ACTION] Exercise insert error for ${day}:`,
                  exerciseError
                );
              if (
                exerciseRow &&
                typeof exercise.sets === "number" &&
                exercise.sets > 0
              ) {
                for (let j = 0; j < exercise.sets; j++) {
                  const setInsert = {
                    exercise_id: exerciseRow.id,
                    set_number: j + 1,
                    weight: null,
                    reps: exercise.reps ?? null,
                    completed: false,
                    notes: exercise.notes ?? null,
                  };
                  console.log(
                    `[ACTION] Set insert object for ${day}:`,
                    setInsert
                  );
                  const { error: setError } = await supabase
                    .from("exercise_sets")
                    .insert(setInsert);
                  if (setError)
                    console.error(
                      `[ACTION] Set insert error for ${day}:`,
                      setError
                    );
                }
              }
            }
            groupOrder++;
          }
          const dayInsert = {
            workout_plan_id: newPlan.id,
            day_of_week: day,
            is_rest: false,
            workout_id: workout.id,
          };
          console.log(
            `[ACTION] workout_plan_days insert object for ${day}:`,
            dayInsert
          );
          const { error: dayError } = await supabase
            .from("workout_plan_days")
            .insert(dayInsert);
          if (dayError)
            console.error(
              `[ACTION] workout_plan_days insert error for ${day}:`,
              dayError
            );
        }
      } else {
        console.log(`[ACTION] Skipping day ${day} (no exercises)`);
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
      .from("workout_plan_days")
      .select("id, workout_id")
      .eq("workout_plan_id", planId);
    if (oldDays) {
      for (const day of oldDays) {
        if (day.workout_id) {
          // Delete all exercises/sets for this workout
          const { data: exercises } = await supabase
            .from("exercises")
            .select("id")
            .eq("workout_id", day.workout_id);
          if (exercises) {
            for (const exercise of exercises) {
              await supabase
                .from("exercise_sets")
                .delete()
                .eq("exercise_id", exercise.id);
            }
            await supabase
              .from("exercises")
              .delete()
              .eq("workout_id", day.workout_id);
          }
          await supabase.from("workouts").delete().eq("id", day.workout_id);
        }
        await supabase.from("workout_plan_days").delete().eq("id", day.id);
      }
    }

    // --- INSERT NEW WEEK STRUCTURE ---
    for (const day of daysOfWeek) {
      const dayPlan = week[day];
      console.log(`[ACTION] Processing day: ${day}`, dayPlan);
      if (!dayPlan || dayPlan.mode === "rest") {
        console.log(`[ACTION] Inserting rest day for ${day}`);
        await supabase.from("workout_plan_days").insert({
          workout_plan_id: planId,
          day_of_week: day,
          is_rest: true,
          workout_id: null,
        });
      } else if (
        dayPlan.mode === "workout" &&
        dayPlan.groups &&
        dayPlan.groups.length > 0 &&
        dayPlan.groups.some(
          (g: WorkoutGroup) => g.exercises && g.exercises.length > 0
        )
      ) {
        console.log(`[ACTION] Inserting workout for ${day}`);
        const workoutInsert = {
          user_id: client.id,
          name: planName + " - " + day,
          is_active: false,
          date: new Date().toISOString().slice(0, 10),
          type: dayPlan.type || "Single",
        };
        console.log(
          `[ACTION] Workout insert object for ${day}:`,
          workoutInsert
        );
        const { data: workout, error: workoutError } = await supabase
          .from("workouts")
          .insert(workoutInsert)
          .select()
          .single();
        if (workoutError)
          console.error(
            `[ACTION] Workout insert error for ${day}:`,
            workoutError
          );
        if (workout) {
          let groupOrder = 0;
          for (const group of dayPlan.groups) {
            // Insert group into exercise_groups
            const { data: groupRow, error: groupError } = await supabase
              .from("exercise_groups")
              .insert({
                workout_id: workout.id,
                group_type: group.type,
                sequence_order: groupOrder,
                notes: group.notes || null,
              })
              .select()
              .single();
            if (groupError) {
              console.error(
                `[ACTION] Group insert error for ${day}:`,
                groupError
              );
              continue;
            }
            for (const exercise of group.exercises || []) {
              const exerciseInsert = {
                workout_id: workout.id,
                group_id: groupRow.id,
                name: exercise.name,
                description: exercise.notes || "",
                video_url: exercise.videoUrl,
                sequence_order: 0, // You can add ordering if needed
              };
              console.log(
                `[ACTION] Exercise insert object for ${day}:`,
                exerciseInsert
              );
              const { data: exerciseRow, error: exerciseError } = await supabase
                .from("exercises")
                .insert(exerciseInsert)
                .select()
                .single();
              if (exerciseError)
                console.error(
                  `[ACTION] Exercise insert error for ${day}:`,
                  exerciseError
                );
              if (
                exerciseRow &&
                typeof exercise.sets === "number" &&
                exercise.sets > 0
              ) {
                for (let j = 0; j < exercise.sets; j++) {
                  const setInsert = {
                    exercise_id: exerciseRow.id,
                    set_number: j + 1,
                    weight: null,
                    reps: exercise.reps ?? null,
                    completed: false,
                    notes: exercise.notes ?? null,
                  };
                  console.log(
                    `[ACTION] Set insert object for ${day}:`,
                    setInsert
                  );
                  const { error: setError } = await supabase
                    .from("exercise_sets")
                    .insert(setInsert);
                  if (setError)
                    console.error(
                      `[ACTION] Set insert error for ${day}:`,
                      setError
                    );
                }
              }
            }
            groupOrder++;
          }
          const dayInsert = {
            workout_plan_id: planId,
            day_of_week: day,
            is_rest: false,
            workout_id: workout.id,
          };
          console.log(
            `[ACTION] workout_plan_days insert object for ${day}:`,
            dayInsert
          );
          const { error: dayError } = await supabase
            .from("workout_plan_days")
            .insert(dayInsert);
          if (dayError)
            console.error(
              `[ACTION] workout_plan_days insert error for ${day}:`,
              dayError
            );
        }
      } else {
        console.log(`[ACTION] Skipping day ${day} (no exercises)`);
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
      week[dayObj.day] = {
        mode: "workout",
        type:
          (groups.length > 0 && groups[0].type) || ("Single" as WorkoutType),
        groups,
      };
    } else {
      week[dayObj.day] = { mode: "rest" };
    }
  }
  console.log("[WORKOUTS LOADER] buildWeekFromPlan result:", week);
  return week;
}

export default function ClientWorkouts() {
  const { workoutPlans, client, complianceData, weekStart } = useLoaderData<{
    workoutPlans: WorkoutPlan[];
    client: { name: string } | null;
    complianceData: number[];
    weekStart: string;
  }>();
  const fetcher = useFetcher();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutPlan | null>(
    null
  );
  const [viewWorkoutPlan, setViewWorkoutPlan] = useState<WorkoutPlan | null>(
    null
  );
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [, setSearchParams] = useSearchParams();

  // For visible plans, just show all plans (or filter as needed)
  const sortedPlans = [...workoutPlans].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const handleEdit = (plan: WorkoutPlan) => {
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
  function getBarColor(percent: number) {
    if (percent <= 0.5) {
      // Red to yellow
      const r = 220 + (250 - 220) * (percent / 0.5);
      const g = 38 + (204 - 38) * (percent / 0.5);
      const b = 38 + (21 - 38) * (percent / 0.5);
      return `rgb(${r},${g},${b})`;
    } else {
      // Yellow to green
      const r = 250 + (22 - 250) * ((percent - 0.5) / 0.5);
      const g = 204 + (163 - 204) * ((percent - 0.5) / 0.5);
      const b = 21 + (74 - 21) * ((percent - 0.5) / 0.5);
      return `rgb(${r},${g},${b})`;
    }
  }

  // Week navigation state
  const calendarStart = weekStart
    ? new Date(weekStart)
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
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.set("weekStart", prev.toISOString());
      return newParams;
    });
  }
  function handleNextWeek() {
    const next = new Date(calendarStart);
    next.setDate(next.getDate() + 7);
    next.setHours(0, 0, 0, 0);
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.set("weekStart", next.toISOString());
      return newParams;
    });
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
                {dayLabels.map((label, i) => (
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
                            width: `${Math.round(
                              (complianceData[i] || 0) * 100
                            )}%`,
                            background: getBarColor(complianceData[i] || 0),
                            transition: "width 0.3s, background 0.3s",
                          }}
                        />
                      </div>
                      <span
                        className="ml-3 text-xs font-medium min-w-[32px] text-right"
                        style={{ color: getBarColor(complianceData[i] || 0) }}
                      >
                        {Math.round((complianceData[i] || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
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
      </div>
    </ClientDetailLayout>
  );
}
