import { json, redirect , createCookie } from "@remix-run/node";
import { useLoaderData, useMatches, Link, useRevalidator, useFetcher } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import Tooltip from "~/components/ui/Tooltip";
import type { DailyWorkout, WorkoutType, Exercise } from "~/types/workout";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import React, { useState, useEffect } from "react";
import { parse } from "cookie";
import type { LoaderFunction } from "@remix-run/node";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { useMealCompletion } from "../context/MealCompletionContext";
import dayjs from "dayjs";
import { 
  getCurrentDate, 
  getCurrentDateISO, 
  getCurrentTimestampISO,
  getStartOfWeek,
  isToday,
  isFuture,
  USER_TIMEZONE 
} from "~/lib/timezone";
import { extractAuthFromCookie, validateAndRefreshToken } from "~/lib/supabase";

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
  restDayCompliance: number;
  mealCompliance: number;
  supplementCompliance: number;
  weightChange: number;
  planName?: string | null;
  isRestDay?: boolean | null;
  completedMealIds?: string[];
  isFlexibleSchedule?: boolean;
  todaysWorkoutCompletion?: {
    isRestDay: boolean;
    workoutName?: string;
    completedGroups?: string[];
  } | null;
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
  const { accessToken, refreshToken } = extractAuthFromCookie(cookies);
  
  let authId: string | undefined;
  let needsTokenRefresh = false;
  let newTokens: { accessToken: string; refreshToken: string } | null = null;
  
  if (accessToken && refreshToken) {
    // Validate and potentially refresh the token
    const validation = await validateAndRefreshToken(accessToken, refreshToken);
    
    if (validation.valid) {
      if (validation.newAccessToken && validation.newRefreshToken) {
        // Token was refreshed, we need to update the cookie
        needsTokenRefresh = true;
        newTokens = {
          accessToken: validation.newAccessToken,
          refreshToken: validation.newRefreshToken
        };
        
        // Extract authId from new token
        try {
          const decoded = jwt.decode(validation.newAccessToken) as Record<string, unknown> | null;
          authId = decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
        } catch (e) {
          console.error("Failed to decode refreshed token:", e);
        }
      } else {
        // Token is still valid, extract authId
        try {
          const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
          authId = decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
        } catch (e) {
          console.error("Failed to decode access token:", e);
        }
      }
    } else {
      console.error("Token validation failed:", validation.reason);
    }
  }
  
  // If no valid auth, redirect to login
  if (!authId) {
    return redirect("/auth/login");
  }

  // Invalidate cache if requested (e.g., after meal completion)
  const url = new URL(request.url);
  const invalidateCache = url.searchParams.get('invalidateCache') === '1';
  if (authId && dashboardCache[authId]) {
    if (invalidateCache) {
      delete dashboardCache[authId];
    } else if (dashboardCache[authId].expires > Date.now()) {
      return json(dashboardCache[authId].data);
    }
  }

  const totalClients = 0;
  const activeClients = 0;
  const inactiveClients = 0;
  const compliance = 0;
  const percentChange = 0;
  const clients: Client[] = [];
  const recentClients: Client[] = [];
  const recentActivity: Activity[] = [];

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
    const coachId = user.role === "coach" ? user.id : user.coach_id;
    if (user.role === "client") {
      const today = getCurrentDate();
      const todayStr = today.format("YYYY-MM-DD");
      const tomorrowStr = today.add(1, "day").format("YYYY-MM-DD");
      // Get ALL meal plans for this user (both active and recently deactivated)
      const { data: allPlans } = await supabase
        .from("meal_plans")
        .select("id, title, description, created_at, is_active, activated_at, deactivated_at")
        .eq("user_id", user.id)
        .eq("is_template", false)
        .order("activated_at", { ascending: false, nullsFirst: false });
      // Determine which plan to show to the client (respecting activation day logic):
      let planToShow = null;
      if (allPlans && allPlans.length > 0) {
        planToShow = allPlans.find(plan => {
          if (!plan.is_active) return false;
          if (!plan.activated_at) return true; // Legacy plans without activation date
          const activatedDate = dayjs(plan.activated_at).tz(USER_TIMEZONE).format("YYYY-MM-DD");
          return activatedDate < todayStr; // Only show plans activated before today (not on activation day)
        });
        // If no active plan found, look for plan deactivated today (was active until today)
        if (!planToShow) {
          planToShow = allPlans.find(plan => {
            if (!plan.deactivated_at) return false;
            const deactivatedDate = dayjs(plan.deactivated_at).tz(USER_TIMEZONE).format("YYYY-MM-DD");
            return deactivatedDate === todayStr; // Deactivated today, so show until end of day
          });
        }
      }
      let todaysMeals: Meal[] = [];
      let completedMealIds: string[] = [];
      if (planToShow) {
        // Fetch all meals for the selected plan, order by sequence_order
        const { data: mealsRaw, error: mealsError } = await supabase
          .from("meals")
          .select("id, name, time, sequence_order, meal_option")
          .eq("meal_plan_id", planToShow.id)
          .order("sequence_order", { ascending: true });
        if (mealsError) console.error('[DASHBOARD] Meals query error:', mealsError);
        // For each meal, fetch foods and join food_library for macros
        todaysMeals = await Promise.all((mealsRaw || []).map(async (meal: any) => {
          const { data: foodsRaw } = await supabase
            .from("foods")
            .select(`id, name, portion, calories, protein, carbs, fat, food_library_id, food_library:food_library_id (calories, protein, carbs, fat)`)
            .eq("meal_id", meal.id);
          const foods = (foodsRaw || []).map((food: any) => {
            const protein = food.food_library && typeof food.food_library === 'object' && 'protein' in food.food_library ? Number(food.food_library.protein) || 0 : Number(food.protein) || 0;
            const carbs = food.food_library && typeof food.food_library === 'object' && 'carbs' in food.food_library ? Number(food.food_library.carbs) || 0 : Number(food.carbs) || 0;
            const fat = food.food_library && typeof food.food_library === 'object' && 'fat' in food.food_library ? Number(food.food_library.fat) || 0 : Number(food.fat) || 0;
            const calories = Math.round(protein * 4 + carbs * 4 + fat * 9) || 0;
            return {
              id: String(food.id || ''),
              name: String(food.name || ''),
              portion: String(food.portion || ''),
              calories: isFinite(calories) ? calories : 0,
              protein: isFinite(protein) ? Math.round(protein) : 0,
              carbs: isFinite(carbs) ? Math.round(carbs) : 0,
              fat: isFinite(fat) ? Math.round(fat) : 0,
            };
          });
          // Optionally, sum macros for the meal (or keep as foods only)
          const totalProtein = foods.reduce((sum, f) => sum + (f.protein || 0), 0);
          const totalCarbs = foods.reduce((sum, f) => sum + (f.carbs || 0), 0);
          const totalFat = foods.reduce((sum, f) => sum + (f.fat || 0), 0);
          const totalCalories = foods.reduce((sum, f) => sum + (f.calories || 0), 0);
          return {
            id: meal.id,
            name: meal.name,
            time: meal.time,
            completed: false,
            foods,
            calories: totalCalories,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat,
            description: meal.description,
          };
        }));
        // Fetch today's meal completions for this plan
        const { data: completions } = await supabase
          .from("meal_completions")
          .select("meal_id, completed_at")
          .eq("user_id", user.id)
          .gte("completed_at", todayStr)
          .lt("completed_at", tomorrowStr);
        completedMealIds = (completions || []).map((mc: any) => {
          const mealObj = todaysMeals.find((m) => m.id === mc.meal_id);
          if (mealObj) {
            return `${mealObj.id}-${mealObj.name}-${mealObj.time.slice(0,5)}`;
          }
          return String(mc.meal_id);
        });
      }
      // Fetch updates and weight logs (needed for dashboard)
      const [updatesRawResult, weightLogsResult] = await Promise.all([
        supabase
          .from("coach_updates")
          .select("message, created_at")
          .eq("client_id", user.id)
          .gte("created_at", todayStr)
          .lt("created_at", tomorrowStr)
          .order("created_at", { ascending: false }),
        supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("user_id", user.id)
          .order("logged_at", { ascending: true })
      ]);
      // Build updates
      const updates = (updatesRawResult.data || []).map((u: any) => ({
        message: u.message,
                      timestamp: u.created_at ? dayjs(u.created_at).tz(USER_TIMEZONE).format("YYYY-MM-DD HH:mm") : ""
      }));
      // Weight change
      let weightChange = 0;
      if (weightLogsResult.data && weightLogsResult.data.length > 0) {
        const first = weightLogsResult.data[0].weight;
        const last = weightLogsResult.data[weightLogsResult.data.length - 1].weight;
        weightChange = last - first;
      } else if (user.starting_weight && user.current_weight) {
        weightChange = user.current_weight - user.starting_weight;
      }
      // Parallelize all independent queries
      const [
        workoutCompletionsResult,
        weeklyWorkoutCompletionsResult,
        activePlansResult,
        workoutPlansResult,
        supplementsResult,
        supplementCompletionsResult
      ] = await Promise.all([
        supabase
          .from("workout_completions")
          .select("completed_at, completed_groups")
          .eq("user_id", user.id)
          .gte("completed_at", todayStr)
          .lt("completed_at", tomorrowStr),
        supabase
          .from("workout_completions")
          .select("completed_at, completed_groups")
          .eq("user_id", user.id)
          .gte("completed_at", today.subtract(7, "day").format("YYYY-MM-DD"))
          .lt("completed_at", tomorrowStr),
        supabase
          .from("workout_plans")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1),
        supabase
          .from("workout_plans")
          .select("id, title, is_active, activated_at, builder_mode")
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
          .gte("completed_at", todayStr)
          .lt("completed_at", tomorrowStr)
      ]);

      // Build today's workout (use string day name for workout_days.day_of_week)
      let workouts: DailyWorkout[] = [];
      let planName: string | null = null;
      let isRestDay: boolean | null = null;
      let isFlexibleSchedule: boolean = false;
      
      // Check if there's an active workout plan that was activated before today
      if (workoutPlansResult.data && workoutPlansResult.data.length > 0) {
        const workoutPlan = workoutPlansResult.data[0];
        
        // Detect if this is a flexible schedule
        isFlexibleSchedule = workoutPlan.builder_mode === 'day';
        
        // Only show workout if plan was activated before today (not on activation day)
        let shouldShowWorkout = true;
        if (workoutPlan.activated_at) {
          const activatedDate = dayjs(workoutPlan.activated_at).tz(USER_TIMEZONE).format("YYYY-MM-DD");
          shouldShowWorkout = activatedDate < todayStr; // Only show if activated before today
        }
        
        if (shouldShowWorkout && !isFlexibleSchedule) {
          // Only fetch fixed schedule workouts - flexible schedules are handled in the workouts page
          const workoutPlanId = workoutPlan.id;
          const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const todayName = daysOfWeek[today.day()];
          // Fetch today's workout day using string day name
          const { data: daysRaw } = await supabase
            .from("workout_days")
            .select("id, workout_plan_id, day_of_week, is_rest, workout_name, workout_type")
            .eq("workout_plan_id", workoutPlanId)
            .eq("day_of_week", todayName)
            .limit(1);
          if (daysRaw && daysRaw.length > 0) {
            const day = daysRaw[0];
            planName = day.workout_name || null;
            isRestDay = day.is_rest;
            if (!day.is_rest) {
              // Fetch all exercises for this day
              const { data: exercisesRaw } = await supabase
                .from("workout_exercises")
                .select("id, workout_day_id, group_type, sequence_order, exercise_name, exercise_description, video_url, sets_data, group_notes")
                .eq("workout_day_id", day.id)
                .order("sequence_order", { ascending: true });
              // Group exercises by group_type
              const groupsMap: Record<string, any[]> = {};
              (exercisesRaw || []).forEach((ex) => {
                if (!groupsMap[ex.group_type]) groupsMap[ex.group_type] = [];
                groupsMap[ex.group_type].push({
                  id: ex.id,
                  name: ex.exercise_name,
                  description: ex.exercise_description,
                  type: ex.group_type,
                  videoUrl: ex.video_url,
                  sets: ex.sets_data || [],
                  notes: ex.group_notes,
                });
              });
              const groups = Object.entries(groupsMap).map(([type, exercises]) => ({
                type: type as WorkoutType,
                exercises,
              }));
              const exercisesFlat = groups.flatMap((g) => g.exercises);
              workouts = [{
              id: day.id,
              name: day.workout_name,
              exercises: exercisesFlat,
              date: today.toISOString().slice(0, 10),
              completed: false,
              groups,
            }];
          } else {
            workouts = [];
          }
        }
      }
      }

      // Process today's workout completion
      let todaysWorkoutCompletion = null;
      if (workoutCompletionsResult.data && workoutCompletionsResult.data.length > 0) {
        const todayCompletion = workoutCompletionsResult.data[0];
        const isRestDayCompletion = !todayCompletion.completed_groups || todayCompletion.completed_groups.length === 0;
        
        if (isFlexibleSchedule) {
          // For flexible schedules, we need to determine the workout name from the completed groups
          let workoutName = "Rest Day";
          if (!isRestDayCompletion) {
            workoutName = "Workout Completed";
          }
          
          todaysWorkoutCompletion = {
            isRestDay: isRestDayCompletion,
            workoutName: isRestDayCompletion ? "Rest Day" : workoutName,
            completedGroups: todayCompletion.completed_groups || []
          };
        } else {
          // For fixed schedules, use the plan name
          todaysWorkoutCompletion = {
            isRestDay: isRestDayCompletion,
            workoutName: planName || (isRestDayCompletion ? "Rest Day" : "Workout"),
            completedGroups: todayCompletion.completed_groups || []
          };
        }
      }

      // Build supplements
      const supplements = (supplementsResult.data || []).map((s) => ({
        name: s.name,
      }));

      // Compliance calculations
      let workoutCompliance = 0;
      if (weeklyWorkoutCompletionsResult.data && activePlansResult.data && activePlansResult.data.length > 0) {
        // Get the active workout plan to count expected workout days (excluding rest days)
        const activePlan = activePlansResult.data[0];
        const { data: workoutDays } = await supabase
          .from("workout_days")
          .select("day_of_week, is_rest")
          .eq("workout_plan_id", activePlan.id);
        
        if (workoutDays) {
          const expectedWorkoutDays = workoutDays.filter(day => !day.is_rest).length;
          
          // Filter completions that are actually workout completions (non-empty completed_groups)
          const validCompletions = weeklyWorkoutCompletionsResult.data.filter(completion => {
            return completion.completed_groups && completion.completed_groups.length > 0;
          });
          
          workoutCompliance = expectedWorkoutDays > 0 
            ? Math.round((validCompletions.length / expectedWorkoutDays) * 100)
            : 0;
        }
      }
      
      // Calculate rest day compliance
      let restDayCompliance = 0;
      if (weeklyWorkoutCompletionsResult.data && activePlansResult.data && activePlansResult.data.length > 0) {
        const activePlan = activePlansResult.data[0];
        const { data: workoutDays } = await supabase
          .from("workout_days")
          .select("day_of_week, is_rest")
          .eq("workout_plan_id", activePlan.id);
        
        if (workoutDays) {
          const expectedRestDays = workoutDays.filter(day => day.is_rest).length;
          
          // Filter completions that are actually rest day completions (empty completed_groups)
          const restDayCompletions = weeklyWorkoutCompletionsResult.data.filter(completion => {
            return !completion.completed_groups || completion.completed_groups.length === 0;
          });
          
          restDayCompliance = expectedRestDays > 0 
            ? Math.round((restDayCompletions.length / expectedRestDays) * 100)
            : 0;
        }
      }
      
      const mealCompliance = workoutCompletionsResult.data && todaysMeals.length > 0
        ? Math.round((workoutCompletionsResult.data.length / todaysMeals.length) * 100)
        : 0;
      const supplementCompliance = supplementCompletionsResult.data && supplements.length > 0
        ? Math.round((supplementCompletionsResult.data.length / supplements.length) * 100)
        : 0;

      const clientData: ClientDashboardData = {
        updates,
        meals: todaysMeals,
        workouts,
        supplements,
        workoutCompliance,
        restDayCompliance,
        mealCompliance,
        supplementCompliance,
        weightChange,
        planName,
        isRestDay,
        completedMealIds,
        isFlexibleSchedule,
        todaysWorkoutCompletion,
      };
      dashboardCache[authId] = { data: { clientData }, expires: Date.now() + 30_000 };
      return json({ clientData });
    } else if (user.role === "coach") {
      // Fetch all clients for this coach
      const { data: clientsRaw } = await supabase
        .from("users")
        .select("id, name, updated_at, created_at, role, status")
        .eq("coach_id", user.id)
        .eq("role", "client");
      const clients = clientsRaw || [];
      // Count totals
      const totalClients = clients.length;
      const activeClients = clients.filter(c => c.status === "active").length;
      const inactiveClients = clients.filter(c => c.status === "inactive").length;
      // --- Compliance Calculation ---
      const activeClientIds = clients.filter(c => c.status === "active").map(c => c.id);
      let compliance = 0;
      if (activeClientIds.length > 0) {
        const weekAgo = getCurrentDate().subtract(7, "day");
        const weekAgoISO = weekAgo.toISOString();
        const nowISO = getCurrentTimestampISO();
        // First, fetch workoutPlansRaw and mealPlansRaw
        const [workoutPlansRaw, mealPlansRaw] = await Promise.all([
          supabase
            .from("workout_plans")
            .select("id, user_id, is_active")
            .in("user_id", activeClientIds)
            .eq("is_active", true),
          supabase
            .from("meal_plans")
            .select("id, user_id, is_active")
            .in("user_id", activeClientIds)
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
            .in("user_id", activeClientIds)
            .gte("completed_at", weekAgoISO)
            .lt("completed_at", nowISO),
          supabase
            .from("meal_completions")
            .select("id, completed_at, user_id")
            .in("user_id", activeClientIds)
            .gte("completed_at", weekAgoISO)
            .lt("completed_at", nowISO),
          supabase
            .from("supplement_completions")
            .select("id, completed_at, user_id")
            .in("user_id", activeClientIds)
            .gte("completed_at", weekAgoISO)
            .lt("completed_at", nowISO),
          supabase
            .from("workout_days")
            .select("workout_plan_id, day_of_week, is_rest")
            .in("workout_plan_id", (workoutPlansRaw.data ?? []).map((p: any) => p.id)),
          supabase
            .from("meals")
            .select("id, meal_plan_id, name, time, meal_option")
            .in("meal_plan_id", (mealPlansRaw.data ?? []).map((p: any) => p.id)),
          supabase
            .from("supplements")
            .select("id, user_id")
            .in("user_id", activeClientIds)
        ]);
        // Group plans and data by user
        const workoutPlanByUser: Record<string, any> = {};
        (workoutPlansRaw.data ?? []).forEach((plan: any) => {
          workoutPlanByUser[plan.user_id] = plan;
        });
        const mealPlanByUser: Record<string, any> = {};
        (mealPlansRaw.data ?? []).forEach((plan: any) => {
          mealPlanByUser[plan.user_id] = plan;
        });
        const workoutDaysByPlan: Record<string, any[]> = {};
        (workoutDaysRaw.data ?? []).forEach((day: any) => {
          if (!workoutDaysByPlan[day.workout_plan_id]) workoutDaysByPlan[day.workout_plan_id] = [];
          workoutDaysByPlan[day.workout_plan_id].push(day);
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
        // Group completions by user
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
        // Calculate compliance for each client
        let totalOverallCompliance = 0;
        let countedClients = 0;
        for (const clientId of activeClientIds) {
          // Expected workouts (only actual workout days, not rest days)
          let expectedWorkoutDays = 0;
          const plan = workoutPlanByUser[clientId];
          if (plan && workoutDaysByPlan[plan.id]) {
            const workoutDays = workoutDaysByPlan[plan.id] || [];
            expectedWorkoutDays = workoutDays.filter((day: any) => !day.is_rest).length;
          }
          // Expected meals (7 days worth) - count unique meal groups, not individual A/B options
          let expectedMeals = 0;
          const mealPlan = mealPlanByUser[clientId];
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
            expectedMeals = Object.keys(mealGroups).length * 7;
          }
          // Expected supplements (7 days worth)
          const supplements = supplementsByUser[clientId] || [];
          const expectedSupplements = supplements.length * 7;
          // Completions - filter out completions on rest days
          const clientWorkoutCompletions = workoutCompletionsByUser[clientId] || [];
          const completedWorkouts = clientWorkoutCompletions.filter((completion: any) => {
            // Filter completions that are actually workout completions (non-empty completed_groups)
            return completion.completed_groups && completion.completed_groups.length > 0;
          }).length;
          // Calculate completed meals by grouping A/B options
          let completedMeals = 0;
          const clientMealPlan = mealPlanByUser[clientId];
          if (clientMealPlan && mealsByPlan[clientMealPlan.id]) {
            const allMeals = mealsByPlan[clientMealPlan.id] || [];
            const clientMealCompletions = mealCompletionsByUser[clientId] || [];
            
            // Group meals by name and time
            const mealGroups = allMeals.reduce((groups: Record<string, any[]>, meal: any) => {
              const key = `${meal.name}-${meal.time}`;
              if (!groups[key]) {
                groups[key] = [];
              }
              groups[key].push(meal);
              return groups;
            }, {});
            
            // Count completed unique meal groups
            const uniqueMealGroups = Object.keys(mealGroups);
            const completedUniqueMealGroups = uniqueMealGroups.filter(groupKey => {
              const [mealName, mealTime] = groupKey.split('-');
              const groupMeals = allMeals.filter((m: any) => 
                m.name === mealName && m.time.startsWith(mealTime)
              );
              
              // Check if any meal in this group was completed
              const groupMealIds = new Set(groupMeals.map((m: any) => m.id));
              const groupCompletions = clientMealCompletions.filter((c: any) => 
                groupMealIds.has(c.meal_id)
              );
              
              return groupCompletions.length > 0; // If any meal in the group was completed, the group is complete
            });
            
            completedMeals = completedUniqueMealGroups.length;
          } else {
            // Fallback to original calculation if no meal plan
            completedMeals = (mealCompletionsByUser[clientId] || []).length;
          }
          const completedSupplements = (supplementCompletionsByUser[clientId] || []).length;
          // Calculate compliance without counting rest days as completed
          const totalCompleted = completedWorkouts + completedMeals + completedSupplements;
          const totalExpected = expectedWorkoutDays + expectedMeals + expectedSupplements;
          const overallCompliance = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
          if (totalExpected > 0) {
            totalOverallCompliance += overallCompliance;
            countedClients++;
          }
        }
        compliance = countedClients > 0 ? Math.round(totalOverallCompliance / countedClients) : 0;
      }
      // --- End Compliance Calculation ---
      dashboardCache[authId] = {
        data: {
          coachId: user.id,
          totalClients,
          activeClients,
          inactiveClients,
          compliance,
          percentChange: 0, // Placeholder
          clients,
          recentClients: [], // Handled by noncritical fetcher
          recentActivity: [], // Handled by noncritical fetcher
        },
        expires: Date.now() + 30_000,
      };
      return json({
        coachId: user.id,
        totalClients,
        activeClients,
        inactiveClients,
        compliance,
        percentChange: 0, // Placeholder
        clients,
        recentClients: [], // Handled by noncritical fetcher
        recentActivity: [], // Handled by noncritical fetcher
      });
    }
  }

  return json({
    coachId: user?.role === "coach" ? user.id : user?.coach_id || null,
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
    <div className={`space-y-4 ${className}`} aria-busy="true">
      {[...Array(lines)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl animate-pulse">
          <div className="rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 h-12 w-12 animate-pulse-soft"></div>
          <div className="flex-1 space-y-3">
            <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full w-3/4 animate-pulse-soft"></div>
            <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full w-1/2 animate-pulse-soft"></div>
          </div>
          <div className="h-8 w-16 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full animate-pulse-soft"></div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { clientData, coachId, totalClients, activeClients, inactiveClients, compliance, percentChange, recentClients: loaderRecentClients, recentActivity: loaderRecentActivity } = useLoaderData<LoaderData>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { checkedMeals, isHydrated } = useMealCompletion();
  const matches = useMatches();
  // Get parent loader data from dashboard route (role, user, currentInvoice)
  const parentMatch = useMatches().find((m) => m.id === "routes/dashboard");
  const parentData = (parentMatch?.data ?? {}) as { role?: string; user?: any; currentInvoice?: any };
  const parentRole = parentData.role;
  const parentUser = parentData.user;
  const parentCurrentInvoice = parentData.currentInvoice;
  const revalidator = useRevalidator();
  
  // Listen for custom event to revalidate dashboard
  useEffect(() => {
    function handleRevalidate() {
      // Reload with cache invalidation param
      const url = new URL(window.location.href);
      url.searchParams.set('invalidateCache', '1');
      window.location.href = url.toString();
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
    hasMore: boolean;
    page: number;
  }>;
  const nonCriticalData: NonCriticalData = nonCriticalFetcher.data ?? {};
  const recentClients = nonCriticalData.recentClients ?? loaderRecentClients ?? [];
  const recentActivity = nonCriticalData.recentActivity ?? loaderRecentActivity ?? [];
  const weightChange = nonCriticalData.weightChange ?? clientData?.weightChange ?? 0;
  const nonCriticalLoading = nonCriticalFetcher.state !== "idle" && !nonCriticalFetcher.data;
  
  const [activity, setActivity] = useState<Activity[]>(recentActivity);
  const [activityPage, setActivityPage] = useState(1);
  const [activityHasMore, setActivityHasMore] = useState(
    (nonCriticalData as any)?.hasMore ?? true
  );
  const [activityLoading, setActivityLoading] = useState(false);
  const activityFetcher = useFetcher();

  // When nonCriticalFetcher loads new data (first load), set activity state
  useEffect(() => {
    if (nonCriticalFetcher.data && nonCriticalFetcher.state === "idle") {
      const data = nonCriticalFetcher.data as {
        recentActivity: Activity[];
        hasMore: boolean;
        page: number;
      };
      setActivity(data.recentActivity || []);
      setActivityPage(data.page || 1);
      setActivityHasMore(data.hasMore ?? false);
    }
  }, [nonCriticalFetcher.data, nonCriticalFetcher.state]);

  // When activityFetcher loads more, append to activity
  useEffect(() => {
    if (activityFetcher.data && activityFetcher.state === "idle") {
      const data = activityFetcher.data as {
        recentActivity: Activity[];
        hasMore: boolean;
        page: number;
      };
      setActivity((prev) => [...prev, ...(data.recentActivity || [])]);
      setActivityPage(data.page || activityPage + 1);
      setActivityHasMore(data.hasMore ?? false);
      setActivityLoading(false);
    }
  }, [activityFetcher.data, activityFetcher.state]);

  const handleLoadMoreActivity = () => {
    setActivityLoading(true);
    activityFetcher.load(`/api/dashboard-noncritical?page=${activityPage + 1}`);
  };
  
  const [commitment, setCommitment] = useState<{ count: number; }>({ count: 0 });
  const [loadingCommitment, setLoadingCommitment] = useState(true);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCommitment() {
      setLoadingCommitment(true);
      setCommitmentError(null);
      try {
        const res = await fetch("/api/subscription-info");
        const data = await res.json();
        if (data && Array.isArray(data.billingHistory)) {
          const uniquePaidPeriods = new Set();
          const paidInvoices = data.billingHistory.filter((inv: any) =>
            inv.status === "paid" &&
            (inv.billing_reason === "subscription_cycle" || inv.billing_reason === "subscription_create") &&
            inv.lines && inv.lines.data && inv.lines.data[0] && inv.lines.data[0].period && inv.lines.data[0].period.end &&
            !uniquePaidPeriods.has(inv.lines.data[0].period.end) &&
            uniquePaidPeriods.add(inv.lines.data[0].period.end)
          );
          setCommitment({ count: paidInvoices.length });
        } else {
          setCommitment({ count: 0 });
        }
      } catch (err) {
        setCommitmentError("Could not load commitment progress.");
      } finally {
        setLoadingCommitment(false);
      }
    }
    fetchCommitment();
  }, []);
  
  // Payment required logic (moved from dashboard.tsx)
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  function formatCurrency(amount: number, currency: string | null | undefined) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency ?? 'usd'),
    }).format(amount / 100);
  }
  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pay-latest-invoice', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Payment failed.');
      } else {
        window.location.reload();
      }
    } catch (e) {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };
  if (parentUser && parentUser.access_status === 'payment_required') {
    const nextBillingDate = (parentCurrentInvoice && parentCurrentInvoice.period_end)
      ? new Date(parentCurrentInvoice.period_end * 1000).toLocaleDateString()
      : 'N/A';
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Payment Required</h1>
        <p className="mb-4">Your account has been restricted due to failed payment attempts. Please update your payment method to regain access.</p>
        <div className="mb-4 p-3 border border-gray-light bg-white rounded w-full max-w-md">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-secondary">Current Amount Due</span>
            <span className="font-bold text-lg">
              {parentCurrentInvoice
                ? formatCurrency(parentCurrentInvoice.amount_due, parentCurrentInvoice.currency)
                : '$0.00'}
            </span>
          </div>
          <div className="mb-2">
            <span className="text-sm text-gray-700">Next Billing Date: </span>
            <span className="text-sm text-gray-900">{nextBillingDate}</span>
          </div>
          {parentCurrentInvoice && parentCurrentInvoice.hosted_invoice_url ? (
            <a
              href={parentCurrentInvoice.hosted_invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded disabled:opacity-50 inline-block text-center w-full"
            >
              Pay Now
            </a>
          ) : (
            <button
              onClick={handlePay}
              disabled={loading}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded disabled:opacity-50 w-full"
            >
              {loading ? 'Paying...' : 'Pay Now'}
            </button>
          )}
          {error && <p className="text-red-600 mt-2">{error}</p>}
        </div>
        <a href="/dashboard/settings/payment" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 mb-4">Update Payment Method</a>
      </div>
    );
  }
  
  return (
    <>
      {parentRole === "coach" ? (
        <div className="space-y-8 animate-fade-in">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gradient mb-2">Coach Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400">Manage your clients and track their progress</p>
            </div>
            <Button
              variant="gradient"
              onClick={() =>
                window.open("https://kavabodybuilding.myshopify.com", "_blank")
              }
              className="whitespace-nowrap"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Shop KAVA
            </Button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Link to="/dashboard/clients" className="group" prefetch="intent">
              <Card variant="elevated" className="p-6 cursor-pointer animate-scale-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-soft">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">This month</p>
                    <p className="text-lg font-bold text-primary">+{recentClients.length}</p>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Total Clients</h3>
                <p className="text-4xl font-bold text-gradient">{totalClients}</p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/active" className="group" prefetch="intent">
              <Card variant="elevated" className="p-6 cursor-pointer animate-scale-in" style={{animationDelay: '0.1s'}}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-success-500 to-success-600 rounded-xl flex items-center justify-center shadow-soft">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Percentage</p>
                    <p className="text-lg font-bold text-success-600">{totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0}%</p>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Active Clients</h3>
                <p className="text-4xl font-bold text-success-600">{activeClients}</p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/inactive" className="group" prefetch="intent">
              <Card variant="elevated" className="p-6 cursor-pointer animate-scale-in" style={{animationDelay: '0.2s'}}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-error-500 to-error-600 rounded-xl flex items-center justify-center shadow-soft">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Percentage</p>
                    <p className="text-lg font-bold text-error-600">{totalClients > 0 ? Math.round((inactiveClients / totalClients) * 100) : 0}%</p>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Inactive Clients</h3>
                <p className="text-4xl font-bold text-error-600">{inactiveClients}</p>
              </Card>
            </Link>

            <Link to="/dashboard/clients/compliance" className="group" prefetch="intent">
              <Card variant="elevated" className="p-6 cursor-pointer animate-scale-in" style={{animationDelay: '0.3s'}}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-warning-500 to-warning-600 rounded-xl flex items-center justify-center shadow-soft">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Change</p>
                    <p className={`text-lg font-bold ${percentChange > 0 ? 'text-success-600' : percentChange < 0 ? 'text-error-600' : 'text-gray-600'}`}>
                      {percentChange > 0 && "+"}{percentChange}%
                    </p>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2 text-secondary dark:text-alabaster">
                  <Tooltip content="Overall client compliance shows workout adherence only. Rest day compliance, meals, and supplements are tracked separately. Click to see detailed breakdown of all compliance metrics.">
                    <span className="flex items-center gap-1">
                      Client Compliance
                      <svg className="w-4 h-4 text-info-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </Tooltip>
                </h3>
                <p className="text-4xl font-bold text-gradient">{compliance}%</p>
              </Card>
            </Link>
          </div>

          {/* Recent Clients and Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Clients */}
            <Card variant="elevated" className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-xl text-secondary dark:text-alabaster">Recent Clients</h3>
              </div>
              <div className="space-y-4">
                {nonCriticalLoading ? (
                  <SkeletonCard lines={4} />
                ) : recentClients.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">No new clients in the last month.</p>
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
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary-light/20 rounded-xl flex items-center justify-center">
                            <span className="text-primary font-semibold text-sm">{client.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-secondary dark:text-alabaster">{client.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Joined {new Date(client.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold text-primary">{percent}%</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Recent Activity */}
            <Card variant="elevated" className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-info-500 to-info-600 rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="font-semibold text-xl text-secondary dark:text-alabaster">Recent Activity</h3>
              </div>
              <div className="space-y-4">
                {nonCriticalLoading ? (
                  <SkeletonCard lines={4} />
                ) : activity.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">No activity yet today.</p>
                  </div>
                ) : (
                  <>
                    {activity.map((activity: Activity) => (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                        <div>
                          <p className="font-medium">{activity.clientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {activity.action}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dayjs(activity.time).format('h:mm A')}
                          </p>
                        </div>
                      </div>
                    ))}
                    {activityHasMore && (
                      <div className="flex justify-center mt-4">
                        <Button variant="outline" onClick={handleLoadMoreActivity} disabled={activityLoading || activityFetcher.state !== "idle"}>
                          {activityLoading || activityFetcher.state !== "idle" ? "Loading..." : "Load More"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gradient mb-2">Your Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400">Track your progress and stay on top of your fitness journey</p>
            </div>
            <Button
              variant="gradient"
              onClick={() =>
                window.open("https://kavabodybuilding.myshopify.com", "_blank")
              }
              className="whitespace-nowrap"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Shop KAVA
            </Button>
          </div>

          {/* Client Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <Card variant="elevated" className="p-6 animate-scale-in">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Last 7 days</p>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Workout Compliance</h3>
              <p className="text-3xl font-bold text-gradient">
                {typeof clientData?.workoutCompliance === "number" && !isNaN(clientData.workoutCompliance)
                  ? `${clientData.workoutCompliance}%`
                  : "-%"}
              </p>
            </Card>

            <Card variant="elevated" className="p-6 animate-scale-in" style={{animationDelay: '0.1s'}}>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-info-500 to-info-600 rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Last 7 days</p>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Rest Day Compliance</h3>
              <p className="text-3xl font-bold text-info-600">
                {typeof clientData?.restDayCompliance === "number" && !isNaN(clientData.restDayCompliance)
                  ? `${clientData.restDayCompliance}%`
                  : "-%"}
              </p>
            </Card>

            <Card variant="elevated" className="p-6 animate-scale-in" style={{animationDelay: '0.2s'}}>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-success-500 to-success-600 rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Last 7 days</p>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Meal Compliance</h3>
              <p className="text-3xl font-bold text-success-600">
                {typeof clientData?.mealCompliance === "number" && !isNaN(clientData.mealCompliance)
                  ? `${clientData.mealCompliance}%`
                  : "-%"}
              </p>
            </Card>

            <Card variant="elevated" className="p-6 animate-scale-in" style={{animationDelay: '0.3s'}}>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-warning-500 to-warning-600 rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Last 7 days</p>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Supplement Compliance</h3>
              <p className="text-3xl font-bold text-warning-600">
                {typeof clientData?.supplementCompliance === "number" && !isNaN(clientData.supplementCompliance)
                  ? `${clientData.supplementCompliance}%`
                  : "-%"}
              </p>
            </Card>

            <Card variant="elevated" className="p-6 animate-scale-in" style={{animationDelay: '0.4s'}}>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-xl flex items-center justify-center shadow-soft">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Since sign up</p>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2 text-secondary dark:text-alabaster">Weight Change</h3>
              <p className="text-3xl font-bold text-gradient">
                {typeof weightChange === "number" && !isNaN(weightChange)
                  ? `${weightChange > 0 ? "+" : ""}${weightChange} lbs`
                  : "- lbs"}
              </p>
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
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 shadow p-6 space-y-6">
                {!isHydrated ? (
                  <div className="text-gray-500 dark:text-gray-400">Loading meals...</div>
                ) : (!clientData?.meals || clientData.meals.length === 0) ? (
                  <div className="text-gray-500 dark:text-gray-400">No meals planned for today.</div>
                ) : (() => {
                    // Create meal key function to match the one used in meals page
                    const createMealKey = (meal: { id?: string | number; name: string; time: string }) => {
                      return `${meal.id}-${meal.name}-${meal.time.slice(0,5)}`;
                    };
                    // Use checkedMeals from MealCompletionContext for instant UI
                    const checkedMealKeys = checkedMeals ?? [];
                    const nextMeal = (clientData.meals ?? []).find((meal) => {
                      const mealKey = createMealKey(meal);
                      const isChecked = checkedMealKeys.includes(mealKey);
                      return !isChecked;
                    });
                    if (!nextMeal) {
                      return <div className="text-green-600 dark:text-green-400 font-semibold">All meals completed for today!</div>;
                    }
                    return (
                      <div className="rounded-lg bg-white dark:bg-gray-700 shadow-sm p-5">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-xl font-semibold text-secondary dark:text-alabaster">{nextMeal.name}</div>
                            <div className="text-gray-500 dark:text-gray-400">{nextMeal.time.slice(0, 5)}</div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-lg text-secondary dark:text-alabaster">{nextMeal.calories} cal</span>
                            <div className="flex gap-2 mt-1">
                              <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full px-2 py-0.5 text-xs font-medium">P: {nextMeal.protein}g</span>
                              <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full px-2 py-0.5 text-xs font-medium">C: {nextMeal.carbs}g</span>
                              <span className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full px-2 py-0.5 text-xs font-medium">F: {nextMeal.fat}g</span>
                            </div>
                          </div>
                        </div>
                        <ul className="mt-3 pl-4 border-l-2 border-gray-100 dark:border-gray-600 space-y-1">
                          {nextMeal.foods.map(food => (
                            <li key={food.id} className="text-gray-700 dark:text-gray-300">
                              <span className="font-medium">{food.name}</span> ({food.portion}) – 
                              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
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
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 shadow p-6 space-y-6 max-h-96 overflow-y-auto">
                {clientData?.todaysWorkoutCompletion ? (
                  // Show today's completed workout/rest day
                  <div className="text-center py-6">
                    <div className="text-green-600 dark:text-green-400 mb-4">
                      <div className="font-semibold text-lg mb-2">✅ Completed Today</div>
                      <div className="text-xl font-bold">
                        {clientData.todaysWorkoutCompletion.isRestDay ? "Rest Day" : clientData.todaysWorkoutCompletion.workoutName}
                      </div>
                      {clientData.todaysWorkoutCompletion.isRestDay && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">Take time to recover and recharge</div>
                      )}
                    </div>
                  </div>
                ) : clientData?.isFlexibleSchedule ? (
                  <div className="text-center py-8">
                    <div className="text-gray-600 dark:text-gray-400 mb-4">
                      <div className="font-semibold text-lg mb-2">Flexible Schedule Active</div>
                      <div className="text-sm">Head to Workouts and pick your workout for today!</div>
                    </div>
                    <Link 
                      to="/dashboard/workouts" 
                      className="inline-block px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors"
                    >
                      Choose Today's Workout
                    </Link>
                  </div>
                ) : clientData?.workouts?.length === 0 && clientData?.planName && clientData?.isRestDay ? (
                  <div className="text-gray-500 dark:text-gray-400 text-center">
                    <div className="font-semibold mb-1">Workout - {dayjs().tz('America/Denver').format('dddd')}</div>
                    <div>Today is a Rest Day</div>
                  </div>
                ) : clientData?.workouts?.length === 0 ? (
                  <div className="text-gray-500 dark:text-gray-400">No workouts planned for today.</div>
                ) : (
                  <div className="space-y-6">
                    {(clientData?.workouts ?? []).map((workout) => (
                      <div key={workout.id} className="rounded-lg bg-white dark:bg-gray-700 shadow-sm p-5">
                        <div className="text-xl font-semibold mb-2 text-secondary dark:text-alabaster">{workout.name}</div>
                        <div className="space-y-4">
                          {workout.groups?.map(group => (
                            <div key={group.type}>
                              <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full px-3 py-1 text-xs font-medium mb-2 inline-block">{group.type}</span>
                              <ul className="mt-2 pl-4 border-l-2 border-gray-100 dark:border-gray-600 space-y-2">
                                {group.exercises.map((exercise) => {
                                  const setsCount = exercise.sets.length;
                                  const reps = setsCount > 0 ? exercise.sets[0].reps : "-";
                                  return (
                                    <li key={exercise.id} className="text-gray-700 dark:text-gray-300">
                                      <span className="font-medium">{exercise.name}</span>
                                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
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
