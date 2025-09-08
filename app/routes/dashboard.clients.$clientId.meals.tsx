import { useLoaderData, useRevalidator , useFetcher, useParams } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { json , ActionFunctionArgs, redirect } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import React, { useEffect, useState, useRef } from "react";
import Card from "~/components/ui/Card";
import CreateMealPlanModal from "~/components/coach/CreateMealPlanModal";
import ViewMealPlanLibraryModal, { type MealPlanLibrary } from "~/components/coach/ViewMealPlanLibraryModal";
import {
  PencilIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import NABadge from "../components/ui/NABadge";
import ActivationDateModal from "~/components/coach/ActivationDateModal";
import { extractAuthFromCookie, validateAndRefreshToken } from "~/lib/supabase";
import { useToast } from "~/context/ToastContext";

// Helper function to truncate meal plan descriptions
const truncateDescription = (description: string, maxLength: number = 50) => {
  if (!description || description.length <= maxLength) {
    return description;
  }
  return description.substring(0, maxLength) + "...";
};

// Helper function to determine activation status for coaches
const getActivationStatus = (plan: { isActive: boolean; activatedAt?: string }) => {
  if (!plan.isActive) return null;
  
  if (!plan.activatedAt) return "Active"; // Legacy plans without activation date
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const activatedDateStr = plan.activatedAt.slice(0, 10);
  
  if (activatedDateStr <= todayStr) {
    return "Active"; // Activated before today or today (immediate activation)
  } else {
    // Format the activation date and time for display
    const activationDate = new Date(plan.activatedAt);
    const formattedDate = activationDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = activationDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `Will Activate ${formattedDate} at ${formattedTime}`;
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
  let client: { id: string; name: string; created_at: string } | null = null;
  const [initialClientResult, clientByIdResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, created_at")
      .eq("slug", clientIdParam)
      .single(),
    supabase
      .from("users")
      .select("id, name, created_at")
      .eq("id", clientIdParam)
      .single(),
  ]);
  client = initialClientResult.data || clientByIdResult.data;
  if (!client) {
    const emptyData = {
      mealPlans: [],
      libraryPlans: [],
      complianceData: [0, 0, 0, 0, 0, 0, 0],
      client: null,
    };
    
    if (clientIdParam) {
      clientMealsCache[clientIdParam] = {
        data: emptyData,
        expires: Date.now() + 30000 // 30 seconds
      };
    }
    
    return json(emptyData);
  }

  // Get coachId from auth cookie
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
  
  let coachId = null;
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

  // Fetch paginated plans
  const [plansRaw, libraryPlansRaw, plansCountRaw, libraryPlansCountRaw, completionsRaw] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, title, description, is_active, created_at, activated_at, deactivated_at, is_template", { count: "exact" })
      .eq("user_id", client.id)
      .eq("is_template", false)
      .order("created_at", { ascending: false })
      .range(mealPlansOffset, mealPlansOffset + mealPlansPageSize - 1),
    supabase
      .from("meal_plans")
      .select("id, title, description, created_at", { count: "exact" })
      .eq("user_id", coachId)
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
      .eq("user_id", coachId)
      .eq("is_template", true),
    supabase
      .from("meal_completions")
      .select("completed_at, meal_id")
      .eq("user_id", client.id)
      .gte("completed_at", weekStart.toISOString().slice(0, 10))
      .lt("completed_at", weekEnd.toISOString().slice(0, 10)),
  ]);

  // Collect all plan ids for this page
  const mealPlanIds = (plansRaw?.data?.map((p: any) => p.id) || []);
  const libraryPlanIds = (libraryPlansRaw?.data?.map((p: any) => p.id) || []);

  // For meal plans, we need to get the meal data
  const mealPlans = await Promise.all(
    (plansRaw?.data || []).map(async (plan: any) => {
              // Get meals for this plan
        const { data: mealsRaw } = await supabase
          .from("meals")
          .select("id, name, time, sequence_order, meal_option")
          .eq("meal_plan_id", plan.id)
          .order("sequence_order", { ascending: true });

        if (mealsRaw && mealsRaw.length > 0) {
          // Batch fetch all foods for all meals in a single query
          const mealIds = mealsRaw.map(m => m.id);
          const { data: foods } = await supabase
            .from("foods")
            .select(`id, name, portion, calories, protein, carbs, fat, meal_id, food_library_id, food_option, sequence_order, food_library:food_library_id (calories, protein, carbs, fat)`)
            .in("meal_id", mealIds)
            .order("sequence_order", { ascending: true });

        // Process foods and map them to meals
        const foodsData = foods || [];
        
        const meals = mealsRaw.map(meal => {
          const mealFoods = foodsData.filter(f => f.meal_id === meal.id);
          
          return {
            id: meal.id,
            name: meal.name,
            time: meal.time,
            sequence_order: meal.sequence_order || 0,
            mealOption: meal.meal_option || 'A',
            foods: mealFoods.map(food => ({
              id: food.id,
              name: food.name,
              portion: food.portion,
              calories: food.calories || 0,
              protein: food.protein || 0,
              carbs: food.carbs || 0,
              fat: food.fat || 0,
              foodOption: food.food_option || 'A',
              sequence_order: 0 // Default since foods table doesn't have this
            }))
          };
        });

        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          isActive: plan.is_active,
          createdAt: plan.created_at,
          activatedAt: plan.activated_at,
          deactivatedAt: plan.deactivated_at,
          meals
        };
      } else {
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          isActive: plan.is_active,
          createdAt: plan.created_at,
          activatedAt: plan.activated_at,
          deactivatedAt: plan.deactivated_at,
          meals: []
        };
      }
    })
  );

  // Library plans are from meal_plans with is_template = true
  // Load full meal data for library plans too (needed for view functionality)
  const libraryPlans = await Promise.all(
    (libraryPlansRaw?.data || []).map(async (plan: any) => {
      // Get meals for this template plan
      const { data: mealsRaw } = await supabase
        .from("meals")
        .select("id, name, time, sequence_order, meal_option")
        .eq("meal_plan_id", plan.id)
        .order("sequence_order", { ascending: true });

      if (mealsRaw && mealsRaw.length > 0) {
          // Batch fetch all foods for all meals in a single query
          const mealIds = mealsRaw.map(m => m.id);
          const { data: foods } = await supabase
            .from("foods")
            .select(`id, name, portion, calories, protein, carbs, fat, meal_id, food_library_id, food_option, sequence_order, food_library:food_library_id (calories, protein, carbs, fat)`)
            .in("meal_id", mealIds)
            .order("sequence_order", { ascending: true });

        // Process foods and map them to meals
        const foodsData = foods || [];
        
        const meals = mealsRaw.map(meal => {
          const mealFoods = foodsData.filter(f => f.meal_id === meal.id);
          
          return {
            id: meal.id,
            name: meal.name,
            time: meal.time,
            sequence_order: meal.sequence_order || 0,
            meal_option: meal.meal_option || 'A',
            foods: mealFoods.map(food => ({
              id: food.id,
              name: food.name,
              portion: food.portion,
              calories: food.calories || 0,
              protein: food.protein || 0,
              carbs: food.carbs || 0,
              fat: food.fat || 0,
              food_option: food.food_option || 'A',
              sequence_order: 0 // Default since foods table doesn't have this
            }))
          };
        });

        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          createdAt: plan.created_at,
          isActive: false, // Library plans are not active
          meals
        };
      } else {
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          created_at: plan.created_at,
          is_template: true,
          meals: []
        };
      }
    })
  );



  // Calculate compliance data for the week
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);
    
    // Check if this day is before the user signed up
    if (client.created_at) {
      const signupDate = new Date(client.created_at);
      signupDate.setHours(0, 0, 0, 0);
      if (day < signupDate) {
        complianceData.push(-1); // N/A for days before signup
        continue;
      }
    }
    
    // Find the plan active on this day
    const activePlan = mealPlans.find((plan) => {
      if (!plan.isActive) return false;
      
      const activated = plan.activatedAt ? new Date(plan.activatedAt) : null;
      const deactivated = plan.deactivatedAt ? new Date(plan.deactivatedAt) : null;
      
      return activated && 
             activated.toISOString().slice(0, 10) <= dayStr && 
             (!deactivated || deactivated > day);
    });
    
    if (!activePlan) {
      complianceData.push(0);
      continue;
    }
    
    // Check if this is the day the plan was first activated
    const planActivated = activePlan.activatedAt ? new Date(activePlan.activatedAt) : null;
    const planActivatedStr = planActivated ? planActivated.toISOString().slice(0, 10) : null;
    const isActivationDay = planActivatedStr === dayStr;
    
    // Check if this is the first plan for this client (to handle immediate activation)
    const isFirstPlan = mealPlans.length === 1 || 
      mealPlans.every(p => p.id === activePlan.id || !p.activatedAt) ||
      mealPlans.every(p => p.id === activePlan.id || new Date(p.createdAt) > new Date(activePlan.createdAt));
    
    // Check if plan was created today (for immediate activation)
    const planCreated = new Date(activePlan.createdAt);
    const planCreatedStr = planCreated.toISOString().slice(0, 10);
    const isCreatedToday = planCreatedStr === dayStr;
    
    if (isActivationDay || (isFirstPlan && planActivatedStr === dayStr) || isCreatedToday) {
      complianceData.push(-1); // N/A for activation/creation day
      continue;
    }
    
    // Meals for this plan
    const meals = activePlan.meals;
    
    // Group meals by name and time to handle A/B options as single meals
    const mealGroups = meals.reduce((groups: Record<string, any[]>, meal: any) => {
      const key = `${meal.name}-${meal.time}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(meal);
      return groups;
    }, {});
    
    const uniqueMealGroups = Object.keys(mealGroups);
    const totalUniqueMeals = uniqueMealGroups.length;
    
    // Count completed unique meal groups
    const completedUniqueMealGroups = uniqueMealGroups.filter(groupKey => {
      const [mealName, mealTime] = groupKey.split('-');
      const groupMeals = meals.filter((m: any) => 
        m.name === mealName && m.time.startsWith(mealTime)
      );
      
      // Check if any meal in this group was completed
      const groupMealIds = new Set(groupMeals.map((m: any) => m.id));
      const groupCompletions = (completionsRaw?.data || []).filter((c: any) => {
        const completedDateStr = c.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
        const matches = completedDateStr === dayStr && groupMealIds.has(c.meal_id);
        
        return matches;
      });
      
      return groupCompletions.length > 0; // If any meal in the group was completed, the group is complete
    });
    
    const completedUniqueMeals = completedUniqueMealGroups.length;
    const percent = totalUniqueMeals > 0 ? completedUniqueMeals / totalUniqueMeals : 0;
    complianceData.push(percent);
  }

  // Assemble the final data structure
  const cacheData = {
    mealPlans,
    libraryPlans,
    complianceData,
    client: {
      id: client.id,
      name: client.name,
      created_at: client.created_at
    },
    pagination: {
      mealPlans: {
        page: mealPlansPage,
        pageSize: mealPlansPageSize,
        total: plansCountRaw.count || 0,
        totalPages: Math.ceil((plansCountRaw.count || 0) / mealPlansPageSize)
      },
      libraryPlans: {
        page: libraryPlansPage,
        pageSize: libraryPlansPageSize,
        total: libraryPlansCountRaw.count || 0,
        totalPages: Math.ceil((libraryPlansCountRaw.count || 0) / libraryPlansPageSize)
      }
    }
  };

  if (clientIdParam) {
    clientMealsCache[clientIdParam] = {
      data: cacheData,
      expires: Date.now() + 30000 // 30 seconds
    };
  }

  return json(cacheData, {
    headers: needsTokenRefresh && newTokens ? {
      "Set-Cookie": [
        `accessToken=${newTokens.accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
        `refreshToken=${newTokens.refreshToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      ].join(", ")
    } : {}
  });
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
  
  let coachId = null;
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
    
    // Check if this is a template (templates can only be deleted by the coach who created them)
    const { data: plan } = await supabase
      .from("meal_plans")
      .select("is_template, user_id")
      .eq("id", planId)
      .single();
    
    if (!plan) {
      return json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.is_template && plan.user_id !== coachId) {
      return json({ error: "Cannot delete templates created by other coaches" }, { status: 403 });
    }

    // Delete meals and foods first
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
    
    // Delete the meal plan
    await supabase.from("meal_plans").delete().eq("id", planId);
    
    // Clear cache to force fresh data
    if (params.clientId && clientMealsCache[params.clientId]) {
      delete clientMealsCache[params.clientId];
    }
    return redirect(request.url);
  }

  if (intent === "setActive") {
    const planId = formData.get("planId") as string;
    const activationDate = formData.get("activationDate") as string;
    
    // Set deactivated_at for all other active plans for this client
    await supabase
      .from("meal_plans")
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq("user_id", client.id)
      .eq("is_active", true)
      .eq("is_template", false) // Only affect client plans, not templates
      .neq("id", planId);
    
    // Set selected plan active with the chosen activation date
    await supabase
      .from("meal_plans")
      .update({ is_active: true, activated_at: activationDate, deactivated_at: null })
      .eq("id", planId);
    
    // Clear cache to force refresh of compliance data
    if (params.clientId && clientMealsCache[params.clientId]) {
      delete clientMealsCache[params.clientId];
    }
    
    return redirect(request.url);
  }

  if (intent === "useTemplate") {
    const templateId = formData.get("templateId") as string;
    
    // Get template plan and verify it's a template
    const { data: template } = await supabase
      .from("meal_plans")
      .select("title, description, is_template")
      .eq("id", templateId)
      .single();
    
    if (!template) {
      return json({ error: "Template not found" }, { status: 400 });
    }

    if (!template.is_template) {
      return json({ error: "Cannot use non-template as template" }, { status: 400 });
    }

    // Check if this is the client's first meal plan
    const { data: existingPlans } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("user_id", client.id)
      .eq("is_template", false);

    const isFirstPlan = !existingPlans || existingPlans.length === 0;

    // Create editable client copy
    const { data: clientPlan, error: clientError } = await supabase
      .from("meal_plans")
      .insert({
        title: template.title,
        description: template.description,
        user_id: client.id,
        is_template: false, // This makes it editable
        is_active: isFirstPlan, // Only activate if this is the first plan
        activated_at: isFirstPlan ? new Date().toISOString() : null, // Only set activation date if activating
      })
      .select()
      .single();
    
    if (clientError || !clientPlan) {
      return json({ error: "Failed to create client meal plan from template" }, { status: 500 });
    }

    // Copy meals and foods from template to client plan
    const { data: templateMeals } = await supabase
      .from("meals")
      .select("id, name, time, sequence_order, meal_option")
      .eq("meal_plan_id", templateId)
      .order("sequence_order");

    if (templateMeals) {
      for (const templateMeal of templateMeals) {
        const { data: clientMeal } = await supabase
          .from("meals")
          .insert({
            meal_plan_id: clientPlan.id,
            name: templateMeal.name,
            time: templateMeal.time,
            sequence_order: templateMeal.sequence_order,
            meal_option: templateMeal.meal_option,
          })
          .select()
          .single();

        if (clientMeal) {
          // Copy foods for this meal
          const { data: templateFoods } = await supabase
            .from("foods")
            .select("name, portion, calories, protein, carbs, fat, sequence_order")
            .eq("meal_id", templateMeal.id)
            .order("sequence_order", { ascending: true });

          if (templateFoods) {
            for (const templateFood of templateFoods) {
              await supabase.from("foods").insert({
                meal_id: clientMeal.id,
                name: templateFood.name,
                portion: templateFood.portion,
                calories: templateFood.calories,
                protein: templateFood.protein,
                carbs: templateFood.carbs,
                fat: templateFood.fat,
                sequence_order: templateFood.sequence_order,
                food_option: 'A',
              });
            }
          }
        }
      }
    }
    
    // Clear cache to force fresh data
    if (params.clientId && clientMealsCache[params.clientId]) {
      delete clientMealsCache[params.clientId];
    }
    
    return json({ success: true, planId: clientPlan.id });
  }

  if (intent === "deleteTemplate") {
    const templateId = formData.get("templateId") as string;
    
    // Verify this is a template owned by the coach
    const { data: template, error: templateError } = await supabase
      .from("meal_plans")
      .select("id, is_template, user_id")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.is_template || template.user_id !== coachId) {
      return json({ error: "Unauthorized to delete this template" }, { status: 403 });
    }

    // Get all meals for this template
    const { data: meals } = await supabase
      .from("meals")
      .select("id")
      .eq("meal_plan_id", templateId);

    // Delete foods, meals, then template plan
    if (meals) {
      for (const meal of meals) {
        await supabase.from("foods").delete().eq("meal_id", meal.id);
      }
      await supabase.from("meals").delete().eq("meal_plan_id", templateId);
    }
    
    await supabase.from("meal_plans").delete().eq("id", templateId);
    
    return redirect(`${request.url}?deletedTemplate=${templateId}`);
  }

  // Create or edit
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const mealsJson = formData.get("meals") as string;
  const meals = JSON.parse(mealsJson);
  const planId = formData.get("planId") as string | null;

  // Filter out meals and foods with empty required fields for data quality
  const validMeals = meals.filter((meal: any) => 
    meal.name && meal.name.trim() !== "" && 
    meal.time && meal.time.trim() !== "" &&
    meal.foods && meal.foods.length > 0 &&
    meal.foods.some((food: any) => 
      food.name && food.name.trim() !== "" && 
      food.portion && food.portion.trim() !== ""
    )
  ).map((meal: any) => ({
    ...meal,
    foods: meal.foods.filter((food: any) => 
      food.name && food.name.trim() !== "" && 
      food.portion && food.portion.trim() !== ""
    )
  }));

  if (intent === "edit" && planId) {
    // Check if this is a template (templates are immutable)
    const { data: planCheck } = await supabase
      .from("meal_plans")
      .select("is_template")
      .eq("id", planId)
      .single();

    if (planCheck?.is_template) {
      return json({ error: "Cannot edit master templates. Templates are immutable." }, { status: 400 });
    }

    // Update the meal plan title and description
    const { data: updatedPlan } = await supabase
      .from("meal_plans")
      .update({ title, description })
      .eq("id", planId)
      .select()
      .single();

    if (updatedPlan) {
      // SMART UPDATE: Instead of delete+insert, update existing meals and foods
      // This prevents duplication while allowing edits
      
      // Get current meals for this plan
      const { data: currentMeals } = await supabase
        .from("meals")
        .select("id, name, time, sequence_order")
        .eq("meal_plan_id", planId)
        .order("sequence_order");

      // Process each meal in the updated plan
      for (const [i, meal] of validMeals.entries()) {
        let mealId;
        
        if (currentMeals && currentMeals[i]) {
          // Update existing meal
          const { data: updatedMeal } = await supabase
            .from("meals")
            .update({
              name: meal.name,
              time: meal.time,
              sequence_order: i,
              meal_option: meal.mealOption || 'A',
            })
            .eq("id", currentMeals[i].id)
            .select()
            .single();
          mealId = updatedMeal?.id;
        } else {
          // Create new meal if we have more meals than before
          const { data: newMeal } = await supabase
            .from("meals")
            .insert({
              meal_plan_id: planId,
              name: meal.name,
              time: meal.time,
              sequence_order: i,
              meal_option: meal.mealOption || 'A',
            })
            .select()
            .single();
          mealId = newMeal?.id;
        }

        if (mealId) {
          // Get current foods for this meal
          const { data: currentFoods } = await supabase
            .from("foods")
            .select("id")
            .eq("meal_id", mealId)
            .order("sequence_order");

          // Update/create foods for this meal
          for (const [foodIndex, food] of meal.foods.entries()) {
            if (currentFoods && currentFoods[foodIndex]) {
              // Update existing food
              await supabase
                .from("foods")
                .update({
                  name: food.name,
                  portion: food.portion,
                  calories: food.calories,
                  protein: food.protein,
                  carbs: food.carbs,
                  fat: food.fat,
                  sequence_order: foodIndex,
                  food_option: food.foodOption || 'A',
                })
                .eq("id", currentFoods[foodIndex].id);
            } else {
              // Create new food if we have more foods than before
              await supabase.from("foods").insert({
                meal_id: mealId,
                name: food.name,
                portion: food.portion,
                calories: food.calories,
                protein: food.protein,
                carbs: food.carbs,
                fat: food.fat,
                sequence_order: foodIndex,
                food_option: food.foodOption || 'A',
              });
            }
          }

          // Delete excess foods if we have fewer foods than before
          if (currentFoods && currentFoods.length > meal.foods.length) {
            const excessFoodIds = currentFoods.slice(meal.foods.length).map(f => f.id);
            await supabase
              .from("foods")
              .delete()
              .in("id", excessFoodIds);
          }
        }
      }

      // Delete excess meals if we have fewer meals than before
      if (currentMeals && currentMeals.length > validMeals.length) {
        const excessMealIds = currentMeals.slice(validMeals.length).map(m => m.id);
        
        // First delete foods for excess meals
        for (const mealId of excessMealIds) {
          await supabase.from("foods").delete().eq("meal_id", mealId);
        }
        
        // Then delete the excess meals
        await supabase
          .from("meals")
          .delete()
          .in("id", excessMealIds);
      }

      // Invalidate server cache for this client
      if (params.clientId && clientMealsCache[params.clientId]) {
        delete clientMealsCache[params.clientId];
      }
      
      return json({ success: true, message: "Meal plan updated successfully" });
    }
  } else if (intent === "create" || !planId) {
    // SIMPLE APPROACH: Create template and client copy in one step
    
    // 1. Create immutable master template
    const { data: newTemplate, error: templateError } = await supabase
      .from("meal_plans")
      .insert({
        title: title,
        description: description || null,
        user_id: coachId,
        is_template: true, // This makes it immutable
        is_active: false,
      })
      .select()
      .single();
    
    if (templateError || !newTemplate) {
      return json({ error: "Failed to create template" }, { status: 500 });
    }

    // Insert meals and foods for the master template
    for (const [i, meal] of validMeals.entries()) {
      const { data: newMeal, error: mealError } = await supabase
        .from("meals")
        .insert({
          meal_plan_id: newTemplate.id,
          name: meal.name,
          time: meal.time,
          sequence_order: i,
          meal_option: meal.mealOption || 'A',
        })
        .select()
        .single();
      
      if (mealError || !newMeal) {
        console.error(`[ACTION] Meal insert error for ${meal.name}:`, mealError);
        continue;
      }
      
      // Insert foods for this meal
      for (const [foodIndex, food] of meal.foods.entries()) {
        const { error: foodError } = await supabase
          .from("foods")
          .insert({
            meal_id: newMeal.id,
            name: food.name,
            portion: food.portion,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            sequence_order: foodIndex,
            food_option: food.foodOption || 'A',
          });
        
        if (foodError) {
          console.error(`[ACTION] Food insert error for ${food.name}:`, foodError);
        }
      }
    }

    // 2. Create editable client copy by copying the template
    const { data: clientPlan, error: clientError } = await supabase
      .from("meal_plans")
      .insert({
        title: title,
        description: description || null,
        user_id: client.id,
        is_template: false, // This makes it editable
        is_active: true,
        activated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (clientError || !clientPlan) {
      return json({ error: "Failed to create client meal plan" }, { status: 500 });
    }

    // Copy meals and foods to client plan (much simpler than complex queries)
    for (const [i, meal] of validMeals.entries()) {
      const { data: clientMeal } = await supabase
        .from("meals")
        .insert({
          meal_plan_id: clientPlan.id,
          name: meal.name,
          time: meal.time,
          sequence_order: i,
          meal_option: meal.mealOption || 'A',
        })
        .select()
        .single();

      if (clientMeal) {
        // Copy foods for this meal
        for (const [foodIndex, food] of meal.foods.entries()) {
          await supabase.from("foods").insert({
            meal_id: clientMeal.id,
            name: food.name,
            portion: food.portion,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            sequence_order: foodIndex,
            food_option: food.foodOption || 'A',
          });
        }
      }
    }
    
    // Clear cache to force fresh data
    if (params.clientId && clientMealsCache[params.clientId]) {
      delete clientMealsCache[params.clientId];
    }
    
    return redirect(request.url);
  }

  // Invalidate server cache for this client
  if (params.clientId && clientMealsCache[params.clientId]) {
    delete clientMealsCache[params.clientId];
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
  foodOption?: 'A' | 'B';
};

export type Meal = {
  id: string | number;
  name: string;
  time: string;
  foods: Food[];
  mealOption?: 'A' | 'B';
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
    libraryPlans: MealPlanLibrary[];
    client: { name: string, id: string, created_at?: string } | null;
    complianceData: number[];
    mealPlansHasMore?: boolean;
  }>();
  const { mealPlans, libraryPlans: initialLibraryPlans, client, complianceData: initialComplianceData, mealPlansHasMore: loaderMealPlansHasMore } = loaderData;
  const fetcher = useFetcher();
  const complianceFetcher = useFetcher<{ complianceData: number[]; completions: any[] }>();
  const revalidator = useRevalidator();
  const toast = useToast();
  const params = useParams();
  
  // State for library plans
  const [libraryPlans, setLibraryPlans] = React.useState(initialLibraryPlans);

  // Ref to track if we've already processed a response to prevent infinite loops
  const processedResponseRef = React.useRef<string | null>(null);

  // Handle fetcher responses for toast notifications and modal management
  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as any;
      const responseKey = `${fetcher.state}-${JSON.stringify(data)}`;
      
      // Check if we've already processed this exact response
      if (processedResponseRef.current === responseKey) {
        return;
      }
      
      // Mark this response as processed
      processedResponseRef.current = responseKey;
      
      if (data.success) {
        toast.success("Meal Plan Saved", data.message || "Your meal plan has been updated successfully.");
        setIsCreateModalOpen(false);
        setSelectedPlan(null);
        revalidator.revalidate(); // Immediate data refresh
        setTimeout(() => {
          fetcher.load(window.location.pathname); // Backup refresh
        }, 100);
        if (params.clientId && clientMealsCache[params.clientId]) {
          delete clientMealsCache[params.clientId]; // Clear in-memory cache
        }
      } else if (data.error) {
        toast.error("Failed to Save Meal Plan", data.error);
      }
    }
  }, [fetcher.state, fetcher.data, toast, revalidator, params.clientId]);

  // Reset processed response ref when a new submission starts
  React.useEffect(() => {
    if (fetcher.state === "submitting") {
      processedResponseRef.current = null;
    }
  }, [fetcher.state]);

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
  const [isActivationModalOpen, setIsActivationModalOpen] = React.useState(false);
  const [planToActivate, setPlanToActivate] = React.useState<MealPlanType | null>(null);
  type MealPlanType = typeof mealPlans extends (infer U)[] ? U : never;
  const [selectedPlan, setSelectedPlan] = React.useState<MealPlanType | null>(
    null
  );

  const handleSetActive = (plan: MealPlanType) => {
    setPlanToActivate(plan);
    setIsActivationModalOpen(true);
  };

  const handleActivationConfirm = (activationDate: string) => {
    if (!planToActivate) return;
    
    const formData = new FormData();
    formData.append("intent", "setActive");
    formData.append("planId", planToActivate.id);
    formData.append("activationDate", activationDate);
    
    fetcher.submit(formData, { method: "post" });
    setIsActivationModalOpen(false);
    setPlanToActivate(null);
  };

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

  // Initial API call to get real-time compliance data
  useEffect(() => {
    if (client?.id) {
      const params = new URLSearchParams();
      params.set("weekStart", calendarStart.toISOString());
      params.set("clientId", client.id);
      complianceFetcher.load(`/api/get-meal-compliance-week?${params.toString()}`);
    }
  }, [client?.id, calendarStart]);

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

  // Listen for meal completion events to refresh compliance data
  useEffect(() => {
    const handleMealCompleted = () => {
      if (client?.id) {
        const params = new URLSearchParams();
        const weekStartDate = calendarStart ? calendarStart.toISOString().split('T')[0] : '';
        params.set("weekStart", weekStartDate);
        params.set("clientId", client.id);
        params.set("_t", Date.now().toString());
        complianceFetcher.load(`/api/get-meal-compliance-week?${params.toString()}`);
      }
    };

    window.addEventListener("meals:completed", handleMealCompleted);
    return () => {
      window.removeEventListener("meals:completed", handleMealCompleted);
    };
  }, [client?.id, calendarStart, complianceFetcher]);

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
      // Apply the same sorting logic to history plans
      const sortedHistoryPlans = [...mealPlans].sort((a, b) => {
        // If one is active and the other isn't, active comes first
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        
        // If both are active or both are inactive, sort by creation date (most recent first)
        return b.createdAt.localeCompare(a.createdAt);
      });
      setHistoryMealPlans(sortedHistoryPlans);
      setMealPlansPage(1);
      setHasMoreMealPlans(loaderMealPlansHasMore ?? true);
    }
  }, [isHistoryModalOpen, mealPlans, loaderMealPlansHasMore]);

  // Keep history data in sync after revalidation (when modal is closed)
  React.useEffect(() => {
    if (!isHistoryModalOpen) {
      // Apply the same sorting logic when keeping history in sync
      const sortedHistoryPlans = [...mealPlans].sort((a, b) => {
        // If one is active and the other isn't, active comes first
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        
        // If both are active or both are inactive, sort by creation date (most recent first)
        return b.createdAt.localeCompare(a.createdAt);
      });
      setHistoryMealPlans(sortedHistoryPlans);
    }
  }, [mealPlans, isHistoryModalOpen]);

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
                            <button
                              type="button"
                              onClick={() => handleSetActive(plan)}
                              className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                              title="Set Active"
                            >
                              Set Active
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {truncateDescription(plan.description)}
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
                      {truncateDescription(activeMealPlan.description)}
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
                    const complianceValue = compliancePercentages[i] || 0;
                    const percentage = Math.round(complianceValue * 100);
                    let displayPercentage = percentage;
                    let barColor = 'transparent';
                    
                    // Handle N/A case (complianceValue === -1)
                    if (complianceValue === -1) {
                      displayPercentage = 0;
                      barColor = 'transparent';
                    } else if (isFuture || (isToday && complianceValue === 0)) {
                      displayPercentage = 0;
                      barColor = 'transparent';
                    } else if (displayPercentage > 0) {
                      barColor = getBarColor(complianceValue);
                    }
                    
                    const signupDate = client?.created_at ? new Date(client.created_at) : null;
                    if (signupDate) signupDate.setHours(0,0,0,0);
                    thisDate.setHours(0,0,0,0);
                    const isBeforeSignup = signupDate && thisDate < signupDate;
                    // Find if a plan exists for this day
                    const planForDay = mealPlans.find((p) => {
                      const activated = p.activatedAt ? new Date(p.activatedAt) : null;
                      const deactivated = p.deactivatedAt ? new Date(p.deactivatedAt) : null;
                      const dayStr = thisDate.toISOString().slice(0, 10);
                      const activatedStr = activated ? activated.toISOString().slice(0, 10) : null;
                      return (
                        activated && activatedStr && activatedStr <= dayStr && (!deactivated || deactivated > thisDate)
                      );
                    });
                    const isNoPlan = !planForDay;
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
                                background: barColor,
                                transition: "width 0.3s, background 0.3s",
                              }}
                            />
                          </div>
                          <span className="ml-4 text-xs font-medium text-right whitespace-nowrap min-w-[40px]">
                            {isBeforeSignup ? (
                              <NABadge reason="Client was not signed up yet" />
                            ) : complianceValue === -1 ? (
                              <NABadge reason="Plan added today - compliance starts tomorrow" />
                            ) : isToday && percentage > 0 ? (
                              `${percentage}%`
                            ) : isToday ? (
                              <span className="bg-primary/10 dark:bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/20">Pending</span>
                            ) : isFuture ? (
                              <span className="text-gray-500">Pending</span>
                            ) : isNoPlan ? (
                              <NABadge reason="Plan hasn't been created for client yet" />
                            ) : (
                              `${percentage}%`
                            )}
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

        {/* Meals Completed Container */}
        {sortedMealPlans.find((p) => p.isActive) && (
          <div className="mt-6 space-y-6">
            <Card title="Meals Completed">
              <div className="space-y-4">
                {/* Daily Meals Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(() => {
                    const activePlan = sortedMealPlans.find((p) => p.isActive);
                    if (!activePlan) return null;

                    // Get the current week's dates
                    const weekStart = new Date(calendarStart);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 7);

                    // Get meal completions for this week
                    const weekStartStr = weekStart.toISOString().split('T')[0];
                    const weekEndStr = weekEnd.toISOString().split('T')[0];
                    
                    // Use the compliance fetcher data to get meal completions
                    const mealCompletions = complianceFetcher.data?.completions || [];

                    // Create a map of completed meals by date
                    const completedMealsByDate: Record<string, string[]> = {};
                    mealCompletions.forEach((completion: any) => {
                      const dateKey = completion.completed_at.slice(0, 10); // Extract just the date part
                      if (!completedMealsByDate[dateKey]) {
                        completedMealsByDate[dateKey] = [];
                      }
                      if (completion.meal_id) {
                        completedMealsByDate[dateKey].push(completion.meal_id);
                      }
                    });

                    // Generate meals for each day of the week
                    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    
                    return daysOfWeek.map((day, dayIndex) => {
                      const currentDate = new Date(weekStart);
                      currentDate.setDate(weekStart.getDate() + dayIndex);
                      const dateStr = currentDate.toISOString().split('T')[0];
                      
                      // Get meals for this day from the active plan
                      const dayMeals = activePlan.meals || [];
                      
                      // Check if this date is before signup
                      const signupDate = client?.created_at ? new Date(client.created_at) : null;
                      if (signupDate) signupDate.setHours(0, 0, 0, 0);
                      const isBeforeSignup = signupDate && currentDate < signupDate;
                      
                      // Check if this date is in the future
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isFuture = currentDate > today;
                      
                      // Check if there's a plan for this day
                      const planForDay = mealPlans.find((p) => {
                        const activated = p.activatedAt ? new Date(p.activatedAt) : null;
                        const deactivated = p.deactivatedAt ? new Date(p.deactivatedAt) : null;
                        const activatedStr = activated ? activated.toISOString().slice(0, 10) : null;
                        return (
                          activated && activatedStr && activatedStr <= dateStr && (!deactivated || deactivated > currentDate)
                        );
                      });
                      const isNoPlan = !planForDay;

                      // If no plan or before signup, show N/A
                      if (isNoPlan || isBeforeSignup) {
                        return (
                          <div
                            key={`${day}-${dayIndex}`}
                            className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-secondary dark:text-alabaster">
                                    {day}
                                  </h4>
                                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                                    {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-dark dark:text-gray-light">
                                  {isBeforeSignup ? "Client was not signed up yet" : "No meal plan for this day"}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-gray-dark dark:text-gray-light">
                              <NABadge reason={isBeforeSignup ? "Client was not signed up yet" : "Plan hasn't been created for client yet"} />
                            </div>
                          </div>
                        );
                      }

                      // If future date, show pending
                      if (isFuture) {
                        return (
                          <div
                            key={`${day}-${dayIndex}`}
                            className="bg-white dark:bg-secondary-light/5 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-secondary dark:text-alabaster">
                                    {day}
                                  </h4>
                                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full">
                                    {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-dark dark:text-gray-light">
                                  {dayMeals.length} meals planned
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-gray-dark dark:text-gray-light">
                              <span className="text-gray-500">Pending</span>
                            </div>
                          </div>
                        );
                      }

                      // Show meals for this day
                      const completedMeals = completedMealsByDate[dateStr] || [];
                      
                      // Group meals by name and time to handle A/B options
                      const mealGroups = dayMeals.reduce((groups: Record<string, any[]>, meal: any) => {
                        const key = `${meal.name}-${meal.time}`;
                        if (!groups[key]) {
                          groups[key] = [];
                        }
                        groups[key].push(meal);
                        return groups;
                      }, {});
                      
                      const totalMealGroups = Object.keys(mealGroups).length;
                      const completedMealGroups = Object.values(mealGroups).filter(group => {
                        const groupMealIds = group.map(m => m.id.toString());
                        return groupMealIds.some(id => completedMeals.includes(id));
                      }).length;
                      
                      const isCompleted = completedMealGroups === totalMealGroups && totalMealGroups > 0;

                      return (
                        <div
                          key={`${day}-${dayIndex}`}
                          className={`bg-white dark:bg-secondary-light/5 rounded-xl border-2 transition-all duration-200 p-4 ${
                            isCompleted
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-secondary dark:text-alabaster">
                                  {day}
                                </h4>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  isCompleted 
                                    ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                                    : "bg-primary/10 text-primary"
                                }`}>
                                  {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <p className="text-sm text-gray-dark dark:text-gray-light">
                                {totalMealGroups} meals planned
                              </p>
                            </div>
                            {isCompleted && (
                              <div className="flex-shrink-0">
                                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Meal Details */}
                          <div className="space-y-2">
                            {(() => {
                              // Group meals by name and time to handle A/B options
                              const mealGroups = dayMeals.reduce((groups: Record<string, any[]>, meal: any) => {
                                const key = `${meal.name}-${meal.time}`;
                                if (!groups[key]) {
                                  groups[key] = [];
                                }
                                groups[key].push(meal);
                                return groups;
                              }, {});

                              return Object.entries(mealGroups).map(([key, meals], groupIndex) => {
                                const [mealName, mealTime] = key.split('-');
                                
                                // Format time to HH:mm
                                const formatTime = (timeStr: string) => {
                                  if (!timeStr) return '';
                                  // If it's already in HH:mm format, return as is
                                  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
                                    return timeStr;
                                  }
                                  // If it's in HH:mm:ss format, remove seconds
                                  if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
                                    return timeStr.substring(0, 5);
                                  }
                                  // If it's a full timestamp, extract time
                                  if (timeStr.includes('T') || timeStr.includes(' ')) {
                                    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);
                                    if (timeMatch) {
                                      return `${timeMatch[1]}:${timeMatch[2]}`;
                                    }
                                  }
                                  return timeStr;
                                };

                                const formattedTime = formatTime(mealTime);
                                
                                // Check completion status for each meal in the group
                                const groupMealIds = meals.map(m => m.id.toString());
                                const completedMealIds: string[] = groupMealIds.filter(id => completedMeals.includes(id));
                                const isGroupCompleted = completedMealIds.length > 0;
                                
                                // If it's a single meal (no A/B), show simple completion
                                if (meals.length === 1) {
                                  const isCompleted = completedMealIds.includes(meals[0].id.toString());
                                  return (
                                    <div
                                      key={`${key}-${groupIndex}`}
                                      className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                                        isCompleted
                                          ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                                          : "bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                                      }`}
                                    >
                                      <div className="flex-1">
                                        <div className="font-medium">{mealName}</div>
                                        <div className="text-xs opacity-75">{formattedTime}</div>
                                      </div>
                                      <div className="flex-shrink-0">
                                        {isCompleted ? (
                                          <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          </div>
                                        ) : (
                                          <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded-full" />
                                        )}
                                      </div>
                                    </div>
                                  );
                                }
                                
                                // For A/B meals, show detailed completion information
                                const completedMealsInGroup: any[] = meals.filter(meal => 
                                  completedMealIds.includes(meal.id.toString())
                                );
                                
                                return (
                                  <div
                                    key={`${key}-${groupIndex}`}
                                    className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                                      isGroupCompleted
                                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                                        : "bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                                    }`}
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium">{mealName}</div>
                                      <div className="text-xs opacity-75">
                                        {formattedTime}
                                        <span className="ml-1 text-xs bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded">
                                          A/B
                                        </span>
                                      </div>
                                      {isGroupCompleted && completedMealsInGroup.length > 0 && (
                                        <div className="text-xs mt-1 font-medium">
                                          {completedMealsInGroup.length === 1 ? (
                                            <span className="text-green-700 dark:text-green-300">
                                              Completed: Option {completedMealsInGroup[0].mealOption}
                                            </span>
                                          ) : (
                                            <span className="text-green-700 dark:text-green-300">
                                              Completed: {completedMealsInGroup.length} options
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-shrink-0 flex items-center gap-1">
                                      {isGroupCompleted ? (
                                        <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        </div>
                                      ) : (
                                        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded-full" />
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          
                          <div className="text-xs text-gray-dark dark:text-gray-light mt-3">
                            {isCompleted ? (
                              <span className="text-green-600 font-medium">All meals completed</span>
                            ) : totalMealGroups > 0 ? (
                              <span className="text-gray-500">
                                {completedMealGroups} of {totalMealGroups} meals completed
                              </span>
                            ) : (
                              <span className="text-gray-500">No meals planned</span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* No active plan message */}
                {(!sortedMealPlans.find((p) => p.isActive)) && (
                  <div className="text-center py-8 text-gray-dark dark:text-gray-light">
                    <p>No active meal plan found.</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

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
                      mealOption: meal.mealOption || 'A',
                      foods: (meal.foods ?? []).map((food: Food) => ({
                        name: food.name ?? "",
                        portion: food.portion ?? "",
                        calories:
                          typeof food.calories === "number" ? food.calories : 0,
                        protein:
                          typeof food.protein === "number" ? food.protein : 0,
                        carbs: typeof food.carbs === "number" ? food.carbs : 0,
                        fat: typeof food.fat === "number" ? food.fat : 0,
                        foodOption: food.foodOption || 'A',
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
              form.append("planId", selectedPlan.id);
            } else {
              form.append("intent", "create");
            }
            fetcher.submit(form, { method: "post" });
            // Don't close modal immediately - let the useEffect handle it after successful submission
          }}
          isLoading={fetcher.state !== "idle"}
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
                            <button
                              type="button"
                              onClick={() => handleSetActive(plan)}
                              className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                              title="Set Active"
                            >
                              Set Active
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {truncateDescription(plan.description)}
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
                                console.log('Original plan data:', plan);
                                console.log('Plan meals:', plan.meals);
                                console.log('Sample food from plan:', plan.meals[0]?.foods[0]);
                                console.log('Meal options in plan:', plan.meals.map(m => ({ name: m.name, time: m.time, mealOption: m.mealOption, foodsCount: m.foods?.length || 0 })));
                                
                                // Debug individual meal foods
                                plan.meals.forEach((meal, mealIdx) => {
                                  console.log(`Plan Meal ${mealIdx} (${meal.mealOption}):`, {
                                    id: meal.id,
                                    name: meal.name,
                                    time: meal.time,
                                    mealOption: meal.mealOption,
                                    foodsCount: meal.foods?.length || 0
                                  });
                                  meal.foods?.forEach((food, foodIdx) => {
                                    console.log(`  Food ${foodIdx}:`, {
                                      name: food.name,
                                      calories: food.calories,
                                      protein: food.protein,
                                      carbs: food.carbs,
                                      fat: food.fat
                                    });
                                  });
                                });
                                
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
          onTemplateDeleted={(templateId) => {
            // Update the local library plans state
            setLibraryPlans(prev => prev.filter(plan => plan.id !== templateId));
          }}
        />

        <ActivationDateModal
          isOpen={isActivationModalOpen}
          onClose={() => {
            setIsActivationModalOpen(false);
            setPlanToActivate(null);
          }}
          onConfirm={handleActivationConfirm}
          planName={planToActivate?.title || ""}
          isLoading={fetcher.state !== "idle"}
        />
      </div>
    </ClientDetailLayout>
  );
}
