import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import CreateMealPlanModal from "~/components/coach/CreateMealPlanModal";
import ViewMealPlanModal from "~/components/coach/ViewMealPlanModal";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import type { MealPlanFormData } from "~/components/coach/CreateMealPlanForm";
import Modal from "~/components/ui/Modal";

interface MealPlanData {
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
}

const mockMealPlans: MealPlanData[] = [
  {
    id: "1",
    title: "High Protein Meal Plan",
    description: "Focus on lean proteins and vegetables",
    createdAt: "2024-03-01",
    isActive: true,
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
            name: "Banana",
            portion: "1 medium",
            calories: 105,
            protein: 1,
            carbs: 27,
            fat: 0,
          },
          {
            name: "Greek Yogurt",
            portion: "1 cup",
            calories: 130,
            protein: 22,
            carbs: 5,
            fat: 0,
          },
        ],
      },
      {
        id: 2,
        name: "Mid-Morning Snack",
        time: "10:00 AM",
        foods: [
          {
            name: "Mixed Nuts",
            portion: "1 oz",
            calories: 170,
            protein: 6,
            carbs: 6,
            fat: 15,
          },
          {
            name: "Apple",
            portion: "1 medium",
            calories: 95,
            protein: 0,
            carbs: 25,
            fat: 0,
          },
        ],
      },
      {
        id: 3,
        name: "Lunch",
        time: "1:00 PM",
        foods: [
          {
            name: "Grilled Chicken Breast",
            portion: "6 oz",
            calories: 180,
            protein: 35,
            carbs: 0,
            fat: 4,
          },
          {
            name: "Brown Rice",
            portion: "1 cup",
            calories: 216,
            protein: 5,
            carbs: 45,
            fat: 2,
          },
          {
            name: "Steamed Broccoli",
            portion: "1 cup",
            calories: 55,
            protein: 4,
            carbs: 11,
            fat: 0,
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
            portion: "1 scoop with water",
            calories: 120,
            protein: 24,
            carbs: 3,
            fat: 1,
          },
          {
            name: "Rice Cakes",
            portion: "2 pieces",
            calories: 100,
            protein: 2,
            carbs: 22,
            fat: 0,
          },
        ],
      },
      {
        id: 5,
        name: "Dinner",
        time: "7:00 PM",
        foods: [
          {
            name: "Salmon Fillet",
            portion: "6 oz",
            calories: 354,
            protein: 34,
            carbs: 0,
            fat: 23,
          },
          {
            name: "Sweet Potato",
            portion: "1 medium",
            calories: 103,
            protein: 2,
            carbs: 24,
            fat: 0,
          },
          {
            name: "Mixed Green Salad",
            portion: "2 cups",
            calories: 50,
            protein: 3,
            carbs: 10,
            fat: 0,
          },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Weight Loss Meal Plan",
    description: "Calorie deficit with balanced macros",
    createdAt: "2024-02-15",
    isActive: false,
    meals: [],
  },
];

export const meta: MetaFunction = () => {
  return [
    { title: "Client Meals | Vested Fitness" },
    { name: "description", content: "Manage client meal plans" },
  ];
};

