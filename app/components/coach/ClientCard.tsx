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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-sm">
        <div className="flex flex-col gap-2">
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Weight
          </p>
          <div className="text-secondary dark:text-alabaster">
            <span>{client.currentWeight} lbs</span>
            <span className="text-sm text-gray-500 ml-2">
              from {client.startingWeight} lbs
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Macros
          </p>
          <div className="flex flex-col gap-1 text-secondary dark:text-alabaster">
            <p>Protein: {macros.protein}g</p>
            <p>Carbs: {macros.carbs}g</p>
            <p>Fat: {macros.fat}g</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-gray-dark dark:text-gray-light font-medium">
            Program
          </p>
          <div className="flex flex-col gap-1 text-secondary dark:text-alabaster">
            <p>Split: {client.workoutSplit}</p>
            <p>Supplements: {client.supplementCount}</p>
            <p>Goal: {client.goal}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
