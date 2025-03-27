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
      id: number;
      name: string;
      time: string;
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
          {mealPlan.meals.map((meal) => (
            <div
              key={meal.id}
              className="border border-gray-light dark:border-davyGray rounded-lg p-4"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
                  {meal.name}
                </h3>
                <span className="text-sm text-gray-dark dark:text-gray-light">
                  {meal.time}
                </span>
              </div>

              <div className="space-y-4">
                {meal.foods.map((food, index) => (
                  <div
                    key={index}
                    className="bg-gray-lightest dark:bg-night p-3 rounded-md"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-secondary dark:text-alabaster">
                        {food.name}
                      </h4>
                      <span className="text-sm text-gray-dark dark:text-gray-light">
                        {food.portion}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-dark dark:text-gray-light">
                          Calories
                        </p>
                        <p className="font-medium text-secondary dark:text-alabaster">
                          {food.calories}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-dark dark:text-gray-light">
                          Protein
                        </p>
                        <p className="font-medium text-secondary dark:text-alabaster">
                          {food.protein}g
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-dark dark:text-gray-light">
                          Carbs
                        </p>
                        <p className="font-medium text-secondary dark:text-alabaster">
                          {food.carbs}g
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-dark dark:text-gray-light">
                          Fat
                        </p>
                        <p className="font-medium text-secondary dark:text-alabaster">
                          {food.fat}g
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
