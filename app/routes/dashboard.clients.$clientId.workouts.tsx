import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import ViewWorkoutPlanModal from "~/components/coach/ViewWorkoutPlanModal";
import CreateWorkoutModal from "~/components/coach/CreateWorkoutModal";
import { useState } from "react";

interface Workout {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  isActive: boolean;
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

  const handleSetActive = (workoutId: string) => {
    setWorkouts((prevWorkouts) =>
      prevWorkouts.map((workout) => ({
        ...workout,
        isActive: workout.id === workoutId,
      }))
    );
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    Create Plan
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {workouts.map((workout) => (
                  <div
                    key={workout.id}
                    className={`p-4 border rounded-lg ${
                      workout.isActive
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-gray-light dark:border-davyGray dark:bg-night/50"
                    }`}
                  >
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
                    <div className="flex gap-2 mt-3">
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
                  </div>
                ))}
              </div>
            </Card>
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
                  <Button variant="primary">Create Workout Plan</Button>
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
