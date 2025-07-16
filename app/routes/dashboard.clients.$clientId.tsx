import { Outlet } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import dayjs from "dayjs";

// --- Types and helpers copied from index route ---
export interface Food {
  id: number;
  name: string;
  portion?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface Meal {
  id: number;
  name: string;
  time?: string;
  sequence_order?: number;
  foods: Food[];
}
export interface MealPlan {
  id: string;
  title: string;
  is_active: boolean;
  meals: Meal[];
}
export interface WorkoutPlan {
  id: string;
  title: string;
  is_active: boolean;
}
export interface Supplement {
  id: string;
  name: string;
}
export interface MinimalClient {
  id: string;
  name: string;
  email?: string;
  goal?: string;
  starting_weight?: number;
  current_weight?: number;
  workout_split?: string;
  role?: string;
  coach_id?: string;
  slug?: string;
}
export interface Update {
  id: string;
  coach_id: string;
  client_id: string;
  message: string;
  created_at: string;
  updated_at: string;
}
export interface CheckIn {
  id: string;
  notes: string;
  created_at: string;
}
export interface WeightLog {
  id: string;
  weight: number;
  logged_at: string;
}
export interface LoaderData {
  client: MinimalClient;
  updates: Update[];
  allUpdates: Update[];
  checkIns: CheckIn[];
  mealPlans: MealPlan[];
  supplements: Supplement[];
  weightLogs?: WeightLog[];
  activeMealPlan?: MealPlan | null;
  activeWorkoutPlan?: WorkoutPlan | null;
  checkInsPage: number;
  checkInsPageSize: number;
  checkInsTotal: number;
  checkInsHasMore: boolean;
}

const clientDetailCache: Record<string, { data: any; expires: number }> = {};

export const loader: import("@remix-run/node").LoaderFunction = async ({
  params,
  request,
}) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const clientIdParam = params.clientId;
  // Debug logging
  console.log("[DEBUG] clientIdParam:", clientIdParam);
  // Parse pagination params for check-ins
  const url = new URL(request.url);
  const checkInsPage = parseInt(url.searchParams.get("checkInsPage") || "1", 10);
  const checkInsPageSize = parseInt(url.searchParams.get("checkInsPageSize") || "10", 10);
  const checkInsOffset = (checkInsPage - 1) * checkInsPageSize;
  // Check cache (per client)
  if (clientIdParam && clientDetailCache[clientIdParam] && clientDetailCache[clientIdParam].expires > Date.now()) {
    return json(clientDetailCache[clientIdParam].data);
  }
  // Try to find client by slug first
  let { data: client, error } = await supabase
    .from("users")
    .select(
      "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug, created_at"
    )
    .eq("slug", clientIdParam)
    .single();
  console.log("[DEBUG] client by slug:", client, error);
  if (client) {
    client.id = String(client.id);
    client.slug = client.slug ? String(client.slug) : "";
    client.name = client.name ? String(client.name) : "";
    client.email = client.email ? String(client.email) : "";
    client.goal = client.goal ? String(client.goal) : "";
    client.workout_split = client.workout_split || "";
    client.role = client.role ? String(client.role) : "client";
    client.coach_id = client.coach_id ? String(client.coach_id) : "";
  }
  // If not found by slug, try by id
  if (error || !client) {
    const { data: clientById, error: errorById } = await supabase
      .from("users")
      .select(
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug, created_at"
      )
      .eq("id", clientIdParam)
      .single();
    console.log("[DEBUG] client by id:", clientById, errorById);
    if (clientById) {
      clientById.id = String(clientById.id);
      clientById.slug = clientById.slug ? String(clientById.slug) : "";
      clientById.name = clientById.name ? String(clientById.name) : "";
      clientById.email = clientById.email ? String(clientById.email) : "";
      clientById.goal = clientById.goal ? String(clientById.goal) : "";
      clientById.workout_split = clientById.workout_split || "";
      clientById.role = clientById.role ? String(clientById.role) : "client";
      clientById.coach_id = clientById.coach_id
        ? String(clientById.coach_id)
        : "";
    }
    client = clientById;
    error = errorById;
  }
  console.log("[DEBUG] final client:", client);
  if (error || !client) {
    const fallbackClient = {
      id: clientIdParam || "",
      name: "Unknown Client",
      email: "",
      goal: "",
      starting_weight: 0,
      current_weight: 0,
      workout_split: "",
      role: "client",
      coach_id: "",
      slug: "",
    };
    return json({
      client: fallbackClient,
      updates: [],
      allUpdates: [],
      checkIns: [],
      mealPlans: [],
      supplements: [],
      checkInsPage: 1,
      checkInsPageSize: 10,
      checkInsTotal: 0,
      checkInsHasMore: false,
    });
  }
  // Fetch all data in parallel
  const [
    updatesRaw,
    allUpdatesRaw,
    checkInsRaw,
    mealPlansRaw,
    workoutPlansRaw,
    supplementsRaw,
    weightLogsRaw
  ] = await Promise.all([
    // Updates from last 7 days
    supabase
      .from("coach_updates")
      .select("id, coach_id, client_id, message, created_at, updated_at")
      .eq("client_id", client.id)
      .gte("created_at", dayjs().subtract(7, 'day').toISOString())
      .order("created_at", { ascending: false }),
    // All updates
    supabase
      .from("coach_updates")
      .select("id, coach_id, client_id, message, created_at, updated_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    // Paginated check-ins
    supabase
      .from("check_ins")
      .select("id, notes, created_at", { count: "exact" })
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .range(checkInsOffset, checkInsOffset + checkInsPageSize - 1),
    // Meal plans
    supabase
      .from("meal_plans")
      .select("id, title, description, is_active, created_at")
      .eq("user_id", client.id)
      .order("created_at", { ascending: false }),
    // Workout plans
    supabase
      .from("workout_plans")
      .select("id, title, is_active")
      .eq("user_id", client.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    // Supplements
    supabase
      .from("supplements")
      .select("id, name, user_id")
      .eq("user_id", client.id)
      .order("created_at", { ascending: false }),
    // Weight logs
    supabase
      .from("weight_logs")
      .select("id, weight, logged_at")
      .eq("user_id", client.id)
      .order("logged_at", { ascending: true })
  ]);
  // Batch fetch all meals for all meal plans
  let mealPlans: any[] = [];
  let activeMealPlan = null;
  if (mealPlansRaw?.data && mealPlansRaw.data.length > 0) {
    const mealPlanIds = mealPlansRaw.data.map((plan: any) => plan.id);
    const { data: mealsRaw } = await supabase
      .from("meals")
      .select("id, name, time, sequence_order, meal_plan_id")
      .in("meal_plan_id", mealPlanIds);
    const mealIds = (mealsRaw || []).map((meal: any) => meal.id);
    const { data: foodsRaw } = await supabase
      .from("foods")
      .select("id, name, portion, calories, protein, carbs, fat, meal_id")
      .in("meal_id", mealIds);
    // Group foods by meal
    const foodsByMeal: Record<number, Food[]> = {};
    (foodsRaw || []).forEach((food: any) => {
      if (!foodsByMeal[food.meal_id]) foodsByMeal[food.meal_id] = [];
      foodsByMeal[food.meal_id].push(food);
    });
    // Group meals by meal plan
    const mealsByPlan: Record<string, Meal[]> = {};
    (mealsRaw || []).forEach((meal: any) => {
      if (!mealsByPlan[meal.meal_plan_id]) mealsByPlan[meal.meal_plan_id] = [];
      mealsByPlan[meal.meal_plan_id].push({ ...meal, foods: foodsByMeal[meal.id] || [] });
    });
    // Attach meals to meal plans
    mealPlans = mealPlansRaw.data.map((plan: any) => ({
      ...plan,
      meals: mealsByPlan[plan.id] || []
    }));
    activeMealPlan = mealPlans.find((p: any) => p.is_active) || null;
  }
  const activeWorkoutPlan =
    workoutPlansRaw?.data && workoutPlansRaw.data.length > 0 ? workoutPlansRaw.data[0] : null;
  const supplements = supplementsRaw?.data || [];
  const weightLogs = weightLogsRaw?.data || [];
  // For check-ins, add pagination info
  const checkIns = checkInsRaw?.data || [];
  const checkInsTotal = checkInsRaw?.count || 0;
  const checkInsHasMore = checkInsOffset + checkIns.length < checkInsTotal;
  const result = {
    client,
    updates: updatesRaw?.data || [],
    allUpdates: allUpdatesRaw?.data || [],
    checkIns,
    checkInsPage,
    checkInsPageSize,
    checkInsTotal,
    checkInsHasMore,
    mealPlans: mealPlans || [],
    supplements,
    weightLogs,
    activeMealPlan,
    activeWorkoutPlan,
  };
  // Cache result
  if (clientIdParam) {
    clientDetailCache[clientIdParam] = { data: result, expires: Date.now() + 30_000 };
  }
  return json(result);
};

export const action: import("@remix-run/node").ActionFunction = async ({ request, params }) => {
  // ... copy the action from index route ...
  // For brevity, you can copy the action logic as-is from the index route
};

export default function ClientIdLayout() {
  return <Outlet />;
} 