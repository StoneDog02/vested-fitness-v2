import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import AddMessageModal from "~/components/coach/AddMessageModal";
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
import { useLocation } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Coach Access | Vested Fitness" },
    {
      name: "description",
      content: "View updates and check-ins from your coach",
    },
  ];
};

interface CoachUpdate {
  id: number;
  date: string;
  message: string;
}

// Mock updates from coach
const initialCoachUpdates: CoachUpdate[] = [
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
    message: "Let's focus on increasing your protein intake this week.",
  },
  {
    id: 4,
    date: "2024-03-20",
    message:
      "Your check-in photos show great progress in your upper body. Keep it up!",
  },
];

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

export default function CoachAccess() {
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [mockWeightData, setMockWeightData] = useState(initialWeightData);
  const [coachUpdates, setCoachUpdates] =
    useState<CoachUpdate[]>(initialCoachUpdates);
  const location = useLocation();

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

  const handleAddMessage = (message: string) => {
    const today = new Date().toISOString().split("T")[0];
    const newUpdate: CoachUpdate = {
      id: coachUpdates.length + 1,
      date: today,
      message,
    };
    setCoachUpdates((prevUpdates) => [newUpdate, ...prevUpdates]);
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
          <Card
            title="Updates from Coach"
            action={
              <button
                onClick={() => setShowAddMessage(true)}
                className="text-sm text-primary hover:underline"
              >
                +Add Message
              </button>
            }
          >
            <div className="space-y-4">
              {coachUpdates.map((update) => (
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
            <div className="h-[400px] flex flex-col">
              <div className="flex-1">
                <ResponsiveContainer
                  key={location.pathname}
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={mockWeightData}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) =>
                        new Date(date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <YAxis
                      domain={["dataMin - 5", "dataMax + 5"]}
                      tickFormatter={(value) => `${value} lbs`}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} lbs`, "Weight"]}
                      labelFormatter={(date) =>
                        new Date(date).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ fill: "#10B981", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 flex flex-col space-y-4">
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-secondary dark:text-alabaster font-medium">
                      Starting Weight:{" "}
                    </span>
                    <span className="text-secondary dark:text-alabaster">
                      {startWeight} lbs
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary dark:text-alabaster font-medium">
                      Current Weight:{" "}
                    </span>
                    <span className="text-secondary dark:text-alabaster">
                      {currentWeight} lbs
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary dark:text-alabaster font-medium">
                      Total Change:{" "}
                    </span>
                    <span
                      className={
                        totalChange <= 0 ? "text-green-500" : "text-red-500"
                      }
                    >
                      {totalChange <= 0 ? "" : "+"}
                      {totalChange} lbs
                    </span>
                  </div>
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
            </div>
          </Card>
        </div>
      </div>

      <AddMessageModal
        isOpen={showAddMessage}
        onClose={() => setShowAddMessage(false)}
        onSubmit={handleAddMessage}
      />
    </div>
  );
}
