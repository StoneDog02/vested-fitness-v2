import React, { useState, useEffect } from "react";
import Button from "~/components/ui/Button";

interface Food {
  name: string;
  portion: string;
  calories: number | string;
  protein: number | string;
  carbs: number | string;
  fat: number | string;
}

interface Meal {
  id: number;
  name: string;
  time: string;
  foods: Food[];
  mealOption?: 'A' | 'B'; // Add meal option field
}

export interface MealPlanFormData {
  title: string;
  description: string;
  meals: Meal[];
}

interface CreateMealPlanFormProps {
  onSubmit: (data: MealPlanFormData) => void;
  onCancel: () => void;
  initialData?: MealPlanFormData;
  isLoading?: boolean;
}

// Simple food item component without drag-and-drop
interface FoodItemProps {
  food: Food;
  foodIndex: number;
  activeMealIndex: number;
  foodsLength: number;
  updateFood: (
    mealIndex: number,
    foodIndex: number,
    field: keyof Food,
    value: string | number,
    isBlur?: boolean
  ) => void;
  removeFood: (mealIndex: number, foodIndex: number) => void;
}

function FoodItem({
  food,
  foodIndex,
  activeMealIndex,
  foodsLength,
  updateFood,
  removeFood,
}: FoodItemProps) {
  return (
    <div className="p-5 bg-white dark:bg-night border border-gray-light/50 dark:border-davyGray/30 rounded-xl shadow-soft">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <h5 className="text-sm font-semibold text-secondary dark:text-alabaster">
              Food Item {foodIndex + 1}
            </h5>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => removeFood(activeMealIndex, foodIndex)}
            className="text-red-500 hover:text-red-700 text-sm font-medium hover:underline transition-colors duration-200"
            disabled={foodsLength <= 1}
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor={`food-name-${activeMealIndex}-${foodIndex}`}
            className="block text-xs font-semibold text-secondary dark:text-alabaster mb-2"
          >
            Food Name
          </label>
          <input
            type="text"
            id={`food-name-${activeMealIndex}-${foodIndex}`}
            value={food.name}
            onChange={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "name",
                e.target.value
              )
            }
            className="w-full px-3 py-2.5 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster text-sm shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="e.g., Chicken Breast"
          />
        </div>
        <div>
          <label
            htmlFor={`food-portion-${activeMealIndex}-${foodIndex}`}
            className="block text-xs font-semibold text-secondary dark:text-alabaster mb-2"
          >
            Portion
          </label>
          <input
            type="text"
            id={`food-portion-${activeMealIndex}-${foodIndex}`}
            value={food.portion}
            onChange={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "portion",
                e.target.value
              )
            }
            className="w-full px-3 py-2.5 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster text-sm shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="e.g., 6 oz"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <span
            className="block text-xs font-semibold text-secondary dark:text-alabaster mb-2"
            id={`food-calories-label-${activeMealIndex}-${foodIndex}`}
          >
            Calories
          </span>
          <div
            className="w-full px-3 py-2.5 border border-gray-light dark:border-davyGray rounded-lg bg-gray-50 dark:bg-night text-secondary dark:text-alabaster text-sm flex items-center min-h-[42px] shadow-inner-soft"
            role="status"
            aria-labelledby={`food-calories-label-${activeMealIndex}-${foodIndex}`}
          >
            {Number(food.calories) || 0}
          </div>
        </div>
        <div>
          <label
            htmlFor={`food-protein-${activeMealIndex}-${foodIndex}`}
            className="block text-xs font-semibold text-secondary dark:text-alabaster mb-2"
          >
            Protein (g)
          </label>
          <input
            type="number"
            id={`food-protein-${activeMealIndex}-${foodIndex}`}
            value={food.protein === 0 ? "" : food.protein}
            onChange={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "protein",
                e.target.value
              )
            }
            onBlur={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "protein",
                e.target.value,
                true
              )
            }
            className="w-full px-3 py-2.5 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster text-sm shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="0"
          />
        </div>
        <div>
          <label
            htmlFor={`food-carbs-${activeMealIndex}-${foodIndex}`}
            className="block text-xs font-semibold text-secondary dark:text-alabaster mb-2"
          >
            Carbs (g)
          </label>
          <input
            type="number"
            id={`food-carbs-${activeMealIndex}-${foodIndex}`}
            value={food.carbs === 0 ? "" : food.carbs}
            onChange={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "carbs",
                e.target.value
              )
            }
            onBlur={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "carbs",
                e.target.value,
                true
              )
            }
            className="w-full px-3 py-2.5 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster text-sm shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="0"
          />
        </div>
        <div>
          <label
            htmlFor={`food-fat-${activeMealIndex}-${foodIndex}`}
            className="block text-xs font-semibold text-secondary dark:text-alabaster mb-2"
          >
            Fat (g)
          </label>
          <input
            type="number"
            id={`food-fat-${activeMealIndex}-${foodIndex}`}
            value={food.fat === 0 ? "" : food.fat}
            onChange={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "fat",
                e.target.value
              )
            }
            onBlur={(e) =>
              updateFood(
                activeMealIndex,
                foodIndex,
                "fat",
                e.target.value,
                true
              )
            }
            className="w-full px-3 py-2.5 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster text-sm shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}


