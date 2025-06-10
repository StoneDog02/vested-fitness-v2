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

type LoaderData = {
  clientData?: ClientDashboardData;
  coachId: string | null;
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  compliance: number;
  clients: Client[];
  recentClients: Client[];
  recentActivity: Activity[];
};

// Types for client dashboard data
type Update = {
  message: string;
  timestamp: string;
};

type Meal = {
  name: string;
  description: string;
  time: string;
  completed: boolean;
};

type Supplement = {
  name: string;
  timing: "Morning" | "Pre-Workout" | "Post-Workout" | "Evening";
  completed: boolean;
};

type ClientDashboardData = {
  updates: Update[];
  meals: Meal[];
  workouts: DailyWorkout[];
  supplements: Supplement[];
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
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
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
      activeClients = totalClients;
      inactiveClients = 0;
      // Recent Clients: last 30 days
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      recentClients = clients
        .filter((c) => new Date(c.created_at) >= monthAgo)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      // Workout compliance: % of workouts completed in last 7 days
      if (totalClients > 0) {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const { data: workouts } = await supabase
          .from("workouts")
          .select("id, user_id, completed, date")
          .in(
            "user_id",
            clients.map((c) => c.id)
          )
          .gte("date", weekAgo.toISOString().slice(0, 10));
        const totalWorkouts = (workouts ?? []).length;
        const completedWorkouts = (workouts ?? []).filter(
          (w: { completed: boolean }) => w.completed
        ).length;
        compliance =
          totalWorkouts > 0
            ? Math.round((completedWorkouts / totalWorkouts) * 100)
            : 0;
      }
      // Recent Activity: today only
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      // Workouts completed today
      const { data: workoutsToday } = await supabase
        .from("workouts")
        .select("id, user_id, completed, date")
        .in(
          "user_id",
          clients.map((c) => c.id)
        )
        .gte("date", today.toISOString().slice(0, 10))
        .lt("date", tomorrow.toISOString().slice(0, 10));
      if (workoutsToday) {
        for (const w of workoutsToday) {
          if (w.completed) {
            const client = clients.find((c) => c.id === w.user_id);
            recentActivity.push({
              id: w.id,
              clientName: client ? client.name : "Unknown",
              action: "Completed workout",
              time: w.date,
            });
          }
        }
      }
      // Meals logged today
      const { data: mealsLogged } = await supabase
        .from("meal_completions")
        .select("id, user_id, completed_at")
        .in(
          "user_id",
          clients.map((c) => c.id)
        )
        .gte("completed_at", today.toISOString())
        .lt("completed_at", tomorrow.toISOString());
      if (mealsLogged) {
        for (const m of mealsLogged) {
          const client = clients.find((c) => c.id === m.user_id);
          recentActivity.push({
            id: m.id,
            clientName: client ? client.name : "Unknown",
            action: "Logged meal",
            time: m.completed_at,
          });
        }
      }
      // Supplements taken today
      const { data: suppsLogged } = await supabase
        .from("supplement_completions")
        .select("id, user_id, completed_at")
        .in(
          "user_id",
          clients.map((c) => c.id)
        )
        .gte("completed_at", today.toISOString())
        .lt("completed_at", tomorrow.toISOString());
      if (suppsLogged) {
        for (const s of suppsLogged) {
          const client = clients.find((c) => c.id === s.user_id);
          recentActivity.push({
            id: s.id,
            clientName: client ? client.name : "Unknown",
            action: "Took supplement",
            time: s.completed_at,
          });
        }
      }
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
    clients,
    recentClients,
    recentActivity,
  });
};

export default function Dashboard() {
  console.log("Dashboard component rendered");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const data = useLoaderData<LoaderData>();
  const { clientData } = data;
  const matches = useMatches();
  const parentData = matches.find((match) => match.id === "routes/dashboard")
    ?.data as { role: "coach" | "client" };
  const role = parentData?.role;
  const coachId = data.coachId;

  // Debug logs
  console.log("Dashboard loader data:", data);
  console.log("Dashboard coachId prop to modal:", coachId);

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
                <p className="text-4xl font-bold">{data.totalClients}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  +3 this month
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/active" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Active Clients</h3>
                <p className="text-4xl font-bold">{data.activeClients}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  75% of total
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/inactive" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Inactive Clients</h3>
                <p className="text-4xl font-bold text-red-500">
                  {data.inactiveClients}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  25% of total
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/compliance" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">
                  Client Compliance
                </h3>
                <p className="text-4xl font-bold">{data.compliance}%</p>
                <p className="text-sm text-muted-foreground mt-2">
                  +5% from last week
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
                {data.recentClients.length === 0 ? (
                  <div className="text-gray-dark dark:text-gray-light">
                    No new clients in the last month.
                  </div>
                ) : (
                  data.recentClients.map((client) => (
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
                            style={{ width: `100%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">100%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Recent Activity */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {data.recentActivity.length === 0 ? (
                  <div className="text-gray-dark dark:text-gray-light">
                    No activity yet today.
                  </div>
                ) : (
                  data.recentActivity.map((activity) => (
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
              <p className="text-4xl font-bold">85%</p>
              <p className="text-sm text-muted-foreground mt-2">Last 7 days</p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Meal Compliance</h3>
              <p className="text-4xl font-bold">92%</p>
              <p className="text-sm text-muted-foreground mt-2">Last 7 days</p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Weight Change</h3>
              <p className="text-4xl font-bold text-green-500">-2.5 lbs</p>
              <p className="text-sm text-muted-foreground mt-2">This month</p>
            </Card>
          </div>

          {/* Four Card Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Updates */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent Updates</h3>
              <div className="space-y-4">
                {clientData?.updates.map((update, index) => (
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
                ))}
              </div>
            </Card>

            {/* Today's Meals */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Today&apos;s Meals</h3>
              <div className="space-y-4">
                {clientData?.meals.map((meal, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{meal.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {meal.time}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meal.description}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={meal.completed}
                      readOnly
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </div>
                ))}
              </div>
            </Card>

            {/* Today's Workouts */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">
                Today&apos;s Workouts
              </h3>
              <div className="space-y-4">
                {clientData?.workouts.map((workout) => (
                  <div
                    key={workout.id}
                    className="p-4 bg-gray-lightest dark:bg-secondary-light/5 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium text-secondary dark:text-alabaster">
                          {workout.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {workout.exercises.length} exercises
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={workout.completed}
                        readOnly
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </div>
                    <div className="space-y-2">
                      {workout.exercises.map((exercise) => (
                        <div key={exercise.id} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-secondary dark:text-alabaster/90">
                              {exercise.name}
                            </span>
                            <span className="text-muted-foreground">
                              {exercise.description}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Today's Supplements */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">
                Today&apos;s Supplements
              </h3>
              <div className="space-y-4">
                {clientData?.supplements.map((supplement, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{supplement.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {supplement.timing}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={supplement.completed}
                      readOnly
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </div>
                ))}
              </div>
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
