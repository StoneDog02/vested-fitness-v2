import { useState, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import { TrashIcon, EyeIcon } from "@heroicons/react/24/outline";
import ViewWorkoutPlanModal from "./ViewWorkoutPlanModal";

// Define the type for a workout plan template
export type WorkoutPlanLibrary = {
  id: string;
  title: string;
  description: string;
  instructions?: string;
  createdAt: string;
  isActive: boolean;
  builderMode?: 'week' | 'day';
  workoutDaysPerWeek?: number;
  days: Array<{
    day: string;
    isRest: boolean;
    workout: {
      id: string;
      title: string;
      createdAt: string;
      exercises: Array<{
        type: string;
        notes?: string;
        exercises: Array<{
          name: string;
          sets: string;
          reps: string;
          notes?: string;
        }>;
      }>;
    } | null;
  }>;
};

type ViewWorkoutPlanLibraryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  libraryPlans: WorkoutPlanLibrary[];
  onTemplateDeleted?: (templateId: string) => void;
};

export default function ViewWorkoutPlanLibraryModal({
  isOpen,
  onClose,
  libraryPlans: initialLibraryPlans,
  onTemplateDeleted,
}: ViewWorkoutPlanLibraryModalProps) {
  const fetcher = useFetcher();
  const [libraryPlans, setLibraryPlans] = useState(initialLibraryPlans);
  const [libraryPlansPage, setLibraryPlansPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewWorkoutPlan, setViewWorkoutPlan] = useState<WorkoutPlanLibrary | null>(null);
  const [submittingTemplateId, setSubmittingTemplateId] = useState<string | null>(null);

  // Handle template deletion
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Check if this was a template deletion
      const url = new URL(window.location.href);
      if (url.searchParams.has("deletedTemplate")) {
        const deletedTemplateId = url.searchParams.get("deletedTemplate");
        if (deletedTemplateId) {
          setLibraryPlans(prev => prev.filter(plan => plan.id !== deletedTemplateId));
          onTemplateDeleted?.(deletedTemplateId);
          // Clean up the URL
          url.searchParams.delete("deletedTemplate");
          window.history.replaceState({}, "", url.toString());
        }
      }
    }
  }, [fetcher.state, fetcher.data, onTemplateDeleted]);

  // Handle successful template usage - auto close modal
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && submittingTemplateId) {
      // Check if the submission was successful
      if (fetcher.data.success || !fetcher.data.error) {
        // Auto close the modal after successful template usage
        onClose();
        setSubmittingTemplateId(null);
        // Refresh the page to show the new plan
        window.location.reload();
      } else {
        // If there was an error, clear the submitting state
        setSubmittingTemplateId(null);
      }
    }
  }, [fetcher.state, fetcher.data, submittingTemplateId, onClose]);

  // Track when a template is being submitted
  useEffect(() => {
    if (fetcher.state === "submitting") {
      const formData = fetcher.formData;
      if (formData) {
        const intent = formData.get("intent");
        const templateId = formData.get("templateId");
        if (intent === "useTemplate" && templateId) {
          setSubmittingTemplateId(templateId as string);
        }
      }
    }
  }, [fetcher.state, fetcher.formData]);

  // Load more plans when scrolled to bottom
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 40 && hasMore && fetcher.state === "idle") {
        const nextPage = libraryPlansPage + 1;
        setLibraryPlansPage(nextPage);
        fetcher.load(`${window.location.pathname}?libraryPlansPage=${nextPage}`);
      }
    };
    const el = containerRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => {
        el.removeEventListener("scroll", handleScroll);
      };
    }
    return undefined;
  }, [isOpen, hasMore, libraryPlansPage, fetcher.state]);

  // Append new plans when fetcher loads more
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const { libraryPlans: newPlans = [], libraryPlansHasMore = false } = fetcher.data as any;
      setLibraryPlans((prev) => [...prev, ...newPlans]);
      setHasMore(libraryPlansHasMore);
    }
  }, [fetcher.data, fetcher.state]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setLibraryPlans(initialLibraryPlans);
      setLibraryPlansPage(1);
      setHasMore(true);
      setSubmittingTemplateId(null);
    }
  }, [isOpen, initialLibraryPlans]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-night rounded-lg p-8 max-w-2xl w-full overflow-y-auto max-h-[90vh]" ref={containerRef}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-secondary dark:text-alabaster">Workout Plan Library</h2>
          <button
            className="text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white text-xl font-bold p-1 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            onClick={onClose}
            aria-label="Close"
            type="button"
            disabled={fetcher.state === "submitting"}
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          {libraryPlans.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400">No workout plans in library.</div>
          ) : (
            libraryPlans.map((plan) => {
              const isSubmitting = submittingTemplateId === plan.id;
              const isDisabled = fetcher.state === "submitting";
              
              return (
                <div
                  key={plan.id}
                  className="p-4 border border-gray-light dark:border-davyGray dark:bg-night/50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium text-secondary dark:text-alabaster">
                        {plan.title}
                      </h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="View Template"
                          onClick={() => setViewWorkoutPlan(plan)}
                          disabled={isDisabled}
                        >
                          <EyeIcon className="h-3 w-3" />
                          View
                        </button>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="useTemplate" />
                          <input type="hidden" name="templateId" value={plan.id} />
                          <button
                            type="submit"
                            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all duration-200 ${
                              isSubmitting 
                                ? "bg-primary/70 text-white cursor-not-allowed" 
                                : "bg-primary hover:bg-primary/80 text-white"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Use Template"
                            disabled={isDisabled}
                          >
                            {isSubmitting ? (
                              <>
                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Creating...
                              </>
                            ) : (
                              "Use Template"
                            )}
                          </button>
                        </fetcher.Form>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="deleteTemplate" />
                          <input type="hidden" name="templateId" value={plan.id} />
                          <button
                            type="submit"
                            className="text-red-500 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Template"
                            disabled={isDisabled}
                            onClick={(e) => {
                              if (!confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
                                e.preventDefault();
                              }
                            }}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </fetcher.Form>
                      </div>
                    </div>
                    <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                      {plan.description}
                    </p>
                    {plan.instructions && (
                      <div className="text-sm text-gray-dark dark:text-gray-light mt-2">
                        Instructions: {plan.instructions}
                      </div>
                    )}
                    <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                      Created: {new Date(plan.createdAt).toLocaleDateString(undefined, {
                        month: "2-digit",
                        day: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                    <div className="mt-3">
                      <div className="text-sm text-gray-dark dark:text-gray-light">
                        {plan.builderMode === 'day' 
                          ? `${plan.workoutDaysPerWeek || plan.days.filter((d) => !d.isRest).length} workout template${(plan.workoutDaysPerWeek || plan.days.filter((d) => !d.isRest).length) !== 1 ? 's' : ''}`
                          : `${plan.days.filter((d) => !d.isRest).length} workout day${plan.days.filter((d) => !d.isRest).length !== 1 ? "s" : ""}`
                        }
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {hasMore && fetcher.state === "loading" && (
            <div className="flex justify-center py-4">
              <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>
      </div>
      
      {/* View Workout Plan Modal */}
      {viewWorkoutPlan && (
        <ViewWorkoutPlanModal
          isOpen={!!viewWorkoutPlan}
          onClose={() => setViewWorkoutPlan(null)}
          workoutPlan={viewWorkoutPlan}
        />
      )}
    </div>
  );
} 