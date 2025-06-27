import { useState, useEffect, useCallback, useRef } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";

import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { useMealCompletion } from "~/context/MealCompletionContext";

export const meta: MetaFunction = () => {
  return [
    { title: "Meals | Vested Fitness" },
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
    let mealPlan = null;
    if (authId) {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );
      // Get user
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", authId)
        .single();
      if (user) {
        // Get active meal plan
        const { data: mealPlansRaw } = await supabase
          .from("meal_plans")
          .select("id, title, is_active, created_at")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        if (mealPlansRaw && mealPlansRaw.length > 0) {
          const plan = mealPlansRaw[0];
          const { data: mealsRaw } = await supabase
            .from("meals")
            .select("id, name, time, sequence_order")
            .eq("meal_plan_id", plan.id)
            .order("sequence_order", { ascending: true });
          const meals = await Promise.all(
            (mealsRaw || []).map(async (meal) => {
              // Join foods to food_library for macros
              const { data: foodsRaw } = await supabase
                .from("foods")
                .select(`id, name, portion, calories, protein, carbs, fat, food_library_id, food_library:food_library_id (calories, protein, carbs, fat)`)
                .eq("meal_id", meal.id);
              const foods = (foodsRaw || []).map((food) => {
                // Ensure all values are serializable numbers
                const protein = food.food_library && typeof food.food_library === 'object' && 'protein' in food.food_library ? Number(food.food_library.protein) || 0 : Number(food.protein) || 0;
                const carbs = food.food_library && typeof food.food_library === 'object' && 'carbs' in food.food_library ? Number(food.food_library.carbs) || 0 : Number(food.carbs) || 0;
                const fat = food.food_library && typeof food.food_library === 'object' && 'fat' in food.food_library ? Number(food.food_library.fat) || 0 : Number(food.fat) || 0;
                // Always calculate calories from macros and ensure no NaN
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
              return { 
                id: String(meal.id || ''),
                name: String(meal.name || ''),
                time: String(meal.time || ''),
                sequence_order: Number(meal.sequence_order) || 0,
                foods 
              };
            })
          );
          mealPlan = {
            name: String(plan.title || ''),
            date: "", // Optionally format date range here
            meals,
          };
        }
      }
    }
    return json({ mealPlan });
  } catch (error) {
    console.error('Error in meals loader:', error);
    return json({ mealPlan: null });
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Set to Sunday

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + index);

    return {
      date: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      status: date > today ? "pending" : "missed",
      percentage: 0,
    };
  });
};

