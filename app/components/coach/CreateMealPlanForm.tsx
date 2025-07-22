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

export default function CreateMealPlanForm({
  onSubmit,
  onCancel,
  initialData,
  isLoading = false,
}: CreateMealPlanFormProps) {
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
    const updatedMeals = [...formData.meals];
    if (field === "protein" || field === "carbs" || field === "fat") {
      if (isBlur) {
        updatedMeals[mealIndex].foods[foodIndex][field] =
          value === "" ? 0 : Number(value);
      } else {
        updatedMeals[mealIndex].foods[foodIndex][field] = value as string;
      }
      // Always recalculate calories
      const protein =
        Number(
          field === "protein"
            ? value
            : updatedMeals[mealIndex].foods[foodIndex].protein
        ) || 0;
      const carbs =
        Number(
          field === "carbs"
            ? value
            : updatedMeals[mealIndex].foods[foodIndex].carbs
        ) || 0;
      const fat =
        Number(
          field === "fat" ? value : updatedMeals[mealIndex].foods[foodIndex].fat
        ) || 0;
      updatedMeals[mealIndex].foods[foodIndex].calories =
        protein * 4 + carbs * 4 + fat * 9;
    } else {
      updatedMeals[mealIndex].foods[foodIndex][field] = value as string;
    }
    setFormData((prev) => ({
      ...prev,
      meals: updatedMeals,
    }));
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

  // Calculate total macros
  const calculateTotalMacros = () => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    formData.meals.forEach((meal) => {
      meal.foods.forEach((food) => {
        totalCalories += Number(food.calories);
        totalProtein += Number(food.protein);
        totalCarbs += Number(food.carbs);
        totalFat += Number(food.fat);
      });
    });

    return {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein),
      carbs: Math.round(totalCarbs),
      fat: Math.round(totalFat),
    };
  };

  const macros = calculateTotalMacros();

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
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
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
            placeholder="e.g., 2000 Calories Meal Plan"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster resize-none h-24"
            placeholder="Brief description of this meal plan..."
          />
        </div>

        {/* Macros Summary */}
        <div className="bg-gray-lightest dark:bg-secondary-light/20 p-3 rounded-lg">
          <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
            Total Macros
          </h4>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-xs text-gray-dark dark:text-gray-light">
                Calories
              </div>
              <div className="font-medium text-secondary dark:text-alabaster">
                {macros.calories}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-dark dark:text-gray-light">
                Protein
              </div>
              <div className="font-medium text-secondary dark:text-alabaster">
                {macros.protein}g
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-dark dark:text-gray-light">
                Carbs
              </div>
              <div className="font-medium text-secondary dark:text-alabaster">
                {macros.carbs}g
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-dark dark:text-gray-light">
                Fat
              </div>
              <div className="font-medium text-secondary dark:text-alabaster">
                {macros.fat}g
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meals Tabs */}
      <div>
        <div className="flex space-x-2 overflow-x-auto pb-2 mb-4">
          {Object.entries(groupedMeals).map(([key, meals], groupIndex) => {
            const firstMeal = meals[0];
            const hasMealB = meals.some(meal => meal.mealOption === 'B');
            const isActive = activeMealIndex === formData.meals.findIndex(m => m.id === firstMeal.id) ||
                           (hasMealB && activeMealIndex === formData.meals.findIndex(m => m.id === meals.find(m => m.mealOption === 'B')?.id));
            
            return (
              <button
                key={key}
                type="button"
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center space-x-2 ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-gray-light dark:bg-davyGray text-secondary dark:text-alabaster hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
                onClick={() => setActiveMealIndex(formData.meals.findIndex(m => m.id === firstMeal.id))}
              >
                <span>{firstMeal.name || `Meal ${groupIndex + 1}`}</span>
                {hasMealB && (
                  <span className="text-xs bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded">
                    A/B
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 dark:bg-primary/20 text-primary hover:bg-primary/20 dark:hover:bg-primary/30"
            onClick={addMeal}
          >
            + Add Meal
          </button>
        </div>

        {/* Active Meal Form */}
        <div className="border border-gray-light dark:border-davyGray rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-3">
              <h3 className="font-medium text-secondary dark:text-alabaster">
                {formData.meals[activeMealIndex]?.name ||
                  `Meal ${activeMealIndex + 1}`}
              </h3>
              
              {/* Meal Option Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-dark dark:text-gray-light">Option:</span>
                <div className="flex bg-gray-light dark:bg-davyGray rounded-lg p-1">
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
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      formData.meals[activeMealIndex]?.mealOption === 'A'
                        ? "bg-white dark:bg-night text-secondary dark:text-alabaster shadow-sm"
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
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      formData.meals[activeMealIndex]?.mealOption === 'B'
                        ? "bg-white dark:bg-night text-secondary dark:text-alabaster shadow-sm"
                        : "text-gray-dark dark:text-gray-light hover:text-secondary dark:hover:text-alabaster"
                    }`}
                  >
                    B
                  </button>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
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
                  className="text-primary hover:text-primary/80 text-sm"
                >
                  + Add Meal B
                </button>
              )}
              <button
                type="button"
                onClick={() => removeMeal(activeMealIndex)}
                className="text-red-500 hover:text-red-700 text-sm"
                disabled={formData.meals.length <= 1}
              >
                Remove Meal
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label
                htmlFor={`meal-name-${activeMealIndex}`}
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
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
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="e.g., Breakfast"
              />
            </div>
            <div>
              <label
                htmlFor={`meal-time-${activeMealIndex}`}
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Time/When
              </label>
              <input
                type="text"
                id={`meal-time-${activeMealIndex}`}
                value={formData.meals[activeMealIndex]?.time || ""}
                onChange={(e) =>
                  updateMeal(activeMealIndex, "time", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="e.g., Morning, 7:00 AM, Before bed"
              />
            </div>
          </div>

          {/* Foods List */}
          <div className="space-y-4">
            <h4 className="font-medium text-secondary dark:text-alabaster">
              Foods
            </h4>

            {formData.meals[activeMealIndex]?.foods.map((food, foodIndex) => (
              <div
                key={foodIndex}
                className="p-3 border border-gray-light dark:border-davyGray rounded-lg"
              >
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-sm font-medium text-secondary dark:text-alabaster">
                    Food Item {foodIndex + 1}
                  </h5>
                  <button
                    type="button"
                    onClick={() => removeFood(activeMealIndex, foodIndex)}
                    className="text-red-500 hover:text-red-700 text-sm"
                    disabled={
                      formData.meals[activeMealIndex]?.foods.length <= 1
                    }
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label
                      htmlFor={`food-name-${activeMealIndex}-${foodIndex}`}
                      className="block text-xs font-medium text-secondary dark:text-alabaster mb-1"
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
                      className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster text-sm"
                      placeholder="e.g., Chicken Breast"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`food-portion-${activeMealIndex}-${foodIndex}`}
                      className="block text-xs font-medium text-secondary dark:text-alabaster mb-1"
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
                      className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster text-sm"
                      placeholder="e.g., 6 oz"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span
                      className="block text-xs font-medium text-secondary dark:text-alabaster mb-1"
                      id={`food-calories-label-${activeMealIndex}-${foodIndex}`}
                    >
                      Calories
                    </span>
                    <div
                      className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-gray-50 dark:bg-night text-secondary dark:text-alabaster text-sm flex items-center min-h-[38px]"
                      role="status"
                      aria-labelledby={`food-calories-label-${activeMealIndex}-${foodIndex}`}
                    >
                      {Number(food.calories) || 0}
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={`food-protein-${activeMealIndex}-${foodIndex}`}
                      className="block text-xs font-medium text-secondary dark:text-alabaster mb-1"
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
                      className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`food-carbs-${activeMealIndex}-${foodIndex}`}
                      className="block text-xs font-medium text-secondary dark:text-alabaster mb-1"
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
                      className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`food-fat-${activeMealIndex}-${foodIndex}`}
                      className="block text-xs font-medium text-secondary dark:text-alabaster mb-1"
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
                      className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addFood(activeMealIndex)}
              className="w-full py-2 text-sm text-primary border border-dashed border-primary bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors duration-200"
            >
              + Add Another Food
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={onCancel} type="button" disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Meal Plan"}
        </Button>
      </div>
    </form>
  );
}
