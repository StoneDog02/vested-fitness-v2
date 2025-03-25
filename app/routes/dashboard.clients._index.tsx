import { Link } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import Button from "~/components/ui/Button";
import ClientCard from "~/components/coach/ClientCard";

export const meta: MetaFunction = () => {
  return [
    { title: "Clients | Vested Fitness" },
    { name: "description", content: "View and manage your clients" },
  ];
};

// Mock clients data
const mockClients = [
  {
    id: "1",
    name: "John Smith",
    email: "john@example.com",
    role: "client",
    createdAt: "2024-01-15",
    coachId: "coach-1",
    startingWeight: 185,
    currentWeight: 175,
    currentMacros: { protein: 180, carbs: 200, fat: 60 },
    workoutSplit: "Push/Pull/Legs",
    supplementCount: 3,
  },
  {
    id: "2",
    name: "Jane Doe",
    email: "jane@example.com",
    role: "client",
    createdAt: "2024-02-10",
    coachId: "coach-1",
    startingWeight: 145,
    currentWeight: 138,
    currentMacros: { protein: 120, carbs: 150, fat: 45 },
    workoutSplit: "Upper/Lower",
    supplementCount: 2,
  },
  {
    id: "3",
    name: "Mike Johnson",
    email: "mike@example.com",
    role: "client",
    createdAt: "2024-03-05",
    coachId: "coach-1",
    startingWeight: 210,
    currentWeight: 200,
    currentMacros: { protein: 200, carbs: 180, fat: 65 },
    workoutSplit: "Full Body",
    supplementCount: 4,
  },
  {
    id: "4",
    name: "Sarah Williams",
    email: "sarah@example.com",
    role: "client",
    createdAt: "2024-03-20",
    coachId: "coach-1",
    startingWeight: 130,
    currentWeight: 125,
    currentMacros: { protein: 110, carbs: 130, fat: 40 },
    workoutSplit: "Upper/Lower",
    supplementCount: 3,
  },
];

export default function ClientsIndex() {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Clients
        </h1>
        <Link to="/dashboard/clients/new">
          <Button variant="primary">Add New Client</Button>
        </Link>
      </div>

      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray dark:text-gray-light"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-light dark:border-davyGray rounded-md leading-5 bg-white dark:bg-night placeholder-gray dark:placeholder-gray-light focus:outline-none focus:ring-primary focus:border-primary sm:text-sm dark:text-alabaster"
            placeholder="Search clients..."
          />
        </div>
      </div>

      <div className="space-y-4">
        {mockClients.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  );
}
