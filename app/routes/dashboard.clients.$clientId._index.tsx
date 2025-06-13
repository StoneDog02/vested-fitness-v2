import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import ClientProfile from "~/components/coach/ClientProfile";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddMessageModal from "~/components/coach/AddMessageModal";
import AddCheckInModal from "~/components/coach/AddCheckInModal";
import CheckInHistoryModal from "~/components/coach/CheckInHistoryModal";
import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import LineChart from "~/components/ui/LineChart";
import { calculateMacros } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Details | Vested Fitness" },
    { name: "description", content: "View and manage client details" },
  ];
};

interface Food {
  id: number;
  name: string;
  portion?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: number;
  name: string;
  time?: string;
  sequence_order?: number;
  foods: Food[];
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

interface Supplement {
  id: string;
  name: string;
}

interface MinimalClient {
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

interface Update {
  id: string;
  coach_id: string;
  client_id: string;
  message: string;
  created_at: string;
  updated_at: string;
}

interface CheckIn {
  id: string;
  notes: string;
  created_at: string;
}

interface WeightLog {
  id: string;
  weight: number;
  logged_at: string;
}

interface LoaderData {
  client: MinimalClient;
  updates: Update[];
  checkIns: CheckIn[];
  mealPlans: MealPlan[];
  supplements: Supplement[];
  weightLogs?: WeightLog[];
  activeMealPlan?: MealPlan | null;
  activeWorkoutPlan?: WorkoutPlan | null;
}

export const loader: import("@remix-run/node").LoaderFunction = async ({
  params,
}) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Try to find client by slug first
  let { data: client, error } = await supabase
    .from("users")
    .select(
      "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug"
    )
    .eq("slug", params.clientId)
    .single();

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
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug"
      )
      .eq("id", params.clientId)
      .single();
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

