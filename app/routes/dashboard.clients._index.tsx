import type { MetaFunction } from "@remix-run/node";
import Button from "~/components/ui/Button";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import { useState } from "react";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunction } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { useLoaderData } from "@remix-run/react";
import ClientProfile from "~/components/coach/ClientProfile";
import { Link } from "@remix-run/react";
import { calculateMacros } from "~/lib/utils";

interface Supplement {
  id: string;
  name: string;
}

interface MealFood {
  id: string;
  name: string;
  portion?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: string;
  name: string;
  time?: string;
  sequence_order?: number;
  foods: MealFood[];
}

interface MealPlan {
  id: string;
  title: string;
  is_active: boolean;
  meals: Meal[];
}

interface WorkoutPlan {
  id: string;
  title: string;
  is_active: boolean;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Clients | Vested Fitness" },
    { name: "description", content: "View and manage your clients" },
  ];
};

// In-memory cache for coach's clients (expires after 30s)
const clientsCache: Record<string, { data: any; expires: number }> = {};

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
  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
  }

  // Check cache (per coach)
  if (coachId && clientsCache[coachId] && clientsCache[coachId].expires > Date.now()) {
    return json({ clients: clientsCache[coachId].data });
  }

  let clients: {
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
    activeMealPlan?: MealPlan | null;
    activeWorkoutPlan?: WorkoutPlan | null;
    supplements?: Supplement[];
    firstWeightLog?: { weight: number };
  }[] = [];
  if (coachId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    // Fetch all clients for this coach
    const { data: clientRows, error } = await supabase
      .from("users")
      .select(
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug"
      )
      .eq("coach_id", coachId)
      .eq("role", "client")
      .neq("status", "inactive"); // Only show active clients
    if (error) console.log("[LOADER] Supabase error:", error);
    if (clientRows && clientRows.length > 0) {
      const clientIds = clientRows.map((c) => c.id);
      // Batch fetch all related data
      const [
        mealPlansRaw,
        mealsRaw,
        foodsRaw,
        workoutPlansRaw,
        supplementsRaw,
        firstWeightLogsRaw
      ] = await Promise.all([
        supabase
          .from("meal_plans")
          .select("id, title, is_active, user_id")
          .in("user_id", clientIds)
          .eq("is_active", true),
        supabase
          .from("meals")
          .select("id, name, time, sequence_order, meal_plan_id")
          .in("meal_plan_id", clientIds.length > 0 ? clientIds : [""]),
        supabase
          .from("foods")
          .select("id, name, portion, calories, protein, carbs, fat, meal_id")
          .in("meal_id", clientIds.length > 0 ? clientIds : [""]),
        supabase
          .from("workout_plans")
          .select("id, title, is_active, user_id")
          .in("user_id", clientIds)
          .eq("is_active", true),
        supabase
          .from("supplements")
          .select("id, name, user_id")
          .in("user_id", clientIds),
        supabase
          .from("weight_logs")
          .select("weight, user_id, logged_at")
          .in("user_id", clientIds)
      ]);
      // Group data by client
      const mealPlansByUser: Record<string, MealPlan | null> = {};
      (mealPlansRaw?.data || []).forEach((plan) => {
        mealPlansByUser[plan.user_id] = { ...plan, meals: [] };
      });
      const mealsByPlan: Record<string, Meal[]> = {};
      (mealsRaw?.data || []).forEach((meal) => {
        if (!mealsByPlan[meal.meal_plan_id]) mealsByPlan[meal.meal_plan_id] = [];
        mealsByPlan[meal.meal_plan_id].push({ ...meal, foods: [] });
      });
      const foodsByMeal: Record<string, MealFood[]> = {};
      (foodsRaw?.data || []).forEach((food) => {
        if (!foodsByMeal[food.meal_id]) foodsByMeal[food.meal_id] = [];
        foodsByMeal[food.meal_id].push(food);
      });
      // Attach foods to meals
      Object.values(mealsByPlan).forEach((meals) => {
        meals.forEach((meal) => {
          meal.foods = foodsByMeal[meal.id] || [];
        });
      });
      // Attach meals to meal plans
      Object.entries(mealPlansByUser).forEach(([userId, plan]) => {
        if (plan && mealsByPlan[plan.id]) {
          plan.meals = mealsByPlan[plan.id];
        }
      });
      // Workout plans
      const workoutPlansByUser: Record<string, WorkoutPlan | null> = {};
      (workoutPlansRaw?.data || []).forEach((plan) => {
        workoutPlansByUser[plan.user_id] = plan;
      });
      // Supplements
      const supplementsByUser: Record<string, Supplement[]> = {};
      (supplementsRaw?.data || []).forEach((supp) => {
        if (!supplementsByUser[supp.user_id]) supplementsByUser[supp.user_id] = [];
        supplementsByUser[supp.user_id].push(supp);
      });
      // First weight log
      const firstWeightLogByUser: Record<string, { weight: number; logged_at: string } | undefined> = {};
      (firstWeightLogsRaw?.data || []).forEach((log) => {
        if (!firstWeightLogByUser[log.user_id] ||
            new Date(log.logged_at) < new Date(firstWeightLogByUser[log.user_id]?.logged_at || Infinity)) {
          firstWeightLogByUser[log.user_id] = { weight: log.weight, logged_at: log.logged_at };
        }
      });
      // Build clients array
      clients = clientRows.map((client) => ({
        ...client,
        activeMealPlan: mealPlansByUser[client.id] || null,
        activeWorkoutPlan: workoutPlansByUser[client.id] || null,
        supplements: supplementsByUser[client.id] || [],
        firstWeightLog: firstWeightLogByUser[client.id]
          ? { weight: firstWeightLogByUser[client.id]!.weight }
          : undefined,
      }));
    }
  }
  // Cache result
  if (coachId) {
    clientsCache[coachId] = { data: clients, expires: Date.now() + 30_000 };
  }
  return json({ clients });
};

