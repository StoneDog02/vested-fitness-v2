import { Client } from "~/lib/supabase";
import { calculateMacros } from "~/lib/utils";

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
    <div className="p-4 bg-white dark:bg-night border border-gray-light dark:border-davyGray rounded-lg">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white text-xl">
          {client.name.charAt(0)}
        </div>
        <h3 className="text-xl font-medium text-secondary dark:text-alabaster">
          {client.name}
        </h3>
      </div>

      <div className="grid grid-cols-5 gap-4 mt-4">
        <div>
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Starting Weight
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.startingWeight} lbs
          </p>
        </div>
        <div>
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Current Weight
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.currentWeight} lbs
          </p>
        </div>
        <div>
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Macros
          </p>
          <p className="text-secondary dark:text-alabaster">
            P: {macros.protein}g | C: {macros.carbs}g | F: {macros.fat}g
          </p>
        </div>
        <div>
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Workout Split
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.workoutSplit}
          </p>
        </div>
        <div>
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Supplements
          </p>
          <p className="text-secondary dark:text-alabaster">
            {client.supplementCount}
          </p>
        </div>
      </div>
    </div>
  );
}
