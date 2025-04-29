import { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

type WorkoutType = "Single" | "Super Set" | "Giant Set";

interface WorkoutSection {
  name: string;
  videoUrl?: string;
  sets: number;
  reps: number;
  notes?: string;
}

interface CreateWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (workout: {
    planName: string;
    type: WorkoutType;
    exercises: WorkoutSection[];
  }) => void;
  initialValues?: {
    planName: string;
    type: WorkoutType;
    exercises: WorkoutSection[];
  };
  title?: string;
  submitLabel?: string;
}

export default function CreateWorkoutModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  title = "Create New Workout",
  submitLabel = "Create Workout",
}: CreateWorkoutModalProps) {
  const [planName, setPlanName] = useState("");
  const [type, setType] = useState<WorkoutType>("Single");
  const [exercises, setExercises] = useState<WorkoutSection[]>([
    { name: "", sets: 3, reps: 10 },
  ]);

  // Populate form with initial values when editing
  useEffect(() => {
    if (initialValues) {
      setPlanName(initialValues.planName);
      setType(initialValues.type);
      setExercises(
        initialValues.exercises.length > 0
          ? initialValues.exercises
          : [{ name: "", sets: 3, reps: 10 }]
      );
    } else if (isOpen) {
      // Reset form when opening for create
      setPlanName("");
      setType("Single");
      setExercises([{ name: "", sets: 3, reps: 10 }]);
    }
  }, [initialValues, isOpen]);

  const handleTypeChange = (newType: WorkoutType) => {
    setType(newType);
    // Reset exercises based on new type
    if (newType === "Single") {
      setExercises([{ name: "", sets: 3, reps: 10 }]);
    } else if (newType === "Super Set") {
      setExercises([
        { name: "", sets: 3, reps: 10 },
        { name: "", sets: 3, reps: 10 },
      ]);
    } else {
      setExercises([
        { name: "", sets: 3, reps: 10 },
        { name: "", sets: 3, reps: 10 },
        { name: "", sets: 3, reps: 10 },
      ]);
    }
  };

  const handleExerciseChange = (
    index: number,
    field: keyof WorkoutSection,
    value: string | number
  ) => {
    setExercises((prev) =>
      prev.map((exercise, i) =>
        i === index ? { ...exercise, [field]: value } : exercise
      )
    );
  };

  const addExercise = () => {
    setExercises((prev) => [...prev, { name: "", sets: 3, reps: 10 }]);
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      planName,
      type,
      exercises,
    });
    // Only reset if not editing
    if (!initialValues) {
      setPlanName("");
      setType("Single");
      setExercises([{ name: "", sets: 3, reps: 10 }]);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workout Plan Name */}
        <div>
          <label
            htmlFor="planName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Workout Plan Name
          </label>
          <input
            id="planName"
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="e.g., Push Day, Pull Day, Legs Day"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* Workout Type Selector */}
        <div>
          <label
            htmlFor="workoutType"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Workout Type
          </label>
          <select
            id="workoutType"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as WorkoutType)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="Single">Single</option>
            <option value="Super Set">Super Set</option>
            <option value="Giant Set">Giant Set</option>
          </select>
        </div>

        {/* Exercise Sections */}
        <div className="space-y-6">
          {exercises.map((exercise, index) => (
            <div
              key={index}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Exercise {index + 1}
                </h3>
                {type === "Giant Set" && index >= 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeExercise(index)}
                    className="!text-red-500 !border-red-500 hover:!bg-red-50 dark:hover:!bg-red-900/20"
                  >
                    Remove Exercise
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {/* Exercise Name */}
                <div>
                  <label
                    htmlFor={`exerciseName-${index}`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Exercise Name
                  </label>
                  <input
                    id={`exerciseName-${index}`}
                    type="text"
                    value={exercise.name}
                    onChange={(e) =>
                      handleExerciseChange(index, "name", e.target.value)
                    }
                    placeholder="e.g., Bench Press, Lateral Raises"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                {/* Video URL */}
                <div>
                  <label
                    htmlFor={`videoUrl-${index}`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Video URL (Optional)
                  </label>
                  <input
                    id={`videoUrl-${index}`}
                    type="url"
                    value={exercise.videoUrl || ""}
                    onChange={(e) =>
                      handleExerciseChange(index, "videoUrl", e.target.value)
                    }
                    placeholder="https://example.com/workout-video"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Sets and Reps */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor={`sets-${index}`}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Number of Sets
                    </label>
                    <input
                      id={`sets-${index}`}
                      type="number"
                      min="1"
                      max="9"
                      value={exercise.sets}
                      onChange={(e) =>
                        handleExerciseChange(
                          index,
                          "sets",
                          Number(e.target.value)
                        )
                      }
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`reps-${index}`}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Number of Reps
                    </label>
                    <input
                      id={`reps-${index}`}
                      type="number"
                      min="1"
                      value={exercise.reps}
                      onChange={(e) =>
                        handleExerciseChange(
                          index,
                          "reps",
                          Number(e.target.value)
                        )
                      }
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor={`notes-${index}`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Notes (Optional)
                  </label>
                  <textarea
                    id={`notes-${index}`}
                    value={exercise.notes || ""}
                    onChange={(e) =>
                      handleExerciseChange(index, "notes", e.target.value)
                    }
                    placeholder="e.g., Negative sets, rest time between sets, form cues, etc."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            </div>
          ))}

          {type === "Giant Set" && (
            <Button
              type="button"
              variant="outline"
              onClick={addExercise}
              className="w-full"
            >
              + Add Exercise
            </Button>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
