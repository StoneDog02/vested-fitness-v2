import { useLoaderData } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import React, { useEffect, useState, useRef } from "react";
import Card from "~/components/ui/Card";
import CreateMealPlanModal from "~/components/coach/CreateMealPlanModal";
import ViewMealPlanLibraryModal from "~/components/coach/ViewMealPlanLibraryModal";
import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  PencilIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

// Helper function to determine activation status for coaches
const getActivationStatus = (plan: { isActive: boolean; activatedAt?: string }) => {
  if (!plan.isActive) return null;
  
  if (!plan.activatedAt) return "Active"; // Legacy plans without activation date
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const activatedDateStr = plan.activatedAt.slice(0, 10);
  
  if (activatedDateStr < todayStr) {
    return "Active"; // Activated before today
  } else if (activatedDateStr === todayStr) {
    return "Will Activate Tomorrow"; // Activated today
  } else {
    return "Scheduled"; // Activated in the future (edge case)
  }
};

// In-memory cache for client meal plans (expires after 30s)
const clientMealsCache: Record<string, { data: any; expires: number }> = {};

export const loader = async ({
  params,
  request,
}: {
  params: { clientId: string };
  request: Request;
}) => {
  const clientIdParam = params.clientId;
  // Check cache (per client)
  if (clientIdParam && clientMealsCache[clientIdParam] && clientMealsCache[clientIdParam].expires > Date.now()) {
    return json(clientMealsCache[clientIdParam].data);
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Try to find client by slug first, then by id
  let client: { id: string; name: string } | null = null;
  const [initialClientResult, clientByIdResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, name")
      .eq("slug", clientIdParam)
      .single(),
    supabase
      .from("users")
      .select("id, name")
      .eq("id", clientIdParam)
      .single(),
  ]);
  client = initialClientResult.data || clientByIdResult.data;
  if (!client)
    return json({
      mealPlans: [],
      libraryPlans: [],
      complianceData: [0, 0, 0, 0, 0, 0, 0],
      client: null,
    });

  // Get week start from query param, default to current week
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam);
    weekStart.setHours(0, 0, 0, 0);
  } else {
    weekStart = new Date();
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Pagination for meal plans and library plans
  const mealPlansPage = parseInt(url.searchParams.get("mealPlansPage") || "1", 10);
  const mealPlansPageSize = parseInt(url.searchParams.get("mealPlansPageSize") || "10", 10);
  const mealPlansOffset = (mealPlansPage - 1) * mealPlansPageSize;
  const libraryPlansPage = parseInt(url.searchParams.get("libraryPlansPage") || "1", 10);
  const libraryPlansPageSize = parseInt(url.searchParams.get("libraryPlansPageSize") || "10", 10);
  const libraryPlansOffset = (libraryPlansPage - 1) * libraryPlansPageSize;

  // Parallel fetch paginated plans
  const [mealPlansRaw, libraryPlansRaw, mealPlansCountRaw, libraryPlansCountRaw] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, title, description, is_active, created_at, activated_at, deactivated_at", { count: "exact" })
      .eq("user_id", client.id)
      .eq("is_template", false)
      .order("created_at", { ascending: false })
      .range(mealPlansOffset, mealPlansOffset + mealPlansPageSize - 1),
    supabase
      .from("meal_plans")
      .select("id, title, description, is_active, created_at, activated_at, deactivated_at", { count: "exact" })
      .eq("is_template", true)
      .order("created_at", { ascending: false })
      .range(libraryPlansOffset, libraryPlansOffset + libraryPlansPageSize - 1),
    supabase
      .from("meal_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", client.id)
      .eq("is_template", false),
    supabase
      .from("meal_plans")
      .select("id", { count: "exact", head: true })
      .eq("is_template", true),
  ]);

  // Collect all plan ids for this page
  const mealPlanIds = (mealPlansRaw.data?.map((p: any) => p.id) || []);
  const libraryPlanIds = (libraryPlansRaw.data?.map((p: any) => p.id) || []);

  // Batch fetch all meals for just these plans
  const { data: allMealsRaw } = await supabase
    .from("meals")
    .select("id, name, time, sequence_order, meal_plan_id")
    .in("meal_plan_id", [...mealPlanIds, ...libraryPlanIds].length > 0 ? [...mealPlanIds, ...libraryPlanIds] : [""])
    .order("sequence_order", { ascending: true });

  // Batch fetch all foods for just these meals
  const allMealIds = (allMealsRaw || []).map((m: any) => m.id);
  const { data: allFoodsRaw } = await supabase
    .from("foods")
    .select("name, portion, calories, protein, carbs, fat, meal_id")
    .in("meal_id", allMealIds.length > 0 ? allMealIds : [""]);

  // Group foods by meal
  const foodsByMeal: Record<string, any[]> = {};
  (allFoodsRaw || []).forEach((food: any) => {
    if (!foodsByMeal[food.meal_id]) foodsByMeal[food.meal_id] = [];
    foodsByMeal[food.meal_id].push(food);
  });

  // Group meals by plan
  const mealsByPlan: Record<string, any[]> = {};
  (allMealsRaw || []).forEach((meal: any) => {
    if (!mealsByPlan[meal.meal_plan_id]) mealsByPlan[meal.meal_plan_id] = [];
    mealsByPlan[meal.meal_plan_id].push({ ...meal, foods: foodsByMeal[meal.id] || [] });
  });

  // Attach meals to plans
  const mealPlans = (mealPlansRaw.data || []).map((plan: any) => ({
    id: plan.id,
    title: plan.title,
    description: plan.description,
    createdAt: plan.created_at,
    isActive: plan.is_active,
    activatedAt: plan.activated_at,
    deactivatedAt: plan.deactivated_at,
    meals: (mealsByPlan[plan.id] || []).filter((meal) => meal.foods && meal.foods.length > 0),
  }));
  const libraryPlans = (libraryPlansRaw.data || []).map((plan: any) => ({
    id: plan.id,
    title: plan.title,
    description: plan.description,
    createdAt: plan.created_at,
    isActive: plan.is_active,
    activatedAt: plan.activated_at,
    deactivatedAt: plan.deactivated_at,
    meals: (mealsByPlan[plan.id] || []).filter((meal) => meal.foods && meal.foods.length > 0),
  }));

  // Pagination info
  const mealPlansTotal = mealPlansCountRaw.count || 0;
  const mealPlansHasMore = mealPlansOffset + mealPlans.length < mealPlansTotal;
  const libraryPlansTotal = libraryPlansCountRaw.count || 0;
  const libraryPlansHasMore = libraryPlansOffset + libraryPlans.length < libraryPlansTotal;

  // Fetch all meal completions for this user for the week
  const { data: completionsRaw } = await supabase
    .from("meal_completions")
    .select("meal_id, completed_at")
    .eq("user_id", client.id)
    .gte("completed_at", weekStart.toISOString())
    .lt("completed_at", weekEnd.toISOString());

  // For each day in the week, find the plan that was active on that day
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    day.setHours(0, 0, 0, 0);
    // Find the plan active on this day
    const plan = mealPlans.find((p) => {
      const activated = p.activatedAt ? new Date(p.activatedAt) : null;
      const deactivated = p.deactivatedAt ? new Date(p.deactivatedAt) : null;
      const dayStr = day.toISOString().slice(0, 10);
      const activatedStr = activated ? activated.toISOString().slice(0, 10) : null;
      return (
        activated && activatedStr && activatedStr <= dayStr && (!deactivated || deactivated > day)
      );
    });
    if (!plan) {
      complianceData.push(0);
      continue;
    }
    // Meals for this plan
    const meals = plan.meals;
    // Completions for this day and these meals
    const mealIds = new Set(meals.map((m) => m.id));
    const dayStr = day.toISOString().slice(0, 10); // Get YYYY-MM-DD format
    const completions = (completionsRaw || []).filter((c) => {
      const completedDateStr = c.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
      return completedDateStr === dayStr && mealIds.has(c.meal_id);
    });
    const percent = meals.length > 0 ? completions.length / meals.length : 0;
    complianceData.push(percent);
  }

  const result = {
    mealPlans,
    libraryPlans,
    mealPlansHasMore,
    mealPlansTotal,
    mealPlansPage,
    mealPlansPageSize,
    libraryPlansHasMore,
    libraryPlansTotal,
    libraryPlansPage,
    libraryPlansPageSize,
    complianceData,
    client,
  };
  // Cache result
  if (clientIdParam) {
    clientMealsCache[clientIdParam] = { data: result, expires: Date.now() + 30_000 };
  }
  return json(result);
};