  if (error || !client) {
    const fallbackClient: MinimalClient = {
      id: params.clientId,
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
      checkIns: [],
      mealPlans: [],
      supplements: [],
    });
  }

  // Fetch updates (optional, can be empty)
  const { data: updates } = await supabase
    .from("coach_updates")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  // Fetch check-ins
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("id, notes, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  // Fetch meal plans (with meals and foods)
  const { data: mealPlansRaw } = await supabase
    .from("meal_plans")
    .select("id, title, description, is_active, created_at")
    .eq("user_id", client.id)
    .order("created_at", { ascending: false });

  let mealPlans: any[] = [];
  let activeMealPlan = null;
  if (mealPlansRaw && mealPlansRaw.length > 0) {
    mealPlans = await Promise.all(
      mealPlansRaw.map(
        async (plan: {
          id: string;
          title: string;
          description: string;
          is_active: boolean;
          created_at: string;
        }) => {
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
          return { ...plan, meals };
        }
      )
    );
    activeMealPlan = mealPlans.find((p) => p.is_active) || null;
  }

  // Fetch active workout plan
  const { data: workoutPlansRaw } = await supabase
    .from("workout_plans")
    .select("id, title, is_active")
    .eq("user_id", client.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const activeWorkoutPlan =
    workoutPlansRaw && workoutPlansRaw.length > 0 ? workoutPlansRaw[0] : null;

  // Fetch supplements
  const { data: supplements } = await supabase
    .from("supplements")
    .select("id, name")
    .eq("user_id", client.id)
    .order("created_at", { ascending: false });

  // Fetch weight logs for the client
  const { data: weightLogsRaw } = await supabase
    .from("weight_logs")
    .select("id, weight, logged_at")
    .eq("user_id", client.id)
    .order("logged_at", { ascending: true });
  const weightLogs = weightLogsRaw || [];

  return json({
    client,
    updates: updates || [],
    checkIns: checkIns || [],
    mealPlans: mealPlans || [],
    supplements: supplements || [],
    weightLogs,
    activeMealPlan,
    activeWorkoutPlan,
  });
};

export default function ClientDetails() {
  const {
    client,
    updates,
    checkIns: rawCheckIns,
    weightLogs = [],
    activeMealPlan,
    activeWorkoutPlan,
    supplements,
  } = useLoaderData<LoaderData>();
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [showAddCheckIn, setShowAddCheckIn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fetcher = useFetcher();

  const checkIns = ((rawCheckIns as CheckIn[]) || []).map((c) => ({
    ...c,
    date: c.created_at,
  }));

  // Sort checkIns by created_at descending (should already be from loader)
  const sortedCheckIns = [...checkIns];
  // Most recent is 'This Week', previous is 'Last Week', rest is history
  const thisWeekCheckIn = sortedCheckIns[0] || null;
  const lastWeekCheckIn = sortedCheckIns[1] || null;
  const historyCheckIns = sortedCheckIns.slice(2);

  // Add check-in handler (submits to API, then reloads page)
  const handleAddCheckIn = (notes: string) => {
    fetcher.submit(
      { notes },
      { method: "post", action: `/api/check-ins/${client.id}` }
    );
    setShowAddCheckIn(false);
  };

  // History modal pagination (if needed)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const displayedHistory = historyCheckIns.slice(0, currentPage * pageSize);
  const hasMore = displayedHistory.length < historyCheckIns.length;
  const handleLoadMore = () => setCurrentPage((p) => p + 1);

  // Reload data after adding a check-in
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      window.location.reload();
    }
  }, [fetcher.state, fetcher.data]);

  // Weight chart data
  const hasWeightLogs = weightLogs && weightLogs.length > 0;
  const chartData = hasWeightLogs
    ? (weightLogs as WeightLog[]).map((w) => ({
        date: w.logged_at,
        weight: Number(w.weight),
      }))
    : [];
  const startWeight = hasWeightLogs
    ? chartData[0].weight
    : client.starting_weight ?? 0;
  const currentWeight = hasWeightLogs
    ? chartData[chartData.length - 1].weight
    : client.current_weight ?? 0;
  const totalChange = currentWeight - startWeight;

  // Prepare real data for ClientProfile
  const safeMeals = (activeMealPlan?.meals || []).map((meal) => ({
    ...meal,
    id: typeof meal.id === "number" ? meal.id : parseInt(meal.id) || 0,
    foods: (meal.foods || []).map((food) => ({
      ...food,
      id: typeof food.id === "number" ? food.id : parseInt(food.id) || 0,
    })),
  }));
  let macros = { protein: 0, carbs: 0, fat: 0 };
  if (safeMeals.length > 0) {
    macros = calculateMacros(safeMeals);
  }
  const workoutSplit =
    activeWorkoutPlan?.title || client.workout_split || "N/A";
  const supplementCount = supplements?.length || 0;

  return (
    <ClientDetailLayout>
      <div className="h-full p-4 sm:p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <ClientProfile
                client={{
                  id: client.id,
                  name: client.name || "Unnamed",
                  startingWeight: client.starting_weight ?? 0,
                  currentWeight: client.current_weight ?? 0,
                  currentMacros: macros,
                  workoutSplit,
                  supplementCount,
                  goal: client.goal || "N/A",
                }}
                mealPlan={{ meals: safeMeals }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column with two stacked cards */}
          <div className="space-y-6">
            {/* Updates to Client */}
            <Card
              title={
                <div className="flex items-center justify-between w-full">
                  <span>Updates to Client</span>
                  <button
                    onClick={() => setShowAddMessage(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    +Add Message
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {updates.length === 0 ? (
                  <div className="text-gray-500 text-sm">No updates yet.</div>
                ) : (
                  updates.map((update) => (
                    <div
                      key={update.id}
                      className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
                    >
                      <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                        {new Date(update.created_at).toLocaleDateString()}
                      </div>
                      <p className="text-secondary dark:text-alabaster">
                        {update.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Check In Notes */}
            <Card
              title={
                <div className="flex items-center justify-between w-full">
                  <span>Check In Notes</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowHistory(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      History
                    </button>
                    <button
                      onClick={() => setShowAddCheckIn(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      +Add Check In
                    </button>
                  </div>
                </div>
              }
            >
              {thisWeekCheckIn || lastWeekCheckIn ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                      Last Week
                    </h4>
                    <p className="text-sm text-gray-dark dark:text-gray-light">
                      {lastWeekCheckIn ? (
                        lastWeekCheckIn.notes
                      ) : (
                        <span className="italic text-gray-400">
                          No check-in yet.
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                      This Week
                    </h4>
                    <p className="text-sm text-gray-dark dark:text-gray-light">
                      {thisWeekCheckIn ? (
                        thisWeekCheckIn.notes
                      ) : (
                        <span className="italic text-gray-400">
                          No check-in yet.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No check-ins yet.</div>
              )}
            </Card>
          </div>

          {/* Weight Chart */}
          <div className="lg:col-span-2">
            <Card title="Weight Progress">
              <div className="h-64 flex items-center justify-center">
                <div className="text-center w-full max-w-sm">
                  {hasWeightLogs ? (
                    <LineChart data={chartData} height={200}>
                      {/* Configure axes and lines as needed */}
                    </LineChart>
                  ) : (
                    <p className="text-gray-dark dark:text-gray-light mb-4">
                      No weight history yet.
                    </p>
                  )}
                  <div className="flex flex-col space-y-2 mt-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster">
                        Starting Weight:
                      </span>
                      <span className="text-sm text-secondary dark:text-alabaster">
                        {startWeight} lbs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster">
                        Current Weight:
                      </span>
                      <span className="text-sm text-secondary dark:text-alabaster">
                        {currentWeight} lbs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster">
                        Total Change:
                      </span>
                      <span
                        className={
                          totalChange < 0 ? "text-green-500" : "text-red-500"
                        }
                      >
                        {totalChange > 0 ? "+" : ""}
                        {totalChange} lbs
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <AddMessageModal
          isOpen={showAddMessage}
          onClose={() => setShowAddMessage(false)}
          onSubmit={(message) => {
            fetcher.submit(
              { message },
              { method: "post", action: `/api/coach-updates/${client.id}` }
            );
            setShowAddMessage(false);
          }}
        />

        <AddCheckInModal
          isOpen={showAddCheckIn}
          onClose={() => setShowAddCheckIn(false)}
          onSubmit={handleAddCheckIn}
          lastWeekNotes={thisWeekCheckIn ? thisWeekCheckIn.notes : ""}
        />

        <CheckInHistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          checkIns={displayedHistory}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          emptyMessage="No history yet."
        />
      </div>
    </ClientDetailLayout>
  );
}
