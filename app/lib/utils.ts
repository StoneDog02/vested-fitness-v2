/**
 * Calculate total macros from all foods in a meal plan
 */
export const calculateMacros = (
  meals: Array<{
    id: number;
    foods?: Array<{
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }>
) => {
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalCalories = 0;

  meals?.forEach((meal) => {
    meal.foods?.forEach((food) => {
      totalProtein += food.protein;
      totalCarbs += food.carbs;
      totalFat += food.fat;
      totalCalories += food.calories;
    });
  });

  return {
    protein: Math.round(totalProtein),
    carbs: Math.round(totalCarbs),
    fat: Math.round(totalFat),
    calories: Math.round(totalCalories),
  };
};

/**
 * Calculate both total macros and completed macros from a meal plan
 */
export const calculateMacrosWithCompleted = (
  meals: Array<{
    id: number;
    foods: Array<{
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