export const meta: MetaFunction = () => {
  return [
    { title: "Client Meals | Kava Training" },
    { name: "description", content: "Manage client meal plans" },
  ];
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Get coachId from auth cookie
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
  if (authId) {
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
  }

  // Find client
  const { data: initialClient, error } = await supabase
    .from("users")
    .select("id")
    .eq("slug", params.clientId)
    .single();
  let client = initialClient;
  if (error || !client) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id")
      .eq("id", params.clientId)
      .single();
    client = clientById;
  }
  if (!client) return json({ error: "Client not found" }, { status: 400 });

  if (intent === "delete") {
    const planId = formData.get("planId") as string;
    // Delete foods, meals, then meal plan
    const { data: meals } = await supabase
      .from("meals")
      .select("id")
      .eq("meal_plan_id", planId);
    if (meals) {
      for (const meal of meals) {
        await supabase.from("foods").delete().eq("meal_id", meal.id);
      }
      await supabase.from("meals").delete().eq("meal_plan_id", planId);
    }
    await supabase.from("meal_plans").delete().eq("id", planId);
    return redirect(request.url);
  }

  if (intent === "setActive") {
    const planId = formData.get("planId") as string;
    const now = new Date().toISOString();
    // Set deactivated_at for all other active plans
    await supabase
      .from("meal_plans")
      .update({ is_active: false, deactivated_at: now })
      .eq("user_id", client.id)
      .eq("is_active", true)
      .neq("id", planId);
    // Set selected plan active and set activated_at if not already set
    await supabase
      .from("meal_plans")
      .update({ is_active: true, activated_at: now, deactivated_at: null })
      .eq("id", planId)
      .is("activated_at", null);
    // If already had activated_at, just set is_active true and deactivated_at null
    await supabase
      .from("meal_plans")
      .update({ is_active: true, deactivated_at: null })
      .eq("id", planId)
      .not("activated_at", "is", null);
    return redirect(request.url);
  }

  if (intent === "useTemplate") {
    const templateId = formData.get("templateId") as string;
    
    // Get template plan
    const { data: template } = await supabase
      .from("meal_plans")
      .select("title, description")
      .eq("id", templateId)
      .single();
    
    if (!template) {
      return json({ error: "Template not found" }, { status: 400 });
    }

    // Create new plan from template
    const { data: newPlan, error: planError } = await supabase
      .from("meal_plans")
      .insert({
        user_id: client.id,
        title: template.title,
        description: template.description,
        is_active: false,
        is_template: false,
        template_id: templateId
      })
      .select()
      .single();

    if (planError || !newPlan) {
      return json({ error: "Failed to create plan from template" }, { status: 500 });
    }

    // Get template meals
    const { data: templateMeals } = await supabase
      .from("meals")
      .select("id, name, time, sequence_order")
      .eq("meal_plan_id", templateId)
      .order("sequence_order", { ascending: true });

    // Copy meals and foods
    if (templateMeals) {
      for (const meal of templateMeals) {
        // Create new meal
        const { data: newMeal } = await supabase
          .from("meals")
          .insert({
            meal_plan_id: newPlan.id,
            name: meal.name,
            time: meal.time,
            sequence_order: meal.sequence_order
          })
          .select()
          .single();

        if (newMeal) {
          // Get and copy foods
          const { data: foods } = await supabase
            .from("foods")
            .select("name, portion, calories, protein, carbs, fat")
            .eq("meal_id", meal.id);

          if (foods) {
            for (const food of foods) {
              await supabase.from("foods").insert({
                meal_id: newMeal.id,
                name: food.name,
                portion: food.portion,
                calories: food.calories,
                protein: food.protein,
                carbs: food.carbs,
                fat: food.fat
              });
            }
          }
        }
      }
    }

    return redirect(request.url);
  }

  // Create or edit
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const mealsJson = formData.get("meals") as string;
  const meals = JSON.parse(mealsJson);
  const planId = formData.get("planId") as string | null;

  // First, create or update the template version
  let templatePlan;
  if (!planId) {
    // Create new template plan
    const { data: newTemplate, error: templateError } = await supabase
      .from("meal_plans")
      .insert({
        user_id: coachId,
        title,
        description,
        is_active: false,
        is_template: true
      })
      .select()
      .single();

    if (templateError || !newTemplate) {
      return json({ error: "Failed to create template" }, { status: 500 });
    }
    templatePlan = newTemplate;

    // Create client version that references the template
    const { data: newPlan, error: planError } = await supabase
      .from("meal_plans")
      .insert({
        user_id: client.id,
        title,
        description,
        is_active: false,
        is_template: false,
        template_id: templatePlan.id
      })
      .select()
      .single();

    if (planError || !newPlan) {
      return json({ error: "Failed to create plan" }, { status: 500 });
    }

    // Insert meals and foods for both plans
    for (const [i, meal] of meals.entries()) {
      // Create meal for template
      const { data: templateMeal } = await supabase
        .from("meals")
        .insert({
          meal_plan_id: templatePlan.id,
          name: meal.name,
          time: meal.time,
          sequence_order: i,
        })
        .select()
        .single();

      // Create meal for client plan
      const { data: clientMeal } = await supabase
        .from("meals")
        .insert({
          meal_plan_id: newPlan.id,
          name: meal.name,
          time: meal.time,
          sequence_order: i,
        })
        .select()
        .single();

      if (templateMeal && clientMeal) {
        for (const food of meal.foods) {
          // Add food to template meal
          await supabase.from("foods").insert({
            meal_id: templateMeal.id,
            name: food.name,
            portion: food.portion,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
          });

          // Add food to client meal
          await supabase.from("foods").insert({
            meal_id: clientMeal.id,
            name: food.name,
            portion: food.portion,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
          });
        }
      }
    }
  } else {
    // Update existing plan
    const { data: updatedPlan } = await supabase
      .from("meal_plans")
      .update({ title, description })
      .eq("id", planId)
      .select()
      .single();

    if (updatedPlan) {
      // Delete old meals/foods
      const { data: oldMeals } = await supabase
        .from("meals")
        .select("id")
        .eq("meal_plan_id", planId);
      if (oldMeals) {
        for (const meal of oldMeals) {
          await supabase.from("foods").delete().eq("meal_id", meal.id);
        }
        await supabase.from("meals").delete().eq("meal_plan_id", planId);
      }

      // Insert new meals and foods
      for (const [i, meal] of meals.entries()) {
        const { data: mealRow } = await supabase
          .from("meals")
          .insert({
            meal_plan_id: planId,
            name: meal.name,
            time: meal.time,
            sequence_order: i,
          })
          .select()
          .single();

        if (mealRow) {
          for (const food of meal.foods) {
            await supabase.from("foods").insert({
              meal_id: mealRow.id,
              name: food.name,
              portion: food.portion,
              calories: food.calories,
              protein: food.protein,
              carbs: food.carbs,
              fat: food.fat,
            });
          }
        }
      }
    }
  }

  return redirect(request.url);
};

