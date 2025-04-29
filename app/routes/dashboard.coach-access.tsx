import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

export const meta: MetaFunction = () => {
  return [
    { title: "Coach Access | Vested Fitness" },
    {
      name: "description",
      content: "View updates and check-ins from your coach",
    },
  ];
};

// Mock check-in notes
const mockCheckInNotes = {
  lastWeek:
    "Client reported feeling stronger in workouts. Sleep has improved to 7-8 hours per night. Compliance with meal plan at 90%.",
  thisWeek:
    "Client is continuing to make progress. Weight down by 1 lb. Requested some modifications to the leg day workout.",
};

// Mock weight data
const initialWeightData = [
  { date: "2024-03-01", weight: 185 },
  { date: "2024-03-08", weight: 183 },
  { date: "2024-03-15", weight: 181 },
  { date: "2024-03-22", weight: 179 },
  { date: "2024-03-29", weight: 177 },
  { date: "2024-04-05", weight: 176 },
  { date: "2024-04-12", weight: 175 },
];

// Mock client data
const mockClientData = {
  goal: "Build muscle and increase strength",
};

// Function to determine if the goal is weight loss oriented
const isWeightLossGoal = (goal: string) => {
  const weightLossKeywords = ["lose", "cut", "lean", "reduce", "drop"];
  return weightLossKeywords.some((keyword) =>
    goal.toLowerCase().includes(keyword)
  );
};

// Function to determine the change color based on goal and value
const getChangeColor = (change: number, goal: string) => {
  const isLossGoal = isWeightLossGoal(goal);

  if (isLossGoal) {
    return change < 0
      ? "text-green-500"
      : change > 0
      ? "text-red-500"
      : "text-secondary dark:text-alabaster";
  } else {
    // For muscle gain/bulk goals
    return change > 0
      ? "text-green-500"
      : change < 0
      ? "text-secondary dark:text-alabaster"
      : "text-secondary dark:text-alabaster";
  }
};

export const loader = async () => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  // Get the current user's ID
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ updates: [], goal: mockClientData.goal });
  }

  // Get the client's user record
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, goal")
    .eq("auth_id", user.id)
    .single();

  if (!clientUser) {
    return json({ updates: [], goal: mockClientData.goal });
  }

  // Get the updates
  const { data: updates, error } = await supabase
    .from("coach_updates")
    .select("*")
    .eq("client_id", clientUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching updates:", error);
    return json({ updates: [], goal: mockClientData.goal });
  }

  return json({
    updates,
    goal: clientUser.goal || mockClientData.goal,
  });
};

export default function CoachAccess() {
  const { updates, goal } = useLoaderData<typeof loader>();
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [mockWeightData, setMockWeightData] = useState(initialWeightData);

  const handleAddWeight = () => {
    if (!newWeight) return;

    const today = new Date().toISOString().split("T")[0];
    const newWeightEntry = {
      date: today,
      weight: parseFloat(newWeight),
    };

    setMockWeightData((prevData) => [...prevData, newWeightEntry]);
    setShowAddWeight(false);
    setNewWeight("");
  };

  const startWeight = mockWeightData[0].weight;
  const currentWeight = mockWeightData[mockWeightData.length - 1].weight;
  const totalChange = currentWeight - startWeight;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-6">
        Coach Access
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column with three stacked cards */}
        <div className="space-y-6">
          {/* Updates from Coach */}
          <Card title="Updates from Coach">
            <div className="space-y-4">
              {updates.map((update) => (
                <div
                  key={update.id}
                  className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
                >
                  <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                    {new Date(update.created_at).toLocaleDateString()}
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
          <Card
            title={
              <div className="flex items-baseline gap-2">
                <span>Weight Progress</span>
                <span className="text-sm text-gray-dark dark:text-gray-light">
                  ({goal})
                </span>
              </div>
            }
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockWeightData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-dark dark:text-gray-light text-center flex-1">
                  Starting Weight: {startWeight} lbs
                </p>
                <p className="text-sm text-gray-dark dark:text-gray-light text-center flex-1">
                  Current Weight: {currentWeight} lbs
                </p>
                <p
                  className={`text-sm text-center flex-1 ${getChangeColor(
                    totalChange,
                    goal
                  )}`}
                >
                  Total Change: {totalChange} lbs
                </p>
              </div>
              {showAddWeight ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="Enter weight in lbs"
                    className="flex-1 px-3 py-2 border border-gray-light dark:border-davyGray rounded-md bg-white dark:bg-night text-secondary dark:text-alabaster"
                  />
                  <Button onClick={handleAddWeight} variant="primary">
                    Save
                  </Button>
                  <Button
                    onClick={() => setShowAddWeight(false)}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowAddWeight(true)}
                  variant="primary"
                  className="w-full"
                >
                  + Add Weight
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