export default function CreateMealPlanForm({
  onSubmit,
  onCancel,
  initialData,
  isLoading = false,
}: CreateMealPlanFormProps) {
  // Initialize form data when editing
  React.useEffect(() => {
    if (initialData) {
      // Form data will be initialized from initialData
    }
  }, [initialData]);

  const [formData, setFormData] = useState<MealPlanFormData>(
    initialData || {
      title: "",
      description: "",
      meals: [
        {
          id: 1,
          name: "",
          time: "",
          foods: [
            {
              name: "",
              portion: "",
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
            },
          ],
          mealOption: 'A',
        },
      ],
    }
  );

  const [activeMealIndex, setActiveMealIndex] = useState(0);
  


  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const addMeal = () => {
    const newMeal: Meal = {
      id: formData.meals.length + 1,
      name: "",
      time: "",
      foods: [
        {
          name: "",
          portion: "",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,

        },
      ],
      mealOption: 'A',
    };

    setFormData((prev) => ({
      ...prev,
      meals: [...prev.meals, newMeal],
    }));
    setActiveMealIndex(formData.meals.length);
  };

  const addMealOption = (mealIndex: number) => {
    const existingMeal = formData.meals[mealIndex];
    const newMeal: Meal = {
      id: formData.meals.length + 1,
      name: existingMeal.name,
      time: existingMeal.time,
      foods: [
        {
          name: "",
          portion: "",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,

        },
      ],
      mealOption: 'B',
    };

    setFormData((prev) => ({
      ...prev,
      meals: [...prev.meals, newMeal],
    }));
    setActiveMealIndex(formData.meals.length);
  };

  const updateMeal = (
    index: number,
    field: "name" | "time" | "foods" | "mealOption",
    value: string | Food[] | 'A' | 'B'
  ) => {
    const updatedMeals = [...formData.meals];
    if (field === "foods") {
      updatedMeals[index][field] = value as Food[];
    } else if (field === "mealOption") {
      updatedMeals[index][field] = value as 'A' | 'B';
    } else {
      updatedMeals[index][field] = value as string;
    }

    setFormData((prev) => ({
      ...prev,
      meals: updatedMeals,
    }));
  };

  const addFood = (mealIndex: number) => {
    const updatedMeals = [...formData.meals];
    const newFood: Food = {
      name: "",
      portion: "",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };

    updatedMeals[mealIndex].foods.push(newFood);

    setFormData((prev) => ({
      ...prev,
      meals: updatedMeals,
    }));
  };



  const updateFood = (
    mealIndex: number,
    foodIndex: number,
    field: keyof Food,
    value: string | number,
    isBlur?: boolean
  ) => {
    setFormData((prev) => {
      const updatedMeals = [...prev.meals];
      const updatedFoods = [...updatedMeals[mealIndex].foods];
      const food = updatedFoods[foodIndex];
      
      // Simple approach: always update the current food item
      if (field === "protein" || field === "carbs" || field === "fat") {
        if (isBlur) {
          updatedFoods[foodIndex][field] = value === "" ? 0 : Number(value);
        } else {
          updatedFoods[foodIndex][field] = value as string;
        }
        // Always recalculate calories
        const protein = Number(field === "protein" ? value : updatedFoods[foodIndex].protein) || 0;
        const carbs = Number(field === "carbs" ? value : updatedFoods[foodIndex].carbs) || 0;
        const fat = Number(field === "fat" ? value : updatedFoods[foodIndex].fat) || 0;
        updatedFoods[foodIndex].calories = protein * 4 + carbs * 4 + fat * 9;
      } else {
        updatedFoods[foodIndex][field] = value as string;
      }
      
      updatedMeals[mealIndex].foods = updatedFoods;
      return { ...prev, meals: updatedMeals };
    });
  };

  const removeFood = (mealIndex: number, foodIndex: number) => {
    const updatedMeals = [...formData.meals];
    updatedMeals[mealIndex].foods.splice(foodIndex, 1);

    // Ensure at least one food item remains
    if (updatedMeals[mealIndex].foods.length === 0) {
              updatedMeals[mealIndex].foods.push({
          name: "",
          portion: "",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,

        });
    }

    setFormData((prev) => ({
      ...prev,
      meals: updatedMeals,
    }));
  };

  const removeMeal = (index: number) => {
    if (formData.meals.length <= 1) {
      return; // Don't remove the last meal
    }

    const updatedMeals = [...formData.meals];
    updatedMeals.splice(index, 1);

    setFormData((prev) => ({
      ...prev,
      meals: updatedMeals,
    }));

    // Adjust active meal index if needed
    if (activeMealIndex >= updatedMeals.length) {
      setActiveMealIndex(updatedMeals.length - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Calculate total macros dynamically based on currently selected meal options
  const calculateTotalMacros = () => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    // Group meals by name and time
    const mealGroups = formData.meals.reduce((groups, meal) => {
      const key = `${meal.name}-${meal.time}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(meal);
      return groups;
    }, {} as Record<string, Meal[]>);

    // For each meal group, determine which meal option to count based on current selection
    Object.values(mealGroups).forEach((groupMeals) => {
      if (groupMeals.length === 1) {
        // Only one meal option, count it
        const meal = groupMeals[0];
        meal.foods.forEach((food) => {
          totalCalories += Number(food.calories);
          totalProtein += Number(food.protein);
          totalCarbs += Number(food.carbs);
          totalFat += Number(food.fat);
        });
      } else if (groupMeals.length > 1) {
        // Multiple meal options (A/B), determine which one to count
        const mealA = groupMeals.find(m => m.mealOption === 'A');
        const mealB = groupMeals.find(m => m.mealOption === 'B');
        
        // Determine which meal option is currently "active" for this group
        let mealToCount: Meal | undefined;
        
        if (mealA && mealB) {
          // Check if the currently active meal index corresponds to this meal group
          const currentMeal = formData.meals[activeMealIndex];
          if (currentMeal && 
              currentMeal.name === mealA.name && 
              currentMeal.time === mealA.time) {
            // We're currently viewing this meal group, count the active option
            mealToCount = currentMeal;
          } else {
            // We're not currently viewing this meal group, default to Meal A
            mealToCount = mealA;
          }
        } else {
          // Fallback to first meal if meal options aren't properly set
          mealToCount = groupMeals[0];
        }
        
        if (mealToCount) {
          mealToCount.foods.forEach((food) => {
            totalCalories += Number(food.calories);
            totalProtein += Number(food.protein);
            totalCarbs += Number(food.carbs);
            totalFat += Number(food.fat);
          });
        }
      }
    });

    return {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein),
      carbs: Math.round(totalCarbs),
      fat: Math.round(totalFat),
    };
  };

  // Calculate macros based on current meal selection
  const [macros, setMacros] = useState(() => calculateTotalMacros());
  
  // Recalculate macros whenever activeMealIndex or formData changes
  React.useEffect(() => {
    const newMacros = calculateTotalMacros();
    setMacros(newMacros);
  }, [activeMealIndex, formData.meals]);

  // Group meals by name and time to show Meal A/B options together
  const groupedMeals = formData.meals.reduce((groups, meal) => {
    const key = `${meal.name}-${meal.time}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(meal);
    return groups;
  }, {} as Record<string, Meal[]>);

  useEffect(() => {
    if (!formData) return;
    let changed = false;
    const updatedMeals = formData.meals.map((meal) => {
      const updatedFoods = meal.foods.map((food) => {
        const protein = Number(food.protein) || 0;
        const carbs = Number(food.carbs) || 0;
        const fat = Number(food.fat) || 0;
        const calcCalories = protein * 4 + carbs * 4 + fat * 9;
        if (Number(food.calories) !== calcCalories) {
          changed = true;
          return { ...food, calories: calcCalories };
        }
        return food;
      });
      return { ...meal, foods: updatedFoods };
    });
    if (changed) {
      setFormData((prev) => ({ ...prev, meals: updatedMeals }));
    }
  }, [initialData]);




    return (
    <>

      <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-gray-lightest to-white dark:from-night dark:to-secondary-light/30 p-6 rounded-xl border border-gray-light/50 dark:border-davyGray/30">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-semibold text-secondary dark:text-alabaster mb-2"
              >
                Meal Plan Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-light dark:border-davyGray rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="e.g., 2000 Calories Meal Plan"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-semibold text-secondary dark:text-alabaster mb-2"
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-light dark:border-davyGray rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster resize-none h-24 shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="Brief description of this meal plan..."
              />
            </div>
          </div>
        </div>

        {/* Macros Summary */}
        <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 dark:from-primary/10 dark:via-primary/20 dark:to-primary/10 p-6 rounded-xl border border-primary/20 dark:border-primary/30 shadow-soft">
          <h4 className="font-semibold text-secondary dark:text-alabaster mb-4 text-center">
            Total Macros
          </h4>
          
          {/* Macro Values */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center bg-white/60 dark:bg-night/60 p-3 rounded-lg border border-primary/20 dark:border-primary/30">
              <div className="text-xs text-gray-dark dark:text-gray-light font-medium mb-1">
                Calories
              </div>
              <div className="font-bold text-lg text-secondary dark:text-alabaster">
                {macros.calories}
              </div>
            </div>
            <div className="text-center bg-white/60 dark:bg-night/60 p-3 rounded-lg border border-primary/20 dark:border-primary/30">
              <div className="text-xs text-gray-dark dark:text-gray-light font-medium mb-1">
                Protein
              </div>
              <div className="font-bold text-lg text-secondary dark:text-alabaster">
                {macros.protein}g
              </div>
            </div>
            <div className="text-center bg-white/60 dark:bg-night/60 p-3 rounded-lg border border-primary/20 dark:border-primary/30">
              <div className="text-xs text-gray-dark dark:text-gray-light font-medium mb-1">
                Carbs
              </div>
              <div className="font-bold text-lg text-secondary dark:text-alabaster">
                {macros.carbs}g
              </div>
            </div>
            <div className="text-center bg-white/60 dark:bg-night/60 p-3 rounded-lg border border-primary/20 dark:border-primary/30">
              <div className="text-xs text-gray-dark dark:text-gray-light font-medium mb-1">
                Fat
              </div>
              <div className="font-bold text-lg text-secondary dark:text-alabaster">
                {macros.fat}g
              </div>
            </div>
          </div>
          
          {/* Meal Option Breakdown */}
          <div className="bg-white/40 dark:bg-night/40 rounded-lg p-4 border border-primary/20 dark:border-primary/30">
            <h5 className="text-sm font-semibold text-secondary dark:text-alabaster mb-3 text-center">
              Included Meal Options
            </h5>
            <div className="space-y-2">
              {Object.entries(groupedMeals).map(([key, meals], groupIndex) => {
                const firstMeal = meals[0];
                const hasMealB = meals.some(meal => meal.mealOption === 'B');
                
                if (meals.length === 1) {
                  // Single meal option
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-dark dark:text-gray-light">
                        {firstMeal.name || `Meal ${groupIndex + 1}`}
                      </span>
                      <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs font-medium">
                        {firstMeal.mealOption || 'A'}
                      </span>
                    </div>
                  );
                } else {
                  // Multiple meal options (A/B) - show which one is being counted
                  const mealA = meals.find(m => m.mealOption === 'A');
                  const mealB = meals.find(m => m.mealOption === 'B');
                  
                  // Determine which option is currently being counted for this meal group
                  let countedOption: 'A' | 'B' | undefined;
                  let isCurrentlyViewing = false;
                  
                  if (mealA && mealB) {
                    const currentMeal = formData.meals[activeMealIndex];
                    if (currentMeal && 
                        currentMeal.name === mealA.name && 
                        currentMeal.time === mealA.time) {
                      // We're currently viewing this meal group, count the active option
                      countedOption = currentMeal.mealOption as 'A' | 'B';
                      isCurrentlyViewing = true;
                    } else {
                      // We're not currently viewing this meal group, default to Meal A
                      countedOption = 'A';
                    }
                  }
                  
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-dark dark:text-gray-light">
                        {firstMeal.name || `Meal ${groupIndex + 1}`}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          countedOption === 'A' 
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          A
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          countedOption === 'B' 
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          B
                        </span>
                        {isCurrentlyViewing && (
                          <span className="text-xs text-primary dark:text-primary-light font-medium">
                            (viewing)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Meals Tabs */}
      <div>
        <div className="flex space-x-3 overflow-x-auto pb-3 mb-6">
          {Object.entries(groupedMeals).map(([key, meals], groupIndex) => {
            const firstMeal = meals[0];
            const hasMealB = meals.some(meal => meal.mealOption === 'B');
            const isActive = activeMealIndex === formData.meals.findIndex(m => m.id === firstMeal.id) ||
                           (hasMealB && activeMealIndex === formData.meals.findIndex(m => m.id === meals.find(m => m.mealOption === 'B')?.id));
            
            return (
              <button
                key={key}
                type="button"
                className={`px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap flex items-center space-x-2 transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-primary to-primary-light text-white shadow-glow"
                    : "bg-white dark:bg-night text-secondary dark:text-alabaster hover:bg-gray-lightest dark:hover:bg-secondary-light/50 border border-gray-light dark:border-davyGray shadow-soft hover:shadow-medium"
                }`}
                onClick={() => setActiveMealIndex(formData.meals.findIndex(m => m.id === firstMeal.id))}
              >
                <span>{firstMeal.name || `Meal ${groupIndex + 1}`}</span>
                {hasMealB && (
                  <span className="text-xs bg-white/20 dark:bg-black/20 px-2 py-1 rounded-lg font-medium">
                    A/B
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="px-5 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary/10 to-primary/20 dark:from-primary/20 dark:to-primary/30 text-primary hover:from-primary/20 hover:to-primary/30 dark:hover:from-primary/30 dark:hover:to-primary/40 shadow-soft hover:shadow-medium transition-all duration-200 border border-primary/30 dark:border-primary/40"
            onClick={addMeal}
          >
            + Add Meal
          </button>
        </div>

        {/* Active Meal Form */}
        <div className="bg-gradient-to-br from-gray-lightest to-white dark:from-night dark:to-secondary-light/30 border border-gray-light/50 dark:border-davyGray/30 rounded-xl p-6 shadow-soft">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <h3 className="font-semibold text-lg text-secondary dark:text-alabaster">
                {formData.meals[activeMealIndex]?.name ||
                  `Meal ${activeMealIndex + 1}`}
              </h3>
              
              {/* Meal Option Selector */}
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-dark dark:text-gray-light font-medium">Option:</span>
                <div className="flex bg-gray-light dark:bg-davyGray rounded-lg p-1 shadow-inner-soft">
                  <button
                    type="button"
                    onClick={() => {
                      const currentMeal = formData.meals[activeMealIndex];
                      const mealA = formData.meals.find(m => 
                        m.name === currentMeal?.name && 
                        m.time === currentMeal?.time && 
                        m.mealOption === 'A'
                      );
                      if (mealA) {
                        setActiveMealIndex(formData.meals.findIndex(m => m.id === mealA.id));
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      formData.meals[activeMealIndex]?.mealOption === 'A'
                        ? "bg-white dark:bg-night text-secondary dark:text-alabaster shadow-soft"
                        : "text-gray-dark dark:text-gray-light hover:text-secondary dark:hover:text-alabaster"
                    }`}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const currentMeal = formData.meals[activeMealIndex];
                      const mealB = formData.meals.find(m => 
                        m.name === currentMeal?.name && 
                        m.time === currentMeal?.time && 
                        m.mealOption === 'B'
                      );
                      if (mealB) {
                        setActiveMealIndex(formData.meals.findIndex(m => m.id === mealB.id));
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      formData.meals[activeMealIndex]?.mealOption === 'B'
                        ? "bg-white dark:bg-night text-secondary dark:text-alabaster shadow-soft"
                        : "text-gray-dark dark:text-gray-light hover:text-secondary dark:hover:text-alabaster"
                    }`}
                  >
                    B
                  </button>
                </div>
              </div>
            </div>
            <div className="flex space-x-3">
              {/* Add Meal B button - only show if this is Meal A and no Meal B exists yet */}
              {formData.meals[activeMealIndex]?.mealOption === 'A' && 
               !formData.meals.some(m => 
                 m.mealOption === 'B' &&
                 ((m.name === formData.meals[activeMealIndex]?.name && m.time === formData.meals[activeMealIndex]?.time) ||
                  (formData.meals[activeMealIndex]?.name === "" && formData.meals[activeMealIndex]?.time === "" && m.name === "" && m.time === ""))
               ) && (
                <button
                  type="button"
                  onClick={() => addMealOption(activeMealIndex)}
                  className="text-primary hover:text-primary/80 text-sm font-medium hover:underline transition-colors duration-200"
                >
                  + Add Meal B
                </button>
              )}
              <button
                type="button"
                onClick={() => removeMeal(activeMealIndex)}
                className="text-red-500 hover:text-red-700 text-sm font-medium hover:underline transition-colors duration-200"
                disabled={formData.meals.length <= 1}
              >
                Remove Meal
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label
                htmlFor={`meal-name-${activeMealIndex}`}
                className="block text-sm font-semibold text-secondary dark:text-alabaster mb-2"
              >
                Meal Name
              </label>
              <input
                type="text"
                id={`meal-name-${activeMealIndex}`}
                value={formData.meals[activeMealIndex]?.name || ""}
                onChange={(e) =>
                  updateMeal(activeMealIndex, "name", e.target.value)
                }
                className="w-full px-4 py-3 border border-gray-light dark:border-davyGray rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="e.g., Breakfast"
              />
            </div>
            <div>
              <label
                htmlFor={`meal-time-${activeMealIndex}`}
                className="block text-sm font-semibold text-secondary dark:text-alabaster mb-2"
              >
                Time/When
              </label>
              <input
                type="text"
                id={`meal-time-${activeMealIndex}`}
                value={(() => {
                  const timeValue = formData.meals[activeMealIndex]?.time || "";
                  // Format time to HH:mm if it's in HH:mm:ss format
                  if (timeValue && timeValue.includes(':') && timeValue.split(':').length === 3) {
                    return timeValue.slice(0, 5);
                  }
                  return timeValue;
                })()}
                onChange={(e) =>
                  updateMeal(activeMealIndex, "time", e.target.value)
                }
                className="w-full px-4 py-3 border border-gray-light dark:border-davyGray rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-night text-secondary dark:text-alabaster shadow-soft transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="e.g., Morning, 7:00 AM, Before bed"
              />
            </div>
          </div>

          {/* Foods List */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h4 className="font-semibold text-lg text-secondary dark:text-alabaster">
                  Foods
                </h4>
              </div>
            </div>

            <div className="space-y-4">
              {formData.meals[activeMealIndex]?.foods.map((food, foodIndex) => (
                <FoodItem
                  key={`food-${activeMealIndex}-${foodIndex}`}
                  food={food}
                  foodIndex={foodIndex}
                  activeMealIndex={activeMealIndex}
                  foodsLength={formData.meals[activeMealIndex]?.foods.length || 0}
                  updateFood={updateFood}
                  removeFood={removeFood}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => addFood(activeMealIndex)}
              className="w-full py-4 text-sm font-semibold text-primary border-2 border-dashed border-primary bg-primary/5 dark:bg-primary/10 rounded-xl hover:bg-primary/10 dark:hover:bg-primary/20 hover:border-primary/60 transition-all duration-200 shadow-soft hover:shadow-medium"
            >
              + Add Another Food
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-6">
        <Button variant="outline" onClick={onCancel} type="button" disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading 
            ? "Saving..." 
            : initialData 
              ? "Save Meal Plan" 
              : "Create Meal Plan"}
        </Button>
      </div>
    </form>
    </>
  );
}
