import { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

type WorkoutType = "Single" | "Super Set" | "Giant Set";

interface WorkoutSection {
  name: string;
  videoUrl?: string;
  videoFile?: File;
  sets: number;
  reps: number;
  notes?: string;
}

interface WorkoutGroup {
  type: WorkoutType;
  exercises: WorkoutSection[];
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
  const [groups, setGroups] = useState<WorkoutGroup[]>([
    { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
  ]);

  // Populate form with initial values when editing
  useEffect(() => {
    if (initialValues) {
      setPlanName(initialValues.planName);
      // For backward compatibility, treat all as one group if not grouped
      setGroups([
        {
          type: initialValues.type,
          exercises:
            initialValues.exercises.length > 0
              ? initialValues.exercises
              : [{ name: "", sets: 3, reps: 10 }],
        },
      ]);
    } else if (isOpen) {
      setPlanName("");
      setGroups([
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ]);
    }
  }, [initialValues, isOpen]);

  const handleGroupTypeChange = (groupIdx: number, newType: WorkoutType) => {
    setGroups((prev) =>
      prev.map((group, idx) =>
        idx === groupIdx
          ? {
              ...group,
              type: newType,
              exercises:
                newType === "Single"
                  ? [{ name: "", sets: 3, reps: 10 }]
                  : newType === "Super Set"
                  ? [
                      { name: "", sets: 3, reps: 10 },
                      { name: "", sets: 3, reps: 10 },
                    ]
                  : [
                      { name: "", sets: 3, reps: 10 },
                      { name: "", sets: 3, reps: 10 },
                      { name: "", sets: 3, reps: 10 },
                    ],
            }
          : group
      )
    );
  };

  const handleExerciseChange = (
    groupIdx: number,
    exIdx: number,
    field: keyof WorkoutSection,
    value: string | number | File | undefined
  ) => {
    setGroups((prev) =>
      prev.map((group, idx) =>
        idx === groupIdx
          ? {
              ...group,
              exercises: group.exercises.map((ex, i) =>
                i === exIdx ? { ...ex, [field]: value } : ex
              ),
            }
          : group
      )
    );
  };

  const addExerciseToGroup = (groupIdx: number) => {
    setGroups((prev) =>
      prev.map((group, idx) =>
        idx === groupIdx
          ? {
              ...group,
              exercises: [...group.exercises, { name: "", sets: 3, reps: 10 }],
            }
          : group
      )
    );
  };

  const removeExerciseFromGroup = (groupIdx: number, exIdx: number) => {
    setGroups((prev) =>
      prev.map((group, idx) =>
        idx === groupIdx
          ? {
              ...group,
              exercises: group.exercises.filter((_, i) => i !== exIdx),
            }
          : group
      )
    );
  };

  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
    ]);
  };

  const removeGroup = (groupIdx: number) => {
    setGroups((prev) => prev.filter((_, idx) => idx !== groupIdx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Flatten all exercises for backward compatibility, but keep type of first group
    onSubmit({
      planName,
      type: groups[0].type,
      exercises: groups.flatMap((g) => g.exercises),
    });
    if (!initialValues) {
      setPlanName("");
      setGroups([
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ]);
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

        {/* Workout Groups */}
        <div className="space-y-8">
          {groups.map((group, groupIdx) => (
            <div
              key={groupIdx}
              className="border border-primary/40 rounded-lg p-4 bg-primary/5 dark:bg-primary/10"
            >
              <div className="flex items-center gap-4 mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Type:
                  <select
                    value={group.type}
                    onChange={(e) =>
                      handleGroupTypeChange(
                        groupIdx,
                        e.target.value as WorkoutType
                      )
                    }
                    className="ml-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Single">Single</option>
                    <option value="Super Set">Super Set</option>
                    <option value="Giant Set">Giant Set</option>
                  </select>
                </label>
                {groups.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-500 ml-auto"
                    onClick={() => removeGroup(groupIdx)}
                  >
                    Remove Group
                  </Button>
                )}
              </div>
              <div className="space-y-6">
                {group.exercises.map((exercise, exIdx) => (
                  <div
                    key={exIdx}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        Exercise {exIdx + 1}
                      </h3>
                      {group.type === "Giant Set" &&
                        group.exercises.length > 3 &&
                        exIdx >= 3 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              removeExerciseFromGroup(groupIdx, exIdx)
                            }
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
                          htmlFor={`exerciseName-${groupIdx}-${exIdx}`}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                          Exercise Name
                        </label>
                        <input
                          id={`exerciseName-${groupIdx}-${exIdx}`}
                          type="text"
                          value={exercise.name}
                          onChange={(e) =>
                            handleExerciseChange(
                              groupIdx,
                              exIdx,
                              "name",
                              e.target.value
                            )
                          }
                          placeholder="e.g., Bench Press, Lateral Raises"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      {/* Sets and Reps */}
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label
                            htmlFor={`sets-${groupIdx}-${exIdx}`}
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                          >
                            Sets
                          </label>
                          <input
                            id={`sets-${groupIdx}-${exIdx}`}
                            type="number"
                            min={1}
                            value={exercise.sets}
                            onChange={(e) =>
                              handleExerciseChange(
                                groupIdx,
                                exIdx,
                                "sets",
                                Number(e.target.value)
                              )
                            }
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                          />
                        </div>
                        <div className="flex-1">
                          <label
                            htmlFor={`reps-${groupIdx}-${exIdx}`}
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                          >
                            Reps
                          </label>
                          <input
                            id={`reps-${groupIdx}-${exIdx}`}
                            type="number"
                            min={1}
                            value={exercise.reps}
                            onChange={(e) =>
                              handleExerciseChange(
                                groupIdx,
                                exIdx,
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
                          htmlFor={`notes-${groupIdx}-${exIdx}`}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                          Notes (optional)
                        </label>
                        <input
                          id={`notes-${groupIdx}-${exIdx}`}
                          type="text"
                          value={exercise.notes || ""}
                          onChange={(e) =>
                            handleExerciseChange(
                              groupIdx,
                              exIdx,
                              "notes",
                              e.target.value
                            )
                          }
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      {/* Upload Video */}
                      <div>
                        <label
                          htmlFor={`videoFile-${groupIdx}-${exIdx}`}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                          Upload Video (optional)
                        </label>
                        <input
                          id={`videoFile-${groupIdx}-${exIdx}`}
                          type="file"
                          accept="video/*"
                          onChange={(e) => {
                            const file =
                              e.target.files && e.target.files[0]
                                ? e.target.files[0]
                                : undefined;
                            handleExerciseChange(
                              groupIdx,
                              exIdx,
                              "videoFile",
                              file
                            );
                          }}
                          className="w-full text-gray-900 dark:text-gray-100"
                        />
                        {exercise.videoFile && (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Selected: {exercise.videoFile.name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {/* Add Exercise Button for Giant Set only */}
                {group.type === "Giant Set" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addExerciseToGroup(groupIdx)}
                  >
                    Add Exercise to Giant Set
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Add Workout Group Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={addGroup}
            className="text-primary text-sm font-medium hover:underline px-2 py-1 bg-transparent border-none focus:outline-none"
            style={{ background: "none" }}
          >
            Add Workout
          </button>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
