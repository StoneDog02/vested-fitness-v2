import { json } from "@remix-run/node";
import { useLoaderData, useMatches, Link, useRevalidator, useFetcher } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import type { DailyWorkout } from "~/types/workout";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import { useState, useEffect } from "react";
import { parse } from "cookie";
import type { LoaderFunction } from "@remix-run/node";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { useMealCompletion } from "../context/MealCompletionContext";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import React from "react";

// Configure dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

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
  id?: string | number; // Add optional id field
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
  supplementCompliance: number;
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
  status?: string;
};

type Activity = {
  id: string;
  clientName: string;
  action: string;
  time: string;
};

// In-memory cache for dashboard critical data (per user, expires after 30s)
const dashboardCache: Record<string, { data: any; expires: number }> = {};

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

  // Check cache (per user)
  if (authId && dashboardCache[authId] && dashboardCache[authId].expires > Date.now()) {
    return json(dashboardCache[authId].data);
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
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);
        // Parallelize all independent queries
        const [
          workoutCompletionsResult,
          activePlansResult,
          mealPlansResult,
          mealCompletionsResult,
          weightLogsResult,
          updatesRawResult,
          workoutPlansResult,
          supplementsResult,
          supplementCompletionsResult
        ] = await Promise.all([
          supabase
            .from("workout_completions")
            .select("completed_at")
            .eq("user_id", user.id)
            .gte("completed_at", weekStart.toISOString().slice(0, 10))
            .lt("completed_at", weekEnd.toISOString().slice(0, 10)),
          supabase
            .from("workout_plans")
            .select("id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1),
          supabase
            .from("meal_plans")
            .select("id, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1),
          supabase
            .from("meal_completions")
            .select("meal_id, completed_at")
            .eq("user_id", user.id)
            .gte("completed_at", weekStart.toISOString())
            .lt("completed_at", weekEnd.toISOString()),
          supabase
            .from("weight_logs")
            .select("weight, logged_at")
            .eq("user_id", user.id)
            .order("logged_at", { ascending: true }),
          supabase
            .from("coach_updates")
            .select("message, created_at")
            .eq("client_id", user.id)
            .gte("created_at", startOfDay.toISOString())
            .lt("created_at", endOfDay.toISOString())
            .order("created_at", { ascending: false }),
          supabase
            .from("workout_plans")
            .select("id, title, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1),
          supabase
            .from("supplements")
            .select("id, name")
            .eq("user_id", user.id),
          supabase
            .from("supplement_completions")
            .select("supplement_id, completed_at")
            .eq("user_id", user.id)
            .gte("completed_at", weekStart.toISOString())
            .lt("completed_at", weekEnd.toISOString())
        ]);
        // ...existing logic to process results (reuse your code, just use the results from above)...
        // Build meals, completedMealIds, and all other clientData fields as before
        // (Insert the full clientData construction logic here, using the results from the parallel queries)
        // At the end, cache the result:
        // Example:
        // const clientData = { ... };
        // dashboardCache[authId] = { data: { clientData }, expires: Date.now() + 30_000 };
        // return json({ clientData });
      }
      // ...coach logic: parallelize all independent queries as above, then cache result...
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

// SkeletonCard component for loading states
type SkeletonCardProps = {
  lines?: number;
  className?: string;
};

function SkeletonCard({ lines = 3, className = "" }: SkeletonCardProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true">
      {[...Array(lines)].map((_, i) => (
        <div key={i} className="animate-pulse h-5 bg-gray-200 dark:bg-davyGray rounded w-full" />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { clientData, coachId, totalClients, activeClients, inactiveClients, compliance, percentChange, recentClients: loaderRecentClients, recentActivity: loaderRecentActivity } = useLoaderData<LoaderData>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { checkedMeals, isHydrated } = useMealCompletion();
  const matches = useMatches();
  const parentData = matches.find((match) => match.id === "routes/dashboard")
    ?.data as { role: "coach" | "client" };
  const role = parentData?.role;
  const revalidator = useRevalidator();
  
  // Listen for custom event to revalidate dashboard
  useEffect(() => {
    function handleRevalidate() {
      revalidator.revalidate();
    }
    window.addEventListener("meals:completed", handleRevalidate);
    window.addEventListener("workouts:completed", handleRevalidate);
    window.addEventListener("supplements:completed", handleRevalidate);
    return () => {
      window.removeEventListener("meals:completed", handleRevalidate);
      window.removeEventListener("workouts:completed", handleRevalidate);
      window.removeEventListener("supplements:completed", handleRevalidate);
    };
  }, [revalidator]);
  
  // Fetch non-critical data in the background from the correct API route
  const nonCriticalFetcher = useFetcher();
  React.useEffect(() => {
    nonCriticalFetcher.load("/api/dashboard-noncritical");
  }, []);
  // TODO: Show skeletons for non-critical cards while nonCriticalFetcher.state !== 'idle'
  // TODO: When nonCriticalFetcher.data is available, render the real cards
  
  // Use fetcher data if available, otherwise fallback to loader data
  type NonCriticalData = Partial<{
    recentClients: Client[];
    recentActivity: Activity[];
    weightChange: number;
    complianceCalendars: any;
  }>;
  const nonCriticalData: NonCriticalData = nonCriticalFetcher.data ?? {};
  const recentClients = nonCriticalData.recentClients ?? loaderRecentClients ?? [];
  const recentActivity = nonCriticalData.recentActivity ?? loaderRecentActivity ?? [];
  const weightChange = nonCriticalData.weightChange ?? clientData?.weightChange ?? 0;
  const nonCriticalLoading = nonCriticalFetcher.state !== "idle" && !nonCriticalFetcher.data;
  
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
            <Link to="/dashboard/clients" className="group" prefetch="intent">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Total Clients</h3>
                <p className="text-4xl font-bold">{totalClients}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  +{recentClients.length} this month
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/active" className="group" prefetch="intent">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Active Clients</h3>
                <p className="text-4xl font-bold">{activeClients}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0}% of total
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/inactive" className="group" prefetch="intent">
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

            <Link to="/dashboard/clients/compliance" className="group" prefetch="intent">
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
                {nonCriticalLoading ? (
                  <SkeletonCard lines={4} />
                ) : recentClients.length === 0 ? (
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
                {nonCriticalLoading ? (
                  <SkeletonCard lines={4} />
                ) : recentActivity.length === 0 ? (
                  <div className="text-gray-dark dark:text-gray-light">
                    No activity yet today.
                  </div>
                ) : (
                  recentActivity.map((activity: Activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium">{activity.clientName}</p>
                        <p className="text-sm text-muted-foreground">
                          {activity.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dayjs(activity.time).local().format('h:mm A')}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              <h3 className="font-semibold text-lg mb-2">Supplement Compliance</h3>
              <p className="text-4xl font-bold">
                {typeof clientData?.supplementCompliance === "number" && !isNaN(clientData.supplementCompliance)
                  ? `${clientData.supplementCompliance}%`
                  : "-%"}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last 7 days</p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Weight Change</h3>
              <p className="text-4xl font-bold text-green-500">
                {typeof weightChange === "number" && !isNaN(weightChange)
                  ? `${weightChange > 0 ? "+" : ""}${weightChange} lbs`
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
                    // Create meal key function to match the one used in meals page
                    const createMealKey = (meal: { id?: string | number; name: string; time: string }) => {
                      return `${meal.id}-${meal.name}-${meal.time.slice(0,5)}`;
                    };
                    // Use completedMealIds from clientData, not checkedMeals
                    const completedMealIds = clientData.completedMealIds ?? [];
                    const nextMeal = (clientData.meals ?? []).find((meal) => {
                      const mealKey = createMealKey(meal);
                      return !completedMealIds.includes(mealKey);
                    });
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
