import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";

export const meta: MetaFunction = () => {
  return [
    { title: "Meals | Vested Fitness" },
    { name: "description", content: "View and track your meal plans" },
  ];
};

// Mock meal plan data
const mockMealPlan = {
  name: "2000 Calories Meal Plan",
  date: "April 8-14, 2024",
  meals: [
    {
      id: 1,
      name: "Breakfast",
      time: "7:00 AM",
      foods: [
        {
          name: "Protein Oatmeal",
          portion: "1 cup",
          calories: 350,
          protein: 25,
          carbs: 40,
          fat: 8,
        },
        {
          name: "Blueberries",
          portion: "1/2 cup",
          calories: 40,
          protein: 0,
          carbs: 10,
          fat: 0,
        },
        {
          name: "Almond Butter",
          portion: "1 tbsp",
          calories: 100,
          protein: 3,
          carbs: 3,
          fat: 9,
        },
      ],
    },
    {
      id: 2,
      name: "Morning Snack",
      time: "10:00 AM",
      foods: [
        {
          name: "Greek Yogurt",
          portion: "1 cup",
          calories: 130,
          protein: 22,
          carbs: 8,
          fat: 0,
        },
        {
          name: "Almonds",
          portion: "1 oz",
          calories: 160,
          protein: 6,
          carbs: 6,
          fat: 14,
        },
      ],
    },
    {
      id: 3,
      name: "Lunch",
      time: "1:00 PM",
      foods: [
        {
          name: "Chicken Breast",
          portion: "6 oz",
          calories: 180,
          protein: 36,
          carbs: 0,
          fat: 4,
        },
        {
          name: "Brown Rice",
          portion: "1 cup",
          calories: 220,
          protein: 5,
          carbs: 45,
          fat: 2,
        },
        {
          name: "Mixed Vegetables",
          portion: "1 cup",
          calories: 50,
          protein: 2,
          carbs: 10,
          fat: 0,
        },
        {
          name: "Olive Oil",
          portion: "1 tsp",
          calories: 40,
          protein: 0,
          carbs: 0,
          fat: 4.5,
        },
      ],
    },
    {
      id: 4,
      name: "Afternoon Snack",
      time: "4:00 PM",
      foods: [
        {
          name: "Protein Shake",
          portion: "1 scoop",
          calories: 120,
          protein: 25,
          carbs: 3,
          fat: 1.5,
        },
        {
          name: "Banana",
          portion: "1 medium",
          calories: 105,
          protein: 1.3,
          carbs: 27,
          fat: 0.4,
        },
      ],
    },
    {
      id: 5,
      name: "Dinner",
      time: "7:00 PM",
      foods: [
        {
          name: "Salmon",
          portion: "6 oz",
          calories: 240,
          protein: 36,
          carbs: 0,
          fat: 10,
        },
        {
          name: "Sweet Potato",
          portion: "1 medium",
          calories: 110,
          protein: 2,
          carbs: 26,
          fat: 0,
        },
        {
          name: "Asparagus",
          portion: "1 cup",
          calories: 40,
          protein: 4,
          carbs: 7,
          fat: 0,
        },
        {
          name: "Avocado",
          portion: "1/4",
          calories: 80,
          protein: 1,
          carbs: 4,
          fat: 7,
        },
      ],
    },
  ],
};

