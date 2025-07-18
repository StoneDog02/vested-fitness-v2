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
import { getCurrentDate } from "~/lib/timezone";

type ActiveClient = {
  id: string;
  name: string;
  lastActive: string;
  compliance: number;
  activeSince: string;
};

// In-memory cache for active clients (expires after 30s)
const activeClientsCache: Record<string, { data: any; expires: number }> = {};

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
  // Check cache (per coach)
  if (coachId && activeClientsCache[coachId] && activeClientsCache[coachId].expires > Date.now()) {
    return json({ activeClients: activeClientsCache[coachId].data });
  }
  let activeClients: ActiveClient[] = [];
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
      // Get all active clients for this coach
      const { data: clients } = await supabase
        .from("users")
        .select("id, name, created_at, updated_at, status")
        .eq("coach_id", coachId)
        .eq("role", "client")
        .neq("status", "inactive"); // Only get active clients
      if (clients && clients.length > 0) {
        const clientIds = clients.map((c) => c.id);
        // Batch fetch all workout completions and workout plans first
        const weekAgo = getCurrentDate().subtract(7, "day");
        const [
          workoutCompletionsRaw,
          workoutPlansRaw
        ] = await Promise.all([
          supabase
            .from("workout_completions")
            .select("id, completed_at, user_id")
            .in("user_id", clientIds)
            .gte("completed_at", weekAgo.format("YYYY-MM-DD")),
          supabase
            .from("workout_plans")
            .select("id, user_id, is_active")
            .in("user_id", clientIds)
            .eq("is_active", true)
        ]);
        // Now fetch workout days for all plans
        const planIds = (workoutPlansRaw.data ?? []).map((p: any) => p.id);
        let workoutDaysRaw: any[] = [];
        if (planIds.length > 0) {
          const { data } = await supabase
            .from("workout_days")
            .select("workout_plan_id, is_rest")
            .in("workout_plan_id", planIds);
          workoutDaysRaw = data ?? [];
        }
        // Group workout plans by user
        const workoutPlanByUser: Record<string, any> = {};
        (workoutPlansRaw.data ?? []).forEach((plan: any) => {
          workoutPlanByUser[plan.user_id] = plan;
        });
        // Group workout days by plan
        const workoutDaysByPlan: Record<string, any[]> = {};
        (workoutDaysRaw || []).forEach((day: any) => {
          if (!workoutDaysByPlan[day.workout_plan_id]) workoutDaysByPlan[day.workout_plan_id] = [];
          workoutDaysByPlan[day.workout_plan_id].push(day);
        });
        // Group workout completions by user
        const workoutCompletionsByUser: Record<string, any[]> = {};
        (workoutCompletionsRaw.data ?? []).forEach((comp: any) => {
          if (!workoutCompletionsByUser[comp.user_id]) workoutCompletionsByUser[comp.user_id] = [];
          workoutCompletionsByUser[comp.user_id].push(comp);
        });
        // Build activeClients array
        activeClients = clients.map((client) => {
          const plan = workoutPlanByUser[client.id];
          let expectedWorkoutDays = 0;
          if (plan && workoutDaysByPlan[plan.id]) {
            expectedWorkoutDays = (workoutDaysByPlan[plan.id] || []).filter((day: any) => !day.is_rest).length;
          }
          const completions = workoutCompletionsByUser[client.id] || [];
          const completedWorkouts = completions.length;
          const compliance = expectedWorkoutDays > 0 ? Math.round((completedWorkouts / expectedWorkoutDays) * 100) : 0;
          // Last active: use updated_at (or latest workout completion if available)
          let lastActive = client.updated_at;
          if (completions.length > 0) {
            const latestCompletion = completions.reduce((latest: any, w: any) =>
              new Date(w.completed_at) > new Date(latest.completed_at) ? w : latest
            );
            lastActive = latestCompletion.completed_at;
          }
          return {
            id: client.id,
            name: client.name,
            lastActive,
            compliance,
            activeSince: client.created_at,
          };
        });
        // Sort by lastActive desc
        activeClients.sort(
          (a, b) =>
            new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
        );
        // Cache result
        if (coachId) {
          activeClientsCache[coachId] = { data: activeClients, expires: Date.now() + 30_000 };
        }
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
              <Link
                key={client.id}
                to={`/dashboard/clients/${client.id}`}
                className="block p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group border border-gray-200 dark:border-gray-700"
              >
                <div className="flex flex-row items-center justify-between mb-3 gap-x-6 flex-wrap">
                  <p className="font-semibold text-lg group-hover:text-primary transition-colors whitespace-nowrap">{client.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Last active {new Date(client.lastActive).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 whitespace-nowrap">
                    Active since {new Date(client.activeSince).toLocaleDateString()}
                  </p>
                  <svg
                    className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
