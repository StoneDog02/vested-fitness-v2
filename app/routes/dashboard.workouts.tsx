import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import WorkoutCard from "~/components/workout/WorkoutCard";
import type { Exercise, WorkoutType } from "~/types/workout";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Workouts | Vested Fitness" },
    { name: "description", content: "View and track your workout plans" },
  ];
};

export const loader: LoaderFunction = async ({ request }) => {
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
  if (!userId) return json({ todaysWorkout: null });
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
  if (!user) return json({ todaysWorkout: null });
  // Get active workout plan
  const { data: workoutPlans } = await supabase
    .from("workout_plans")
    .select("id, title, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);
  if (!workoutPlans || workoutPlans.length === 0) return json({ todaysWorkout: null });
  const planId = workoutPlans[0].id;
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDay = daysOfWeek[new Date().getDay()];
  const { data: planDays } = await supabase
    .from("workout_plan_days")
    .select("id, day_of_week, is_rest, workout_id")
    .eq("workout_plan_id", planId)
    .eq("day_of_week", todayDay)
    .limit(1);
  if (!planDays || planDays.length === 0 || planDays[0].is_rest || !planDays[0].workout_id) {
    return json({ todaysWorkout: null });
  }
  // Fetch workout details
  const { data: workout } = await supabase
    .from("workouts")
    .select("id, name, type")
    .eq("id", planDays[0].workout_id)
    .single();
  if (!workout) return json({ todaysWorkout: null });
  // Fetch exercise groups for this workout
  const { data: groupsRaw } = await supabase
    .from("exercise_groups")
    .select("id, group_type, sequence_order")
    .eq("workout_id", workout.id)
    .order("sequence_order", { ascending: true });
  // For each group, fetch exercises and sets
  const groups = await Promise.all(
    (groupsRaw || []).map(async (group) => {
      const { data: exercisesRaw } = await supabase
        .from("exercises")
        .select("id, name, description, video_url")
        .eq("group_id", group.id);
      const exercises = await Promise.all(
        (exercisesRaw || []).map(async (ex) => {
          const { data: setsRaw } = await supabase
            .from("exercise_sets")
            .select("set_number, reps")
            .eq("exercise_id", ex.id)
            .order("set_number", { ascending: true });
          return {
            id: ex.id,
            name: ex.name,
            description: ex.description,
            videoUrl: ex.video_url,
            type: group.group_type,
            sets: (setsRaw ?? []).map((set) => ({
              setNumber: set.set_number,
              reps: set.reps,
              completed: false,
            })),
          };
        })
      );
      return {
        type: group.group_type,
        exercises,
      };
    })
  );
  // Flatten all exercises for the table
  const allExercises = groups.flatMap((g) => g.exercises);
  // Get all unique types
  const uniqueTypes = Array.from(new Set(groups.map((g) => g.type)));
  return json({
    todaysWorkout: {
      id: workout.id,
      name: workout.name,
      groups,
      allExercises,
      uniqueTypes,
    },
  });
};

export default function Workouts() {
  const { todaysWorkout } = useLoaderData<{ todaysWorkout: null | {
    id: string;
    name: string;
    groups: { type: string; exercises: Exercise[] }[];
    allExercises: Exercise[];
    uniqueTypes: string[];
  } }>();
  const [dayOffset, setDayOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submittedData, setSubmittedData] = useState<
    Record<string, { exercises: Record<string, boolean> }>
  >({});
  const [completedExercises, setCompletedExercises] = useState<
    Record<string, boolean>
  >({});

  // Get the formatted date display
  const getDateDisplay = (offset: number) => {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + offset);
    const weekdayName = targetDate.toLocaleDateString("en-US", {
      weekday: "long",
    });
    const formattedDate = targetDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    if (offset === 0) {
      return { title: "Today", subtitle: formattedDate, weekday: weekdayName };
    } else if (offset === 1) {
      return {
        title: "Tomorrow",
        subtitle: formattedDate,
        weekday: weekdayName,
      };
    } else if (offset === -1) {
      return {
        title: "Yesterday",
        subtitle: formattedDate,
        weekday: weekdayName,
      };
    } else {
      return {
        title: weekdayName,
        subtitle: formattedDate,
        weekday: weekdayName,
      };
    }
  };
  const dateDisplay = getDateDisplay(dayOffset);

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6">
        Today's Workout
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-2">
          <Card className="mb-4 sm:mb-6">
            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-secondary dark:text-alabaster mb-2">
                {todaysWorkout ? todaysWorkout.name : "Rest Day"}
              </h2>
              {todaysWorkout && todaysWorkout.uniqueTypes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {todaysWorkout.uniqueTypes.map((type) => (
                    <span
                      key={type}
                      className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold"
                    >
                      {type.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4 sm:space-y-6">
              {!todaysWorkout ? (
                <p className="text-secondary dark:text-alabaster">
                  No workout scheduled for this day.
                </p>
              ) : (
                todaysWorkout.groups.map((group, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-secondary-light/5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-200 p-4 sm:p-6"
                  >
                    <WorkoutCard
                      exercises={group.exercises}
                      type={group.type === "Super Set" || group.type === "SuperSet" ? "Super" : group.type === "Giant Set" || group.type === "GiantSet" ? "Giant" : "Single"}
                      dayOffset={0}
                    />
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-4 sm:space-y-6">
          {/* Placeholder for right column */}
          <Card title="Workout Plan Info">
            <div className="text-xs sm:text-sm text-gray-dark dark:text-gray-light mb-3 sm:mb-4">
              {todaysWorkout ? "Active Plan" : "No active plan"}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
