import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientProfile from "~/components/coach/ClientProfile";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";

// Mock client data - in a real app, this would come from Supabase
const mockClient = {
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
};

// Mock meal plan for client
const mockMealPlan = {
  meals: [
    {
      id: 1,
      foods: [
        { calories: 350, protein: 25, carbs: 40, fat: 8 },
        { calories: 40, protein: 0, carbs: 10, fat: 0 },
        { calories: 100, protein: 3, carbs: 3, fat: 9 },
      ],
    },
    {
      id: 2,
      foods: [
        { calories: 130, protein: 22, carbs: 8, fat: 0 },
        { calories: 160, protein: 6, carbs: 6, fat: 14 },
      ],
    },
    {
      id: 3,
      foods: [
        { calories: 180, protein: 36, carbs: 0, fat: 4 },
        { calories: 220, protein: 5, carbs: 45, fat: 2 },
        { calories: 50, protein: 2, carbs: 10, fat: 0 },
        { calories: 40, protein: 0, carbs: 0, fat: 4.5 },
      ],
    },
  ],
};

// Mock updates from coach
const mockUpdates = [
  {
    id: 1,
    date: "2024-04-10",
    message: "Great progress this week! Keep up the good work on your meals.",
  },
  {
    id: 2,
    date: "2024-04-03",
    message: "Remember to increase your water intake before workouts.",
  },
  {
    id: 3,
    date: "2024-03-27",
    message: "Let's focus on getting more protein this week.",
  },
];

// Mock check-in notes
const mockCheckInNotes = {
  lastWeek:
    "Completed all workouts, followed meal plan at 90% adherence. Feeling stronger, especially during pull days.",
  thisWeek:
    "Slight hip pain during squats. Adjusted form and it's better. Need help with sleep quality - averaging 6 hours.",
};

export const meta: MetaFunction = () => {
  return [
    { title: "Client Details | Vested Fitness" },
    { name: "description", content: "View and manage client details" },
  ];
};

export default function ClientDetails() {
  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <ClientProfile client={mockClient} mealPlan={mockMealPlan} />
            <Button variant="outline">Message Client</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column with two stacked cards */}
          <div className="space-y-6">
            {/* Updates to Client */}
            <Card
              title="Updates to Client"
              action={
                <button className="text-sm text-primary hover:underline">
                  +Add Message
                </button>
              }
            >
              <div className="space-y-4">
                {mockUpdates.map((update) => (
                  <div
                    key={update.id}
                    className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
                  >
                    <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                      {update.date}
                    </div>
                    <p className="text-secondary dark:text-alabaster">
                      {update.message}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Check In Notes */}
            <Card title="Check In Notes">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    Last Week
                  </h4>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    {mockCheckInNotes.lastWeek}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    This Week
                  </h4>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    {mockCheckInNotes.thisWeek}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Weight Chart */}
          <div className="md:col-span-2">
            <Card title="Weight Progress">
              <div className="h-64 flex items-center justify-center">
                {/* In a real app, you would render a chart here using Chart.js */}
                <div className="text-center">
                  <p className="text-gray-dark dark:text-gray-light mb-2">
                    Weight Chart Would Display Here
                  </p>
                  <div className="flex flex-col space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster font-medium">
                        Starting Weight:
                      </span>
                      <span className="text-sm text-secondary dark:text-alabaster">
                        {mockClient.startingWeight} lbs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster font-medium">
                        Current Weight:
                      </span>
                      <span className="text-sm text-secondary dark:text-alabaster">
                        {mockClient.currentWeight} lbs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary dark:text-alabaster font-medium">
                        Total Change:
                      </span>
                      <span className="text-sm text-green-500">
                        -{mockClient.startingWeight - mockClient.currentWeight}{" "}
                        lbs
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ClientDetailLayout>
  );
}
