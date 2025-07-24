import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface SetData {
  setNumber: number;
  weight?: number;
  reps: string;
  completed?: boolean;
  notes?: string;
}

interface ExerciseData {
  id: string;
  name: string;
  description: string;
  sets: SetData[];
}

interface WorkoutPlanData {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  isActive: boolean;
  exercises: ExerciseData[];
}

interface ViewWorkoutPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  workoutPlan: WorkoutPlanData;
}

export default function ViewWorkoutPlanModal({
  isOpen,
  onClose,
  workoutPlan,
}: ViewWorkoutPlanModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={workoutPlan.title}
      size="lg"
    >
      <div className="space-y-6">
        <div>
          <p className="text-gray-dark dark:text-gray-light">
            {workoutPlan.description}
          </p>
          <p className="text-sm text-gray-dark dark:text-gray-light mt-2">
            Created: {workoutPlan.createdAt}
          </p>
        </div>

        <div className="space-y-6">
          {workoutPlan.exercises.map((exercise) => (
            <div
              key={exercise.id}
              className="border border-gray-light dark:border-davyGray rounded-lg p-4"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
                  {exercise.name}
                </h3>
                <span className="text-sm text-gray-dark dark:text-gray-light">
                  {exercise.description}
                </span>
              </div>

              <div className="space-y-2 mt-2">
                {exercise.sets.map((set) => (
                  <div
                    key={set.setNumber}
                    className="flex gap-4 text-sm items-center"
                  >
                    <span className="font-medium text-secondary dark:text-alabaster">
                      Set {set.setNumber}
                    </span>
                    <span className="text-gray-dark dark:text-gray-light">
                      Reps: {set.reps}
                    </span>
                    {set.weight !== undefined && (
                      <span className="text-gray-dark dark:text-gray-light">
                        Weight: {set.weight} lbs
                      </span>
                    )}
                    {set.notes && (
                      <span className="italic text-gray-500 dark:text-gray-400">
                        Notes: {set.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
