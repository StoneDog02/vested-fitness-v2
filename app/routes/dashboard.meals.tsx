import { useState, useEffect, useCallback, useRef } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import NABadge from "~/components/ui/NABadge";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";

import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { useMealCompletion } from "~/context/MealCompletionContext";
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

// In-memory cache for meals loader (per user, 30s TTL)
const mealsLoaderCache: Record<string, { data: any; expires: number }> = {};

export const meta: MetaFunction = () => {
  return [
    { title: "Meals | Kava Training" },
    { name: "description", content: "View and track your meal plans" },
  ];
};

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Get user auth from cookie (same as dashboard._index.tsx)
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
    let authId;
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken);
        authId = decoded && typeof decoded === "object" && "sub" in decoded ? decoded.sub : undefined;
      } catch (e) {}
    }

    if (!authId) {
      throw new Response("Unauthorized", { status: 401 });
    }

    // Check cache (per user)
    if (mealsLoaderCache[authId] && mealsLoaderCache[authId].expires > Date.now()) {
      return json(mealsLoaderCache[authId].data);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    const today = getCurrentDate();
    const todayStr = today.format("YYYY-MM-DD");
    const tomorrowStr = today.add(1, "day").format("YYYY-MM-DD");
    
    // Get user
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, avatar_url, created_at")
      .eq("auth_id", authId)
      .single();

    if (error || !user) {
      throw new Response("User not found", { status: 404 });
    }

    // Get ALL meal plans for this user (both active and recently deactivated)
    const { data: allPlans, error: plansError } = await supabase
      .from("meal_plans")
      .select("id, title, description, created_at, is_active, activated_at, deactivated_at")
      .eq("user_id", user.id)
      .eq("is_template", false)
      .order("activated_at", { ascending: false, nullsFirst: false });

    // Determine which plan to show to the client:
    // 1. Show active plans activated before today (normal case)
    // 2. Show plans deactivated today (they were active until today, should show until end of day)
    let activeMealPlan = null;
    let debugPlan = null;
    if (allPlans && allPlans.length > 0) {
      // First try to find an active plan (including activation day)
      let planToShow = allPlans.find(plan => {
        if (!plan.is_active) return false;
        if (!plan.activated_at) return true; // Legacy plans without activation date
        const activatedDate = dayjs(plan.activated_at).tz(USER_TIMEZONE).format("YYYY-MM-DD");
        return activatedDate <= todayStr; // Show plans activated today or before (activation day will be handled by UI)
      });
      // If no active plan found, look for plan deactivated today (was active until today)
      if (!planToShow) {
        planToShow = allPlans.find(plan => {
          if (!plan.deactivated_at) return false;
          const deactivatedDate = dayjs(plan.deactivated_at).tz(USER_TIMEZONE).format("YYYY-MM-DD");
          return deactivatedDate === todayStr; // Deactivated today, so show until end of day
        });
      }
      if (planToShow) {
        debugPlan = planToShow;
        // Get the full plan details
        const { data: mealsRaw } = await supabase
          .from("meals")
          .select("id, name, time, sequence_order")
          .eq("meal_plan_id", planToShow.id)
          .order("sequence_order", { ascending: true });
        if (mealsRaw && mealsRaw.length > 0) {
          // Batch fetch all foods for all meals in a single query
          const mealIds = mealsRaw.map(m => m.id);
          const [foodsRes, completionsRes] = await Promise.all([
            mealIds.length > 0
              ? supabase
                  .from("foods")
                  .select(`id, name, portion, calories, protein, carbs, fat, meal_id, food_library_id, food_library:food_library_id (calories, protein, carbs, fat)`)
                  .in("meal_id", mealIds)
              : { data: [] },
            supabase
              .from("meal_completions")
              .select("meal_id, completed_at")
              .eq("user_id", user.id)
              .gte("completed_at", todayStr)
              .lt("completed_at", tomorrowStr)
          ]);
          const foodsRaw = foodsRes.data || [];
          // Group foods by meal_id
          const foodsByMeal: Record<string, any[]> = {};
          for (const food of foodsRaw) {
            const mealId = String(food.meal_id);
            if (!foodsByMeal[mealId]) foodsByMeal[mealId] = [];
            // Ensure all values are serializable numbers
            const protein = food.food_library && typeof food.food_library === 'object' && 'protein' in food.food_library ? Number(food.food_library.protein) || 0 : Number(food.protein) || 0;
            const carbs = food.food_library && typeof food.food_library === 'object' && 'carbs' in food.food_library ? Number(food.food_library.carbs) || 0 : Number(food.carbs) || 0;
            const fat = food.food_library && typeof food.food_library === 'object' && 'fat' in food.food_library ? Number(food.food_library.fat) || 0 : Number(food.fat) || 0;
            // Always calculate calories from macros and ensure no NaN
            const calories = Math.round(protein * 4 + carbs * 4 + fat * 9) || 0;
            foodsByMeal[mealId].push({
              id: String(food.id || ''),
              name: String(food.name || ''),
              portion: String(food.portion || ''),
              calories: isFinite(calories) ? calories : 0,
              protein: isFinite(protein) ? Math.round(protein) : 0,
              carbs: isFinite(carbs) ? Math.round(carbs) : 0,
              fat: isFinite(fat) ? Math.round(fat) : 0,
            });
          }
          // Assemble meals with foods
          const meals = mealsRaw.map(meal => ({
            id: String(meal.id || ''),
            name: String(meal.name || ''),
            time: String(meal.time || ''),
            sequence_order: Number(meal.sequence_order) || 0,
            foods: foodsByMeal[String(meal.id)] || []
          }));
          activeMealPlan = {
            name: planToShow.title,
            date: "", // Could add date range formatting here if needed
            meals,
          };
          // Debug: Log plan, date, and meals
          // console.log('[MEALS] Selected planToShow:', {
          //   id: planToShow.id,
          //   title: planToShow.title,
          //   activated_at: planToShow.activated_at,
          //   is_active: planToShow.is_active
          // });
          // console.log('[MEALS] todayStr:', todayStr, 'tomorrowStr:', tomorrowStr);
          // console.log('[MEALS] Meals fetched:', (meals || []).map(m => ({ id: m.id, name: m.name, time: m.time })));
          // Get meal completions for today if we have an active meal plan
          let mealCompletions: { meal_id: string, completed_at: string }[] = [];
          if (completionsRes.data) {
            mealCompletions = completionsRes.data;
          }
          const result = {
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              avatar_url: user.avatar_url,
              created_at: user.created_at,
            },
            mealPlan: activeMealPlan,
            mealCompletions,
          };
          // Cache result
          mealsLoaderCache[authId] = { data: result, expires: Date.now() + 30_000 };
          return json(result);
        }
      }
    }
    // If no plan or no meals, return empty
    const result = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
      mealPlan: null,
      mealCompletions: [],
    };
    mealsLoaderCache[authId] = { data: result, expires: Date.now() + 30_000 };
    return json(result);
  } catch (error) {
    console.error('Error in meals loader:', error);
    return json({ 
      user: null,
      mealPlan: null, 
      mealCompletions: [] 
    });
  }
};

