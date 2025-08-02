import React, { useState, useEffect } from "react";

interface Food {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: string | number;
  name: string;
  time: string;
  mealOption: 'A' | 'B';
  foods: Food[];
}

interface MealOptionsCardProps {
  meals: Meal[];
  onMealSelect: (meal: Meal) => void;
  selectedMealId?: string | number;
  isDaySubmitted?: boolean;
  isActivationDay?: boolean;
  isHydrated?: boolean;
  createMealKey: (meal: { id: string | number; name: string; time: string; mealOption?: 'A' | 'B' }) => string;
  checkedMeals?: string[];
  toggleMealCheck: (meal: Meal) => void;
}

export default function MealOptionsCard({
  meals,
  onMealSelect,
  selectedMealId,
  isDaySubmitted = false,
  isActivationDay = false,
  isHydrated = true,
  createMealKey,
  checkedMeals = [],
  toggleMealCheck,
}: MealOptionsCardProps) {
  const [selectedOption, setSelectedOption] = useState<'A' | 'B'>(
    meals.find(m => m.id === selectedMealId)?.mealOption || 'A'
  );

  // Group meals by name and time
  const mealGroups = meals.reduce((groups, meal) => {
    const key = `${meal.name}-${meal.time}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(meal);
    return groups;
  }, {} as Record<string, Meal[]>);

  const handleOptionSelect = (option: 'A' | 'B') => {
    setSelectedOption(option);
    const selectedMeal = meals.find(m => m.mealOption === option);
    if (selectedMeal) {
      onMealSelect(selectedMeal);
    }
  };

  // Update selected option when selectedMealId changes
  useEffect(() => {
    if (selectedMealId) {
      const meal = meals.find(m => m.id === selectedMealId);
      if (meal) {
        setSelectedOption(meal.mealOption);
      }
    }
  }, [selectedMealId, meals]);

  return (
    <div className="space-y-4">
      {Object.entries(mealGroups).map(([key, mealOptions]) => {
        const mealA = mealOptions.find(m => m.mealOption === 'A');
        const mealB = mealOptions.find(m => m.mealOption === 'B');
        const hasMealB = !!mealB;
        const currentMeal = selectedOption === 'A' ? mealA : mealB;
        
        if (!currentMeal) return null;

        const mealKey = createMealKey({ 
          id: currentMeal.id, 
          name: currentMeal.name, 
          time: currentMeal.time,
          mealOption: currentMeal.mealOption
        });
        
        // Check if any meal in this group is completed (for A/B options)
        const isAnyMealInGroupChecked = mealOptions.some(meal => {
          const key = createMealKey({ 
            id: meal.id, 
            name: meal.name, 
            time: meal.time,
            mealOption: meal.mealOption // Include the mealOption in the key
          });
          return isHydrated && checkedMeals.includes(key);
        });
        
        const isChecked = isAnyMealInGroupChecked;

        return (
          <div
            key={key}
            className="relative border border-gray-light dark:border-davyGray rounded-xl p-4 sm:p-6 transition-all duration-200 hover:shadow-md"
          >
            {/* Meal Options Selector */}
            {hasMealB && (
              <div className="mb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-dark dark:text-gray-light">Choose your meal:</span>
                  <div className="flex bg-gray-light dark:bg-davyGray rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => handleOptionSelect('A')}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        selectedOption === 'A'
                          ? "bg-primary text-white shadow-sm"
                          : "text-gray-dark dark:text-gray-light hover:text-secondary dark:hover:text-alabaster"
                      }`}
                    >
                      Option A
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOptionSelect('B')}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        selectedOption === 'B'
                          ? "bg-primary text-white shadow-sm"
                          : "text-gray-dark dark:text-gray-light hover:text-secondary dark:hover:text-alabaster"
                      }`}
                    >
                      Option B
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-secondary dark:text-alabaster mb-1">
                  {currentMeal.name}
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
                  {currentMeal.time.includes(':') ? currentMeal.time.slice(0, 5) : currentMeal.time}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <label
                  htmlFor={`meal-${currentMeal.id}`}
                  className={`text-xs sm:text-sm ${
                    isDaySubmitted || isActivationDay
                      ? "text-gray-dark dark:text-gray-light"
                      : "text-gray-dark dark:text-gray-light cursor-pointer"
                  } select-none`}
                >
                  {!isHydrated
                    ? "Loading..."
                    : (() => {
                        if (isActivationDay) {
                          return "Activation Day";
                        }
                        return isChecked
                          ? "Completed"
                          : isDaySubmitted
                          ? "Not Completed"
                          : "Mark as complete";
                      })()}
                </label>
                <input
                  type="checkbox"
                  id={`meal-${currentMeal.id}`}
                  value={currentMeal.id}
                  checked={isChecked}
                  onChange={() => {
                    if (!isDaySubmitted && !isActivationDay && isHydrated) {
                      // If any meal in the group is checked, uncheck all meals in the group
                      if (isAnyMealInGroupChecked) {
                        mealOptions.forEach(meal => {
                          const key = createMealKey({ 
                            id: meal.id, 
                            name: meal.name, 
                            time: meal.time,
                            mealOption: meal.mealOption
                          });
                          if (checkedMeals.includes(key)) {
                            toggleMealCheck(meal);
                          }
                        });
                      } else {
                        // Otherwise, check the currently selected meal
                        toggleMealCheck(currentMeal);
                      }
                    }
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
                  {currentMeal.foods.map((food: Food) => (
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

            {/* Macros Summary */}
            <div className="mt-4 pt-4 border-t border-gray-light dark:border-davyGray">
              <div className="grid grid-cols-4 gap-2 text-xs sm:text-sm">
                <div className="text-center">
                  <div className="text-gray-dark dark:text-gray-light">Calories</div>
                  <div className="font-medium text-secondary dark:text-alabaster">
                    {currentMeal.foods.reduce((sum, food) => sum + food.calories, 0)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-dark dark:text-gray-light">Protein</div>
                  <div className="font-medium text-secondary dark:text-alabaster">
                    {currentMeal.foods.reduce((sum, food) => sum + food.protein, 0)}g
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-dark dark:text-gray-light">Carbs</div>
                  <div className="font-medium text-secondary dark:text-alabaster">
                    {currentMeal.foods.reduce((sum, food) => sum + food.carbs, 0)}g
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-dark dark:text-gray-light">Fat</div>
                  <div className="font-medium text-secondary dark:text-alabaster">
                    {currentMeal.foods.reduce((sum, food) => sum + food.fat, 0)}g
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
} 