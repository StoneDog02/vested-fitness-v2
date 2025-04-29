import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddSupplementModal from "~/components/coach/AddSupplementModal";
import { useState } from "react";

interface Supplement {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  compliance: number;
}

const mockSupplements: Supplement[] = [
  {
    id: "1",
    name: "Whey Protein",
    dosage: "30g",
    frequency: "Post-workout",
    instructions: "Mix with water or milk",
    compliance: 85,
  },
  {
    id: "2",
    name: "Creatine Monohydrate",
    dosage: "5g",
    frequency: "Daily",
    instructions: "Take with water",
    compliance: 90,
  },
];

export const meta: MetaFunction = () => {
  return [
    { title: "Client Supplements | Vested Fitness" },
    { name: "description", content: "Manage client supplement protocols" },
  ];
};

export default function ClientSupplements() {
  const [supplements, setSupplements] = useState<Supplement[]>(mockSupplements);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(
    null
  );

  const handleRemoveSupplement = (id: string) => {
    setSupplements((prevSupplements) =>
      prevSupplements.filter((supplement) => supplement.id !== id)
    );
  };

  const handleAddSupplement = (
    newSupplement: Omit<Supplement, "id" | "compliance">
  ) => {
    if (editingSupplement) {
      // Update existing supplement
      setSupplements((prev) =>
        prev.map((supplement) =>
          supplement.id === editingSupplement.id
            ? { ...supplement, ...newSupplement }
            : supplement
        )
      );
      setEditingSupplement(null);
    } else {
      // Add new supplement
      const supplement: Supplement = {
        ...newSupplement,
        id: Date.now().toString(),
        compliance: 0,
      };
      setSupplements((prev) => [...prev, supplement]);
    }
    setIsAddModalOpen(false);
  };

  const handleEditClick = (supplement: Supplement) => {
    setEditingSupplement(supplement);
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
    setEditingSupplement(null);
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            Client&apos;s Supplements
          </h1>
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
            Add Supplement
          </Button>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Supplements List */}
          <div className="flex-1 space-y-6">
            {supplements.map((supplement) => (
              <Card key={supplement.id}>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-semibold text-secondary dark:text-alabaster mb-2">
                        {supplement.name}
                      </h3>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-dark dark:text-gray-light">
                          <span className="font-medium">Dosage:</span>{" "}
                          {supplement.dosage}
                        </p>
                        <p className="text-sm text-gray-dark dark:text-gray-light">
                          <span className="font-medium">Frequency:</span>{" "}
                          {supplement.frequency}
                        </p>
                        <p className="text-sm text-gray-dark dark:text-gray-light">
                          <span className="font-medium">Instructions:</span>{" "}
                          {supplement.instructions}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(supplement)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => handleRemoveSupplement(supplement.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Supplement Compliance Card */}
          <div className="w-full md:w-fit">
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold text-secondary dark:text-alabaster mb-4">
                  Supplement Compliance
                </h2>
                <div className="space-y-2">
                  {supplements.map((supplement) => (
                    <div
                      key={supplement.id}
                      className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-gray-lightest dark:hover:bg-secondary-light/5"
                    >
                      <span className="text-secondary dark:text-alabaster mr-8">
                        {supplement.name}
                      </span>
                      <span
                        className={`${
                          supplement.compliance >= 80
                            ? "text-green-500"
                            : supplement.compliance >= 50
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                      >
                        {supplement.compliance}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        <AddSupplementModal
          isOpen={isAddModalOpen}
          onClose={handleModalClose}
          onAdd={handleAddSupplement}
          editingSupplement={editingSupplement}
        />
      </div>
    </ClientDetailLayout>
  );
}
