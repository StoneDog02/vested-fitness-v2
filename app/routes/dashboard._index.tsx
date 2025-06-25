import { json } from "@remix-run/node";
import { useLoaderData, useMatches, Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import type { DailyWorkout } from "~/types/workout";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import { useState } from "react";
import { parse } from "cookie";
import type { LoaderFunction } from "@remix-run/node";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { useMealCompletion } from "../context/MealCompletionContext";

type LoaderData = {
  clientData?: ClientDashboardData;
  coachId: string | null;
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  compliance: number;
  percentChange: number;
  clients: Client[];
  recentClients: Client[];
  recentActivity: Activity[];
};

// Types for client dashboard data
type Update = {
  message: string;
  timestamp: string;
};

// Add Food type
type Food = {
  id: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// Update Meal type
type Meal = {
  name: string;
  time: string;
  completed: boolean;
  foods: Food[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  description?: string;
};

type Supplement = {
  name: string;
  timing?: "Morning" | "Pre-Workout" | "Post-Workout" | "Evening";
  completed?: boolean;
};

type ClientDashboardData = {
  updates: Update[];
  meals: Meal[];
  workouts: DailyWorkout[];
  supplements: Supplement[];
  workoutCompliance: number;
  mealCompliance: number;
  weightChange: number;
  planName?: string | null;
  isRestDay?: boolean | null;
  completedMealIds?: string[];
};

type Client = {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  role: string;
};

type Activity = {
  id: string;
  clientName: string;
  action: string;
  time: string;
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

  let totalClients = 0;
  let activeClients = 0;
  let inactiveClients = 0;
  let compliance = 0;
  let percentChange = 0;
  let clients: Client[] = [];
  let recentClients: Client[] = [];
  const recentActivity: Activity[] = [];

  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id, starting_weight, current_weight")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
      if (user.role === "client") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayOfWeek = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        // Calculate workout compliance using workout_completions table
        const { data: workoutCompletions } = await supabase
          .from("workout_completions")
          .select("completed_at")
          .eq("user_id", user.id)
          .gte("completed_at", weekStart.toISOString().slice(0, 10))
          .lt("completed_at", weekEnd.toISOString().slice(0, 10));
        
        // Count expected workout days (non-rest days) for the week
        const { data: activePlans } = await supabase
          .from("workout_plans")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1);
        
        let expectedWorkoutDays = 0;
        if (activePlans && activePlans.length > 0) {
          const { data: workoutDays } = await supabase
            .from("workout_days")
            .select("is_rest")
            .eq("workout_plan_id", activePlans[0].id);
          expectedWorkoutDays = (workoutDays || []).filter(day => !day.is_rest).length;
        }
        
        const completedWorkouts = (workoutCompletions ?? []).length;
        const workoutCompliance = expectedWorkoutDays > 0 ? Math.round((completedWorkouts / expectedWorkoutDays) * 100) : 0;
        const { data: mealPlans } = await supabase
          .from("meal_plans")
          .select("id, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1);
        let meals: Meal[] = [];
        let completedMealIds: string[] = [];
        if (mealPlans && mealPlans.length > 0) {
          const planId = mealPlans[0].id;
          let mealsRaw = null;
          let mealsError = null;
          try {
            const result = await supabase
              .from("meals")
              .select("id, name, time")
              .eq("meal_plan_id", planId);
            mealsRaw = result.data;
            mealsError = result.error;
          } catch (err) {
            /* ignore */
          }
          // For each meal, fetch foods and calculate macros
          meals = [];
          if (mealsRaw && mealsRaw.length > 0) {
            for (const meal of mealsRaw) {
              let foodsRaw: Food[] = [];
              try {
                const foodsResult = await supabase
                  .from("foods")
                  .select("id, name, portion, calories, protein, carbs, fat")
                  .eq("meal_id", meal.id);
                foodsRaw = (foodsResult.data as Food[]) || [];
              } catch (err) {
                /* ignore */
              }
              // Calculate macros
              let calories = 0, protein = 0, carbs = 0, fat = 0;
              for (const food of foodsRaw) {
                calories += Number(food.calories) || 0;
                protein += Number(food.protein) || 0;
                carbs += Number(food.carbs) || 0;
                fat += Number(food.fat) || 0;
              }
              meals.push({
                name: meal.name,
                time: meal.time || "",
                foods: foodsRaw,
                calories,
                protein,
                carbs,
                fat,
                completed: false, // always false, just for display
                description: ""
              });
            }
            // Fetch completed meal IDs for today
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(startOfDay);
            endOfDay.setDate(startOfDay.getDate() + 1);
            const { data: todayCompletions } = await supabase
              .from("meal_completions")
              .select("meal_id")
              .eq("user_id", user.id)
              .gte("completed_at", startOfDay.toISOString())
              .lt("completed_at", endOfDay.toISOString());
            const mealIdToKey: Record<string, string> = {};
            for (const meal of mealsRaw) {
              mealIdToKey[String(meal.id)] = String(meal.name) + String(meal.time);
            }
            completedMealIds = (todayCompletions ?? []).map((c: any) => mealIdToKey[String(c.meal_id)]).filter(Boolean);
          }
        }
        const { data: mealCompletions } = await supabase
          .from("meal_completions")
          .select("meal_id, completed_at")
          .eq("user_id", user.id)
          .gte("completed_at", weekStart.toISOString())
          .lt("completed_at", weekEnd.toISOString());
        const completedMeals = (mealCompletions ?? []).length;
        const totalPossibleMeals = meals.length * 7;
        const mealCompliance = totalPossibleMeals > 0 ? Math.round((completedMeals / totalPossibleMeals) * 100) : 0;
        const { data: weightLogs } = await supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("user_id", user.id)
          .order("logged_at", { ascending: true });
        let weightChange = 0;
        if (weightLogs && weightLogs.length > 0) {
          const firstWeight = weightLogs[0].weight;
          const lastWeight = weightLogs[weightLogs.length - 1].weight;
          weightChange = lastWeight - firstWeight;
        } else if (user.starting_weight && user.current_weight) {
          weightChange = user.current_weight - user.starting_weight;
        }
        // Fetch coach updates for today only
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);
        const { data: updatesRaw } = await supabase
          .from("coach_updates")
          .select("message, created_at")
          .eq("client_id", user.id)
          .gte("created_at", startOfDay.toISOString())
          .lt("created_at", endOfDay.toISOString())
          .order("created_at", { ascending: false });
        const updates = (updatesRaw ?? []).map((u: any) => ({
          message: u.message,
          timestamp: new Date(u.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }));
        // Fetch active workout plan and today's workout for the client
        let todaysWorkouts: DailyWorkout[] = [];
        let planName: string | null = null;
        let isRestDay: boolean | null = null;
        const { data: workoutPlans } = await supabase
          .from("workout_plans")
          .select("id, title, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1);
        if (workoutPlans && workoutPlans.length > 0) {
          planName = workoutPlans[0].title;
          const planId = workoutPlans[0].id;
          const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const todayDay = daysOfWeek[new Date().getDay()];
          const { data: planDays } = await supabase
            .from("workout_days")
            .select("id, day_of_week, is_rest, workout_name, workout_type")
            .eq("workout_plan_id", planId)
            .eq("day_of_week", todayDay)
            .limit(1);
          if (planDays && planDays.length > 0) {
            isRestDay = !!planDays[0].is_rest;
            if (!planDays[0].is_rest) {
              const workoutDay = planDays[0];
              
              // Fetch exercises for this workout day
              const { data: exercisesRaw } = await supabase
                .from("workout_exercises")
                .select("id, group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data")
                .eq("workout_day_id", workoutDay.id)
                .order("sequence_order", { ascending: true });
              
              if (exercisesRaw && exercisesRaw.length > 0) {
                // Convert exercises to the expected format
                const exercises = exercisesRaw.map((ex: any) => {
                  const setsData = ex.sets_data || [];
                  return {
                    id: ex.id,
                    name: ex.exercise_name,
                    description: ex.exercise_description,
                    type: ex.group_type,
                    sets: setsData.map((set: any) => ({
                      setNumber: set.set_number,
                      reps: set.reps,
                      completed: false,
                    })),
                  };
                });
                
                // Group exercises by type
                const groups = Array.from(new Set(exercises.map(ex => ex.type))).map(type => ({
                  type,
                  exercises: exercises.filter(ex => ex.type === type),
                }));
                
                todaysWorkouts.push({
                  id: workoutDay.id,
                  name: workoutDay.workout_name || "Today's Workout",
                  exercises,
                  groups,
                  date: today.toISOString().slice(0, 10),
                  completed: false,
                });
              }
            }
          }
        }
        // Fetch supplements for this client
        const { data: supplementsRaw } = await supabase
          .from("supplements")
          .select("id, name")
          .eq("user_id", user.id);
        const supplements = (supplementsRaw ?? []).map((s: any) => ({
          name: s.name,
        }));
        const clientData: ClientDashboardData & { planName?: string | null; isRestDay?: boolean | null; completedMealIds?: string[] } = {
          updates,
          meals,
          workouts: todaysWorkouts,
          supplements,
          workoutCompliance,
          mealCompliance,
          weightChange,
          planName,
          isRestDay,
          completedMealIds,
        };
        return json({ clientData });
      }
    }
    if (coachId) {
      // Fetch all clients for this coach
      const { data: clientRows } = await supabase
        .from("users")
        .select("id, name, updated_at, created_at, role")
        .eq("coach_id", coachId)
        .eq("role", "client");
      clients = clientRows ?? [];
      totalClients = clients.length;
      // TEMP: For testing, treat all clients as active (simulate all are subscribed)
      activeClients = totalClients;
      inactiveClients = 0;
      // Recent Clients: last 30 days
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      recentClients = await Promise.all(
        clients
          .filter((c) => new Date(c.created_at) >= monthAgo)
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          .map(async (client) => {
            // Active meal plan
            const { data: mealPlansRaw } = await supabase
              .from("meal_plans")
              .select("id, title, is_active")
              .eq("user_id", client.id)
              .eq("is_active", true)
              .order("created_at", { ascending: false });
            const activeMealPlan = mealPlansRaw && mealPlansRaw.length > 0 ? mealPlansRaw[0] : null;
            // Active workout plan
            const { data: workoutPlansRaw } = await supabase
              .from("workout_plans")
              .select("id, title, is_active")
              .eq("user_id", client.id)
              .eq("is_active", true)
              .order("created_at", { ascending: false });
            const activeWorkoutPlan = workoutPlansRaw && workoutPlansRaw.length > 0 ? workoutPlansRaw[0] : null;
            // Supplements
            const { data: supplementsRaw } = await supabase
              .from("supplements")
              .select("id, name")
              .eq("user_id", client.id);
            const supplements = supplementsRaw || [];
            return {
              ...client,
              activeMealPlan,
              activeWorkoutPlan,
              supplements,
            };
          })
      );
      // Overall compliance: % of workouts, meals, and supplements completed in last 7 days
      if (totalClients > 0) {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        
        // Fetch all completions for the week
        const { data: workoutCompletions } = await supabase
          .from("workout_completions")
          .select("id, user_id, completed_at")
          .in("user_id", clients.map((c) => c.id))
          .gte("completed_at", weekAgo.toISOString().slice(0, 10));

        const { data: mealCompletions } = await supabase
          .from("meal_completions")
          .select("id, user_id, completed_at")
          .in("user_id", clients.map((c) => c.id))
          .gte("completed_at", weekAgo.toISOString())
          .lt("completed_at", new Date().toISOString());

        const { data: supplementCompletions } = await supabase
          .from("supplement_completions")
          .select("id, user_id, completed_at")
          .in("user_id", clients.map((c) => c.id))
          .gte("completed_at", weekAgo.toISOString().slice(0, 10));
        
        // Calculate expected activities for all clients
        let totalExpectedWorkouts = 0;
        let totalExpectedMeals = 0;
        let totalExpectedSupplements = 0;
        
        for (const client of clients) {
          // Expected workouts
          const { data: clientWorkoutPlans } = await supabase
            .from("workout_plans")
            .select("id")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .limit(1);
          
          if (clientWorkoutPlans && clientWorkoutPlans.length > 0) {
            const { data: workoutDays } = await supabase
              .from("workout_days")
              .select("is_rest")
              .eq("workout_plan_id", clientWorkoutPlans[0].id);
            totalExpectedWorkouts += (workoutDays || []).filter(day => !day.is_rest).length;
          }

          // Expected meals (7 days worth)
          const { data: clientMealPlans } = await supabase
            .from("meal_plans")
            .select("id")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .limit(1);
          
          if (clientMealPlans && clientMealPlans.length > 0) {
            const { data: meals } = await supabase
              .from("meals")
              .select("id")
              .eq("meal_plan_id", clientMealPlans[0].id);
            totalExpectedMeals += (meals || []).length * 7; // 7 days
          }

          // Expected supplements (7 days worth)
          const { data: clientSupplements } = await supabase
            .from("supplements")
            .select("id")
            .eq("user_id", client.id);
          totalExpectedSupplements += (clientSupplements || []).length * 7; // 7 days
        }
        
        const completedWorkouts = (workoutCompletions ?? []).length;
        const completedMeals = (mealCompletions ?? []).length;
        const completedSupplements = (supplementCompletions ?? []).length;
        
        const totalCompleted = completedWorkouts + completedMeals + completedSupplements;
        const totalExpected = totalExpectedWorkouts + totalExpectedMeals + totalExpectedSupplements;
        
        compliance = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;

        // Previous week compliance
        const { data: prevWorkoutCompletions } = await supabase
          .from("workout_completions")
          .select("id, user_id, completed_at")
          .in("user_id", clients.map((c) => c.id))
          .gte("completed_at", twoWeeksAgo.toISOString().slice(0, 10))
          .lt("completed_at", weekAgo.toISOString().slice(0, 10));

        const { data: prevMealCompletions } = await supabase
          .from("meal_completions")
          .select("id, user_id, completed_at")
          .in("user_id", clients.map((c) => c.id))
          .gte("completed_at", twoWeeksAgo.toISOString())
          .lt("completed_at", weekAgo.toISOString());

        const { data: prevSupplementCompletions } = await supabase
          .from("supplement_completions")
          .select("id, user_id, completed_at")
          .in("user_id", clients.map((c) => c.id))
          .gte("completed_at", twoWeeksAgo.toISOString().slice(0, 10))
          .lt("completed_at", weekAgo.toISOString().slice(0, 10));
        
        const prevTotalCompleted = (prevWorkoutCompletions ?? []).length + 
                                   (prevMealCompletions ?? []).length + 
                                   (prevSupplementCompletions ?? []).length;
        const prevCompliance = totalExpected > 0 ? Math.round((prevTotalCompleted / totalExpected) * 100) : 0;
        percentChange = compliance - prevCompliance;
      }
      // Recent Activity: today only
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      // Fetch all activity data
      const { data: workoutsToday } = await supabase
        .from("workout_completions")
        .select("id, user_id, completed_at")
        .in("user_id", clients.map((c) => c.id))
        .gte("completed_at", today.toISOString().slice(0, 10))
        .lt("completed_at", tomorrow.toISOString().slice(0, 10));

      const { data: mealsLogged } = await supabase
        .from("meal_completions")
        .select("id, user_id, completed_at")
        .in("user_id", clients.map((c) => c.id))
        .gte("completed_at", today.toISOString().slice(0, 10))
        .lt("completed_at", tomorrow.toISOString().slice(0, 10));

      const { data: suppsLogged } = await supabase
        .from("supplement_completions")
        .select("id, user_id, completed_at")
        .in("user_id", clients.map((c) => c.id))
        .gte("completed_at", today.toISOString().slice(0, 10))
        .lt("completed_at", tomorrow.toISOString().slice(0, 10));

      // Group activities by client and type
      const activityGroups: { [key: string]: { 
        clientName: string; 
        action: string; 
        count: number; 
        latestTime: string;
        id: string;
      } } = {};

      // Process workouts
      if (workoutsToday) {
        for (const w of workoutsToday) {
          const client = clients.find((c) => c.id === w.user_id);
          const clientName = client ? client.name : "Unknown";
          const key = `${w.user_id}-workout`;
          
          if (!activityGroups[key]) {
            activityGroups[key] = {
              clientName,
              action: "Completed workout",
              count: 0,
              latestTime: w.completed_at,
              id: w.id,
            };
          }
          activityGroups[key].count++;
          // Keep the latest time
          if (new Date(w.completed_at) > new Date(activityGroups[key].latestTime)) {
            activityGroups[key].latestTime = w.completed_at;
          }
        }
      }

      // Process meals
      if (mealsLogged) {
        for (const m of mealsLogged) {
          const client = clients.find((c) => c.id === m.user_id);
          const clientName = client ? client.name : "Unknown";
          const key = `${m.user_id}-meal`;
          
          if (!activityGroups[key]) {
            activityGroups[key] = {
              clientName,
              action: "Logged meals",
              count: 0,
              latestTime: m.completed_at,
              id: m.id,
            };
          }
          activityGroups[key].count++;
          // Keep the latest time
          if (new Date(m.completed_at) > new Date(activityGroups[key].latestTime)) {
            activityGroups[key].latestTime = m.completed_at;
          }
        }
      }

      // Process supplements
      if (suppsLogged) {
        for (const s of suppsLogged) {
          const client = clients.find((c) => c.id === s.user_id);
          const clientName = client ? client.name : "Unknown";
          const key = `${s.user_id}-supplement`;
          
          if (!activityGroups[key]) {
            activityGroups[key] = {
              clientName,
              action: "Completed supplements",
              count: 0,
              latestTime: s.completed_at,
              id: s.id,
            };
          }
          activityGroups[key].count++;
          // Keep the latest time
          if (new Date(s.completed_at) > new Date(activityGroups[key].latestTime)) {
            activityGroups[key].latestTime = s.completed_at;
          }
        }
      }

      // Convert to recentActivity array with proper formatting
      Object.values(activityGroups).forEach((group) => {
        let actionText = group.action;
        if (group.count > 1) {
          actionText = `${group.action} (${group.count})`;
        }
        
        recentActivity.push({
          id: group.id,
          clientName: group.clientName,
          action: actionText,
          time: group.latestTime,
        });
      });

      // Sort activity by time desc
      recentActivity.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
    }
  }

  return json({
    coachId,
    totalClients,
    activeClients,
    inactiveClients,
    compliance,
    percentChange,
    clients,
    recentClients,
    recentActivity,
  });
};

export default function Dashboard() {
  const { clientData, coachId, totalClients, activeClients, inactiveClients, compliance, percentChange, clients, recentClients, recentActivity } = useLoaderData<LoaderData>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { checkedMeals, isHydrated } = useMealCompletion();
  const matches = useMatches();
  const parentData = matches.find((match) => match.id === "routes/dashboard")
    ?.data as { role: "coach" | "client" };
  const role = parentData?.role;

  return (
    <>
      {role === "coach" ? (
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Coach Dashboard</h1>
            <Button
              variant="primary"
              onClick={() =>
                window.open("https://kavabodybuilding.myshopify.com", "_blank")
              }
              className="bg-green-500 hover:bg-green-600 whitespace-nowrap"
            >
              Shop KAVA
            </Button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Link to="/dashboard/clients" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Total Clients</h3>
                <p className="text-4xl font-bold">{totalClients}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  +{recentClients.length} this month
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/active" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Active Clients</h3>
                <p className="text-4xl font-bold">{activeClients}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0}% of total
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/inactive" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Inactive Clients</h3>
                <p className="text-4xl font-bold text-red-500">
                  {inactiveClients}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {totalClients > 0 ? Math.round((inactiveClients / totalClients) * 100) : 0}% of total
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/compliance" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">
                  Client Compliance
                </h3>
                <p className="text-4xl font-bold">{compliance}%</p>
                <p
                  className={`text-sm mt-2 ${
                    percentChange > 0
                      ? "text-green-600"
                      : percentChange < 0
                      ? "text-red-500"
                      : "text-gray-400"
                  }`}
                >
                  {percentChange > 0 && "+"}
                  {percentChange}% from last week
                </p>
              </Card>
            </Link>
          </div>

          {/* Recent Clients and Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Clients */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent Clients</h3>
              <div className="space-y-4">
                {recentClients.length === 0 ? (
                  <div className="text-gray-dark dark:text-gray-light">
                    No new clients in the last month.
                  </div>
                ) : (
                  recentClients.map((client: Client & { activeMealPlan?: any; activeWorkoutPlan?: any; supplements?: any[] }) => {
                    // Calculate setup completion percentage
                    let steps = 0;
                    if (client.activeMealPlan) steps++;
                    if (client.activeWorkoutPlan) steps++;
                    if (client.supplements && client.supplements.length > 0) steps++;
                    const percent = Math.round((steps / 3) * 100);
                    return (
                      <div
                        key={client.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">{client.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Joined{" "}
                              {new Date(client.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-[60px] h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{percent}%</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Recent Activity */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {recentActivity.length === 0 ? (
                  <div className="text-gray-dark dark:text-gray-light">
                    No activity yet today.
                  </div>
                ) : (
                  recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium">{activity.clientName}</p>
                        <p className="text-sm text-muted-foreground">
                          {activity.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Client Dashboard</h1>
            <Button
              variant="primary"
              onClick={() =>
                window.open("https://kavabodybuilding.myshopify.com", "_blank")
              }
              className="bg-green-500 hover:bg-green-600 whitespace-nowrap"
            >
              Shop KAVA
            </Button>
          </div>

          {/* Client Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Workout Compliance</h3>
              <p className="text-4xl font-bold">
                {typeof clientData?.workoutCompliance === "number" && !isNaN(clientData.workoutCompliance)
                  ? `${clientData.workoutCompliance}%`
                  : "-%"}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last 7 days</p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Meal Compliance</h3>
              <p className="text-4xl font-bold">
                {typeof clientData?.mealCompliance === "number" && !isNaN(clientData.mealCompliance)
                  ? `${clientData.mealCompliance}%`
                  : "-%"}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last 7 days</p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Weight Change</h3>
              <p className="text-4xl font-bold text-green-500">
                {typeof clientData?.weightChange === "number" && !isNaN(clientData.weightChange)
                  ? `${clientData.weightChange > 0 ? "+" : ""}${clientData.weightChange} lbs`
                  : "- lbs"}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Since sign up</p>
            </Card>
          </div>

          {/* Four Card Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Updates */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent Updates</h3>
              <div className="space-y-4">
                {clientData?.updates && clientData.updates.length > 0 ? (
                  clientData.updates.map((update, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm text-secondary dark:text-alabaster">
                          {update.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {update.timestamp}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-dark dark:text-gray-light text-sm">No Updates From Coach</div>
                )}
              </div>
            </Card>

            {/* Next Meal */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Next Meal</h3>
              <div className="rounded-xl bg-white shadow p-6 space-y-6">
                {!isHydrated ? (
                  <div className="text-gray-500">Loading meals...</div>
                ) : (!clientData?.meals || clientData.meals.length === 0) ? (
                  <div className="text-gray-500">No meals planned for today.</div>
                ) : (() => {
                    const nextMeal = (clientData.meals ?? []).find((meal) => !checkedMeals.includes(String(meal.name) + String(meal.time)));
                    if (!nextMeal) {
                      return <div className="text-green-600 font-semibold">All meals completed for today!</div>;
                    }
                    return (
                      <div className="rounded-lg bg-gray-50 shadow-sm p-5">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-xl font-semibold">{nextMeal.name}</div>
                            <div className="text-gray-500">{nextMeal.time.slice(0, 5)}</div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-lg">{nextMeal.calories} cal</span>
                            <div className="flex gap-2 mt-1">
                              <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs font-medium">P: {nextMeal.protein}g</span>
                              <span className="bg-green-100 text-green-800 rounded-full px-2 py-0.5 text-xs font-medium">C: {nextMeal.carbs}g</span>
                              <span className="bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5 text-xs font-medium">F: {nextMeal.fat}g</span>
                            </div>
                          </div>
                        </div>
                        <ul className="mt-3 pl-4 border-l-2 border-gray-100 space-y-1">
                          {nextMeal.foods.map(food => (
                            <li key={food.id} className="text-gray-700">
                              <span className="font-medium">{food.name}</span> ({food.portion}) – 
                              <span className="ml-1 text-xs text-gray-500">
                                {food.calories} cal, P: {food.protein}g, C: {food.carbs}g, F: {food.fat}g
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()
                }
              </div>
            </Card>

            {/* Today's Workouts */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Today's Workouts</h3>
              <div className="rounded-xl bg-white shadow p-6 space-y-6">
                {clientData?.workouts?.length === 0 && clientData?.planName && clientData?.isRestDay ? (
                  <div className="text-gray-500 text-center">
                    <div className="font-semibold mb-1">{clientData.planName} - Day</div>
                    <div>Today is a Rest Day</div>
                  </div>
                ) : clientData?.workouts?.length === 0 ? (
                  <div className="text-gray-500">No workouts planned for today.</div>
                ) : (
                  <div className="space-y-6">
                    {(clientData?.workouts ?? []).map((workout) => (
                      <div key={workout.id} className="rounded-lg bg-gray-50 shadow-sm p-5">
                        <div className="text-xl font-semibold mb-2">{workout.name}</div>
                        <div className="space-y-4">
                          {workout.groups?.map(group => (
                            <div key={group.type}>
                              <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-xs font-medium mb-2 inline-block">{group.type}</span>
                              <ul className="mt-2 pl-4 border-l-2 border-gray-100 space-y-2">
                                {group.exercises.map((exercise) => {
                                  const setsCount = exercise.sets.length;
                                  const reps = setsCount > 0 ? exercise.sets[0].reps : "-";
                                  return (
                                    <li key={exercise.id} className="text-gray-700">
                                      <span className="font-medium">{exercise.name}</span>
                                      <span className="ml-2 text-xs text-gray-500">
                                        {setsCount} set{setsCount !== 1 ? "s" : ""} x {reps} reps
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Today's Supplements */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">
                Today&apos;s Supplements
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                {clientData?.supplements.map((supplement, index) => (
                  <li key={index} className="font-medium">{supplement.name}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
      <ClientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        coachId={coachId}
      />
    </>
  );
}
