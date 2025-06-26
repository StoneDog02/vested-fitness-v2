import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunction } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import type { Database } from "~/lib/supabase";
import { Buffer } from "buffer";

// Type for compliance client with separate tracking
type ComplianceClient = {
  id: string;
  name: string;
  workoutCompliance: number;
  mealCompliance: number;
  supplementCompliance: number;
  overallCompliance: number;
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
          // Get compliance data for last 7 days
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          
          // Fetch all completions for the week (consistent date filtering)
          const weekAgoISO = weekAgo.toISOString();
          const nowISO = new Date().toISOString();
          
          const { data: workoutCompletions } = await supabase
            .from("workout_completions")
            .select("id, completed_at")
            .eq("user_id", client.id)
            .gte("completed_at", weekAgoISO)
            .lt("completed_at", nowISO);

          const { data: mealCompletions } = await supabase
            .from("meal_completions")
            .select("id, completed_at")
            .eq("user_id", client.id)
            .gte("completed_at", weekAgoISO)
            .lt("completed_at", nowISO);

          const { data: supplementCompletions } = await supabase
            .from("supplement_completions")
            .select("id, completed_at")
            .eq("user_id", client.id)
            .gte("completed_at", weekAgoISO)
            .lt("completed_at", nowISO);
          
          // Calculate expected activities for this client
          let expectedWorkoutDays = 0;
          let expectedMeals = 0;
          let expectedSupplements = 0;
          
          // Expected workouts
          const { data: clientWorkoutPlans } = await supabase
            .from("workout_plans")
            .select("id")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .limit(1);
          
          if (clientWorkoutPlans && clientWorkoutPlans.length > 0) {
            const { data: workoutDays } = await supabase
              .from("workout_days")
              .select("is_rest")
              .eq("workout_plan_id", clientWorkoutPlans[0].id);
            expectedWorkoutDays = (workoutDays || []).filter(day => !day.is_rest).length;
          }

          // Expected meals (7 days worth)
          const { data: clientMealPlans } = await supabase
            .from("meal_plans")
            .select("id")
            .eq("user_id", client.id)
            .eq("is_active", true)
            .limit(1);
          
          if (clientMealPlans && clientMealPlans.length > 0) {
            const { data: meals } = await supabase
              .from("meals")
              .select("id")
              .eq("meal_plan_id", clientMealPlans[0].id);
            expectedMeals = (meals || []).length * 7; // 7 days
          }

          // Expected supplements (7 days worth)
          const { data: clientSupplements } = await supabase
            .from("supplements")
            .select("id")
            .eq("user_id", client.id);
          expectedSupplements = (clientSupplements || []).length * 7; // 7 days
          
          const completedWorkouts = (workoutCompletions ?? []).length;
          const completedMeals = (mealCompletions ?? []).length;
          const completedSupplements = (supplementCompletions ?? []).length;
          
          // Calculate individual compliance percentages
          const workoutCompliance = expectedWorkoutDays > 0 ? Math.round((completedWorkouts / expectedWorkoutDays) * 100) : 0;
          const mealCompliance = expectedMeals > 0 ? Math.round((completedMeals / expectedMeals) * 100) : 0;
          const supplementCompliance = expectedSupplements > 0 ? Math.round((completedSupplements / expectedSupplements) * 100) : 0;
          
          // Calculate overall compliance
          const totalCompleted = completedWorkouts + completedMeals + completedSupplements;
          const totalExpected = expectedWorkoutDays + expectedMeals + expectedSupplements;
          const overallCompliance = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
          
          complianceClients.push({
            id: client.id,
            name: client.name,
            workoutCompliance,
            mealCompliance,
            supplementCompliance,
            overallCompliance,
          });
        }
        // Sort by overall compliance desc
        complianceClients.sort((a, b) => b.overallCompliance - a.overallCompliance);
      }
    }
  }
  return json({ complianceClients });
};

// Bright color scaling from theme green to red with smooth transitions
function getComplianceColor(percentage: number): string {
  if (percentage >= 95) return "#00CC03"; // Theme green - perfect
  if (percentage >= 90) return "#00E804"; // Bright theme green - excellent
  if (percentage >= 85) return "#32E135"; // Theme light green - very good
  if (percentage >= 80) return "#65E668"; // Lighter green - good
  if (percentage >= 75) return "#98EB9B"; // Very light green - above average
  if (percentage >= 70) return "#B8F0BA"; // Pale green - decent
  if (percentage >= 65) return "#D4F5D6"; // Very pale green - okay
  if (percentage >= 60) return "#F0FAF0"; // Almost white green - needs improvement
  if (percentage >= 55) return "#FFF8DC"; // Cream - concerning
  if (percentage >= 50) return "#FFE135"; // Bright yellow - poor
  if (percentage >= 45) return "#FFD700"; // Gold - very poor
  if (percentage >= 40) return "#FFA500"; // Orange - critical
  if (percentage >= 35) return "#FF6347"; // Tomato - very critical
  if (percentage >= 30) return "#FF4500"; // Red orange - extremely poor
  if (percentage >= 25) return "#FF0000"; // Pure red - critical
  if (percentage >= 20) return "#DC143C"; // Crimson - very critical
  if (percentage >= 15) return "#B22222"; // Fire brick - extremely poor
  if (percentage >= 10) return "#8B0000"; // Dark red - needs immediate attention
  return "#660000"; // Very dark red - emergency
}

// Component for individual compliance bar
function ComplianceBar({ 
  label, 
  percentage
}: { 
  label: string; 
  percentage: number;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ 
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: getComplianceColor(percentage)
            }}
          />
        </div>
        <span 
          className="text-xs font-medium min-w-[32px] text-right"
          style={{ color: getComplianceColor(percentage) }}
        >
          {percentage}%
        </span>
      </div>
    </div>
  );
}

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
              <Link
                key={client.id}
                to={`/dashboard/clients/${client.id}`}
                className="block p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-lg group-hover:text-primary transition-colors">{client.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Overall: {client.overallCompliance}%</p>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors"
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
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ComplianceBar
                    label="Workouts"
                    percentage={client.workoutCompliance}
                  />
                  
                  <ComplianceBar
                    label="Meals"
                    percentage={client.mealCompliance}
                  />
                  
                  <ComplianceBar
                    label="Supplements"
                    percentage={client.supplementCompliance}
                  />
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