export default function ClientsIndex() {
  const { coachId, clients } = useLoaderData<{
    coachId: string;
    clients: {
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
      activeMealPlan?: MealPlan | null;
      activeWorkoutPlan?: WorkoutPlan | null;
      supplements?: Supplement[];
      firstWeightLog?: { weight: number };
    }[];
  }>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredClients = clients.filter(
    (client: {
      name: string;
      goal?: string;
      starting_weight?: number;
      current_weight?: number;
      workout_split?: string;
      current_macros?: { protein: number; carbs: number; fat: number };
      supplement_count?: number;
    }) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      (client.goal || "").toLowerCase().includes(search.toLowerCase()) ||
      (client.workout_split || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Clients
        </h1>
        <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
          Add New Client
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray dark:text-gray-light"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-light dark:border-davyGray rounded-md leading-5 bg-white dark:bg-night placeholder-gray dark:placeholder-gray-light focus:outline-none focus:ring-primary focus:border-primary sm:text-sm dark:text-alabaster"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredClients.map((client) => {
          // Convert meal/food IDs to numbers for ClientProfile compatibility
          const safeMeals = (client.activeMealPlan?.meals || []).map(
            (meal) => ({
              ...meal,
              id:
                typeof meal.id === "number" ? meal.id : parseInt(meal.id) || 0,
              foods: (meal.foods || []).map((food) => ({
                ...food,
                id:
                  typeof food.id === "number"
                    ? food.id
                    : parseInt(food.id) || 0,
              })),
            })
          );
          // Calculate macros from active meal plan
          let macros = { protein: 0, carbs: 0, fat: 0 };
          if (safeMeals.length > 0) {
            macros = calculateMacros(safeMeals);
          }
          // Workout split from active workout plan
          const workoutSplit = client.activeWorkoutPlan?.title || "N/A";
          // Supplements
          const supplementCount = client.supplements?.length || 0;
          // Use first weight log as startingWeight if it exists, else fallback
          const startingWeight = client.firstWeightLog?.weight ?? client.starting_weight ?? 0;
          return (
            <Link
              key={client.id}
              to={`/dashboard/clients/${client.slug || client.id}`}
              className="block hover:shadow-lg transition-all"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div>
                <ClientProfile
                  client={{
                    id: client.id,
                    name: client.name || "Unnamed",
                    startingWeight,
                    currentWeight: client.current_weight ?? 0,
                    currentMacros: macros,
                    workoutSplit,
                    supplementCount,
                    goal: client.goal || "N/A",
                  }}
                  mealPlan={{ meals: safeMeals }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      <ClientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        coachId={coachId}
      />
    </div>
  );
}
