import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
import dayjs from "dayjs";
import { getCurrentDate } from "~/lib/timezone";

export const meta: MetaFunction = () => {
  return [
    { title: "Coach Access | Kava Training" },
    {
      name: "description",
      content: "View updates and check-ins from your coach",
    },
  ];
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

// In-memory cache for coach access data (per user, 30s TTL)
const coachAccessCache: Record<string, { data: any; expires: number }> = {};

// Type for check-in records
interface CheckIn {
  id: string;
  notes: string;
  created_at: string;
}

const CHECKINS_PER_PAGE = 10;
const UPDATES_PER_PAGE = 10;
const MEAL_LOGS_PER_PAGE = 10;

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
    return json({ updates: [], goal: "Build muscle and increase strength", checkInNotes: { thisWeek: null, lastWeek: null }, allCheckIns: [], allUpdates: [], weightLogs: [], mealLogs: [], paginatedMealLogs: [] });
  }

  // Check cache (per user)
  if (coachAccessCache[authId] && coachAccessCache[authId].expires > Date.now()) {
    return json(coachAccessCache[authId].data);
  }

  // Get the client's user record
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, goal")
    .eq("auth_id", authId)
    .single();
  if (!clientUser) {
    return json({ updates: [], goal: "Build muscle and increase strength", checkInNotes: { thisWeek: null, lastWeek: null }, allCheckIns: [], allUpdates: [], weightLogs: [], mealLogs: [], paginatedMealLogs: [] });
  }

  // Parse page params for check-in, update, and meal log pagination
  const url = new URL(request.url);
  const checkInPage = parseInt(url.searchParams.get("checkInPage") || "1", 10);
  const checkInOffset = (checkInPage - 1) * CHECKINS_PER_PAGE;
  const updatePage = parseInt(url.searchParams.get("updatePage") || "1", 10);
  const updateOffset = (updatePage - 1) * UPDATES_PER_PAGE;
  const mealLogPage = parseInt(url.searchParams.get("mealLogPage") || "1", 10);
  const mealLogOffset = (mealLogPage - 1) * MEAL_LOGS_PER_PAGE;

  // Fetch coach_updates, check_ins, weight_logs, and meal logs in parallel
  const [updatesRes, checkInsRes, weightLogsRes, paginatedCheckInsRes, paginatedUpdatesRes, mealLogsRes, paginatedMealLogsRes] = await Promise.all([
    supabase
      .from("coach_updates")
      .select("id, message, created_at")
      .eq("client_id", clientUser.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("check_ins")
      .select("id, notes, created_at")
      .eq("client_id", clientUser.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("weight_logs")
      .select("id, weight, logged_at")
      .eq("user_id", clientUser.id)
      .order("logged_at", { ascending: true }),
    supabase
      .from("check_ins")
      .select("id, notes, created_at")
      .eq("client_id", clientUser.id)
      .order("created_at", { ascending: false })
      .range(checkInOffset, checkInOffset + CHECKINS_PER_PAGE - 1),
    supabase
      .from("coach_updates")
      .select("id, message, created_at")
      .eq("client_id", clientUser.id)
      .order("created_at", { ascending: false })
      .range(updateOffset, updateOffset + UPDATES_PER_PAGE - 1),
    supabase
      .from("meal_completions")
      .select("id, meal_id, completed_at")
      .eq("user_id", clientUser.id)
      .order("completed_at", { ascending: false }),
    supabase
      .from("meal_completions")
      .select("id, meal_id, completed_at")
      .eq("user_id", clientUser.id)
      .order("completed_at", { ascending: false })
      .range(mealLogOffset, mealLogOffset + MEAL_LOGS_PER_PAGE - 1),
  ]);

  const updates = updatesRes.data || [];
  const checkIns = (checkInsRes.data as CheckIn[]) || [];
  const weightLogs = (weightLogsRes.data as any[]) || [];
  const paginatedCheckIns = (paginatedCheckInsRes.data as CheckIn[]) || [];
  const paginatedUpdates = (paginatedUpdatesRes.data as any[]) || [];
  const mealLogs = mealLogsRes.data || [];
  const paginatedMealLogs = paginatedMealLogsRes.data || [];
  const totalCheckIns = checkIns.length;
  const hasMorePaginatedCheckIns = checkInOffset + paginatedCheckIns.length < totalCheckIns;
  const totalUpdates = updates.length;
  const hasMorePaginatedUpdates = updateOffset + paginatedUpdates.length < totalUpdates;
  const totalMealLogs = mealLogs.length;
  const hasMorePaginatedMealLogs = mealLogOffset + paginatedMealLogs.length < totalMealLogs;

  // Helper to get week start (Sunday)
  function getWeekStart(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  const today = getCurrentDate().toDate();
  const thisWeekStart = getWeekStart(today);
  const lastWeekStart = dayjs(thisWeekStart).subtract(7, "day").toDate();
  const nextWeekStart = dayjs(thisWeekStart).add(7, "day").toDate();

  let thisWeekNote = null;
  let lastWeekNote = null;

  if (checkIns && checkIns.length > 0) {
    // Find the most recent check-in for this week
    thisWeekNote = checkIns.find((ci: CheckIn) => {
      const created = new Date(ci.created_at);
      return created >= thisWeekStart && created < nextWeekStart;
    });
    // Find the most recent check-in for last week
    lastWeekNote = checkIns.find((ci: CheckIn) => {
      const created = new Date(ci.created_at);
      return created >= lastWeekStart && created < thisWeekStart;
    });
  }

  // Filter updates to only those from the last 7 days
  const now = getCurrentDate().toDate();
  const oneWeekAgo = dayjs(now).subtract(7, "day").toDate();
  const recentUpdates = (updates || []).filter((u: any) => {
    const created = new Date(u.created_at);
    return created >= oneWeekAgo;
  });
  // Container grows to fit up to 3 updates, scrolls if more
  const containerMaxHeight = recentUpdates.length > 3 ? 'max-h-40' : '';
  const showScrollIndicator = recentUpdates.length > 3;

  const result = {
    updates: updates || [],
    goal: clientUser.goal || "Build muscle and increase strength",
    checkInNotes: {
      thisWeek: thisWeekNote || null,
      lastWeek: lastWeekNote || null,
    },
    allCheckIns: checkIns || [],
    allUpdates: updates || [],
    weightLogs,
    paginatedCheckIns,
    hasMorePaginatedCheckIns,
    paginatedUpdates,
    hasMorePaginatedUpdates,
    mealLogs,
    paginatedMealLogs,
    hasMorePaginatedMealLogs,
  };
  // Cache result
  coachAccessCache[authId] = { data: result, expires: Date.now() + 30_000 };
  return json(result);
};

export default function CoachAccess() {
  const { updates, goal, checkInNotes, allCheckIns = [], allUpdates = [], weightLogs: initialWeightLogs = [], paginatedCheckIns = [], hasMorePaginatedCheckIns = false, paginatedUpdates = [], hasMorePaginatedUpdates = false, mealLogs = [], paginatedMealLogs = [], hasMorePaginatedMealLogs = false } = useLoaderData<typeof loader>();
  const [showUpdateHistory, setShowUpdateHistory] = useState(false);
  const [showCheckInHistory, setShowCheckInHistory] = useState(false);
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [weightLogs, setWeightLogs] = useState(initialWeightLogs);

  // Pagination state for check-ins
  const [checkInPage, setCheckInPage] = useState(1);
  const [checkInHistory, setCheckInHistory] = useState(
    paginatedCheckIns.map((ci: CheckIn) => ({ id: ci.id, date: ci.created_at, notes: ci.notes }))
  );
  const [hasMoreCheckIns, setHasMoreCheckIns] = useState(hasMorePaginatedCheckIns);
  const checkInFetcher = useFetcher();

  // Pagination state for updates
  const [updatePage, setUpdatePage] = useState(1);
  const [updateHistory, setUpdateHistory] = useState(
    paginatedUpdates.map((u: { id: string; message: string; created_at: string }) => ({ id: u.id, message: u.message, created_at: u.created_at }))
  );
  const [hasMoreUpdates, setHasMoreUpdates] = useState(hasMorePaginatedUpdates);
  const updateFetcher = useFetcher();

  // When modal opens, reset to first page
  useEffect(() => {
    if (showCheckInHistory) {
      setCheckInPage(1);
      setCheckInHistory(paginatedCheckIns.map((ci: CheckIn) => ({ id: ci.id, date: ci.created_at, notes: ci.notes })));
      setHasMoreCheckIns(hasMorePaginatedCheckIns);
    }
    if (showUpdateHistory) {
      setUpdatePage(1);
      setUpdateHistory(paginatedUpdates.map((u: { id: string; message: string; created_at: string }) => ({ id: u.id, message: u.message, created_at: u.created_at })));
      setHasMoreUpdates(hasMorePaginatedUpdates);
    }
  }, [showCheckInHistory, paginatedCheckIns, hasMorePaginatedCheckIns, showUpdateHistory, paginatedUpdates, hasMorePaginatedUpdates]);

  // Append new check-ins, updates, and meal logs when fetchers load more
  useEffect(() => {
    if (checkInFetcher.data && checkInFetcher.state === "idle") {
      const { paginatedCheckIns: newCheckIns = [], hasMorePaginatedCheckIns: moreCheckIns = false } = checkInFetcher.data as any;
      setCheckInHistory((prev: { id: string; date: string; notes: string; formattedDate?: string; weekRange?: string; }[]) => [
        ...prev,
        ...newCheckIns.map((ci: CheckIn) => ({ id: ci.id, date: ci.created_at, notes: ci.notes })),
      ]);
      setHasMoreCheckIns(moreCheckIns);
    }
    if (updateFetcher.data && updateFetcher.state === "idle") {
      const { paginatedUpdates: newUpdates = [], hasMorePaginatedUpdates: moreUpdates = false } = updateFetcher.data as any;
      setUpdateHistory((prev: { id: string; message: string; created_at: string }[]) => [
        ...prev,
        ...newUpdates.map((u: { id: string; message: string; created_at: string }) => ({ id: u.id, message: u.message, created_at: u.created_at })),
      ]);
      setHasMoreUpdates(moreUpdates);
    }
  }, [checkInFetcher.data, checkInFetcher.state, updateFetcher.data, updateFetcher.state]);

  const handleLoadMoreCheckIns = () => {
    const nextPage = checkInPage + 1;
    setCheckInPage(nextPage);
    checkInFetcher.load(`/dashboard/coach-access?checkInPage=${nextPage}`);
  };

  const handleLoadMoreUpdates = () => {
    const nextPage = updatePage + 1;
    setUpdatePage(nextPage);
    updateFetcher.load(`/dashboard/coach-access?updatePage=${nextPage}`);
  };

  // Filter updates to only those from the last 7 days
  const now = getCurrentDate().toDate();
  const oneWeekAgo = dayjs(now).subtract(7, "day").toDate();
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
            updates={updateHistory}
            onLoadMore={handleLoadMoreUpdates}
            hasMore={hasMoreUpdates}
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
            checkIns={checkInHistory}
            onLoadMore={handleLoadMoreCheckIns}
            hasMore={hasMoreCheckIns}
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
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="text-center p-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-davyGray rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-gray-400 dark:text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
                      Track Your Progress
                    </h3>
                    <p className="text-gray-dark dark:text-gray-light mb-6 max-w-sm">
                      Start tracking your weight to see your progress over time with visual charts and statistics.
                    </p>
                    <Button variant="primary" onClick={() => setShowAddWeight(true)}>
                      Set Starting Weight
                    </Button>
                  </div>
                </div>
              )}
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
