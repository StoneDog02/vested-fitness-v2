import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import ViewWorkoutPlanModal from "~/components/coach/ViewWorkoutPlanModal";
import CreateWorkoutModal from "~/components/coach/CreateWorkoutModal";
import { useState } from "react";
import Modal from "~/components/ui/Modal";
import { TrashIcon } from "@heroicons/react/24/outline";

interface Workout {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  isActive: boolean;
  isArchived?: boolean;
}

interface WorkoutSection {
  name: string;
  videoUrl?: string;
  sets: number;
  reps: number;
  notes?: string;
}

interface WorkoutPlanForm {
  planName: string;
  type: "Single" | "Super Set" | "Giant Set";
  exercises: WorkoutSection[];
}

const mockWorkouts: Workout[] = [
  {
    id: "1",
    title: "Upper Body Strength",
    description: "Focus on chest and back exercises",
    createdAt: "2024-03-01",
    isActive: true,
  },
  {
    id: "2",
    title: "Lower Body Power",
    description: "Heavy compound movements",
    createdAt: "2024-02-15",
    isActive: false,
  },
  {
    id: "3",
    title: "HIIT Cardio",
    description: "High-intensity interval training",
    createdAt: "2024-02-01",
    isActive: false,
  },
  {
    id: "4",
    title: "Core & Stability",
    description: "Focus on core strength and balance",
    createdAt: "2024-01-15",
    isActive: false,
  },
  {
    id: "5",
    title: "Full Body Circuit",
    description: "Complete body workout with supersets",
    createdAt: "2024-01-01",
    isActive: false,
  },
  {
    id: "6",
    title: "Mobility & Recovery",
    description: "Dynamic stretching and mobility work",
    createdAt: "2023-12-15",
    isActive: false,
  },
  {
    id: "7",
    title: "Power & Explosiveness",
    description: "Plyometrics and explosive movements",
    createdAt: "2023-12-01",
    isActive: false,
  },
];

const mockExercises = [
  {
    id: "ex1",
    name: "Bench Press",
    description: "4 sets x 6-10 reps",
    sets: [
      { setNumber: 1, reps: 10, weight: 135 },
      { setNumber: 2, reps: 8, weight: 185 },
      { setNumber: 3, reps: 6, weight: 205 },
      { setNumber: 4, reps: 6, weight: 205 },
    ],
  },
  {
    id: "ex2",
    name: "Incline Dumbbell Press",
    description: "3 sets x 8-10 reps",
    sets: [
      { setNumber: 1, reps: 10, weight: 60 },
      { setNumber: 2, reps: 10, weight: 65 },
      { setNumber: 3, reps: 8, weight: 70 },
    ],
  },
];

export const meta: MetaFunction = () => {
  return [
    { title: "Client Workouts | Vested Fitness" },
    { name: "description", content: "Manage client workout plans" },
  ];
};