// Function to calculate the total macros from all foods in the meal plan
const calculateMacros = (
  meals: Array<{
    id: number | string;
    name: string;
    time: string;
    foods: Array<{
      name: string;
      portion: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }>,
  completedMealIds: string[] = []
) => {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  let completedCalories = 0;
  let completedProtein = 0;
  let completedCarbs = 0;
  let completedFat = 0;

  meals.forEach((meal) => {
    const isCompleted = completedMealIds.includes(String(meal.id));
    meal.foods.forEach((food) => {
      // Always add to total
      totalCalories += food.calories;
      totalProtein += food.protein;
      totalCarbs += food.carbs;
      totalFat += food.fat;
      // Only add to completed if meal is checked
      if (isCompleted) {
        completedCalories += food.calories;
        completedProtein += food.protein;
        completedCarbs += food.carbs;
        completedFat += food.fat;
      }
    });
  });
  return {
    total: {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein),
      carbs: Math.round(totalCarbs),
      fat: Math.round(totalFat),
    },
    completed: {
      calories: Math.round(completedCalories),
      protein: Math.round(completedProtein),
      carbs: Math.round(completedCarbs),
      fat: Math.round(completedFat),
    },
  };
};

// Function to generate calendar data for the current week
const generateCalendarData = () => {
  const today = getCurrentDate();
  const startOfWeek = getStartOfWeek();

  return Array.from({ length: 7 }).map((_, index) => {
    const date = startOfWeek.add(index, "day");

    return {
      date: date.format("ddd, MMM D"),
      status: date.isAfter(today, "day") ? "pending" : "missed",
      percentage: 0,
      complianceValue: 0,
    };
  });
};

