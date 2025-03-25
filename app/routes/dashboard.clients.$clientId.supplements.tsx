import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Supplements | Vested Fitness" },
    { name: "description", content: "Manage client supplements" },
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
  },
  {
    date: "Apr 9",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: true,
  },
  { date: "Apr 10", supplements: ["Multivitamin", "Creatine"], taken: true },
  {
    date: "Apr 11",
    supplements: ["Multivitamin", "Protein Powder", "Creatine"],
    taken: false,
  },
  {
    date: "Apr 12",
    supplements: ["Multivitamin", "Protein Powder"],
    taken: true,
  },
];

export default function ClientSupplements() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-secondary">
          John Smith&apos;s Supplements
        </h1>
      </div>

      <div className="space-y-6">
        {/* Client's Supplements */}
        <Card
          title="Client Supplements"
          action={
            <Button variant="outline" size="sm">
              Add Supplement
            </Button>
          }
        >
          <div className="space-y-4">
            {mockSupplements.map((supplement) => (
              <div
                key={supplement.id}
                className="p-4 border border-gray-light dark:border-davyGray rounded-lg dark:bg-night/50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-secondary dark:text-alabaster text-lg">
                      {supplement.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                      <div>
                        <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
                          Dosage:
                        </span>
                        <span className="text-sm text-secondary dark:text-alabaster ml-2">
                          {supplement.dosage}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
                          Frequency:
                        </span>
                        <span className="text-sm text-secondary dark:text-alabaster ml-2">
                          {supplement.frequency}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
                          Timing:
                        </span>
                        <span className="text-sm text-secondary dark:text-alabaster ml-2">
                          {supplement.timing}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
                          Started:
                        </span>
                        <span className="text-sm text-secondary dark:text-alabaster ml-2">
                          {supplement.startDate}
                        </span>
                      </div>
                    </div>
                    {supplement.notes && (
                      <div className="mt-2">
                        <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
                          Notes:
                        </span>
                        <p className="text-sm text-secondary dark:text-alabaster mt-1">
                          {supplement.notes}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button className="text-primary text-sm hover:underline">
                      Edit
                    </button>
                    <button className="text-red-500 text-sm hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Supplement Compliance */}
        <Card title="Recent Supplement Compliance">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-light dark:border-davyGray">
                  <th className="text-left py-3 text-sm font-medium text-secondary dark:text-alabaster">
                    Date
                  </th>
                  <th className="text-left py-3 text-sm font-medium text-secondary dark:text-alabaster">
                    Supplements
                  </th>
                  <th className="text-left py-3 text-sm font-medium text-secondary dark:text-alabaster">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockComplianceData.map((day, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-light dark:border-davyGray last:border-0"
                  >
                    <td className="py-3 text-sm text-secondary dark:text-alabaster">
                      {day.date}
                    </td>
                    <td className="py-3 text-sm text-secondary dark:text-alabaster">
                      {day.supplements.join(", ")}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          day.taken
                            ? "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400"
                            : "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400"
                        }`}
                      >
                        {day.taken ? "Taken" : "Missed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
