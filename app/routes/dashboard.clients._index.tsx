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

  // Fetch all clients for this coach
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
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug"
      )
      .eq("coach_id", coachId)
      .eq("role", "client")
      .neq("status", "inactive"); // Only show active clients
    if (error) console.log("[LOADER] Supabase error:", error);
    let clientsWithWeightLogs: typeof clients = [];
    if (data) {
      // For each client, fetch their active meal plan, workout plan, supplements, and first weight log
      clientsWithWeightLogs = await Promise.all(
        data.map(async (client) => {
          // Active meal plan
          const { data: mealPlansRaw } = await supabase
            .from("meal_plans")
            .select("id, title, is_active")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false });
          let activeMealPlan = null;
          if (mealPlansRaw && mealPlansRaw.length > 0) {
            const plan = mealPlansRaw[0];
            const { data: mealsRaw } = await supabase
              .from("meals")
              .select("id, name, time, sequence_order")
              .eq("meal_plan_id", plan.id)
              .order("sequence_order", { ascending: true });
            const meals = await Promise.all(
              (mealsRaw || []).map(async (meal) => {
                const { data: foods } = await supabase
                  .from("foods")
                  .select("id, name, portion, calories, protein, carbs, fat")
                  .eq("meal_id", meal.id);
                return { ...meal, foods: foods || [] };
              })
            );
            activeMealPlan = { ...plan, meals };
          }

          // Active workout plan
          const { data: workoutPlansRaw } = await supabase
            .from("workout_plans")
            .select("id, title, is_active")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false });
          const activeWorkoutPlan =
            workoutPlansRaw && workoutPlansRaw.length > 0
              ? workoutPlansRaw[0]
              : null;

          // Supplements
          const { data: supplementsRaw } = await supabase
            .from("supplements")
            .select("id, name")
            .eq("user_id", client.id);
          const supplements = supplementsRaw || [];

          // First weight log
          const { data: firstWeightLogRaw } = await supabase
            .from("weight_logs")
            .select("weight")
            .eq("user_id", client.id)
            .order("logged_at", { ascending: true })
            .limit(1);
          const firstWeightLog = firstWeightLogRaw && firstWeightLogRaw.length > 0 ? firstWeightLogRaw[0] : undefined;

          return {
            ...client,
            activeMealPlan,
            activeWorkoutPlan,
            supplements,
            firstWeightLog,
          };
        })
      );
    }
    clients = clientsWithWeightLogs;
  }

  return json({ coachId, clients });
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