export type Food = {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Meal = {
  id: string | number;
  name: string;
  time: string;
  foods: Food[];
};

export type MealPlan = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  isActive: boolean;
  meals: Meal[];
  activatedAt?: string;
  deactivatedAt?: string;
};

export default function ClientMeals() {
  const loaderData = useLoaderData<{
    mealPlans: MealPlan[];
    libraryPlans: MealPlan[];
    client: { name: string, id: string } | null;
    complianceData: number[];
    mealPlansHasMore?: boolean;
  }>();
  const { mealPlans, libraryPlans, client, complianceData: initialComplianceData, mealPlansHasMore: loaderMealPlansHasMore } = loaderData;
  const fetcher = useFetcher();
  const complianceFetcher = useFetcher<{ complianceData: number[] }>();

  // Sort meal plans by createdAt descending
  const activeMealPlan = mealPlans.find((plan) => plan.isActive);
  const inactiveMealPlans = mealPlans
    .filter((plan) => !plan.isActive)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedMealPlans = [
    ...(activeMealPlan ? [activeMealPlan] : []),
    ...inactiveMealPlans,
  ];

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = React.useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = React.useState(false);
  type MealPlanType = typeof mealPlans extends (infer U)[] ? U : never;
  const [selectedPlan, setSelectedPlan] = React.useState<MealPlanType | null>(
    null
  );

  // Compliance calendar state
  const [calendarStart, setCalendarStart] = React.useState(() => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  });
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarStart.getDate() + 6);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // New: Real-time compliance data
  const [compliancePercentages, setCompliancePercentages] = useState<number[]>(initialComplianceData || [0,0,0,0,0,0,0]);

  // Update compliance data when fetcher returns
  useEffect(() => {
    if (complianceFetcher.data?.complianceData) {
      setCompliancePercentages(complianceFetcher.data.complianceData);
    }
  }, [complianceFetcher.data]);

  // Update when initial loader data changes
  useEffect(() => {
    if (initialComplianceData) {
      setCompliancePercentages(initialComplianceData);
    }
  }, [initialComplianceData]);

  // Bright color scaling from theme green to red with smooth transitions
  function getBarColor(percent: number) {
    const percentage = percent * 100; // Convert to percentage
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

  function formatDateShort(date: Date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  const [historyMealPlans, setHistoryMealPlans] = React.useState(mealPlans);
  const [mealPlansPage, setMealPlansPage] = React.useState(1);
  const [hasMoreMealPlans, setHasMoreMealPlans] = React.useState(loaderMealPlansHasMore ?? true);
  const historyModalRef = useRef<HTMLDivElement>(null);
  const historyFetcher = useFetcher();

  // Infinite scroll for history modal
  React.useEffect(() => {
    if (!isHistoryModalOpen) return;
    const handleScroll = () => {
      if (!historyModalRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = historyModalRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 40 && hasMoreMealPlans && historyFetcher.state === "idle") {
        const nextPage = mealPlansPage + 1;
        setMealPlansPage(nextPage);
        historyFetcher.load(`${window.location.pathname}?mealPlansPage=${nextPage}`);
      }
    };
    const el = historyModalRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => {
        el.removeEventListener("scroll", handleScroll);
      };
    }
    return undefined;
  }, [isHistoryModalOpen, hasMoreMealPlans, mealPlansPage, historyFetcher.state]);

  // Append new plans when fetcher loads more
  React.useEffect(() => {
    if (historyFetcher.data && historyFetcher.state === "idle") {
      const { mealPlans: newPlans = [], mealPlansHasMore = false } = historyFetcher.data as any;
      setHistoryMealPlans((prev) => [...prev, ...newPlans]);
      setHasMoreMealPlans(mealPlansHasMore);
    }
  }, [historyFetcher.data, historyFetcher.state]);

  // Reset on open
  React.useEffect(() => {
    if (isHistoryModalOpen) {
      setHistoryMealPlans(mealPlans);
      setMealPlansPage(1);
      setHasMoreMealPlans(loaderMealPlansHasMore ?? true);
    }
  }, [isHistoryModalOpen, mealPlans, loaderMealPlansHasMore]);

  return (
    <ClientDetailLayout>
      <div className="h-full p-4 sm:p-6 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4">
            {client ? `${client.name}'s Meals` : "Client's Meals"}
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Left: Meal Plan History */}
            <Card
              title="Meal Plan History"
              action={
                <div className="flex flex-row gap-x-2 items-center">
                  <button
                    className="text-primary text-xs font-medium hover:underline px-1"
                    onClick={() => setIsLibraryModalOpen(true)}
                    style={{ background: "none", border: "none" }}
                  >
                    Library
                  </button>
                  <button
                    className="text-primary text-xs font-medium hover:underline px-1"
                    onClick={() => setIsHistoryModalOpen(true)}
                    style={{ background: "none", border: "none" }}
                  >
                    History
                  </button>
                  <button
                    className="bg-primary text-white px-4 py-2 rounded text-sm"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    + Create Plan
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {historyMealPlans.length === 0 ? (
                  <div className="text-gray-500">No meal plans found.</div>
                ) : (
                  historyMealPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`p-4 border rounded-lg ${
                        plan.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-secondary dark:text-alabaster">
                            {plan.title}
                          </h3>
                          {plan.isActive ? (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              getActivationStatus(plan) === "Will Activate Tomorrow" 
                                ? "bg-orange-500 text-white" 
                                : "bg-primary text-white"
                            }`}>
                              {getActivationStatus(plan)}
                            </span>
                          ) : (
                            <fetcher.Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="setActive"
                              />
                              <input
                                type="hidden"
                                name="planId"
                                value={plan.id}
                              />
                              <button
                                type="submit"
                                className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                                title="Set Active"
                              >
                                Set Active
                              </button>
                            </fetcher.Form>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {plan.description}
                        </p>
                        <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                          Created:{" "}
                          {new Date(plan.createdAt).toLocaleDateString(
                            undefined,
                            {
                              month: "2-digit",
                              day: "2-digit",
                              year: "numeric",
                            }
                          )}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex gap-2">
                            <button
                              className="text-green-600 hover:text-green-700 text-sm hover:underline flex items-center gap-1"
                              onClick={() => {
                                setSelectedPlan({
                                  id: plan.id,
                                  title: plan.title,
                                  description: plan.description,
                                  createdAt: plan.createdAt,
                                  isActive: plan.isActive,
                                  meals: plan.meals,
                                });
                                setIsCreateModalOpen(true);
                              }}
                            >
                              <PencilIcon className="h-4 w-4" /> Edit
                            </button>
                          </div>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="delete" />
                            <input
                              type="hidden"
                              name="planId"
                              value={plan.id}
                            />
                            <button
                              type="submit"
                              className="text-red-500 hover:text-red-600 flex items-center gap-1"
                              title="Delete"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </fetcher.Form>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {hasMoreMealPlans && historyFetcher.state === "loading" && (
                  <div className="flex justify-center py-4">
                    <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
            </Card>
            {/* Right: Active Meal Plan & Calendar/Compliance */}
            <div className="space-y-6">
              {/* Active Meal Plan */}
              <Card title="Active Meal Plan">
                {activeMealPlan ? (
                  <div>
                    <h4 className="font-semibold">{activeMealPlan.title}</h4>
                    <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                      {activeMealPlan.description}
                    </p>
                    <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                      Created:{" "}
                      {new Date(activeMealPlan.createdAt).toLocaleDateString(
                        undefined,
                        { month: "2-digit", day: "2-digit", year: "numeric" }
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-gray-dark dark:text-gray-light mb-4">
                      No active meal plan
                    </p>
                    <button
                      className="bg-primary text-white px-4 py-2 rounded text-sm"
                      onClick={() => setIsCreateModalOpen(true)}
                    >
                      Create Meal Plan
                    </button>
                  </div>
                )}
              </Card>
              {/* Meal Calendar/Compliance */}
              <Card>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">
                    Meal Compliance Calendar
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <button
                      className="p-1 rounded hover:bg-gray-100"
                      onClick={() => {
                        const prev = new Date(calendarStart);
                        prev.setDate(prev.getDate() - 7);
                        setCalendarStart(prev);
                        
                        // Use fetcher for fast data loading
                        const params = new URLSearchParams();
                        params.set("weekStart", prev.toISOString());
                        params.set("clientId", client?.id || "");
                        complianceFetcher.load(`/api/get-meal-compliance-week?${params.toString()}`);
                      }}
                      aria-label="Previous week"
                      type="button"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span>
                      Week of {formatDateShort(calendarStart)} -{" "}
                      {formatDateShort(calendarEnd)}
                    </span>
                    <button
                      className="p-1 rounded hover:bg-gray-100"
                      onClick={() => {
                        const next = new Date(calendarStart);
                        next.setDate(next.getDate() + 7);
                        setCalendarStart(next);
                        
                        // Use fetcher for fast data loading
                        const params = new URLSearchParams();
                        params.set("weekStart", next.toISOString());
                        params.set("clientId", client?.id || "");
                        complianceFetcher.load(`/api/get-meal-compliance-week?${params.toString()}`);
                      }}
                      aria-label="Next week"
                      type="button"
                    >
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {dayLabels.map((label, i) => {
                    // Determine if this is today or future/past
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const thisDate = new Date(calendarStart);
                    thisDate.setDate(calendarStart.getDate() + i);
                    thisDate.setHours(0, 0, 0, 0);
                    const isToday = thisDate.getTime() === today.getTime();
                    const isFuture = thisDate.getTime() > today.getTime();
                    
                    // Determine percentage for display
                    const percentage = Math.round((compliancePercentages[i] || 0) * 100);
                    let displayPercentage = percentage;
                    
                    // For pending days, show 0% in the bar but don't show percentage text
                    if (isFuture || (isToday && compliancePercentages[i] === 0)) {
                      displayPercentage = 0;
                    }
                    
                    return (
                      <div key={label} className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 w-10 text-left flex-shrink-0">
                          {label}
                        </span>
                        <div className="flex-1" />
                        <div className="flex items-center min-w-[120px] max-w-[200px] w-2/5">
                          <div className="relative flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute left-0 top-0 h-2 rounded-full"
                              style={{
                                width: `${displayPercentage}%`,
                                background: displayPercentage > 0 ? getBarColor(compliancePercentages[i] || 0) : 'transparent',
                                transition: "width 0.3s, background 0.3s",
                              }}
                            />
                          </div>
                          <span
                            className={`ml-4 text-xs font-medium text-right whitespace-nowrap ${
                              isToday && compliancePercentages[i] === 0 
                                ? 'bg-primary/10 dark:bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/20' 
                                : isFuture || (isToday && compliancePercentages[i] === 0)
                                ? 'text-gray-500 min-w-[60px]'
                                : 'min-w-[40px]'
                            }`}
                            style={{ 
                              color: !(isFuture || (isToday && compliancePercentages[i] === 0)) 
                                ? getBarColor(compliancePercentages[i] || 0)
                                : undefined
                            }}
                          >
                            {isFuture || (isToday && compliancePercentages[i] === 0) ? 'Pending' : `${percentage}%`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        </div>
        {/* Placeholder modals */}
        <CreateMealPlanModal
          isOpen={isCreateModalOpen}
          existingPlan={
            selectedPlan
              ? {
                  title: selectedPlan.title ?? "",
                  description: selectedPlan.description ?? "",
                  meals: (selectedPlan.meals ?? []).map(
                    (meal: Meal, idx: number) => ({
                      id: typeof meal.id === "number" ? meal.id : idx + 1,
                      name: meal.name ?? "",
                      time: meal.time ?? "",
                      foods: (meal.foods ?? []).map((food: Food) => ({
                        name: food.name ?? "",
                        portion: food.portion ?? "",
                        calories:
                          typeof food.calories === "number" ? food.calories : 0,
                        protein:
                          typeof food.protein === "number" ? food.protein : 0,
                        carbs: typeof food.carbs === "number" ? food.carbs : 0,
                        fat: typeof food.fat === "number" ? food.fat : 0,
                      })),
                    })
                  ),
                }
              : undefined
          }
          onClose={() => {
            setIsCreateModalOpen(false);
            setSelectedPlan(null);
          }}
          onSave={(data) => {
            const form = new FormData();
            form.append("title", data.title);
            form.append("description", data.description);
            form.append("meals", JSON.stringify(data.meals));
            if (selectedPlan) {
              form.append("intent", "edit");
              const planId = historyMealPlans.find(
                (p) =>
                  p.title === selectedPlan.title &&
                  p.description === selectedPlan.description
              )?.id || "";
              form.append("planId", planId);
            } else {
              form.append("intent", "create");
            }
            fetcher.submit(form, { method: "post" });
            setIsCreateModalOpen(false);
            setSelectedPlan(null);
          }}
        />
        {isHistoryModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-2xl w-full overflow-y-auto max-h-[90vh]" ref={historyModalRef}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Meal Plan History</h2>
                <button
                  className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={() => setIsHistoryModalOpen(false)}
                  aria-label="Close"
                  type="button"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                {historyMealPlans.length === 0 ? (
                  <div className="text-gray-500">No meal plans found.</div>
                ) : (
                  historyMealPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`p-4 border rounded-lg ${
                        plan.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-secondary dark:text-alabaster">
                            {plan.title}
                          </h3>
                          {plan.isActive ? (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              getActivationStatus(plan) === "Will Activate Tomorrow" 
                                ? "bg-orange-500 text-white" 
                                : "bg-primary text-white"
                            }`}>
                              {getActivationStatus(plan)}
                            </span>
                          ) : (
                            <fetcher.Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="setActive"
                              />
                              <input
                                type="hidden"
                                name="planId"
                                value={plan.id}
                              />
                              <button
                                type="submit"
                                className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                                title="Set Active"
                              >
                                Set Active
                              </button>
                            </fetcher.Form>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {plan.description}
                        </p>
                        <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                          Created:{" "}
                          {new Date(plan.createdAt).toLocaleDateString(
                            undefined,
                            {
                              month: "2-digit",
                              day: "2-digit",
                              year: "numeric",
                            }
                          )}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex gap-2">
                            <button
                              className="text-green-600 hover:text-green-700 text-sm hover:underline flex items-center gap-1"
                              onClick={() => {
                                setSelectedPlan({
                                  id: plan.id,
                                  title: plan.title,
                                  description: plan.description,
                                  createdAt: plan.createdAt,
                                  isActive: plan.isActive,
                                  meals: plan.meals,
                                });
                                setIsCreateModalOpen(true);
                              }}
                            >
                              <PencilIcon className="h-4 w-4" /> Edit
                            </button>
                          </div>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="delete" />
                            <input
                              type="hidden"
                              name="planId"
                              value={plan.id}
                            />
                            <button
                              type="submit"
                              className="text-red-500 hover:text-red-600 flex items-center gap-1"
                              title="Delete"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </fetcher.Form>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        <ViewMealPlanLibraryModal
          isOpen={isLibraryModalOpen}
          onClose={() => setIsLibraryModalOpen(false)}
          libraryPlans={libraryPlans}
        />
      </div>
    </ClientDetailLayout>
  );
}
