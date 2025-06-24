import { useState, useEffect } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
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
              const protein = food.food_library && typeof food.food_library === 'object' && 'protein' in food.food_library ? Number(food.food_library.protein) : Number(food.protein) || 0;
              const carbs = food.food_library && typeof food.food_library === 'object' && 'carbs' in food.food_library ? Number(food.food_library.carbs) : Number(food.carbs) || 0;
              const fat = food.food_library && typeof food.food_library === 'object' && 'fat' in food.food_library ? Number(food.food_library.fat) : Number(food.fat) || 0;
              // Always calculate calories from macros
              const calories = protein * 4 + carbs * 4 + fat * 9;
              return {
                id: food.id,
                name: food.name,
                portion: food.portion,
                calories,
                protein,
                carbs,
                fat,
              };
            });
            return { ...meal, foods };
          })
        );
        mealPlan = {
          name: plan.title,
          date: "", // Optionally format date range here
          meals,
        };
      }
    }
  }
  return json({ mealPlan });
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
  const liveMealPlan = loaderData?.mealPlan;
  const [dayOffset, setDayOffset] = useState(0);
  const [calendarData, setCalendarData] = useState(generateCalendarData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDaySubmitted, setIsDaySubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { checkedMeals, setCheckedMeals, addCheckedMeal, removeCheckedMeal, resetCheckedMeals, isHydrated } = useMealCompletion();

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

  // Fetch completed meals for the current day from backend
  useEffect(() => {
    async function fetchCompletedMeals() {
      setIsDaySubmitted(false);
      
      try {
        const res = await fetch(`/api/get-meal-completions?date=${currentDateApi}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.completedMealIds) && data.completedMealIds.length > 0) {
            // Convert meal IDs from backend to meal keys for frontend consistency
            const mealKeys = data.completedMealIds.map(String).map(getMealKeyFromId).filter(Boolean) as string[];
            setCheckedMeals(mealKeys);
            setIsDaySubmitted(true);
          } else {
            setIsDaySubmitted(false);
            // Don't clear checkedMeals here - let localStorage state persist
          }
        }
      } catch (e) {
        setIsDaySubmitted(false);
        // Don't clear checkedMeals here - let localStorage state persist
      }
    }
    
    // Only fetch if context is hydrated to avoid race conditions
    if (isHydrated) {
      fetchCompletedMeals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateApi, isHydrated]);

  // --- Compliance Calendar Backend Integration ---
  useEffect(() => {
    async function fetchWeekCompletions() {
      if (!liveMealPlan || !liveMealPlan.meals || liveMealPlan.meals.length === 0) {
        setCalendarData(generateCalendarData());
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
        if (res.ok) {
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
              const total = liveMealPlan.meals.length;
              const percentage = total > 0 ? Math.round((completed.length / total) * 100) : 0;
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
                if (completed.length === 0) {
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
        setCalendarData(generateCalendarData());
      }
    }
    fetchWeekCompletions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMealPlan]);

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

  // Function to handle "checked" state for meals
  const toggleMealCheck = (meal: { id: string | number; name: string; time: string }) => {
    const mealKey = createMealKey(meal);
    
    if (checkedMeals.includes(mealKey)) {
      removeCheckedMeal(mealKey);
    } else {
      addCheckedMeal(mealKey);
    }
  };

  // Helper function to convert between meal keys and IDs
  const createMealKey = (meal: { name: string; time: string }) => String(meal.name) + String(meal.time);
  
  const getMealIdFromKey = (mealKey: string) => {
    const meal = liveMealPlan?.meals?.find((m: any) => createMealKey(m) === mealKey);
    return meal ? String(meal.id) : null;
  };

  const getMealKeyFromId = (mealId: string) => {
    const meal = liveMealPlan?.meals?.find((m: any) => String(m.id) === mealId);
    return meal ? createMealKey(meal) : null;
  };

  // Calculate the macros based on the food items - need to convert keys back to check against meal IDs
  const completedMealIds = checkedMeals.map(getMealIdFromKey).filter(Boolean) as string[];
  const calculatedMacros = calculateMacros(liveMealPlan?.meals || [], completedMealIds);

  // Replace mockMealPlan with liveMealPlan if available
  const mealPlan = liveMealPlan;

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
                  setCheckedMeals([]);
                }}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
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
                      setDayOffset(0);
                      setCheckedMeals([]);
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
                  setCheckedMeals([]);
                }}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
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
              {!mealPlan || !mealPlan.meals || mealPlan.meals.length === 0 ? (
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
                                const mealKey = createMealKey(meal);
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
                            const mealKey = createMealKey(meal);
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
                  onClick={async () => {
                    setIsSubmitting(true);
                    setSubmitError(null);
                    try {
                      // Convert meal keys back to meal IDs for backend submission
                      const mealIdsForBackend = checkedMeals.map(getMealIdFromKey).filter(Boolean) as string[];
                      const body = {
                        completedMealIds: mealIdsForBackend,
                        date: currentDateApi,
                      };
                      const res = await fetch("/api/submit-meal-completions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      });
                      let responseJson = null;
                      try {
                        responseJson = await res.json();
                      } catch (e) {}
                      if (res.ok) {
                        setIsDaySubmitted(true);
                        setShowSuccess(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        setTimeout(() => setShowSuccess(false), 3000);
                        resetCheckedMeals();
                      } else {
                        setSubmitError(responseJson?.error || 'Submission failed.');
                      }
                    } catch (err) {
                      setSubmitError('Submission failed.');
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
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
                    {mealPlan && mealPlan.meals ? `${completedMealIds.length} of ${mealPlan.meals.length} meals` : "0 of 0 meals"}
                    completed
                  </span>
                </div>
                <div className="w-full bg-gray-300 dark:bg-davyGray rounded-full h-3 mb-2">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: mealPlan && mealPlan.meals && mealPlan.meals.length > 0
                        ? `${(completedMealIds.length / mealPlan.meals.length) * 100}%`
                        : "0%",
                    }}
                  ></div>
                </div>
                <div className="text-xs text-gray-dark dark:text-gray-light text-right">
                  {mealPlan && mealPlan.meals && mealPlan.meals.length > 0
                    ? Math.round((completedMealIds.length / mealPlan.meals.length) * 100)
                    : 0}
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
                        <span className="text-sm text-gray-dark dark:text-gray-light">
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