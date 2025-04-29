import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientProfile from "~/components/coach/ClientProfile";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddMessageModal from "~/components/coach/AddMessageModal";
import AddCheckInModal from "~/components/coach/AddCheckInModal";
import CheckInHistoryModal from "~/components/coach/CheckInHistoryModal";
import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

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

interface CheckInNote {
  id: string;
  date: string;
  notes: string;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Client Details | Vested Fitness" },
    { name: "description", content: "View and manage client details" },
  ];
};

export const loader = async ({ params }: { params: { clientId: string } }) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: updates, error } = await supabase
    .from("coach_updates")
    .select("*")
    .eq("client_id", params.clientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching updates:", error);
    return json({ updates: [] });
  }

  return json({ updates });
};

export default function ClientDetails() {
  const { updates } = useLoaderData<typeof loader>();
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [showAddCheckIn, setShowAddCheckIn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [checkInHistory, setCheckInHistory] = useState<CheckInNote[]>([
    {
      id: "1",
      date: "2024-03-01",
      notes:
        "Client reported feeling stronger in workouts. Sleep has improved to 7-8 hours per night. Compliance with meal plan at 90%.",
    },
    {
      id: "2",
      date: "2024-02-24",
      notes:
        "Client is making good progress with form. Sleep quality needs improvement. Meal plan compliance at 85%.",
    },
    {
      id: "3",
      date: "2024-02-17",
      notes:
        "Initial check-in. Client is motivated and ready to start the program. Set baseline measurements and goals.",
    },
  ]);
  const [displayedHistory, setDisplayedHistory] = useState<CheckInNote[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentCheckIn, setCurrentCheckIn] = useState({
    lastWeek:
      "Client reported feeling stronger in workouts. Sleep has improved to 7-8 hours per night. Compliance with meal plan at 90%.",
    thisWeek:
      "Client is continuing to make progress. Weight down by 1 lb. Requested some modifications to the leg day workout.",
  });
  const fetcher = useFetcher();

  // Initialize displayed history
  useEffect(() => {
    setDisplayedHistory(checkInHistory.slice(0, 10));
  }, [checkInHistory]);

  const handleAddMessage = (message: string) => {
    fetcher.submit(
      { message },
      { method: "post", action: `/api/coach-updates/${mockClient.id}` }
    );
    setShowAddMessage(false);
  };

  const handleAddCheckIn = (thisWeek: string) => {
    // Move current thisWeek to lastWeek
    const newLastWeek = currentCheckIn.thisWeek;

    // Add the current lastWeek to history
    const newHistoryEntry: CheckInNote = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      notes: currentCheckIn.lastWeek,
    };

    setCheckInHistory((prev) => [newHistoryEntry, ...prev]);
    setCurrentCheckIn({
      lastWeek: newLastWeek,
      thisWeek,
    });
  };

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    const startIndex = nextPage * 10;
    const newCheckIns = checkInHistory.slice(startIndex, startIndex + 10);
    setDisplayedHistory((prev) => [...prev, ...newCheckIns]);
    setCurrentPage(nextPage);
  };

  const hasMore = displayedHistory.length < checkInHistory.length;

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
                <button
                  onClick={() => setShowAddMessage(true)}
                  className="text-sm text-primary hover:underline"
                >
                  +Add Message
                </button>
              }
            >
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
            <Card
              title="Check In Notes"
              action={
                <div className="flex flex-col items-end space-y-1">
                  <button
                    onClick={() => setShowAddCheckIn(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    +Add Check In
                  </button>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    History
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    Last Week
                  </h4>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    {currentCheckIn.lastWeek}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    This Week
                  </h4>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    {currentCheckIn.thisWeek}
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

        <AddMessageModal
          isOpen={showAddMessage}
          onClose={() => setShowAddMessage(false)}
          onSubmit={handleAddMessage}
        />

        <AddCheckInModal
          isOpen={showAddCheckIn}
          onClose={() => setShowAddCheckIn(false)}
          onSubmit={handleAddCheckIn}
          lastWeekNotes={currentCheckIn.lastWeek}
        />

        <CheckInHistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          checkIns={displayedHistory}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
        />
      </div>
    </ClientDetailLayout>
  );
}
