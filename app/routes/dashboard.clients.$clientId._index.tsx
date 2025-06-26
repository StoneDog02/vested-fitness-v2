import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import ClientProfile from "~/components/coach/ClientProfile";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddMessageModal from "~/components/coach/AddMessageModal";
import AddCheckInModal from "~/components/coach/AddCheckInModal";
import CheckInHistoryModal from "~/components/coach/CheckInHistoryModal";
import UpdateHistoryModal from "~/components/coach/UpdateHistoryModal";
import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import LineChart from "~/components/ui/LineChart";
import { calculateMacros } from "~/lib/utils";
import { ResponsiveContainer } from "recharts";

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

interface CheckInNote {
  id: string;
  date: string;
  notes: string;
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
      id: params.clientId || "",
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

  // Fetch supplements (normal query)
  const { data: supplements } = await supabase
    .from("supplements")
    .select("id, name, user_id")
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

export const action: import("@remix-run/node").ActionFunction = async ({ request, params }) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const message = formData.get("message")?.toString();
  const notes = formData.get("notes")?.toString();
  const id = formData.get("id")?.toString();

  // Find client by slug or id
  let { data: client, error } = await supabase
    .from("users")
    .select("id, coach_id")
    .eq("slug", params.clientId)
    .single();
  if (!client || error) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id, coach_id")
      .eq("id", params.clientId)
      .single();
    client = clientById;
  }
  if (!client) {
    return json({ error: "Client not found" }, { status: 404 });
  }
  const coach_id = client.coach_id;

  // CRUD for coach_updates
  if (intent === "addUpdate" && message) {
    const { data, error } = await supabase
      .from("coach_updates")
      .insert({ coach_id, client_id: client.id, message })
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to add update" }, { status: 500 });
    }
    return json({ update: data });
  }
  if (intent === "editUpdate" && id && message) {
    const { data, error } = await supabase
      .from("coach_updates")
      .update({ message, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to update message" }, { status: 500 });
    }
    return json({ update: data });
  }
  if (intent === "deleteUpdate" && id) {
    const { data, error } = await supabase
      .from("coach_updates")
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to delete update" }, { status: 500 });
    }
    return json({ deletedUpdate: data });
  }

  // CRUD for check_ins
  if (intent === "addCheckIn" && notes) {
    const { data, error } = await supabase
      .from("check_ins")
      .insert({ client_id: client.id, coach_id, notes })
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to add check-in" }, { status: 500 });
    }
    return json({ checkIn: data });
  }
  if (intent === "editCheckIn" && id && notes) {
    const { data, error } = await supabase
      .from("check_ins")
      .update({ notes })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to update check-in" }, { status: 500 });
    }
    return json({ checkIn: data });
  }
  if (intent === "deleteCheckIn" && id) {
    const { data, error } = await supabase
      .from("check_ins")
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to delete check-in" }, { status: 500 });
    }
    return json({ deletedCheckIn: data });
  }

  return json({ error: "No valid data or intent provided" }, { status: 400 });
};

