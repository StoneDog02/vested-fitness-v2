import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface ViewMealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealPlan: {
    id: string;
    title: string;
    description: string;
    createdAt: string;
    isActive: boolean;
    meals: {
      id: string | number;
      name: string;
      time: string;
      mealOption?: 'A' | 'B';
      foods: {
        name: string;
        portion: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }[];
    }[];
  };
}

export default function ViewMealPlanModal({
  isOpen,
  onClose,
  mealPlan,
}: ViewMealPlanModalProps) {
  // Group meals by name and time to handle A/B options
  const mealGroups = mealPlan.meals.reduce((groups, meal) => {
    const key = `${meal.name}-${meal.time}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(meal);
    return groups;
  }, {} as Record<string, typeof mealPlan.meals>);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mealPlan.title} size="lg">
      <div className="space-y-6">
        <div>
          <p className="text-gray-dark dark:text-gray-light">
            {mealPlan.description}
          </p>
          <p className="text-sm text-gray-dark dark:text-gray-light mt-2">
            Created: {mealPlan.createdAt}
          </p>
        </div>

        <div className="space-y-6">
          {Object.entries(mealGroups).map(([groupKey, groupMeals]) => {
            // Sort meals by option (A first, then B)
            const sortedMeals = groupMeals.sort((a, b) => {
              const optionA = a.mealOption || 'A';
              const optionB = b.mealOption || 'A';
              return optionA.localeCompare(optionB);
            });

            const firstMeal = sortedMeals[0];
            const hasMultipleOptions = sortedMeals.length > 1;

            return (
              <div
                key={groupKey}
                className="border border-gray-light dark:border-davyGray rounded-lg p-4"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
                    {firstMeal.name}
                  </h3>
                  <span className="text-sm text-gray-dark dark:text-gray-light">
                    {firstMeal.time.includes(':') ? firstMeal.time.slice(0, 5) : firstMeal.time}
                  </span>
                </div>

                {/* Display meal options */}
                <div className="space-y-6">
                  {sortedMeals.map((meal, mealIndex) => (
                    <div key={meal.id} className="space-y-4">
                      {/* Option header if there are multiple options */}
                      {hasMultipleOptions && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-semibold">
                              {meal.mealOption || 'A'}
                            </span>
                            <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
                              Option {meal.mealOption || 'A'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Foods for this meal option */}
                      <div className="space-y-3 ml-0">
                        {meal.foods.map((food, foodIndex) => (
                          <div
                            key={`${meal.id}-${foodIndex}`}
                            className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                          >
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="font-semibold text-secondary dark:text-alabaster">
                                {food.name}
                              </h4>
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                                {food.portion}
                              </span>
                            </div>

                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div className="text-center">
                                <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">
                                  Calories
                                </p>
                                <p className="text-lg font-bold text-secondary dark:text-alabaster">
                                  {food.calories}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">
                                  Protein
                                </p>
                                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                  {food.protein}g
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">
                                  Carbs
                                </p>
                                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                  {food.carbs}g
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">
                                  Fat
                                </p>
                                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                  {food.fat}g
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Divider between options */}
                      {hasMultipleOptions && mealIndex < sortedMeals.length - 1 && (
                        <div className="border-t border-gray-200 dark:border-gray-600 pt-4"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