// Function to calculate the total macros from all foods in the meal plan
const calculateMacros = (
  meals: Array<{
    id: number;
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
  completedMealIds: number[] = []
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
    const isCompleted = completedMealIds.includes(meal.id);

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
  const [dayOffset, setDayOffset] = useState(0);
  const [calendarData, setCalendarData] = useState(generateCalendarData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submittedDays, setSubmittedDays] = useState<{
    [key: string]: number[];
  }>({});

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

  // Get submitted meals for current day
  const submittedMealsForDay = submittedDays[currentDateFormatted] || [];
  const isDaySubmitted = submittedMealsForDay.length > 0;

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
  const [checkedMeals, setCheckedMeals] = useState<number[]>([]);

  const toggleMealCheck = (mealId: number) => {
    if (checkedMeals.includes(mealId)) {
      setCheckedMeals(checkedMeals.filter((id) => id !== mealId));
    } else {
      setCheckedMeals([...checkedMeals, mealId]);
    }
  };

  // Calculate the macros based on the food items
  const calculatedMacros = calculateMacros(mockMealPlan.meals, checkedMeals);

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
              {mockMealPlan.meals.map((meal) => (
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
                        {(isDaySubmitted &&
                          submittedMealsForDay.includes(meal.id)) ||
                        (!isDaySubmitted && checkedMeals.includes(meal.id))
                          ? "Completed"
                          : isDaySubmitted
                          ? "Not Completed"
                          : "Mark as complete"}
                      </label>
                      <input
                        type="checkbox"
                        id={`meal-${meal.id}`}
                        checked={
                          isDaySubmitted
                            ? submittedMealsForDay.includes(meal.id)
                            : checkedMeals.includes(meal.id)
                        }
                        onChange={() =>
                          !isDaySubmitted && toggleMealCheck(meal.id)
                        }
                        disabled={isDaySubmitted}
                        className={`w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-light dark:border-davyGray text-primary focus:ring-primary ${
                          isDaySubmitted
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
                        {meal.foods.map((food, index) => (
                          <div
                            key={index}
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
              ))}
            </div>

            {/* Submit Completed Meals Button */}
            <div className="flex justify-end mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
              <Button
                variant="primary"
                disabled={isSubmitting || isDaySubmitted}
                onClick={async () => {
                  setIsSubmitting(true);

                  try {
                    // Calculate completion percentage
                    const completionPercentage = Math.round(
                      (checkedMeals.length / mockMealPlan.meals.length) * 100
                    );

                    // Format the current date to match calendar format
                    const currentDateFormatted = currentDate.toLocaleDateString(
                      "en-US",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      }
                    );

                    // Simulate API call with setTimeout
                    await new Promise((resolve) => setTimeout(resolve, 1000));

                    // Update calendar status based on completion percentage
                    setCalendarData((prevData) =>
                      prevData.map((day) =>
                        day.date === currentDateFormatted
                          ? {
                              ...day,
                              percentage: completionPercentage,
                              status:
                                completionPercentage >= 80
                                  ? "completed"
                                  : completionPercentage > 0
                                  ? "partial"
                                  : "missed",
                            }
                          : day
                      )
                    );

                    // Store the submitted meals for this day
                    setSubmittedDays((prev) => ({
                      ...prev,
                      [currentDateFormatted]: [...checkedMeals],
                    }));

                    // Show success message
                    setShowSuccess(true);

                    // Scroll to top smoothly
                    window.scrollTo({ top: 0, behavior: "smooth" });

                    // Hide success message after 3 seconds
                    setTimeout(() => {
                      setShowSuccess(false);
                    }, 3000);
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
          </Card>
        </div>

        <div className="space-y-6">
          {/* Meal Plan Info */}
          <Card title={mockMealPlan.name}>
            <div className="text-sm text-gray-dark dark:text-gray-light mb-6">
              {mockMealPlan.date}
            </div>

            {/* Daily Progress Summary */}
            <div className="mb-6 bg-gray-lightest dark:bg-secondary-light/20 rounded-xl p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-secondary dark:text-alabaster">
                  Daily Progress
                </h3>
                <span className="text-sm text-gray-dark dark:text-gray-light">
                  {checkedMeals.length} of {mockMealPlan.meals.length} meals
                  completed
                </span>
              </div>
              <div className="w-full bg-gray-300 dark:bg-davyGray rounded-full h-3 mb-2">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      (checkedMeals.length / mockMealPlan.meals.length) * 100
                    }%`,
                  }}
                ></div>
              </div>
              <div className="text-xs text-gray-dark dark:text-gray-light text-right">
                {Math.round(
                  (checkedMeals.length / mockMealPlan.meals.length) * 100
                )}
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
              {calendarData.map((day, index) => (
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
                        day.percentage >= 80
                          ? "bg-primary"
                          : day.percentage > 0
                          ? "bg-yellow-500"
                          : day.status === "pending"
                          ? "bg-gray-light dark:bg-davyGray"
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
              ))}
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
  const percentage = Math.round((completed / total) * 100) || 0;

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