// Utility to get the start of the week (Sunday) for a given date
function getWeekStart(dateStr: string) {
  const date = new Date(dateStr);
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = date.getDate() - day;
  const weekStart = new Date(date.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.getTime(); // Use timestamp for grouping
}

// Helper to format date as mm/dd/yyyy
function formatDateMMDDYYYY(dateStr: string) {
  const date = new Date(dateStr);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export default function ClientDetails() {
  const {
    client,
    updates: loaderUpdates,
    checkIns: loaderCheckIns,
    weightLogs = [],
    activeMealPlan,
    activeWorkoutPlan,
    supplements,
  } = useLoaderData<LoaderData>();
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [showAddCheckIn, setShowAddCheckIn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showUpdateHistory, setShowUpdateHistory] = useState(false);
  const fetcher = useFetcher();

  // Local state for updates, checkIns, and supplements
  const [updates, setUpdates] = useState<Update[]>(loaderUpdates);
  const [checkIns, setCheckIns] = useState<CheckInNote[]>(
    ((loaderCheckIns as CheckIn[]) || []).map((c) => ({ id: c.id, date: c.created_at, notes: c.notes }))
  );
  const [supplementsState, setSupplements] = useState<Supplement[]>(supplements);

  // Sort checkIns by date descending
  const sortedCheckIns = [...checkIns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group check-ins by week start (Sunday)
  const weekGroups: { [weekStart: number]: CheckInNote[] } = {};
  for (const checkIn of sortedCheckIns) {
    const weekStart = getWeekStart(checkIn.date);
    if (!weekGroups[weekStart]) weekGroups[weekStart] = [];
    weekGroups[weekStart].push(checkIn);
  }
  const weekStarts = Object.keys(weekGroups)
    .map(Number)
    .sort((a, b) => b - a);

  // Anchor to current and previous week based on today's date
  const now = new Date();
  const thisWeekStart = getWeekStart(now.toISOString());
  const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;

  const thisWeekCheckIn = (weekGroups[thisWeekStart] && weekGroups[thisWeekStart][0]) || null;
  const lastWeekCheckIn = (weekGroups[lastWeekStart] && weekGroups[lastWeekStart][0]) || null;

  // For history, exclude this and last week
  const historyCheckIns = weekStarts
    .filter(ws => ws !== thisWeekStart && ws !== lastWeekStart)
    .map(ws => weekGroups[ws][0]);

  // History modal pagination (if needed)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const displayedHistory = historyCheckIns.slice(0, currentPage * pageSize);
  const hasMore = displayedHistory.length < historyCheckIns.length;
  const handleLoadMore = () => setCurrentPage((p) => p + 1);

  // When checkIns changes (add/delete), reset pagination if modal is open
  useEffect(() => {
    if (showHistory) {
      setCurrentPage(1);
    }
  }, [checkIns, showHistory]);

  // Add check-in handler (submits to API, then updates state)
  const handleAddCheckIn = (notes: string) => {
    fetcher.submit(
      { intent: "addCheckIn", notes },
      { method: "post" }
    );
    setShowAddCheckIn(false);
  };

  // Add update handler (submits to API, then updates state)
  const handleAddUpdate = (message: string) => {
    fetcher.submit(
      { intent: "addUpdate", message },
      { method: "post" }
    );
    setShowAddMessage(false);
  };

  // Update local state after fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data: any = fetcher.data;
      if (data.checkIn) {
        setCheckIns((prev) => [{ id: data.checkIn.id, date: data.checkIn.created_at, notes: data.checkIn.notes }, ...prev]);
      }
      if (data.update) {
        setUpdates((prev) => [data.update, ...prev]);
      }
      if (data.deletedUpdate) {
        setUpdates((prev) => prev.filter((u) => u.id !== data.deletedUpdate.id));
      }
      if (data.deletedCheckIn) {
        setCheckIns((prev) => prev.filter((c) => c.id !== data.deletedCheckIn.id));
      }
      // Handle supplements add/delete (assume data.supplement or data.deletedSupplement)
      if (data.supplement) {
        setSupplements((prev) => [data.supplement, ...prev]);
      }
      if (data.deletedSupplement) {
        setSupplements((prev) => prev.filter((s) => s.id !== data.deletedSupplement.id));
      }
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
  const supplementCount = supplementsState?.length || 0;

  // Edit handlers for updates
  const deleteUpdate = (id: string) => {
    fetcher.submit(
      { intent: "deleteUpdate", id },
      { method: "post" }
    );
  };

  // Edit handlers for check-ins
  const deleteCheckIn = (id: string) => {
    fetcher.submit(
      { intent: "deleteCheckIn", id },
      { method: "post" }
    );
  };

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
                  startingWeight: startWeight,
                  currentWeight: currentWeight,
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
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowUpdateHistory(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      History
                    </button>
                    <button
                      onClick={() => setShowAddMessage(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      +Add Message
                    </button>
                  </div>
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
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                          {new Date(update.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="text-xs text-red-500 hover:underline"
                            onClick={() => deleteUpdate(update.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-secondary dark:text-alabaster">
                        {update.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>
            <UpdateHistoryModal
              isOpen={showUpdateHistory}
              onClose={() => setShowUpdateHistory(false)}
              updates={updates}
              emptyMessage="No updates yet."
            />

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
              <div className="space-y-6">
                {/* Last Week Section */}
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    Last Week
                  </h4>
                  {lastWeekCheckIn ? (
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatDateMMDDYYYY(lastWeekCheckIn.date)}</span>
                        <p className="text-sm text-gray-dark dark:text-gray-light mb-0">
                          {lastWeekCheckIn.notes}
                        </p>
                      </div>
                      <button
                        className="text-xs text-red-500 hover:underline ml-4"
                        onClick={() => deleteCheckIn(lastWeekCheckIn.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="italic text-gray-400 text-sm">No Previous Check In Yet.</div>
                  )}
                </div>
                {/* This Week Section */}
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    This Week
                  </h4>
                  {thisWeekCheckIn ? (
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatDateMMDDYYYY(thisWeekCheckIn.date)}</span>
                        <p className="text-sm text-gray-dark dark:text-gray-light mb-0">
                          {thisWeekCheckIn.notes}
                        </p>
                      </div>
                      <button
                        className="text-xs text-red-500 hover:underline ml-4"
                        onClick={() => deleteCheckIn(thisWeekCheckIn.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="italic text-gray-400 text-sm">Add This Week&apos;s Check In.</div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Weight Chart */}
          <div className="lg:col-span-2">
            <Card title="Weight Progress">
              <div className="w-full" style={{ height: 350 }}>
                {hasWeightLogs ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} />
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-dark dark:text-gray-light mb-4">
                    No weight history yet.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>

        <AddMessageModal
          isOpen={showAddMessage}
          onClose={() => setShowAddMessage(false)}
          onSubmit={handleAddUpdate}
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
          checkIns={displayedHistory.map((c) => ({ ...c, formattedDate: formatDateMMDDYYYY(c.date) }))}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          emptyMessage="No history yet."
        />
      </div>
    </ClientDetailLayout>
  );
}
