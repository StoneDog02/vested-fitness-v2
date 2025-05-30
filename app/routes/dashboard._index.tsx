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

// Mock data for the client dashboard
const mockClientData: ClientDashboardData = {
  updates: [
    {
      message:
        "Your coach has adjusted your macros for the week. Check your meal plan for updates.",
      timestamp: "2 hours ago",
    },
    {
      message:
        "New workout plan added for next week focusing on strength training.",
      timestamp: "5 hours ago",
    },
    {
      message: "Great progress on your morning cardio sessions!",
      timestamp: "1 day ago",
    },
  ],
  meals: [
    {
      name: "Breakfast",
      description: "Oatmeal with protein powder and berries",
      time: "7:00 AM",
      completed: true,
    },
    {
      name: "Morning Snack",
      description: "Greek yogurt with almonds",
      time: "10:00 AM",
      completed: true,
    },
    {
      name: "Lunch",
      description: "Grilled chicken salad with avocado",
      time: "1:00 PM",
      completed: false,
    },
    {
      name: "Afternoon Snack",
      description: "Protein shake and banana",
      time: "4:00 PM",
      completed: false,
    },
    {
      name: "Dinner",
      description: "Salmon with sweet potato and broccoli",
      time: "7:00 PM",
      completed: false,
    },
  ],
  workouts: [
    {
      id: "1",
      name: "Pull Day",
      date: new Date().toISOString(),
      completed: false,
      exercises: [
        {
          id: "1",
          name: "Bench Press",
          description: "4 sets x 6-10 reps",
          type: "Single",
          videoUrl: "https://example.com/bench-press-tutorial",
          sets: [
            {
              setNumber: 1,
              weight: 135,
              reps: 10,
              completed: true,
              notes: "Warm-up",
            },
            { setNumber: 2, weight: 185, reps: 8, completed: true },
            { setNumber: 3, weight: 205, reps: 6, completed: true },
            { setNumber: 4, weight: 205, reps: 6, completed: true },
          ],
        },
        {
          id: "2",
          name: "Incline Dumbbell Press",
          description: "3 sets x 8-10 reps",
          type: "Single",
          videoUrl: "https://example.com/incline-db-press-tutorial",
          sets: [
            { setNumber: 1, weight: 60, reps: 10, completed: true },
            { setNumber: 2, weight: 65, reps: 10, completed: true },
            { setNumber: 3, weight: 70, reps: 8, completed: true },
          ],
        },
        {
          id: "3",
          name: "Seated Shoulder Press",
          description: "3 sets x 8-10 reps",
          type: "Single",
          videoUrl: "https://example.com/shoulder-press-tutorial",
          sets: [
            { setNumber: 1, weight: 95, reps: 10, completed: true },
            { setNumber: 2, weight: 115, reps: 8, completed: true },
            { setNumber: 3, weight: 115, reps: 8, completed: false },
          ],
        },
      ],
    },
  ],
  supplements: [
    {
      name: "Multivitamin",
      timing: "Morning",
      completed: true,
    },
    {
      name: "Fish Oil",
      timing: "Morning",
      completed: true,
    },
    {
      name: "Creatine",
      timing: "Pre-Workout",
      completed: false,
    },
    {
      name: "Pre-workout supplement",
      timing: "Pre-Workout",
      completed: false,
    },
  ],
};

// Mock data for the coach dashboard
const mockClients = [
  { id: 1, name: "Sarah Johnson", lastActive: "2 hours ago", compliance: 85 },
  { id: 2, name: "Mike Smith", lastActive: "1 day ago", compliance: 92 },
  { id: 3, name: "Emma Davis", lastActive: "3 hours ago", compliance: 78 },
  { id: 4, name: "John Wilson", lastActive: "5 hours ago", compliance: 95 },
];

const mockActivity = [
  {
    id: 1,
    client: "Sarah Johnson",
    action: "Completed workout",
    time: "2 hours ago",
  },
  { id: 2, client: "Mike Smith", action: "Logged meals", time: "3 hours ago" },
  {
    id: 3,
    client: "Emma Davis",
    action: "Updated weight",
    time: "4 hours ago",
  },
  {
    id: 4,
    client: "John Wilson",
    action: "Completed workout",
    time: "5 hours ago",
  },
];

export const loader: LoaderFunction = async ({ request }) => {
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  let accessToken, refreshToken;
  if (supabaseAuthCookieKey) {
    try {
      // Decode from base64 before parsing
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      console.log("[LOADER] decoded cookie value:", decoded);
      // Parse twice: first to get the string, then to get the array
      const [access, refresh] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
      refreshToken = refresh;
    } catch (e) {
      accessToken = undefined;
      refreshToken = undefined;
    }
  }
  console.log("[LOADER] accessToken:", accessToken);
  console.log("[LOADER] refreshToken:", refreshToken);

  let coachId = null;
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
      console.log("[LOADER] decoded authId:", authId);
    } catch (e) {
      console.log("[LOADER] JWT decode error:", e);
    }
  }

  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    // Fetch full user record including role and coach_id
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    console.log("[LOADER] user:", user, userError);
    if (user) {
      // If coach, use their own id; if client, use their coach_id
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
  }
  return json<LoaderData & { coachId: string | null }>({
    clientData: mockClientData,
    coachId,
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
                <p className="text-4xl font-bold">24</p>
                <p className="text-sm text-muted-foreground mt-2">
                  +3 this month
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/active" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Active Clients</h3>
                <p className="text-4xl font-bold">18</p>
                <p className="text-sm text-muted-foreground mt-2">
                  75% of total
                </p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/inactive" className="group">
              <Card className="p-6 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30 cursor-pointer transition-all">
                <h3 className="font-semibold text-lg mb-2">Inactive Clients</h3>
                <p className="text-4xl font-bold text-red-500">6</p>
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
                <p className="text-4xl font-bold">87%</p>
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
                {mockClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Last active {client.lastActive}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-[60px] h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${client.compliance}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {client.compliance}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent Activity */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {mockActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div
                      className={
                        "w-2 h-2 mt-2 rounded-full " +
                        (activity.action.includes("workout")
                          ? "bg-green-500"
                          : activity.action.includes("meals")
                          ? "bg-blue-500"
                          : "bg-yellow-500")
                      }
                    />
                    <div>
                      <p className="font-medium">{activity.client}</p>
                      <p className="text-sm text-muted-foreground">
                        {activity.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
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
