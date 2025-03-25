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

  const handleSupplementCheck = (id: string) => {
    setCheckedSupplements((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-6">
        Supplements
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Supplements */}
        <div className="lg:col-span-2">
          <Card title="Today's Supplements">
            <div className="space-y-4">
              {mockSupplements.map((supplement) => (
                <div
                  key={supplement.id}
                  className="flex items-start p-3 rounded-lg border border-gray-light dark:border-davyGray"
                >
                  <div className="flex-shrink-0 pt-0.5">
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
                      className="font-medium text-secondary dark:text-alabaster"
                    >
                      {supplement.name}
                    </label>
                    <div className="text-sm text-gray-dark dark:text-gray-light">
                      {supplement.dosage} - {supplement.frequency} -{" "}
                      {supplement.timing}
                    </div>
                    {supplement.notes && (
                      <div className="text-sm text-gray-dark dark:text-gray-light mt-1 italic">
                        {supplement.notes}
                      </div>
                    )}
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
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-dark dark:text-gray-light">
                    {day.date}
                  </span>
                  <span
                    className={`${
                      day.compliance >= 80
                        ? "text-green-500"
                        : day.compliance >= 50
                        ? "text-yellow-500"
                        : "text-red-500"
                    }`}
                  >
                    {day.compliance}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Benefits */}
          <Card title="Benefits">
            <div className="space-y-3">
              <p className="text-sm text-gray-dark dark:text-gray-light">
                Your custom supplement protocol supports:
              </p>
              <ul className="text-sm space-y-2 text-gray-dark dark:text-gray-light">
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Muscle recovery and growth</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Increased energy and metabolism</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Immune system support</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Joint health and mobility</span>
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