export default function Meals() {
  const loaderData = useLoaderData<{ mealPlan: any }>();
  const todaysMealPlan = loaderData?.mealPlan;
  const [dayOffset, setDayOffset] = useState(0);
  const [calendarData, setCalendarData] = useState(generateCalendarData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDaySubmitted, setIsDaySubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { checkedMeals, setCheckedMeals, addCheckedMeal, removeCheckedMeal, resetCheckedMeals, clearCorruptedData, isHydrated } = useMealCompletion();
  const weekFetcher = useFetcher<{ meals: Record<string, any>, completions: Record<string, string[]> }>();
  
  // Track current week and cached meal data
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  });
  const [weekMeals, setWeekMeals] = useState<Record<string, any>>({});
  const [weekCompletions, setWeekCompletions] = useState<Record<string, string[]>>({});
  const [currentDayMealPlan, setCurrentDayMealPlan] = useState(todaysMealPlan);
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);

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
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
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
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dayOffset);
      const dateStr = targetDate.toISOString().slice(0, 10);
      
      // Check if we have this day's data in our cache
      const mealData = weekMeals[dateStr];
      
      if (mealData !== undefined) {
        // We have the data cached
        setCurrentDayMealPlan(mealData);
        setIsLoadingMeals(false);
      } else {
        // Need to fetch this week's data
        const weekStart = new Date(targetDate);
        const dayOfWeek = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        
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
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
  const currentDate = new Date(today);
  currentDate.setDate(today.getDate() + dayOffset);

  // Format current date for lookup
  const currentDateFormatted = currentDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  // Format for API (YYYY-MM-DD)
  const currentDateApi = currentDate.toISOString().slice(0, 10);

  // Update completion status when day changes or week data loads - OPTIMIZED
  useEffect(() => {
    if (!isHydrated || !isMountedRef.current) return; // Wait for hydration and check if mounted
    
    try {
      const dateStr = currentDate.toISOString().slice(0, 10);
      const dayCompletions = weekCompletions[dateStr] || [];
      
      console.log(`🔍 Checking completions for ${dateStr} (offset: ${dayOffset}):`, {
        dayCompletions,
        weekCompletions: Object.keys(weekCompletions),
        isHydrated,
        dayOffset
      });
      
      if (dayCompletions.length > 0) {
        // Convert meal IDs from backend to meal keys for frontend consistency
        const mealKeys = dayCompletions.map(String).map(getMealKeyFromId).filter(Boolean) as string[];
        console.log(`✅ Found ${dayCompletions.length} completions, converted to ${mealKeys.length} meal keys:`, mealKeys);
        setCheckedMeals(mealKeys);
        setIsDaySubmitted(true);
      } else {
        console.log(`❌ No completions found in cache for ${dateStr}`);
        setIsDaySubmitted(false);
        // For today, check the backend for real-time data - but only once per day change
        if (dayOffset === 0) {
          console.log('📡 Fetching real-time data for today...');
          fetchCompletedMealsForToday();
        } else {
          // For other days, clear the checked meals if no completions found
          console.log(`🧹 Clearing checked meals for day offset ${dayOffset}`);
          setCheckedMeals([]);
        }
      }
    } catch (error) {
      console.error('Error updating completion status:', error);
    }
  }, [currentDateApi, weekCompletions, dayOffset, isHydrated]); // Removed setCheckedMeals from dependencies

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
          setIsDaySubmitted(true);
        }
      }
    } catch (e) {
      // Ignore errors, use cached data
    }
  }, [currentDateApi, currentDayMealPlan]); // Removed setCheckedMeals from dependencies

  // --- Compliance Calendar Backend Integration --- STABLE VERSION
  useEffect(() => {
    let isCancelled = false;
    
    async function fetchWeekCompletions() {
      if (!isMountedRef.current) return;
      
      if (!currentDayMealPlan || !currentDayMealPlan.meals || currentDayMealPlan.meals.length === 0) {
        if (!isCancelled) {
          setCalendarData(generateCalendarData());
        }
        return;
      }
      
      // Get start and end of week (Sunday to Saturday)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const startStr = startOfWeek.toISOString().slice(0, 10);
      const endStr = endOfWeek.toISOString().slice(0, 10);
      
      try {
        const res = await fetch(`/api/get-meal-completions?start=${startStr}&end=${endStr}`);
        if (res.ok && !isCancelled && isMountedRef.current) {
          const data = await res.json();
          const completionsByDate = data.completionsByDate || {};
          setCalendarData(
            Array.from({ length: 7 }).map((_, index) => {
              const date = new Date(startOfWeek);
              date.setDate(startOfWeek.getDate() + index);
              date.setHours(0, 0, 0, 0);
              const dateStr = date.toISOString().slice(0, 10);
              const prettyDate = date.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const completed = completionsByDate[dateStr] || [];
              // Deduplicate completed meal IDs to prevent inflated percentages
              const uniqueCompleted = [...new Set(completed)];
              
              // Debug logging in development
              if (process.env.NODE_ENV === 'development' && completed.length !== uniqueCompleted.length) {
                console.warn(`Duplicates detected for ${dateStr}: ${completed.length} total, ${uniqueCompleted.length} unique`, completed);
              }
              const total = currentDayMealPlan.meals.length;
              const percentage = total > 0 ? Math.round((uniqueCompleted.length / total) * 100) : 0;
              const todayDate = new Date();
              todayDate.setHours(0, 0, 0, 0);
              let status;
              if (date.getTime() > todayDate.getTime()) {
                status = "pending";
                return {
                  date: prettyDate,
                  status,
                  percentage: 0,
                };
              } else if (date.getTime() === todayDate.getTime()) {
                // Today
                if (uniqueCompleted.length === 0) {
                  status = "pending";
                  return {
                    date: prettyDate,
                    status,
                    percentage: 0,
                  };
                } else {
                  status = "completed";
                  return {
                    date: prettyDate,
                    status,
                    percentage,
                  };
                }
              } else {
                // Past
                status = "completed";
                return {
                  date: prettyDate,
                  status,
                  percentage,
                };
              }
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
  const getFormattedDate = (date: Date, today: Date) => {
    const diffInDays = Math.floor(
      (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (diffInDays) {
      case 0:
        return "Today";
      case 1:
        return "Tomorrow";
      case -1:
        return "Yesterday";
      default:
        return date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
    }
  };

  const formattedDate = getFormattedDate(currentDate, today);

  // Helper function to convert between meal keys and IDs - MOVED UP
  const createMealKey = (meal: { id: number | string; name: string; time: string }) => `${meal.id}-${meal.name}-${meal.time}`;
  
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

  // Handle meal submission - MEMOIZED AND OPTIMIZED
  const handleSubmitMeals = useCallback(async () => {
    if (isSubmitting || isDaySubmitted) return; // Prevent double submission
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Convert meal keys back to meal IDs for backend submission - with deduplication
      const mealIdsForBackend = [...new Set(checkedMeals.map(getMealIdFromKey).filter(Boolean))] as string[];
      
      const body = {
        completedMealIds: mealIdsForBackend,
        date: currentDateApi,
      };
      
      console.log('🚀 Submitting meal completions:', body);
      
      const res = await fetch("/api/submit-meal-completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      let responseJson = null;
      try {
        responseJson = await res.json();
        console.log('📨 Submission response:', { status: res.status, data: responseJson });
      } catch (e) {
        console.error('Failed to parse response JSON:', e);
      }
      
      if (res.ok) {
        // Update local state to reflect submission
        setIsDaySubmitted(true);
        
        // Update week completions cache to prevent re-fetching
        setWeekCompletions(prev => ({
          ...prev,
          [currentDateApi]: mealIdsForBackend
        }));
        
        // Update compliance calendar immediately for today
        setCalendarData(prev => 
          prev.map(day => {
            if (day.date === currentDate.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })) {
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
        
        // Show success message
        setShowSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setShowSuccess(false), 3000);
        
        // Don't reset checked meals - keep them visible for user feedback
      } else {
        setSubmitError(responseJson?.error || 'Submission failed.');
      }
    } catch (err) {
      setSubmitError('Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, isDaySubmitted, checkedMeals, currentDateApi, getMealIdFromKey]);

  // Calculate the macros based on the food items - need to convert keys back to check against meal IDs with deduplication
  const completedMealIds = [...new Set(checkedMeals.map(getMealIdFromKey).filter(Boolean))] as string[];
  
  // Debug the meal ID conversion
  if (process.env.NODE_ENV === 'development' && checkedMeals.length > 0) {
    console.log('🔍 Meal ID Conversion Debug:', {
      checkedMeals,
      convertedIds: checkedMeals.map(key => ({
        key,
        id: getMealIdFromKey(key),
        meal: currentDayMealPlan?.meals?.find((m: any) => String(m.id) === getMealIdFromKey(key))
      })),
      finalCompletedIds: completedMealIds,
      currentDayMealPlan: currentDayMealPlan?.meals?.map((m: any) => ({ id: m.id, name: m.name, time: m.time }))
    });
  }
  
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

      {/* Debug Info in Development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1">
            <div><strong>Debug Info:</strong></div>
            <div>• Day Offset: {dayOffset} (0 = today)</div>
            <div>• Current Date: {currentDateApi}</div>
            <div>• Completed Meals: {completedMealIds.length} / {mealPlan?.meals?.length || 0}</div>
            <div>• Is Day Submitted: {isDaySubmitted ? 'Yes' : 'No'}</div>
            <div>• Is Hydrated: {isHydrated ? 'Yes' : 'No'}</div>
            <div>• Checked Meals: [{checkedMeals.join(', ')}]</div>
            <div>• Week Completions for this date: [{(weekCompletions[currentDateApi] || []).join(', ')}]</div>
            {completedMealIds.length > (mealPlan?.meals?.length || 0) && (
              <div className="text-red-600 dark:text-red-400 font-bold">⚠️ DATA CORRUPTION DETECTED</div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={clearCorruptedData}
              className="px-3 py-1 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded text-xs hover:bg-yellow-300 dark:hover:bg-yellow-700"
            >
              Clear localStorage
            </button>
            <button
              onClick={async () => {
                const res = await fetch(`/api/get-meal-completions?date=${currentDateApi}`);
                const data = await res.json();
                console.log(`API Response for ${currentDateApi}:`, data);
              }}
              className="px-3 py-1 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs hover:bg-blue-300 dark:hover:bg-blue-700"
            >
              Test API
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          {/* Today's Meals */}
          <Card>
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => {
                  console.log(`Navigating to day offset: ${dayOffset - 1}`);
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
                  {currentDate.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                {dayOffset !== 0 && (
                  <button
                    onClick={() => {
                      console.log('Navigating back to today');
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
                  console.log(`Navigating to day offset: ${dayOffset + 1}`);
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
                            isDaySubmitted
                              ? "text-gray-dark dark:text-gray-light"
                              : "text-gray-dark dark:text-gray-light cursor-pointer"
                          } select-none`}
                        >
                          {!isHydrated
                            ? "Loading..."
                            : (() => {
                                const mealKey = createMealKey({ id: meal.id, name: meal.name, time: meal.time });
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
                              !isDaySubmitted && toggleMealCheck(meal);
                            }}
                          disabled={isDaySubmitted || !isHydrated}
                          className={`w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-light dark:border-davyGray text-primary focus:ring-primary ${
                            isDaySubmitted || !isHydrated
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
                  disabled={isSubmitting || isDaySubmitted}
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
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const startOfWeek = new Date(today);
                  startOfWeek.setDate(today.getDate() - today.getDay());
                  const thisDate = new Date(startOfWeek);
                  thisDate.setDate(startOfWeek.getDate() + index);
                  thisDate.setHours(0, 0, 0, 0);
                  const isToday = thisDate.getTime() === today.getTime();
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between py-3 border-b dark:border-davyGray last:border-0"
                    >
                      <div className="text-sm font-medium text-secondary dark:text-alabaster">
                        {day.date}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${
                            day.status === "pending"
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
                        <span className={`text-sm ${
                          isToday && day.status === "pending"
                            ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20'
                            : 'text-gray-dark dark:text-gray-light'
                        }`}>
                          {day.status === "pending"
                            ? "Pending"
                            : `${day.percentage}%`}
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