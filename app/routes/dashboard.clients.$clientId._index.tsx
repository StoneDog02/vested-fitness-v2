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

export const meta: MetaFunction = () => {
  return [
    { title: "Client Details | Vested Fitness" },
    { name: "description", content: "View and manage client details" },
  ];
};

export const loader = async ({ params }: { params: { clientId: string } }) => {
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

  // If not found by slug, try by id
  if (error || !client) {
    const { data: clientById, error: errorById } = await supabase
      .from("users")
      .select(
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug"
      )
      .eq("id", params.clientId)
      .single();
    client = clientById;
    error = errorById;
  }

  if (error || !client) {
    // Return safe defaults if not found
    return json({
      client: {
        id: params.clientId,
        name: "Unknown Client",
        email: "",
        goal: "",
        starting_weight: null,
        current_weight: null,
        workout_split: "",
        role: "client",
        coach_id: "",
        slug: "",
      },
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mealPlans: any[] = [];
  if (mealPlansRaw && mealPlansRaw.length > 0) {
    // For each meal plan, fetch meals and foods
    mealPlans = await Promise.all(
      mealPlansRaw.map(async (plan) => {
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
      })
    );
  }

  // Fetch supplements
  const { data: supplements } = await supabase
    .from("supplements")
    .select("id, name, dosage, frequency, timing, notes, start_date")
    .eq("user_id", client.id)
    .order("created_at", { ascending: false });

  return json({
    client,
    updates: updates || [],
    checkIns: checkIns || [],
    mealPlans: mealPlans || [],
    supplements: supplements || [],
  });
};

export default function ClientDetails() {
  const {
    client,
    updates,
    mealPlans,
    checkIns: rawCheckIns,
  } = useLoaderData<typeof loader>();
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [showAddCheckIn, setShowAddCheckIn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fetcher = useFetcher();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkIns = (rawCheckIns || []).map((c: any) => ({
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

  return (
    <ClientDetailLayout>
      <div className="h-full p-4 sm:p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <ClientProfile client={client} mealPlan={mealPlans[0] || {}} />
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
                  <p className="text-gray-dark dark:text-gray-light mb-4">
                    Weight Chart Would Display Here
                  </p>
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster">
                        Starting Weight:
                      </span>
                      <span className="text-sm text-secondary dark:text-alabaster">
                        {client.starting_weight} lbs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster">
                        Current Weight:
                      </span>
                      <span className="text-sm text-secondary dark:text-alabaster">
                        {client.current_weight} lbs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster">
                        Total Change:
                      </span>
                      <span className="text-sm text-green-500">
                        -{client.starting_weight - client.current_weight} lbs
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