export default function ClientWorkouts() {
  const [workouts, setWorkouts] = useState<Workout[]>(mockWorkouts);
  const activeWorkout = workouts.find((workout) => workout.isActive);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editWorkoutData, setEditWorkoutData] =
    useState<WorkoutPlanForm | null>(null);
  const [viewWorkoutPlan, setViewWorkoutPlan] = useState<Workout | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Filter workouts for the main container to only show non-archived ones
  // AND only show workouts that were either:
  // 1. Part of the initial 3 most recent
  // 2. Explicitly activated by the coach
  const initialWorkoutIds = mockWorkouts.slice(0, 3).map((w) => w.id);
  const visibleWorkouts = workouts.filter(
    (workout) =>
      !workout.isArchived &&
      (initialWorkoutIds.includes(workout.id) ||
        workout.createdAt > mockWorkouts[0].createdAt) // This means it was activated after initial load
  );

  // Sort visible workouts by createdAt descending
  const sortedVisibleWorkouts = [...visibleWorkouts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  const recentWorkouts = sortedVisibleWorkouts;

  // For the history modal, use all workouts
  const sortedWorkouts = [...workouts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const handleSetActive = (workoutId: string) => {
    setWorkouts((prevWorkouts) => {
      // Find the workout being activated
      const workoutToActivate = prevWorkouts.find(
        (workout) => workout.id === workoutId
      );
      if (!workoutToActivate) return prevWorkouts;

      // Get all workouts except the one being activated
      const otherWorkouts = prevWorkouts.filter(
        (workout) => workout.id !== workoutId
      );

      // Sort remaining workouts by date (newest first)
      const sortedOtherWorkouts = [...otherWorkouts].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      // Create new array with activated workout at the start, and unarchive it
      const reorderedWorkouts = [
        {
          ...workoutToActivate,
          isActive: true,
          isArchived: false, // Unarchive when activating
          createdAt: new Date().toISOString().split("T")[0],
        },
        ...sortedOtherWorkouts.map((workout) => ({
          ...workout,
          isActive: false,
        })),
      ];

      return reorderedWorkouts;
    });

    // Close the history modal
    setIsHistoryModalOpen(false);
  };

  const handleEdit = (workout: Workout) => {
    setEditWorkoutData({
      planName: workout.title,
      type: "Single", // You may want to store type in your data model
      exercises: mockExercises.map((ex) => ({
        name: ex.name,
        videoUrl: undefined,
        sets: ex.sets[0]?.setNumber || 3,
        reps: ex.sets[0]?.reps || 10,
        notes: undefined,
      })),
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateWorkout = (updated: WorkoutPlanForm) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.title === (editWorkoutData ? editWorkoutData.planName : "")
          ? {
              ...w,
              title: updated.planName,
              description: updated.exercises.map((ex) => ex.name).join(", "),
            }
          : w
      )
    );
    setIsEditModalOpen(false);
    setEditWorkoutData(null);
  };

  const handleCreateWorkout = (workoutData: WorkoutPlanForm) => {
    setWorkouts((prev) => [
      ...prev,
      {
        id: (prev.length + 1).toString(),
        title: workoutData.planName,
        description: workoutData.exercises.map((ex) => ex.name).join(", "),
        createdAt: new Date().toISOString().slice(0, 10),
        isActive: false,
      },
    ]);
    setIsCreateModalOpen(false);
  };

  const handleRemoveWorkout = (workoutId: string) => {
    setWorkouts((prevWorkouts) => {
      const workoutToArchive = prevWorkouts.find((w) => w.id === workoutId);

      // Mark the workout as archived instead of removing it
      const updatedWorkouts = prevWorkouts.map((workout) =>
        workout.id === workoutId
          ? { ...workout, isArchived: true, isActive: false }
          : workout
      );

      // If we're archiving the active workout, make the next visible one active
      if (workoutToArchive?.isActive) {
        const remainingVisible = updatedWorkouts.filter(
          (w) =>
            !w.isArchived &&
            (initialWorkoutIds.includes(w.id) ||
              w.createdAt > mockWorkouts[0].createdAt)
        );
        if (remainingVisible.length > 0) {
          // Sort by creation date (newest first)
          const sortedVisible = [...remainingVisible].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt)
          );
          // Set the first remaining workout as active
          return updatedWorkouts.map((workout) => ({
            ...workout,
            isActive: !workout.isArchived && workout.id === sortedVisible[0].id,
          }));
        }
      }

      return updatedWorkouts;
    });
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            John Smith&apos;s Workouts
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left side - Workout History */}
          <div>
            <Card
              title="Workout History"
              action={
                <div className="flex flex-col items-start gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    Create Plan
                  </Button>
                  <button
                    className="text-primary text-xs font-medium hover:underline mt-1 px-1"
                    onClick={() => setIsHistoryModalOpen(true)}
                    style={{ background: "none", border: "none" }}
                  >
                    History
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {recentWorkouts.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-dark dark:text-gray-light">
                      Create workouts to be shown here
                    </p>
                  </div>
                ) : (
                  recentWorkouts.map((workout) => (
                    <div
                      key={workout.id}
                      className={`p-4 border rounded-lg ${
                        workout.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-secondary dark:text-alabaster">
                            {workout.title}
                          </h3>
                          {workout.isActive ? (
                            <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                              Active
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {workout.description}
                        </p>
                        <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                          Created: {workout.createdAt}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex gap-2">
                            <button
                              className="text-gray-dark dark:text-gray-light text-sm hover:underline"
                              onClick={() => handleEdit(workout)}
                            >
                              Edit
                            </button>
                            {!workout.isActive && (
                              <button
                                className="text-green-500 text-sm hover:underline"
                                onClick={() => handleSetActive(workout.id)}
                              >
                                Set Active
                              </button>
                            )}
                          </div>
                          <button
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleRemoveWorkout(workout.id)}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
            {/* History Modal */}
            <Modal
              isOpen={isHistoryModalOpen}
              onClose={() => setIsHistoryModalOpen(false)}
              title="Workout History"
            >
              <div className="space-y-4">
                {sortedWorkouts.length === 0 ? (
                  <div className="text-center text-gray-dark dark:text-gray-light">
                    No workouts in history.
                  </div>
                ) : (
                  sortedWorkouts.map((workout) => (
                    <div
                      key={workout.id}
                      className={`p-4 border rounded-lg ${
                        workout.isActive
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-gray-light dark:border-davyGray dark:bg-night/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-secondary dark:text-alabaster">
                            {workout.title}
                          </h3>
                          {workout.isActive && (
                            <span className="px-2 py-1 text-xs bg-primary text-white rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {workout.description}
                        </p>
                        <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                          Created: {workout.createdAt}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex gap-2">
                            <button
                              className="text-gray-dark dark:text-gray-light text-sm hover:underline"
                              onClick={() => handleEdit(workout)}
                            >
                              Edit
                            </button>
                            {!workout.isActive && (
                              <button
                                className="text-green-500 text-sm hover:underline"
                                onClick={() => handleSetActive(workout.id)}
                              >
                                Set Active
                              </button>
                            )}
                          </div>
                          <button
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleRemoveWorkout(workout.id)}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Modal>
          </div>

          {/* Right side - Active Plan & Calendar */}
          <div className="space-y-6">
            {/* Active Workout Plan */}
            <Card title="Active Workout Plan">
              {activeWorkout ? (
                <div>
                  <h3 className="font-medium text-secondary dark:text-alabaster text-lg">
                    {activeWorkout.title}
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                    {activeWorkout.description}
                  </p>
                  <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                    Created: {activeWorkout.createdAt}
                  </div>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setViewWorkoutPlan(activeWorkout)}
                  >
                    View Full Plan
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-dark dark:text-gray-light mb-4">
                    No active workout plan
                  </p>
                </div>
              )}
            </Card>

            {/* Workout Calendar */}
            <Card title="Workout Calendar">
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-dark dark:text-gray-light">
                  Workout Calendar Would Display Here
                </p>
              </div>
            </Card>
          </div>
        </div>
        {viewWorkoutPlan && (
          <ViewWorkoutPlanModal
            isOpen={!!viewWorkoutPlan}
            onClose={() => setViewWorkoutPlan(null)}
            workoutPlan={{
              ...viewWorkoutPlan,
              exercises: mockExercises,
            }}
          />
        )}

        <CreateWorkoutModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreateWorkout}
        />

        {isEditModalOpen && editWorkoutData && (
          <CreateWorkoutModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setEditWorkoutData(null);
            }}
            onSubmit={handleUpdateWorkout}
            initialValues={editWorkoutData}
            title="Edit Workout Plan"
            submitLabel="Save Changes"
          />
        )}
      </div>
    </ClientDetailLayout>
  );
}
