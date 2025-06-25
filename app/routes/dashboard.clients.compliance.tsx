import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunction } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import type { Database } from "~/lib/supabase";
import { Buffer } from "buffer";

// Type for compliance client
type ComplianceClient = {
  id: string;
  name: string;
  compliance: number;
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
  const complianceClients: ComplianceClient[] = [];
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
        .select("id, name")
        .eq("coach_id", coachId)
        .eq("role", "client");
      if (clients) {
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
          complianceClients.push({
            id: client.id,
            name: client.name,
            compliance,
          });
        }
        // Sort by compliance desc
        complianceClients.sort((a, b) => b.compliance - a.compliance);
      }
    }
  }
  return json({ complianceClients });
};

export default function ComplianceClients() {
  const { complianceClients } = useLoaderData<typeof loader>();
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Client Compliance</h1>
      <Card className="p-6">
        <div className="space-y-4">
          {complianceClients.length === 0 ? (
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
              <span className="text-gray-500 text-lg">No clients found.</span>
            </div>
          ) : (
            complianceClients.map((client: ComplianceClient) => (
              <div
                key={client.id}
                className="flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{client.name}</p>
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