export default function ClientMeals() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<MealPlanData | null>(null);
  const [mealPlans, setMealPlans] = useState<MealPlanData[]>(mockMealPlans);
  const [editingPlan, setEditingPlan] = useState<{
    data: MealPlanFormData;
    id: string;
  } | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const activeMealPlan = mealPlans.find((plan) => plan.isActive);

  // Sort meal plans by createdAt descending
  const sortedMealPlans = [...mealPlans].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  const recentMealPlans = sortedMealPlans.slice(0, 3);
  const historyMealPlans = sortedMealPlans.slice(3);

  const handleSetActive = (id: string) => {
    setMealPlans((prevPlans) =>
      prevPlans.map((plan) => ({
        ...plan,
        isActive: plan.id === id,
      }))
    );
  };

  const handleViewPlan = (plan: MealPlanData) => {
    setSelectedPlan(plan);
    setIsViewModalOpen(true);
  };

  const handleEditPlan = (plan: MealPlanData) => {
    // Convert MealPlanData to MealPlanFormData
    const formData: MealPlanFormData = {
      title: plan.title,
      description: plan.description,
      meals: plan.meals,
    };
    setEditingPlan({ data: formData, id: plan.id });
    setIsCreateModalOpen(true);
  };

  const handleSaveMealPlan = (mealPlanData: MealPlanFormData) => {
    if (editingPlan) {
      // Update existing plan
      setMealPlans((prevPlans) =>
        prevPlans.map((plan) =>
          plan.id === editingPlan.id
            ? {
                ...plan,
                title: mealPlanData.title,
                description: mealPlanData.description,
                meals: mealPlanData.meals,
              }
            : plan
        )
      );
      setEditingPlan(null);
    } else {
      // Create new plan
      const newPlan: MealPlanData = {
        id: (mealPlans.length + 1).toString(),
        title: mealPlanData.title,
        description: mealPlanData.description,
        createdAt: new Date().toISOString().split("T")[0],
        isActive: false,
        meals: mealPlanData.meals,
      };
      setMealPlans([...mealPlans, newPlan]);
    }
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            John Smith&apos;s Meals
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left side - Meal Plan History */}
          <div>
            <Card
              title="Meal Plan History"
              action={
                <div className="flex flex-col items-start gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    Create Plan
                  </Button>
                  <button
                    className="text-primary text-xs font-medium hover:underline mt-1 px-1"
                    onClick={() => setIsHistoryModalOpen(true)}
                    style={{ background: "none", border: "none" }}
                  >
                    History
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {recentMealPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`p-4 border rounded-lg ${
                      plan.isActive
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-gray-light dark:border-davyGray dark:bg-night/50"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium text-secondary dark:text-alabaster">
                        {plan.title}
                      </h3>
                      {plan.isActive && (
                        <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                      {plan.description}
                    </p>
                    <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                      Created: {plan.createdAt}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        className="text-gray-dark dark:text-gray-light text-sm hover:underline"
                        onClick={() => handleEditPlan(plan)}
                      >
                        Edit
                      </button>
                      {!plan.isActive && (
                        <button
                          className="text-primary text-sm hover:underline"
                          onClick={() => handleSetActive(plan.id)}
                        >
                          Set Active
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            {/* History Modal */}
            <Modal
              isOpen={isHistoryModalOpen}
              onClose={() => setIsHistoryModalOpen(false)}
              title="Meal Plan History"
            >
              <div className="space-y-4">
                {historyMealPlans.length === 0 ? (
                  <div className="text-center text-gray-dark dark:text-gray-light">
                    No more meal plans in history.
                  </div>
                ) : (
                  historyMealPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`p-4 border rounded-lg ${
                        plan.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium text-secondary dark:text-alabaster">
                          {plan.title}
                        </h3>
                        {plan.isActive && (
                          <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                        {plan.description}
                      </p>
                      <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                        Created: {plan.createdAt}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          className="text-gray-dark dark:text-gray-light text-sm hover:underline"
                          onClick={() => handleEditPlan(plan)}
                        >
                          Edit
                        </button>
                        {!plan.isActive && (
                          <button
                            className="text-primary text-sm hover:underline"
                            onClick={() => handleSetActive(plan.id)}
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Modal>
          </div>

          {/* Right side - Active Plan & Calendar */}
          <div className="space-y-6">
            {/* Active Meal Plan */}
            <Card title="Active Meal Plan">
              {activeMealPlan ? (
                <div>
                  <h3 className="font-medium text-secondary dark:text-alabaster text-lg">
                    {activeMealPlan.title}
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                    {activeMealPlan.description}
                  </p>
                  <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                    Created: {activeMealPlan.createdAt}
                  </div>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => handleViewPlan(activeMealPlan)}
                  >
                    View Full Plan
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-dark dark:text-gray-light mb-4">
                    No active meal plan
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    Create Meal Plan
                  </Button>
                </div>
              )}
            </Card>

            {/* Meal Calendar */}
            <Card title="Meal Calendar">
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-dark dark:text-gray-light">
                  Meal Calendar Would Display Here
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <CreateMealPlanModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingPlan(null);
        }}
        onSave={handleSaveMealPlan}
        existingPlan={editingPlan?.data}
      />

      {selectedPlan && (
        <ViewMealPlanModal
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedPlan(null);
          }}
          mealPlan={selectedPlan}
        />
      )}
    </ClientDetailLayout>
  );
}
