import { calculateMacros } from "~/lib/utils";

// Inline Client type for this component
interface Client {
  id: string;
  name: string;
  startingWeight: number;
  currentWeight: number;
  currentMacros: { protein: number; carbs: number; fat: number };
  workoutSplit: string;
  supplementCount: number;
  goal?: string;
}

interface ClientProfileProps {
  client: Client;
  mealPlan?: {
    meals: Array<{
      id: number;
      foods: Array<{
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }>;
    }>;
  };
}

export default function ClientProfile({
  client,
  mealPlan,
}: ClientProfileProps) {
  // Calculate macros from meal plan if available, otherwise use client's current macros
  const macros = mealPlan
    ? calculateMacros(mealPlan.meals)
    : client.currentMacros;

  return (
    <div className="p-4 bg-white dark:bg-night border border-gray-light dark:border-davyGray rounded-lg w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white text-xl">
          {client.name.charAt(0)}
        </div>
        <h3 className="text-xl font-medium text-secondary dark:text-alabaster">
          {client.name}
        </h3>
      </div>
      {client.goal && (
        <div className="mb-4">
          <span className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-sm font-semibold">
            Goal: {client.goal}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-6 gap-x-4">
        <div>
          <p className="text-gray-dark dark:text-gray-light text-sm mb-1">
            Starting Weight
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.startingWeight} lbs
          </p>
        </div>
        <div>
          <p className="text-gray-dark dark:text-gray-light text-sm mb-1">
            Current Weight
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.currentWeight} lbs
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-gray-dark dark:text-gray-light text-sm mb-1">
            Macros
          </p>
          <div className="space-y-0.5">
            <p className="text-secondary dark:text-alabaster">
              P: {macros.protein}g
            </p>
            <p className="text-secondary dark:text-alabaster">
              C: {macros.carbs}g
            </p>
            <p className="text-secondary dark:text-alabaster">
              F: {macros.fat}g
            </p>
          </div>
        </div>
        <div>
          <p className="text-gray-dark dark:text-gray-light text-sm mb-1">
            Workout Split
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.workoutSplit}
          </p>
        </div>
      </div>
    </div>
  );
}
