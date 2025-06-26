import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { useState } from "react";
import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunctionArgs } from "@remix-run/node";
import CheckInHistoryModal from "~/components/coach/CheckInHistoryModal";
import UpdateHistoryModal from "~/components/coach/UpdateHistoryModal";
import LineChart from "~/components/ui/LineChart";
import { ResponsiveContainer } from "recharts";

export const meta: MetaFunction = () => {
  return [
    { title: "Coach Access | Vested Fitness" },
    {
      name: "description",
      content: "View updates and check-ins from your coach",
    },
  ];
};

// Mock check-in notes
const mockCheckInNotes = {
  lastWeek:
    "Client reported feeling stronger in workouts. Sleep has improved to 7-8 hours per night. Compliance with meal plan at 90%.",
  thisWeek:
    "Client is continuing to make progress. Weight down by 1 lb. Requested some modifications to the leg day workout.",
};

// Mock weight data
const initialWeightData = [
  { date: "2024-03-01", weight: 185 },
  { date: "2024-03-08", weight: 183 },
  { date: "2024-03-15", weight: 181 },
  { date: "2024-03-22", weight: 179 },
  { date: "2024-03-29", weight: 177 },
  { date: "2024-04-05", weight: 176 },
  { date: "2024-04-12", weight: 175 },
];

// Mock client data
const mockClientData = {
  goal: "Build muscle and increase strength",
};

// Function to determine if the goal is weight loss oriented
const isWeightLossGoal = (goal: string) => {
  const weightLossKeywords = ["lose", "cut", "lean", "reduce", "drop"];
  return weightLossKeywords.some((keyword) =>
    goal.toLowerCase().includes(keyword)
  );
};

// Function to determine the change color based on goal and value
const getChangeColor = (change: number, goal: string) => {
  const isLossGoal = isWeightLossGoal(goal);

  if (isLossGoal) {
    return change < 0
      ? "text-green-500"
      : change > 0
      ? "text-red-500"
      : "text-secondary dark:text-alabaster";
  } else {
    // For muscle gain/bulk goals
    return change > 0
      ? "text-green-500"
      : change < 0
      ? "text-secondary dark:text-alabaster"
      : "text-secondary dark:text-alabaster";
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Parse cookies to get Supabase auth token
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

  let authId;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken);
      authId = decoded && typeof decoded === "object" && "sub" in decoded
        ? decoded.sub
        : undefined;
    } catch (e) {
      authId = undefined;
    }
  }
  if (!authId) {
    return json({ updates: [], goal: mockClientData.goal, checkInNotes: { thisWeek: null, lastWeek: null }, allCheckIns: [], allUpdates: [], weightLogs: [] });
  }

  // Get the client's user record
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, goal")
    .eq("auth_id", authId)
    .single();
  if (!clientUser) {
    return json({ updates: [], goal: mockClientData.goal, checkInNotes: { thisWeek: null, lastWeek: null }, allCheckIns: [], allUpdates: [], weightLogs: [] });
  }

  // Get the updates
  const { data: updates, error } = await supabase
    .from("coach_updates")
    .select("*")
    .eq("client_id", clientUser.id)
    .order("created_at", { ascending: false });

  // Get check-in notes for this client
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("id, notes, created_at")
    .eq("client_id", clientUser.id)
    .order("created_at", { ascending: false });

  // Get weight logs for the client
  const { data: weightLogsRaw } = await supabase
    .from("weight_logs")
    .select("id, weight, logged_at")
    .eq("user_id", clientUser.id)
    .order("logged_at", { ascending: true });
  const weightLogs = weightLogsRaw || [];

  // Helper to get week start (Sunday)
  function getWeekStart(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  const today = new Date();
  const thisWeekStart = getWeekStart(today);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(thisWeekStart.getDate() + 7);

  let thisWeekNote = null;
  let lastWeekNote = null;

  if (checkIns && checkIns.length > 0) {
    // Find the most recent check-in for this week
    thisWeekNote = checkIns.find((ci) => {
      const created = new Date(ci.created_at);
      return created >= thisWeekStart && created < nextWeekStart;
    });
    // Find the most recent check-in for last week
    lastWeekNote = checkIns.find((ci) => {
      const created = new Date(ci.created_at);
      return created >= lastWeekStart && created < thisWeekStart;
    });
  }

  // Filter updates to only those from the last 7 days
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  const recentUpdates = (updates || []).filter((u: any) => {
    const created = new Date(u.created_at);
    return created >= oneWeekAgo;
  });
  // Container grows to fit up to 3 updates, scrolls if more
  const containerMaxHeight = recentUpdates.length > 3 ? 'max-h-40' : '';
  const showScrollIndicator = recentUpdates.length > 3;

  return json({
    updates: updates || [],
    goal: clientUser.goal || mockClientData.goal,
    checkInNotes: {
      thisWeek: thisWeekNote || null,
      lastWeek: lastWeekNote || null,
    },
    allCheckIns: checkIns || [],
    allUpdates: updates || [],
    weightLogs,
  });
};

