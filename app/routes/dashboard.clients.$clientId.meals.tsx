import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import CreateMealPlanModal from "~/components/coach/CreateMealPlanModal";
import type { MealPlanFormData } from "~/components/coach/CreateMealPlanForm";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Meals | Vested Fitness" },
    { name: "description", content: "Manage client meal plans" },
  ];
};

// Mock meal plans
const mockMealPlans = [
  {
    id: "1",
    title: "John's 2000 Calories Meal Plan",
    createdAt: "2024-02-15",
    isActive: true,
    description:
      "Balanced meal plan focused on muscle gain while maintaining current body fat levels.",
  },
  {
    id: "2",
    title: "John's Cutting Meal Plan",
    createdAt: "2024-01-10",
    isActive: false,
    description:
      "Reduced calorie meal plan for fat loss while preserving muscle mass.",
  },
  {
    id: "3",
    title: "John's Maintenance Plan",
    createdAt: "2023-12-05",
    isActive: false,
    description:
      "Balanced meal plan to maintain current physique and performance.",
  },
];

// Mock calendar data (simplified)
const mockCalendarData = [
  { date: "Mon, Apr 8", status: "completed" },
  { date: "Tue, Apr 9", status: "completed" },
  { date: "Wed, Apr 10", status: "missed" },
  { date: "Thu, Apr 11", status: "completed" },
  { date: "Fri, Apr 12", status: "pending" },
  { date: "Sat, Apr 13", status: "pending" },
  { date: "Sun, Apr 14", status: "pending" },
];

export default function ClientMeals() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mealPlans, setMealPlans] = useState(mockMealPlans);

  const activeMealPlan = mealPlans.find((plan) => plan.isActive);

  const handleSaveMealPlan = (mealPlanData: MealPlanFormData) => {
    // In a real app, we'd call an API to save the meal plan
    // For now, just add it to our local state
    const newPlan = {
      id: (mealPlans.length + 1).toString(),
      title: mealPlanData.title,
      description: mealPlanData.description,
      createdAt: new Date().toISOString().split("T")[0],
      isActive: false,
    };

    setMealPlans([...mealPlans, newPlan]);
  };

  const handleSetActive = (planId: string) => {
    setMealPlans((plans) =>
      plans.map((plan) => ({
        ...plan,
        isActive: plan.id === planId,
      }))
    );
  };

  return (
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
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  Upload Plan
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  Create Plan
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {mealPlans.map((plan) => (
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
                    <button className="text-primary text-sm hover:underline">
                      View
                    </button>
                    {!plan.isActive && (
                      <button
                        className="text-primary text-sm hover:underline"
                        onClick={() => handleSetActive(plan.id)}
                      >
                        Set Active
                      </button>
                    )}
                    <button className="text-gray-dark dark:text-gray-light text-sm hover:underline">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
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
                <Button variant="outline" className="mt-4">
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
          <Card title="Meal Compliance Calendar">
            <div className="space-y-2">
              {mockCalendarData.map((day, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b dark:border-davyGray last:border-0 pb-2 last:pb-0"
                >
                  <span className="text-sm text-secondary dark:text-alabaster">
                    {day.date}
                  </span>
                  <div className="flex items-center">
                    <span
                      className={`inline-block w-3 h-3 rounded-full mr-2 ${
                        day.status === "completed"
                          ? "bg-green-500"
                          : day.status === "missed"
                          ? "bg-red-500"
                          : "bg-gray-light dark:bg-davyGray"
                      }`}
                    ></span>
                    <span className="text-sm capitalize text-gray-dark dark:text-gray-light">
                      {day.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Create Meal Plan Modal */}
      <CreateMealPlanModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleSaveMealPlan}
      />
    </div>
  );
}
