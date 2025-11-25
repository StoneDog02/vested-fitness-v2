import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Tooltip from "~/components/ui/Tooltip";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunction } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import type { Database } from "~/lib/supabase";
import { Buffer } from "buffer";
import { getCurrentDate, getCurrentTimestampISO } from "~/lib/timezone";

// Type for compliance client with separate tracking
type ComplianceClient = {
  id: string;
  name: string;
  workoutCompliance: number;
  mealCompliance: number;
  supplementCompliance: number;
  overallCompliance: number;
};

// In-memory cache for compliance clients (expires after 30s)
const complianceClientsCache: Record<string, { data: any; expires: number }> = {};

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
    
    // Check for cache invalidation parameter
    const url = new URL(request.url);
    const invalidateCache = url.searchParams.get('invalidateCache') === '1';
    
    // Check cache (per coach) - skip if invalidating
    if (!invalidateCache && coachId && complianceClientsCache[coachId] && complianceClientsCache[coachId].expires > Date.now()) {
      return json({ complianceClients: complianceClientsCache[coachId].data });
    }
    
    if (coachId) {
      // Get all clients for this coach
      const { data: clients } = await supabase
        .from("users")
        .select("id, name")
        .eq("coach_id", coachId)
        .eq("role", "client");
      if (clients && clients.length > 0) {
        const clientIds = clients.map((c) => c.id);
        const today = getCurrentDate();
        // Last 7 days including today (today is day 0, so go back 6 days)
        const weekAgo = today.subtract(6, "day");
        const weekAgoStr = weekAgo.format("YYYY-MM-DD");
        const todayStr = today.format("YYYY-MM-DD");
        const tomorrowStr = today.add(1, "day").format("YYYY-MM-DD");
        // First, fetch workoutPlansRaw and mealPlansRaw
        const [
          workoutPlansRaw,
          mealPlansRaw
        ] = await Promise.all([
          supabase
            .from("workout_plans")
            .select("id, user_id, is_active")
            .in("user_id", clientIds)
            .eq("is_active", true),
          supabase
            .from("meal_plans")
            .select("id, user_id, is_active")
            .in("user_id", clientIds)
            .eq("is_active", true)
        ]);
        // Now fetch all completions, workout days, meals, and supplements
        const [
          workoutCompletionsRaw,
          mealCompletionsRaw,
          supplementCompletionsRaw,
          workoutDaysRaw,
          mealsRaw,
          supplementsRaw
        ] = await Promise.all([
          supabase
            .from("workout_completions")
            .select("id, completed_at, user_id, completed_groups")
            .in("user_id", clientIds)
            .gte("completed_at", weekAgoStr)
            .lt("completed_at", tomorrowStr),
          supabase
            .from("meal_completions")
            .select("id, completed_at, user_id, meal_id")
            .in("user_id", clientIds)
            .gte("completed_at", weekAgoStr)
            .lt("completed_at", tomorrowStr),
          supabase
            .from("supplement_completions")
            .select("id, completed_at, user_id, supplement_id")
            .in("user_id", clientIds)
            .gte("completed_at", weekAgoStr)
            .lt("completed_at", tomorrowStr),
          supabase
            .from("workout_days")
            .select("workout_plan_id, day_of_week, is_rest")
            .in("workout_plan_id", (workoutPlansRaw.data ?? []).map((p: any) => p.id)),
          supabase
            .from("meals")
            .select("id, meal_plan_id, name, time")
            .in("meal_plan_id", (mealPlansRaw.data ?? []).map((p: any) => p.id)),
          supabase
            .from("supplements")
            .select("id, user_id, active_from")
            .in("user_id", clientIds)
        ]);
        // Group data by client
        const workoutCompletionsByUser: Record<string, any[]> = {};
        (workoutCompletionsRaw.data ?? []).forEach((comp: any) => {
          if (!workoutCompletionsByUser[comp.user_id]) workoutCompletionsByUser[comp.user_id] = [];
          workoutCompletionsByUser[comp.user_id].push(comp);
        });
        const mealCompletionsByUser: Record<string, any[]> = {};
        (mealCompletionsRaw.data ?? []).forEach((comp: any) => {
          if (!mealCompletionsByUser[comp.user_id]) mealCompletionsByUser[comp.user_id] = [];
          mealCompletionsByUser[comp.user_id].push(comp);
        });
        const supplementCompletionsByUser: Record<string, any[]> = {};
        (supplementCompletionsRaw.data ?? []).forEach((comp: any) => {
          if (!supplementCompletionsByUser[comp.user_id]) supplementCompletionsByUser[comp.user_id] = [];
          supplementCompletionsByUser[comp.user_id].push(comp);
        });
        const workoutPlanByUser: Record<string, any> = {};
        (workoutPlansRaw.data ?? []).forEach((plan: any) => {
          workoutPlanByUser[plan.user_id] = plan;
        });
        const workoutDaysByPlan: Record<string, any[]> = {};
        (workoutDaysRaw.data ?? []).forEach((day: any) => {
          if (!workoutDaysByPlan[day.workout_plan_id]) workoutDaysByPlan[day.workout_plan_id] = [];
          workoutDaysByPlan[day.workout_plan_id].push(day);
        });
        const mealPlanByUser: Record<string, any> = {};
        (mealPlansRaw.data ?? []).forEach((plan: any) => {
          mealPlanByUser[plan.user_id] = plan;
        });
        const mealsByPlan: Record<string, any[]> = {};
        (mealsRaw.data ?? []).forEach((meal: any) => {
          if (!mealsByPlan[meal.meal_plan_id]) mealsByPlan[meal.meal_plan_id] = [];
          mealsByPlan[meal.meal_plan_id].push(meal);
        });
        const supplementsByUser: Record<string, any[]> = {};
        (supplementsRaw.data ?? []).forEach((supp: any) => {
          if (!supplementsByUser[supp.user_id]) supplementsByUser[supp.user_id] = [];
          supplementsByUser[supp.user_id].push(supp);
        });
        // Build complianceClients array
        complianceClients.push(...clients.map((client) => {
          // Calculate expected activities for this client
          let expectedWorkoutDays = 0;
          let expectedMeals = 0;
          let expectedSupplements = 0;
          // Expected workouts (only actual workout days, not rest days)
          const plan = workoutPlanByUser[client.id];
          if (plan && workoutDaysByPlan[plan.id]) {
            const workoutDays = workoutDaysByPlan[plan.id] || [];
            expectedWorkoutDays = workoutDays.filter((day: any) => !day.is_rest).length;
          }
          // Expected meals (7 days worth)
          const mealPlan = mealPlanByUser[client.id];
          if (mealPlan && mealsByPlan[mealPlan.id]) {
            const allMeals = mealsByPlan[mealPlan.id] || [];
            
            // Group meals by name and time to handle A/B options as single meals
            const mealGroups = allMeals.reduce((groups: Record<string, any[]>, meal: any) => {
              const key = `${meal.name}-${meal.time}`;
              if (!groups[key]) {
                groups[key] = [];
              }
              groups[key].push(meal);
              return groups;
            }, {});
            
            // Count unique meal groups (treating A/B options as single meals)
            const uniqueMealGroups = Object.keys(mealGroups);
            expectedMeals = uniqueMealGroups.length * 7;
          }
          // Expected supplements (7 days worth) - only count supplements that are active
          const supplements = supplementsByUser[client.id] || [];
          // Filter supplements that are active (have active_from date that's <= today)
          const today = getCurrentDate();
          const todayStr = today.format("YYYY-MM-DD");
          const activeSupplements = supplements.filter((supp: any) => {
            if (!supp.active_from) return true; // If no active_from, assume active
            return supp.active_from <= todayStr;
          });
          expectedSupplements = activeSupplements.length * 7;
          // Completions - filter by completed_groups to get actual workouts (not rest days)
          // Workouts have non-empty completed_groups, rest days have empty/null completed_groups
          const clientWorkoutCompletions = workoutCompletionsByUser[client.id] || [];
          const completedWorkouts = clientWorkoutCompletions.filter((completion: any) => {
            // Check if completed_groups exists and is a non-empty array
            return completion.completed_groups && 
                   Array.isArray(completion.completed_groups) && 
                   completion.completed_groups.length > 0;
          }).length;
          
          // Calculate completed meals by grouping A/B options and counting per day
          let completedMeals = 0;
          const clientMealPlan = mealPlanByUser[client.id];
          if (clientMealPlan && mealsByPlan[clientMealPlan.id]) {
            const allMeals = mealsByPlan[clientMealPlan.id] || [];
            const clientMealCompletions = mealCompletionsByUser[client.id] || [];
            
            // Group meals by name and time to handle A/B options
            const mealGroups = allMeals.reduce((groups: Record<string, any[]>, meal: any) => {
              const key = `${meal.name}-${meal.time}`;
              if (!groups[key]) {
                groups[key] = [];
              }
              groups[key].push(meal);
              return groups;
            }, {});
            
            const uniqueMealGroups = Object.keys(mealGroups);
            
            // Count completed meals per day for the week
            for (let i = 0; i < 7; i++) {
              const day = weekAgo.add(i, "day");
              const dayStr = day.format("YYYY-MM-DD");
              
              // Count how many unique meal groups were completed on this day
              const completedGroupsForDay = uniqueMealGroups.filter(groupKey => {
                const [mealName, mealTime] = groupKey.split('-');
                const groupMeals = allMeals.filter((m: any) => 
                  m.name === mealName && m.time.startsWith(mealTime)
                );
                
                // Check if any meal in this group was completed on this day
                const groupMealIds = new Set(groupMeals.map((m: any) => m.id));
                const dayCompletions = clientMealCompletions.filter((c: any) => {
                  const completedDateStr = c.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
                  return completedDateStr === dayStr && groupMealIds.has(c.meal_id);
                });
                
                return dayCompletions.length > 0; // If any meal in the group was completed on this day, the group is complete
              });
              
              completedMeals += completedGroupsForDay.length;
            }
          } else {
            // Fallback to original calculation if no meal plan
            completedMeals = (mealCompletionsByUser[client.id] || []).length;
          }
          
          // Calculate completed supplements per day for the week
          let completedSupplements = 0;
          const clientSupplementCompletions = supplementCompletionsByUser[client.id] || [];
          const activeSupplementIds = new Set(activeSupplements.map((s: any) => s.id));
          
          // Count completed supplements per day for the week
          for (let i = 0; i < 7; i++) {
            const day = weekAgo.add(i, "day");
            const dayStr = day.format("YYYY-MM-DD");
            
            // Count how many active supplements were completed on this day
            const dayCompletions = clientSupplementCompletions.filter((c: any) => {
              const completedDateStr = c.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
              return completedDateStr === dayStr && activeSupplementIds.has(c.supplement_id);
            });
            
            completedSupplements += dayCompletions.length;
          }
          // Calculate individual compliance percentages
          const workoutCompliance = expectedWorkoutDays > 0
            ? Math.round((completedWorkouts / expectedWorkoutDays) * 100)
            : 0;
          const mealCompliance = expectedMeals > 0 ? Math.round((completedMeals / expectedMeals) * 100) : 0;
          const supplementCompliance = expectedSupplements > 0 ? Math.round((completedSupplements / expectedSupplements) * 100) : 0;
          // Calculate overall compliance (excluding rest days)
          const totalCompleted = completedWorkouts + completedMeals + completedSupplements;
          const totalExpected = expectedWorkoutDays + expectedMeals + expectedSupplements;
          const overallCompliance = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
          return {
            id: client.id,
            name: client.name,
            workoutCompliance,
            mealCompliance,
            supplementCompliance,
            overallCompliance,
          };
        }));
        // Sort by overall compliance desc
        complianceClients.sort((a, b) => b.overallCompliance - a.overallCompliance);
        // Cache result
        if (coachId) {
          complianceClientsCache[coachId] = { data: complianceClients, expires: Date.now() + 30_000 };
        }
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
  percentage,
  tooltip
}: { 
  label: string; 
  percentage: number;
  tooltip?: string;
}) {
  const labelElement = (
    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{label}</span>
  );
  
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        {tooltip ? (
          <Tooltip content={tooltip}>
            {labelElement}
          </Tooltip>
        ) : (
          labelElement
        )}
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