export default function CoachAccess() {
  const { updates, goal, checkInNotes, allCheckIns = [], allUpdates = [], weightLogs: initialWeightLogs = [] } = useLoaderData<typeof loader>();
  const [showUpdateHistory, setShowUpdateHistory] = useState(false);
  const [showCheckInHistory, setShowCheckInHistory] = useState(false);
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [weightLogs, setWeightLogs] = useState(initialWeightLogs);

  // Filter updates to only those from the last 7 days
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  const recentUpdates = (updates || []).filter((u: any) => {
    const created = new Date(u.created_at);
    return created >= oneWeekAgo;
  });
  // Container grows to fit up to 3 updates, scrolls if more
  const containerMaxHeight = recentUpdates.length > 3 ? 'max-h-40' : '';
  const showScrollIndicator = recentUpdates.length > 3;

  // Fetch latest weight logs after adding starting weight
  async function fetchWeightLogs() {
    try {
      const res = await fetch("/api/get-weight-logs");
      if (res.ok) {
        const data = await res.json();
        setWeightLogs(data.weightLogs || []);
      }
    } catch (err) {
    }
  }

  // Prepare chart data from live weight logs
  const hasWeightLogs = weightLogs && weightLogs.length > 0;
  const chartData = hasWeightLogs
    ? weightLogs.map((w: any) => ({
        date: w.logged_at,
        weight: Number(w.weight),
      }))
    : [];
  const startWeight = hasWeightLogs ? chartData[0].weight : 0;
  const currentWeight = hasWeightLogs ? chartData[chartData.length - 1].weight : 0;
  const totalChange = hasWeightLogs ? currentWeight - startWeight : 0;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-6">
        Coach Access
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column with three stacked cards */}
        <div className="space-y-6">
          {/* Updates from Coach */}
          <Card title={
            <div className="flex items-center justify-between w-full">
              <span>Updates from Coach</span>
              <button
                onClick={() => setShowUpdateHistory(true)}
                className="text-xs text-primary hover:underline"
              >
                History
              </button>
            </div>
          }>
            <div className={`relative space-y-4 overflow-y-auto pr-2 custom-scrollbar ${containerMaxHeight}`} style={{ maxHeight: recentUpdates.length > 3 ? '10rem' : 'none' }}>
              {recentUpdates.map((update: any) => (
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
              ))}
              {recentUpdates.length === 0 && (
                <div className="text-gray-dark dark:text-gray-light text-sm">No Updates From Coach</div>
              )}
              {showScrollIndicator && (
                <div className="pointer-events-none absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-white dark:from-night to-transparent" />
              )}
            </div>
          </Card>
          <UpdateHistoryModal
            isOpen={showUpdateHistory}
            onClose={() => setShowUpdateHistory(false)}
            updates={allUpdates}
            emptyMessage="No updates yet."
          />

          {/* Check In Notes */}
          <Card title={
            <div className="flex items-center justify-between w-full">
              <span>Check In Notes</span>
              <button
                onClick={() => setShowCheckInHistory(true)}
                className="text-xs text-primary hover:underline"
              >
                History
              </button>
            </div>
          }>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                  Last Week
                </h4>
                {checkInNotes.lastWeek ? (
                  <>
                    <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                      {new Date(checkInNotes.lastWeek.created_at).toLocaleDateString()}
                    </div>
                    <p className="text-sm text-gray-dark dark:text-gray-light">
                      {checkInNotes.lastWeek.notes}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-dark dark:text-gray-light">No Check In Notes for last week.</p>
                )}
              </div>
              <div>
                <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                  This Week
                </h4>
                {checkInNotes.thisWeek ? (
                  <>
                    <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                      {new Date(checkInNotes.thisWeek.created_at).toLocaleDateString()}
                    </div>
                    <p className="text-sm text-gray-dark dark:text-gray-light">
                      {checkInNotes.thisWeek.notes}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-dark dark:text-gray-light">No Check In Notes for this week yet</p>
                )}
              </div>
            </div>
          </Card>
          <CheckInHistoryModal
            isOpen={showCheckInHistory}
            onClose={() => setShowCheckInHistory(false)}
            checkIns={allCheckIns.map(ci => ({ id: ci.id, date: ci.created_at, notes: ci.notes }))}
            onLoadMore={() => {}}
            hasMore={false}
            emptyMessage="No history yet."
          />
        </div>

        {/* Weight Chart */}
        <div className="md:col-span-2">
          <Card title={
            <div className="flex items-center justify-between w-full">
              <span>Weight Progress</span>
            </div>
          }>
            <div className="w-full" style={{ height: 350 }}>
              {showAddWeight ? (
                <div className="flex flex-col items-center gap-4 bg-gray-50 dark:bg-night rounded-xl p-6 shadow-md w-full max-w-xs mx-auto mt-12">
                  <label htmlFor="add-weight" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                    {hasWeightLogs ? "Add Weight" : "Set Your Starting Weight"}
                  </label>
                  <input
                    id="add-weight"
                    type="number"
                    value={newWeight}
                    onChange={e => setNewWeight(e.target.value)}
                    placeholder={hasWeightLogs ? "Enter weight (lbs)" : "Enter starting weight (lbs)"}
                    className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-md bg-white dark:bg-night text-secondary dark:text-alabaster text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {hasWeightLogs ? "Log your new weight for today." : "This will be your baseline for progress tracking."}
                  </span>
                  <div className="flex gap-2 w-full">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={async () => {
                        if (!newWeight) return;
                        await fetch("/api/set-starting-weight", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ weight: newWeight }),
                        });
                        setShowAddWeight(false);
                        setNewWeight("");
                        await fetchWeightLogs();
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowAddWeight(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : hasWeightLogs ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} />
                </ResponsiveContainer>
              ) : null}
            </div>
            {/* Add Weight button below the graph, centered */}
            {hasWeightLogs && !showAddWeight && (
              <div className="flex justify-center mt-4">
                <Button variant="primary" onClick={() => setShowAddWeight(true)}>
                  Add Weight
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Add this at the very end of the file
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: linear-gradient(to top, #e5e7eb 60%, transparent 100%);
      border-radius: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: #e5e7eb transparent;
    }
  `;
  document.head.appendChild(style);
}
