import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Workouts | Vested Fitness" },
    { name: "description", content: "Manage client workout plans" },
  ];
};

// Mock workout plans
const mockWorkoutPlans = [
  {
    id: "1",
    title: "John's Push/Pull/Legs Split",
    createdAt: "2024-02-10",
    isActive: true,
    description:
      "6-day split focused on progressive overload for building muscle mass.",
  },
  {
    id: "2",
    title: "John's Full Body Program",
    createdAt: "2024-01-05",
    isActive: false,
    description: "3-day full body program with emphasis on compound movements.",
  },
  {
    id: "3",
    title: "John's Bodyweight Routine",
    createdAt: "2023-11-20",
    isActive: false,
    description: "At-home workout plan requiring minimal equipment.",
  },
];

// Mock calendar data (simplified)
const mockCalendarData = [
  { date: "Mon, Apr 8", workout: "Push Day", status: "completed" },
  { date: "Tue, Apr 9", workout: "Pull Day", status: "completed" },
  { date: "Wed, Apr 10", workout: "Leg Day", status: "missed" },
  { date: "Thu, Apr 11", workout: "Push Day", status: "completed" },
  { date: "Fri, Apr 12", workout: "Pull Day", status: "pending" },
  { date: "Sat, Apr 13", workout: "Leg Day", status: "pending" },
  { date: "Sun, Apr 14", workout: "Rest Day", status: "pending" },
];

export default function ClientWorkouts() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          John Smith&apos;s Workouts
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left side - Workout Plan History */}
        <div>
          <Card
            title="Workout Plan History"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  Upload Plan
                </Button>
                <Button size="sm" variant="primary">
                  Create Plan
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {mockWorkoutPlans.map((plan) => (
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
                      <button className="text-primary text-sm hover:underline">
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
          {/* Active Workout Plan */}
          <Card title="Active Workout Plan">
            {activeWorkoutPlan ? (
              <div>
                <h3 className="font-medium text-secondary dark:text-alabaster text-lg">
                  {activeWorkoutPlan.title}
                </h3>
                <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                  {activeWorkoutPlan.description}
                </p>
                <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                  Created: {activeWorkoutPlan.createdAt}
                </div>
                <Button variant="outline" className="mt-4">
                  View Full Plan
                </Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-dark dark:text-gray-light mb-4">
                  No active workout plan
                </p>
                <Button variant="primary">Create Workout Plan</Button>
              </div>
            )}
          </Card>

          {/* Workout Calendar */}
          <Card title="Workout Compliance Calendar">
            <div className="space-y-2">
              {mockCalendarData.map((day, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b dark:border-davyGray last:border-0 pb-2 last:pb-0"
                >
                  <div>
                    <span className="text-sm text-secondary dark:text-alabaster">
                      {day.date}
                    </span>
                    <span className="text-xs text-gray-dark dark:text-gray-light ml-2">
                      ({day.workout})
                    </span>
                  </div>
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
    </div>
  );
}
