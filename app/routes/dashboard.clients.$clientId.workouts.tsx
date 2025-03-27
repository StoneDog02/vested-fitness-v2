import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { useState } from "react";

interface Workout {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  isActive: boolean;
}

const mockWorkouts: Workout[] = [
  {
    id: "1",
    title: "Upper Body Strength",
    description: "Focus on chest and back exercises",
    createdAt: "2024-03-01",
    isActive: true,
  },
  {
    id: "2",
    title: "Lower Body Power",
    description: "Heavy compound movements",
    createdAt: "2024-02-15",
    isActive: false,
  },
];

export const meta: MetaFunction = () => {
  return [
    { title: "Client Workouts | Vested Fitness" },
    { name: "description", content: "Manage client workout plans" },
  ];
};

export default function ClientWorkouts() {
  const [workouts] = useState<Workout[]>(mockWorkouts);
  const activeWorkout = workouts.find((workout) => workout.isActive);

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            John Smith&apos;s Workouts
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left side - Workout History */}
          <div>
            <Card
              title="Workout History"
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="primary">
                    Create Plan
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {workouts.map((workout) => (
                  <div
                    key={workout.id}
                    className={`p-4 border rounded-lg ${
                      workout.isActive
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-gray-light dark:border-davyGray dark:bg-night/50"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium text-secondary dark:text-alabaster">
                        {workout.title}
                      </h3>
                      {workout.isActive && (
                        <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                      {workout.description}
                    </p>
                    <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                      Created: {workout.createdAt}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button className="text-primary text-sm hover:underline">
                        View
                      </button>
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
              {activeWorkout ? (
                <div>
                  <h3 className="font-medium text-secondary dark:text-alabaster text-lg">
                    {activeWorkout.title}
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                    {activeWorkout.description}
                  </p>
                  <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                    Created: {activeWorkout.createdAt}
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
            <Card title="Workout Calendar">
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-dark dark:text-gray-light">
                  Workout Calendar Would Display Here
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ClientDetailLayout>
  );
}
