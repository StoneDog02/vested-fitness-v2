import { useState, useEffect, useRef } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

export type WorkoutType = "Single" | "Super Set" | "Giant Set";

interface WorkoutSection {
  name: string;
  videoUrl?: string;
  videoFile?: File;
  sets: number;
  reps: number;
  notes?: string;
}

export interface WorkoutGroup {
  type: WorkoutType;
  exercises: WorkoutSection[];
}

interface CreateWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    planName: string;
    week: { [day: string]: DayPlan };
  }) => void;
  initialValues?: {
    planName: string;
    week: { [day: string]: DayPlan };
  };
  title?: string;
  submitLabel?: string;
}

const daysOfWeek = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type DayPlan = {
  mode: "workout" | "rest";
  type?: WorkoutType;
  groups?: WorkoutGroup[];
};

export default function CreateWorkoutModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  title = "Create New Workout",
  submitLabel = "Create Workout",
}: CreateWorkoutModalProps) {
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [planName, setPlanName] = useState("");
  const [weekPlans, setWeekPlans] = useState<{ [day: string]: DayPlan }>(() =>
    daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: { mode: "rest" } }), {})
  );
  // Track saved state per day
  const [savedDays, setSavedDays] = useState<{ [day: string]: boolean }>(() =>
    daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: false }), {})
  );
  // Ref to track last edited day
  const lastDayIndex = useRef(currentDayIndex);

  // Populate form with initial values when editing
  useEffect(() => {
    if (initialValues && initialValues.week) {
      setPlanName(initialValues.planName || "");
      setWeekPlans(initialValues.week);
      setSavedDays(
        daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: true }), {})
      );
    } else if (isOpen) {
      setPlanName("");
      setWeekPlans(
        daysOfWeek.reduce(
          (acc, day) => ({ ...acc, [day]: { mode: "rest" } }),
          {}
        )
      );
      setSavedDays(
        daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: false }), {})
      );
    }
    setCurrentDayIndex(0);
    lastDayIndex.current = 0;
  }, [initialValues, isOpen]);

  // Auto-save when navigating away from a day
  useEffect(() => {
    if (lastDayIndex.current !== currentDayIndex) {
      const prevDay = daysOfWeek[lastDayIndex.current];
      setSavedDays((prev) => ({ ...prev, [prevDay]: true }));
      lastDayIndex.current = currentDayIndex;
    }
  }, [currentDayIndex]);

  const currentDay = daysOfWeek[currentDayIndex];
  const currentPlan = weekPlans[currentDay] || { mode: "rest" };

  const handleModeChange = (mode: "workout" | "rest") => {
    setWeekPlans((prev) => ({
      ...prev,
      [currentDay]:
        mode === "workout"
          ? {
              mode,
              type: prev[currentDay]?.type || "Single",
              groups: prev[currentDay]?.groups || [
                {
                  type: "Single",
                  exercises: [{ name: "", sets: 3, reps: 10 }],
                },
              ],
            }
          : { mode },
    }));
  };

  const handleGroupTypeChange = (groupIdx: number, newType: WorkoutType) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: groups.map((group, idx) =>
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
          ),
          type: newType,
        },
      };
    });
  };

  const handleExerciseChange = (
    groupIdx: number,
    exIdx: number,
    field: keyof WorkoutSection,
    value: string | number | File | undefined
  ) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: groups.map((group, idx) =>
            idx === groupIdx
              ? {
                  ...group,
                  exercises: group.exercises.map((ex, i) =>
                    i === exIdx ? { ...ex, [field]: value } : ex
                  ),
                }
              : group
          ),
        },
      };
    });
  };

  const addExerciseToGroup = (groupIdx: number) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: groups.map((group, idx) =>
            idx === groupIdx
              ? {
                  ...group,
                  exercises: [
                    ...group.exercises,
                    { name: "", sets: 3, reps: 10 },
                  ],
                }
              : group
          ),
        },
      };
    });
  };

  const removeExerciseFromGroup = (groupIdx: number, exIdx: number) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: groups.map((group, idx) =>
            idx === groupIdx
              ? {
                  ...group,
                  exercises: group.exercises.filter((_, i) => i !== exIdx),
                }
              : group
          ),
        },
      };
    });
  };

  const addGroup = () => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: [
            ...groups,
            { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
          ],
        },
      };
    });
  };

  const removeGroup = (groupIdx: number) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: 3, reps: 10 }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: groups.filter((_, idx) => idx !== groupIdx),
        },
      };
    });
  };

  const handleDayNav = (dir: -1 | 1) => {
    setCurrentDayIndex((prev) => {
      let next = prev + dir;
      if (next < 0) next = daysOfWeek.length - 1;
      if (next >= daysOfWeek.length) next = 0;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Submit the week object as-is
    onSubmit({ planName, week: weekPlans });
    if (!initialValues) {
      setPlanName("");
      setWeekPlans(
        daysOfWeek.reduce(
          (acc, day) => ({ ...acc, [day]: { mode: "rest" } }),
          {}
        )
      );
      setCurrentDayIndex(0);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workout Plan Name (overhead) */}
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
        {/* Day Navigation and Mode Selection */}
        <div className="flex items-center justify-between mb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleDayNav(-1)}
          >
            &lt;
          </Button>
          <span className="font-semibold text-lg flex items-center gap-2">
            {currentDay}
            {savedDays[currentDay] && (
              <span className="text-green-600 text-xs ml-2">Saved</span>
            )}
          </span>
          <Button type="button" variant="ghost" onClick={() => handleDayNav(1)}>
            &gt;
          </Button>
        </div>
        <div className="flex gap-6 mb-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={currentPlan.mode === "workout"}
              onChange={() => handleModeChange("workout")}
              className="accent-primary h-4 w-4"
            />
            <span className="text-sm">Workout</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={currentPlan.mode === "rest"}
              onChange={() => handleModeChange("rest")}
              className="accent-primary h-4 w-4"
            />
            <span className="text-sm">Rest</span>
          </label>
        </div>
        {/* Only show workout builder if mode is 'workout' */}
        {currentPlan.mode === "workout" && (
          <>
            {/* Workout Groups */}
            <div className="space-y-8">
              {(
                currentPlan.groups || [
                  {
                    type: "Single",
                    exercises: [{ name: "", sets: 3, reps: 10 }],
                  },
                ]
              ).map((group, groupIdx) => (
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
                        className="ml-2 rounded-full border border-primary text-primary bg-primary/10 px-6 py-1 font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition min-w-[8rem]"
                      >
                        <option value="Single">Single</option>
                        <option value="Super Set">Super Set</option>
                        <option value="Giant Set">Giant Set</option>
                      </select>
                    </label>
                    {(currentPlan.groups?.length || 1) > 1 && (
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
          </>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
