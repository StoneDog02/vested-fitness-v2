import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";

export const meta: MetaFunction = () => {
  return [
    { title: "Supplements | Vested Fitness" },
    { name: "description", content: "View and track your supplements" },
  ];
};

// Mock supplements data
const mockSupplements = [
  {
    id: "1",
    name: "Multivitamin",
    dosage: "1 tablet",
    frequency: "Daily",
    timing: "Morning with breakfast",
    notes: "Helps fill nutritional gaps in the diet",
    startDate: "2024-01-15",
  },
  {
    id: "2",
    name: "Protein Powder",
    dosage: "1 scoop (25g)",
    frequency: "Daily",
    timing: "Post-workout or as needed",
    notes: "Whey isolate, 24g protein per serving",
    startDate: "2024-01-15",
  },
  {
    id: "3",
    name: "Creatine Monohydrate",
    dosage: "5g",
    frequency: "Daily",
    timing: "Any time with water",
    notes: "No loading phase needed, consistent daily use",
    startDate: "2024-02-10",
  },
];

// Mock compliance data
const mockComplianceData = [
  {
    date: "Apr 5",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: true,
    compliance: 100,
  },
  {
    date: "Apr 6",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: true,
    compliance: 100,
  },
  {
    date: "Apr 7",
    supplements: ["Multivitamin", "Protein Powder"],
    taken: true,
    compliance: 67,
  },
  {
    date: "Apr 8",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: true,
    compliance: 100,
  },
  {
    date: "Apr 9",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: true,
    compliance: 100,
  },
  {
    date: "Apr 10",
    supplements: ["Multivitamin", "Creatine"],
    taken: true,
    compliance: 67,
  },
  {
    date: "Apr 11",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: false,
    compliance: 0,
  },
];

export default function Supplements() {
  const [checkedSupplements, setCheckedSupplements] = useState<{
    [key: string]: boolean;
  }>({});
  const [dayOffset, setDayOffset] = useState(0);

  const handleSupplementCheck = (id: string) => {
    setCheckedSupplements((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Get current date with offset
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + dayOffset);

  // Format date display
  const getRelativeDay = (offset: number) => {
    switch (offset) {
      case 0:
        return "Today";
      case 1:
        return "Tomorrow";
      case -1:
        return "Yesterday";
      default:
        return currentDate.toLocaleDateString("en-US", { weekday: "long" });
    }
  };

  const dateDisplay = {
    title: getRelativeDay(dayOffset),
    subtitle: currentDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-6">
        Supplements
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            {/* Date Navigation */}
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => setDayOffset(dayOffset - 1)}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Previous
              </button>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-secondary dark:text-alabaster">
                  {dateDisplay.title}
                </h2>
                <div className="text-sm text-gray-dark dark:text-gray-light mt-1">
                  {dateDisplay.subtitle}
                </div>
                {dayOffset !== 0 && (
                  <button
                    onClick={() => setDayOffset(0)}
                    className="text-xs text-primary hover:text-primary-dark transition-colors duration-200 mt-1"
                  >
                    Go to today
                  </button>
                )}
              </div>
              <button
                onClick={() => setDayOffset(dayOffset + 1)}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
              >
                Next
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {mockSupplements.map((supplement) => (
                <div
                  key={supplement.id}
                  className="flex items-start p-4 rounded-lg border border-gray-light dark:border-davyGray hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex-shrink-0 pt-1">
                    <input
                      type="checkbox"
                      id={`supplement-${supplement.id}`}
                      checked={!!checkedSupplements[supplement.id]}
                      onChange={() => handleSupplementCheck(supplement.id)}
                      className="h-4 w-4 rounded border-gray-light text-primary focus:ring-primary"
                    />
                  </div>
                  <div className="ml-3 flex-grow">
                    <label
                      htmlFor={`supplement-${supplement.id}`}
                      className="font-medium text-secondary dark:text-alabaster text-lg"
                    >
                      {supplement.name}
                    </label>
                    <div className="mt-1 text-sm text-gray-dark dark:text-gray-light">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <span className="font-medium">Dosage:</span>{" "}
                          {supplement.dosage}
                        </div>
                        <div>
                          <span className="font-medium">Timing:</span>{" "}
                          {supplement.timing}
                        </div>
                      </div>
                      {supplement.notes && (
                        <div className="mt-2 italic">{supplement.notes}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Instructions */}
          <Card title="Instructions">
            <div className="space-y-3">
              <p className="text-sm text-gray-dark dark:text-gray-light">
                Take your supplements as directed by your coach. Mark each
                supplement as completed after taking it.
              </p>
              <h4 className="font-medium text-secondary dark:text-alabaster text-sm mb-1">
                Recommended times:
              </h4>
              <ul className="text-sm space-y-1 text-gray-dark dark:text-gray-light">
                <li>• Morning supplements: With breakfast</li>
                <li>• Pre-workout: 30 minutes before exercise</li>
                <li>• Post-workout: Within 30 minutes after exercise</li>
                <li>• Evening supplements: With dinner or before bed</li>
              </ul>
            </div>
          </Card>

          {/* Recent Compliance */}
          <Card title="Recent Compliance">
            <div className="space-y-2">
              {mockComplianceData.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-gray-lightest dark:hover:bg-secondary-light/5"
                >
                  <span className="text-gray-dark dark:text-gray-light">
                    {day.date}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-lightest dark:bg-night rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          day.compliance >= 80
                            ? "bg-green-500"
                            : day.compliance >= 50
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${day.compliance}%` }}
                      />
                    </div>
                    <span
                      className={`${
                        day.compliance >= 80
                          ? "text-green-500"
                          : day.compliance >= 50
                          ? "text-yellow-500"
                          : "text-red-500"
                      } w-8 text-right`}
                    >
                      {day.compliance}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
