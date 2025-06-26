import { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import type { MealPlan } from "~/routes/dashboard.clients.$clientId.meals";
import { useFetcher } from "@remix-run/react";

type ViewMealPlanLibraryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  libraryPlans: MealPlan[];
};

export default function ViewMealPlanLibraryModal({
  isOpen,
  onClose,
  libraryPlans,
}: ViewMealPlanLibraryModalProps) {
  const fetcher = useFetcher();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-night rounded-lg p-8 max-w-2xl w-full overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-secondary dark:text-alabaster">Meal Plan Library</h2>
          <button
            className="text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white text-xl font-bold p-1 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          {libraryPlans.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400">No meal plans in library.</div>
          ) : (
            libraryPlans.map((plan) => (
              <div
                key={plan.id}
                className="p-4 border border-gray-light dark:border-davyGray dark:bg-night/50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-secondary dark:text-alabaster">
                      {plan.title}
                    </h3>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="useTemplate" />
                      <input type="hidden" name="templateId" value={plan.id} />
                      <button
                        type="submit"
                        className="bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded text-xs font-semibold"
                        title="Use Template"
                      >
                        Use Template
                      </button>
                    </fetcher.Form>
                  </div>
                  <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                    {plan.description}
                  </p>
                  <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                    Created:{" "}
                    {new Date(plan.createdAt).toLocaleDateString(undefined, {
                      month: "2-digit",
                      day: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                  <div className="mt-3">
                    <div className="text-sm text-gray-dark dark:text-gray-light">
                      {plan.meals.length} meal{plan.meals.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
} 