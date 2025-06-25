import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunction } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import type { Database } from "~/lib/supabase";
import { Buffer } from "buffer";

type ActiveClient = {
  id: string;
  name: string;
  lastActive: string;
  compliance: number;
  activeSince: string;
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
  const activeClients: ActiveClient[] = [];
  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    // Get coach id
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
    if (coachId) {
      // Get all clients for this coach
      const { data: clients } = await supabase
        .from("users")
        .select("id, name, created_at, updated_at")
        .eq("coach_id", coachId)
        .eq("role", "client");
      if (clients) {
        // TEMP: For testing, treat all clients as active (simulate all are subscribed)
        for (const client of clients) {
          // Compliance: % of workouts completed in last 7 days
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          
          // Get workout completions
          const { data: workoutCompletions } = await supabase
            .from("workout_completions")
            .select("id, completed_at")
            .eq("user_id", client.id)
            .gte("completed_at", weekAgo.toISOString().slice(0, 10));
          
          // Get expected workout days for this client
          const { data: clientPlans } = await supabase
            .from("workout_plans")
            .select("id")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .limit(1);
          
          let expectedWorkoutDays = 0;
          if (clientPlans && clientPlans.length > 0) {
            const { data: workoutDays } = await supabase
              .from("workout_days")
              .select("is_rest")
              .eq("workout_plan_id", clientPlans[0].id);
            expectedWorkoutDays = (workoutDays || []).filter(day => !day.is_rest).length;
          }
          
          const completedWorkouts = (workoutCompletions ?? []).length;
          const compliance =
            expectedWorkoutDays > 0
              ? Math.round((completedWorkouts / expectedWorkoutDays) * 100)
              : 0;
          
          // Last active: use updated_at (or latest workout completion if available)
          let lastActive = client.updated_at;
          if (workoutCompletions && workoutCompletions.length > 0) {
            const latestCompletion = workoutCompletions.reduce((latest, w) =>
              new Date(w.completed_at) > new Date(latest.completed_at) ? w : latest
            );
            lastActive = latestCompletion.completed_at;
          }
          activeClients.push({
            id: client.id,
            name: client.name,
            lastActive,
            compliance,
            activeSince: client.created_at,
          });
        }
        // Sort by lastActive desc
        activeClients.sort(
          (a, b) =>
            new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
        );
      }
    }
  }
  return json({ activeClients });
};

export default function ActiveClients() {
  const { activeClients } = useLoaderData<typeof loader>();
  const [search, setSearch] = useState("");
  const filteredClients = activeClients.filter((client: ActiveClient) =>
    client.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Active Clients</h1>
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
      <Card className="p-6">
        <div className="space-y-4">
          {filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg
                className="w-10 h-10 mb-2"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="text-gray-500 text-lg">
                No active clients found.
              </span>
            </div>
          ) : (
            filteredClients.map((client: ActiveClient) => (
              <div
                key={client.id}
                className="flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Last active {new Date(client.lastActive).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Active since{" "}
                    {new Date(client.activeSince).toLocaleDateString()}
                  </p>
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
                  <Link
                    to={`/dashboard/clients/${client.id}`}
                    className="ml-4 text-primary hover:underline text-sm"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
