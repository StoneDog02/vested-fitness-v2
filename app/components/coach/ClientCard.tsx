import { Link } from "@remix-run/react";

interface ClientCardProps {
  client: {
    id: string;
    name: string;
    startingWeight: number;
    currentWeight: number;
    currentMacros: {
      protein: number;
      carbs: number;
      fat: number;
    };
    workoutSplit: string;
    supplementCount: number;
    goal: string;
  };
}

export default function ClientCard({ client }: ClientCardProps) {
  // Use client's current macros since we don't have meal plans
  const macros = client.currentMacros;

  return (
    <Link
      to={`/dashboard/clients/${client.id}`}
      className="block p-4 transition bg-white dark:bg-night border border-gray-light dark:border-davyGray rounded-lg hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
            {client.name.charAt(0)}
          </div>
          <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
            {client.name}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-4 mt-4 text-sm">
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
        <div>
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Goal
          </p>
          <p className="text-secondary dark:text-alabaster">{client.goal}</p>
        </div>
      </div>
    </Link>
  );
}