export default function Meals() {
  const loaderData = useLoaderData<{ user: any; mealPlan: any; mealCompletions: any[] }>();
  const todaysMealPlan = loaderData?.mealPlan;
  const user = loaderData?.user;
  const [dayOffset, setDayOffset] = useState(0);
  const [calendarData, setCalendarData] = useState(generateCalendarData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDaySubmitted, setIsDaySubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { checkedMeals, setCheckedMeals, addCheckedMeal, removeCheckedMeal, resetCheckedMeals, clearCorruptedData, isHydrated } = useMealCompletion();
  const weekFetcher = useFetcher<{ meals: Record<string, any>, completions: Record<string, string[]> }>();
  const submitFetcher = useFetcher();
  
  // Track current week and cached meal data
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return getStartOfWeek().toDate();
  });
  const [weekMeals, setWeekMeals] = useState<Record<string, any>>({});
  const [weekCompletions, setWeekCompletions] = useState<Record<string, string[]>>({});
  const [currentDayMealPlan, setCurrentDayMealPlan] = useState(todaysMealPlan);
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [isActivationDay, setIsActivationDay] = useState(false);

  // Use refs to prevent unnecessary re-renders
  const isInitializedRef = useRef(false);
  const lastDayOffsetRef = useRef(dayOffset);
  const lastWeekStartRef = useRef(currentWeekStart.getTime());
  const isMountedRef = useRef(true);

  // Cleanup on unmount to prevent memory leaks and state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Function to fetch a week's worth of meal data
  const fetchMealWeek = useCallback((weekStart: Date) => {
    if (weekFetcher.state !== 'idle') return; // Prevent multiple simultaneous fetches
    
    setIsLoadingMeals(true);
    const params = new URLSearchParams();
    params.set("weekStart", weekStart.toISOString());
    weekFetcher.load(`/api/get-meal-week?${params.toString()}`);
  }, [weekFetcher]);

  // Initialize week data on mount - ONLY RUN ONCE
  useEffect(() => {
    if (isInitializedRef.current || !isMountedRef.current) return;
    isInitializedRef.current = true;
    
    try {
      // Add today's meal plan to the week cache
      const today = getCurrentDate();
      const todayStr = today.format("YYYY-MM-DD");
      if (todaysMealPlan) {
        setWeekMeals(prev => ({
          ...prev,
          [todayStr]: todaysMealPlan
        }));
      }
      
      // Fetch the rest of the week's data
      fetchMealWeek(currentWeekStart);
    } catch (error) {
      console.error('Error initializing meal data:', error);
    }
  }, []); // Empty dependency array - only run once

  // Handle week fetcher data updates - SIMPLIFIED
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    try {
      if (weekFetcher.data?.meals && weekFetcher.data?.completions) {
        setWeekMeals(prev => ({ ...prev, ...weekFetcher.data!.meals }));
        setWeekCompletions(prev => ({ ...prev, ...weekFetcher.data!.completions }));
        setIsLoadingMeals(false);
      } else if (weekFetcher.state === 'idle' && weekFetcher.data === undefined) {
        setIsLoadingMeals(false);
      }
    } catch (error) {
      console.error('Error handling week fetcher data:', error);
      setIsLoadingMeals(false);
    }
  }, [weekFetcher.data, weekFetcher.state]);

  // Update meal data when day offset changes - SIMPLIFIED AND DEBOUNCED
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    // Only run if day offset actually changed
    if (lastDayOffsetRef.current === dayOffset) return;
    lastDayOffsetRef.current = dayOffset;
    
    try {
      const targetDate = getCurrentDate().add(dayOffset, "day");
      const dateStr = targetDate.format("YYYY-MM-DD");
      
      // Check if we have this day's data in our cache
      const mealData = weekMeals[dateStr];
      
      if (mealData !== undefined) {
        // We have the data cached
        setCurrentDayMealPlan(mealData);
        setIsLoadingMeals(false);
      } else {
        // Need to fetch this week's data
        const weekStart = getStartOfWeek(targetDate).toDate();
        const weekStartTime = weekStart.getTime();
        if (weekStartTime !== lastWeekStartRef.current) {
          lastWeekStartRef.current = weekStartTime;
          setCurrentWeekStart(weekStart);
          fetchMealWeek(weekStart);
        }
      }
    } catch (error) {
      console.error('Error updating meal data for day offset:', error);
      setIsLoadingMeals(false);
    }
  }, [dayOffset, weekMeals, fetchMealWeek]);

  // Calculate the current date with offset
  const today = getCurrentDate();
  const currentDate = today.add(dayOffset, "day");

  // Format current date for lookup
  const currentDateFormatted = currentDate.format("ddd, MMM D");
  // Format for API (YYYY-MM-DD)
  const currentDateApi = currentDate.format("YYYY-MM-DD");

  // Fetch completed meals for today from backend (for real-time updates) - MEMOIZED
  const fetchCompletedMealsForToday = useCallback(async () => {
    if (!isMountedRef.current) return; // Prevent updates after unmount
    
    try {
      const res = await fetch(`/api/get-meal-completions?date=${currentDateApi}`);
      if (res.ok && isMountedRef.current) {
        const data = await res.json();
        if (Array.isArray(data.completedMealIds) && data.completedMealIds.length > 0) {
          const mealKeys = data.completedMealIds.map(String).map((mealId: string) => {
            const meal = currentDayMealPlan?.meals?.find((m: any) => String(m.id) === mealId);
            return meal ? createMealKey({ id: meal.id, name: meal.name, time: meal.time }) : null;
          }).filter(Boolean) as string[];
          setCheckedMeals(mealKeys);
          // Only set as submitted if we found matching meals in the current plan
          setIsDaySubmitted(mealKeys.length > 0);
        }
      }
    } catch (e) {
      // Ignore errors, use cached data
    }
  }, [currentDateApi, currentDayMealPlan]);

  // Update completion status when day changes or week data loads - OPTIMIZED
  useEffect(() => {
    if (!isHydrated || !isMountedRef.current) return; // Wait for hydration and check if mounted
    
    try {
      const dateStr = currentDate.toISOString().slice(0, 10);
      const dayCompletions = weekCompletions[dateStr] || [];
      
      if (dayCompletions.length > 0) {
        // Convert meal IDs from backend to meal keys for frontend consistency
        const mealKeys = dayCompletions.map(String).map(getMealKeyFromId).filter(Boolean) as string[];
        setCheckedMeals(mealKeys);
        // Only set as submitted if we found matching meals in the current plan
        setIsDaySubmitted(mealKeys.length > 0);
      } else {
        setIsDaySubmitted(false);
        // For today, always re-fetch completions from backend when dayOffset changes to 0
        if (dayOffset === 0) {
          fetchCompletedMealsForToday();
        } else {
          // For other days, clear the checked meals if no completions found
          setCheckedMeals([]);
        }
      }
    } catch (error) {
      console.error('Error updating completion status:', error);
    }
  }, [currentDateApi, weekCompletions, dayOffset, isHydrated, fetchCompletedMealsForToday]);

  // --- Compliance Calendar Backend Integration --- STABLE VERSION
  useEffect(() => {
    let isCancelled = false;
    
    async function fetchWeekCompletions() {
      if (!isMountedRef.current) return;
      
      // Get start and end of week (Sunday to Saturday)
      const today = getCurrentDate();
      const startOfWeek = getStartOfWeek();
      
      try {
        // Use the compliance week API to get proper N/A handling
        const res = await fetch(`/api/get-meal-compliance-week?weekStart=${startOfWeek.toISOString()}&clientId=${encodeURIComponent(loaderData?.user?.id || '')}`);
        if (res.ok && !isCancelled && isMountedRef.current) {
          const data = await res.json();
          const complianceData = data.complianceData || [];
          
          // Check if today is activation day by looking at compliance data
          const todayIndex = getCurrentDate().day();
          const isTodayActivationDay = complianceData[todayIndex] === -1;
          setIsActivationDay(isTodayActivationDay);
          
          setCalendarData(
            Array.from({ length: 7 }).map((_, index) => {
              const date = getStartOfWeek().add(index, "day");
              const prettyDate = date.format("ddd, MMM D");
              
              const complianceValue = complianceData[index] || 0;
              const percentage = complianceValue === -1 ? 0 : Math.round(complianceValue * 100);
              const todayDate = getCurrentDate();
              
              let status;
              if (complianceValue === -1) {
                status = "na";
              } else if (date.isAfter(todayDate, "day")) {
                status = "pending";
              } else if (date.isSame(todayDate, "day")) {
                // Today
                if (percentage === 0) {
                  status = "pending";
                } else {
                  status = "completed";
                }
              } else {
                // Past
                status = "completed";
              }
              
              return {
                date: prettyDate,
                status,
                percentage,
                complianceValue,
              };
            })
          );
        }
      } catch (e) {
        if (!isCancelled) {
          setCalendarData(generateCalendarData());
        }
      }
    }
    
    fetchWeekCompletions();
    
    return () => {
      isCancelled = true;
    };
  }, [currentDayMealPlan]); // Removed weekCompletions dependency to prevent circular updates

  // Format the date with relative labels
  const getFormattedDate = (date: dayjs.Dayjs, today: dayjs.Dayjs) => {
    const diffInDays = date.diff(today, "day");

    switch (diffInDays) {
      case 0:
        return "Today";
      case 1:
        return "Tomorrow";
      case -1:
        return "Yesterday";
      default:
        return date.format("dddd, MMMM D");
    }
  };

  const formattedDate = getFormattedDate(currentDate, today);

  // Helper function to convert between meal keys and IDs - MOVED UP
  const createMealKey = (meal: { id: number | string; name: string; time: string }) => `${meal.id}-${meal.name}-${meal.time.slice(0,5)}`;
  
  const getMealIdFromKey = useCallback((mealKey: string) => {
    // Extract meal ID from the key - UUID is first 5 segments when split by dash (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-name-time)
    const parts = mealKey.split('-');
    if (parts.length < 5) return null;
    
    // Reconstruct the UUID (first 5 parts)
    const mealId = parts.slice(0, 5).join('-');
    const meal = currentDayMealPlan?.meals?.find((m: any) => String(m.id) === mealId);
    return meal ? String(meal.id) : null;
  }, [currentDayMealPlan]);

  const getMealKeyFromId = useCallback((mealId: string) => {
    const meal = currentDayMealPlan?.meals?.find((m: any) => String(m.id) === mealId);
    return meal ? createMealKey({ id: meal.id, name: meal.name, time: meal.time }) : null;
  }, [currentDayMealPlan]);

  // Function to handle "checked" state for meals
  const toggleMealCheck = useCallback((meal: { id: string | number; name: string; time: string }) => {
    const mealKey = createMealKey(meal);
    
    if (checkedMeals.includes(mealKey)) {
      removeCheckedMeal(mealKey);
    } else {
      addCheckedMeal(mealKey);
    }
  }, [checkedMeals, addCheckedMeal, removeCheckedMeal]);

  // Handle meal submission - OPTIMISTIC UI with fetcher
  const handleSubmitMeals = useCallback(async () => {
    if (isSubmitting || isDaySubmitted || isActivationDay) return; // Prevent double submission and activation day submission
    setIsSubmitting(true);
    setSubmitError(null);

    // Convert meal keys back to meal IDs for backend submission - with deduplication
    const mealIdsForBackend = [...new Set(checkedMeals.map(getMealIdFromKey).filter(Boolean))] as string[];
    const body = {
      completedMealIds: mealIdsForBackend,
      date: currentDateApi,
    };

    // Optimistically update UI
    setIsDaySubmitted(true);
    setWeekCompletions(prev => ({
      ...prev,
      [currentDateApi]: mealIdsForBackend
    }));
    setCalendarData(prev =>
      prev.map(day => {
        if (day.date === currentDate.format("ddd, MMM D")) {
          const total = currentDayMealPlan?.meals?.length || 0;
          const percentage = total > 0 ? Math.round((mealIdsForBackend.length / total) * 100) : 0;
          return {
            ...day,
            status: "completed",
            percentage
          };
        }
        return day;
      })
    );
    setShowSuccess(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => setShowSuccess(false), 3000);

    // Submit to backend using fetcher
    submitFetcher.submit(
      { completedMealIds: mealIdsForBackend, date: currentDateApi },
      { method: "POST", action: "/api/submit-meal-completions", encType: "application/json" }
    );
    setIsSubmitting(false);

    // Dispatch custom event to trigger dashboard revalidation
    window.dispatchEvent(new Event("meals:completed"));
  }, [isSubmitting, isDaySubmitted, checkedMeals, currentDateApi, getMealIdFromKey, currentDayMealPlan]);

  // Calculate the macros based on the food items - need to convert keys back to check against meal IDs with deduplication
  const completedMealIds = [...new Set(checkedMeals.map(getMealIdFromKey).filter(Boolean))] as string[];
  

  
  // Error detection: If completed meals exceed total meals, clear corrupted data
  useEffect(() => {
    if (isHydrated && currentDayMealPlan?.meals && completedMealIds.length > currentDayMealPlan.meals.length) {
      console.error(`Data corruption detected: ${completedMealIds.length} completed meals > ${currentDayMealPlan.meals.length} total meals. Clearing data.`);
      clearCorruptedData();
    }
  }, [completedMealIds.length, currentDayMealPlan?.meals?.length, isHydrated, clearCorruptedData]);
  
  const calculatedMacros = calculateMacros(currentDayMealPlan?.meals || [], completedMealIds);

  // Use the current day's meal plan
  const mealPlan = currentDayMealPlan;

  return (
    <div className="p-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-primary text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Submit Successful</span>
        </div>
      )}

      <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-6">
        Meals
      </h1>



      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          {/* Today's Meals */}
          <Card>
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => {
                  setDayOffset(dayOffset - 1);
                  // Don't clear checked meals here - let the effect handle it
                }}
                disabled={isLoadingMeals}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1 disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Previous
              </button>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-secondary dark:text-alabaster">
                  {formattedDate}
                </h2>
                <div className="text-sm text-gray-dark dark:text-gray-light mt-1">
                  {currentDate.format("MMMM D, YYYY")}
                </div>
                {dayOffset !== 0 && (
                  <button
                    onClick={() => {
                      setDayOffset(0);
                      // Don't clear checked meals here - let the effect handle it
                    }}
                    className="text-xs text-primary hover:text-primary-dark transition-colors duration-200 mt-1"
                  >
                    Go to today
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setDayOffset(dayOffset + 1);
                  // Don't clear checked meals here - let the effect handle it
                }}
                disabled={isLoadingMeals}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1 disabled:opacity-50"
              >
                Next
                <svg
                  className="w-4 h-4"
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
              </button>
            </div>

            <div className="space-y-4 sm:space-y-8">
              {isLoadingMeals ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-2 text-gray-500">
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading meals...
                  </div>
                </div>
              ) : !mealPlan || !mealPlan.meals || mealPlan.meals.length === 0 ? (
                <div className="text-gray-500 text-center py-8">No meal plan available.</div>
              ) : (
                mealPlan.meals.map((meal: { id: number | string; name: string; time: string; foods: any[] }) => (
                  <div
                    key={meal.id}
                    className="relative border border-gray-light dark:border-davyGray rounded-xl p-4 sm:p-6 transition-all duration-200 hover:shadow-md"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-secondary dark:text-alabaster mb-1">
                          {meal.name}
                        </h3>
                        <div className="text-xs sm:text-sm text-gray-dark dark:text-gray-light flex items-center gap-2">
                          <svg
                            className="w-3 h-3 sm:w-4 sm:h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {meal.time}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <label
                          htmlFor={`meal-${meal.id}`}
                          className={`text-xs sm:text-sm ${
                            isDaySubmitted || isActivationDay
                              ? "text-gray-dark dark:text-gray-light"
                              : "text-gray-dark dark:text-gray-light cursor-pointer"
                          } select-none`}
                        >
                          {!isHydrated
                            ? "Loading..."
                            : (() => {
                                const mealKey = createMealKey({ id: meal.id, name: meal.name, time: meal.time });
                                if (isActivationDay) {
                                  return "Activation Day";
                                }
                                return (isDaySubmitted && checkedMeals.includes(mealKey)) ||
                                       (!isDaySubmitted && checkedMeals.includes(mealKey))
                                  ? "Completed"
                                  : isDaySubmitted
                                  ? "Not Completed"
                                  : "Mark as complete";
                              })()}
                        </label>
                        <input
                          type="checkbox"
                          id={`meal-${meal.id}`}
                          value={meal.id}
                          checked={(() => {
                            const mealKey = createMealKey({ id: meal.id, name: meal.name, time: meal.time });
                            const isChecked = isHydrated && checkedMeals.includes(mealKey);
                            return isChecked;
                          })()}
                          onChange={() => {
                            !isDaySubmitted && !isActivationDay && toggleMealCheck(meal);
                          }}
                          disabled={isDaySubmitted || !isHydrated || isActivationDay}
                          className={`w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-light dark:border-davyGray text-primary focus:ring-primary ${
                            isDaySubmitted || !isHydrated || isActivationDay
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <div className="min-w-full px-4 sm:px-0">
                        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-2 text-xs sm:text-sm font-medium text-gray-dark dark:text-gray-light uppercase tracking-wider">
                          <div>Food</div>
                          <div>Portion</div>
                          <div>Calories</div>
                        </div>
                        <div className="space-y-2">
                          {meal.foods.map((food: { name: string; portion: string; calories: number }) => (
                            <div
                              key={food.name + food.portion}
                              className="grid grid-cols-3 gap-2 sm:gap-4 py-2 text-xs sm:text-sm hover:bg-gray-lightest dark:hover:bg-secondary-light/10 rounded-lg transition-colors duration-200"
                            >
                              <div className="font-medium text-secondary dark:text-alabaster">
                                {food.name}
                              </div>
                              <div className="text-gray-dark dark:text-gray-light">
                                {food.portion}
                              </div>
                              <div className="text-gray-dark dark:text-gray-light">
                                {food.calories}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )))}
              </div>

              {/* Submit Completed Meals Button */}
              <div className="flex justify-end mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                <Button
                  variant="primary"
                  disabled={isSubmitting || isDaySubmitted || isActivationDay}
                  onClick={handleSubmitMeals}
                >
                  <span className="flex items-center gap-2">
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>Submitting...</span>
                      </>
                    ) : isDaySubmitted ? (
                      "Already Submitted"
                    ) : (
                      "Submit Completed Meals"
                    )}
                  </span>
                </Button>
              </div>

              {/* Activation Day Message */}
              {isActivationDay && dayOffset === 0 && (
                <div className="mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                  <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-blue-600 dark:text-blue-400">Meal Plan Activated Today</span>
                    </div>
                    <p>Your meal plan is now active! You can view today's meals, but tracking will take effect tomorrow.</p>
                  </div>
                </div>
              )}

              {/* Show message for past/future days */}
              {dayOffset !== 0 && (
                <div className="mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                  <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
                    {dayOffset < 0 
                      ? "This is a past day. Meal completion status is shown as recorded."
                      : "This is a future day. You can only submit today's meals."
                    }
                  </div>
                </div>
              )}

              {/* Show error if present */}
              {submitError && (
                <div className="text-red-600 text-sm mt-2">{submitError}</div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            {/* Meal Plan Info */}
            <Card title={mealPlan ? mealPlan.name : "Meal Plan"}>
              <div className="text-sm text-gray-dark dark:text-gray-light mb-6">
                {mealPlan && mealPlan.date}
              </div>

              {/* Daily Progress Summary */}
              <div className="mb-6 bg-gray-lightest dark:bg-secondary-light/20 rounded-xl p-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-secondary dark:text-alabaster">
                    Daily Progress
                  </h3>
                  <span className="text-sm text-gray-dark dark:text-gray-light">
                    {mealPlan && mealPlan.meals ? `${completedMealIds.length} of ${mealPlan.meals.length} meals` : "0 of 0 meals"}{" "}
                    completed
                  </span>
                </div>
                <div className="w-full bg-gray-300 dark:bg-davyGray rounded-full h-3 mb-2">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: mealPlan && mealPlan.meals && mealPlan.meals.length > 0
                        ? `${(completedMealIds.length / mealPlan.meals.length) * 100}%`
                        : "100%",
                    }}
                  ></div>
                </div>
                <div className="text-xs text-gray-dark dark:text-gray-light text-right">
                  {mealPlan && mealPlan.meals && mealPlan.meals.length > 0
                    ? Math.round((completedMealIds.length / mealPlan.meals.length) * 100)
                    : 100}
                  % complete
                </div>
              </div>

              <div className="space-y-4">
                {/* Macros Progress */}
                <div className="grid grid-cols-1 gap-4">
                  <MacroProgressCard
                    label="Calories"
                    completed={calculatedMacros.completed.calories}
                    total={calculatedMacros.total.calories}
                    colorClass="bg-primary"
                  />
                  <MacroProgressCard
                    label="Protein"
                    completed={calculatedMacros.completed.protein}
                    total={calculatedMacros.total.protein}
                    colorClass="bg-blue-500"
                    unit="g"
                  />
                  <MacroProgressCard
                    label="Carbs"
                    completed={calculatedMacros.completed.carbs}
                    total={calculatedMacros.total.carbs}
                    colorClass="bg-purple-500"
                    unit="g"
                  />
                  <MacroProgressCard
                    label="Fat"
                    completed={calculatedMacros.completed.fat}
                    total={calculatedMacros.total.fat}
                    colorClass="bg-yellow-500"
                    unit="g"
                  />
                </div>
              </div>
            </Card>

            {/* Compliance Calendar */}
            <Card title="Meal Compliance">
              <div className="space-y-3">
                {calendarData.map((day, index) => {
                  // Determine if this is today
                  const today = getCurrentDate();
                  const startOfWeek = getStartOfWeek();
                  const thisDate = startOfWeek.add(index, "day");
                  const isToday = thisDate.isSame(today, "day");
                  
                  // Determine status and display
                  let showNABadge = false;
                  let naReason = "";
                  
                  // Check if this day is before the user signed up
                  const signupDate = user?.created_at ? dayjs(user.created_at).tz(USER_TIMEZONE).startOf("day") : null;
                  const isBeforeSignup = signupDate && thisDate.isBefore(signupDate, "day");
                  
                  if (isBeforeSignup) {
                    showNABadge = true;
                    naReason = "You weren't signed up yet!";
                  } else if (day.status === "na") {
                    showNABadge = true;
                    naReason = day.complianceValue === -1 
                      ? "Meal plan added today - compliance starts tomorrow"
                      : "No meal plan has been created yet";
                  }
                  
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between py-3 px-4 border-b dark:border-davyGray last:border-0"
                    >
                      <div className="text-sm font-medium text-secondary dark:text-alabaster">
                        {day.date}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${
                            isBeforeSignup || day.status === "na"
                              ? "bg-gray-light dark:bg-davyGray"
                              : day.status === "pending"
                              ? isToday
                                ? "bg-green-500"
                                : "bg-gray-light dark:bg-davyGray"
                              : day.percentage >= 80
                              ? "bg-primary"
                              : day.percentage > 0
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                        ></span>
                        {showNABadge ? (
                          <NABadge reason={naReason} />
                        ) : (
                          <span className={`text-sm ${
                            isToday && day.status === "pending"
                              ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20'
                              : 'text-gray-dark dark:text-gray-light'
                          }`}>
                            {day.status === "pending" ? "Pending" : `${day.percentage}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
  );
}

// Helper component for macro progress cards
function MacroProgressCard({
  label,
  completed,
  total,
  colorClass,
  unit = "",
}: {
  label: string;
  completed: number;
  total: number;
  colorClass: string;
  unit?: string;
}) {
  const percentage = total === 0 ? 100 : Math.round((completed / total) * 100);

  return (
    <div className="bg-gray-lightest dark:bg-secondary-light/20 rounded-xl p-4">
      <div className="flex justify-between mb-2">
        <div className="text-xs text-gray-dark dark:text-gray-light uppercase font-medium">
          {label}
        </div>
        <div className="text-xs text-gray-dark dark:text-gray-light">
          {percentage}%
        </div>
      </div>
      <div className="flex justify-between mb-2">
        <div className="text-sm font-medium text-secondary dark:text-alabaster">
          {completed}
          {unit} / {total}
          {unit}
        </div>
      </div>
      <div className="w-full bg-gray-300 dark:bg-davyGray rounded-full h-2">
        <div
          className={`${colorClass} h-2 rounded-full transition-all duration-300 ease-out`}
          style={{
            width: `${Math.min(100, percentage)}%`,
          }}
        ></div>
      </div>
    </div>
  );
}