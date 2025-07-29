import { useState, useEffect, useRef } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

export type WorkoutType = "Single" | "Super Set" | "Giant Set";

interface WorkoutSection {
  name: string;
  videoUrl?: string;
  videoFile?: File;
  sets: string;
  reps: string;
  notes?: string;
}

export interface WorkoutGroup {
  type: WorkoutType;
  exercises: WorkoutSection[];
  dayLabel?: string; // Add day label field for workout templates
}

interface CreateWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    planName: string;
    builderMode: 'week' | 'day';
    workoutDaysPerWeek?: number;
    week: { [day: string]: DayPlan };
  }) => void;
  initialValues?: {
    planName: string;
    builderMode?: 'week' | 'day';
    workoutDaysPerWeek?: number;
    week: { [day: string]: DayPlan };
  };
  title?: string;
  submitLabel?: string;
  isLoading?: boolean;
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
  dayLabel?: string; // Add day label field
};

export default function CreateWorkoutModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  title = "Create New Workout",
  submitLabel = "Create Workout",
  isLoading = false,
}: CreateWorkoutModalProps) {
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  const [planName, setPlanName] = useState("");
  const [builderMode, setBuilderMode] = useState<'week' | 'day'>('week');
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState(4);
  const [weekPlans, setWeekPlans] = useState<{ [day: string]: DayPlan }>(() =>
    daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: { mode: "rest" } }), {})
  );
  const [workoutTemplates, setWorkoutTemplates] = useState<DayPlan[]>([]);
  // Track saved state per day
  const [savedDays, setSavedDays] = useState<{ [day: string]: boolean }>(() =>
    daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: false }), {})
  );
  // Ref to track last edited day
  const lastDayIndex = useRef(currentDayIndex);

  // Populate form with initial values when editing
  useEffect(() => {
    if (isOpen) {
      if (initialValues) {
        setPlanName(initialValues.planName || "");
        setBuilderMode(initialValues.builderMode || 'week');
        setWorkoutDaysPerWeek(initialValues.workoutDaysPerWeek || 4);
        
        if (initialValues.week) {
          setWeekPlans(initialValues.week);
          setSavedDays(
            daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: true }), {})
          );
        }
        
        // Initialize workout templates for Flexible Schedule
        if (initialValues.builderMode === 'day' && initialValues.workoutDaysPerWeek) {
          const templates: DayPlan[] = [];
          for (let i = 0; i < initialValues.workoutDaysPerWeek; i++) {
            templates.push({
              mode: "workout",
              type: "Single",
              groups: [{ type: "Single", exercises: [{ name: "", sets: "", reps: "" }] }],
              dayLabel: `Workout ${i + 1}`
            });
          }
          setWorkoutTemplates(templates);
        }
      } else {
        setPlanName("");
        setBuilderMode('week');
        setWorkoutDaysPerWeek(4);
        setWeekPlans(
          daysOfWeek.reduce(
            (acc, day) => ({ ...acc, [day]: { mode: "rest" } }),
            {}
          )
        );
        setSavedDays(
          daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: false }), {})
        );
        setWorkoutTemplates([]);
      }
      setCurrentDayIndex(0);
      setCurrentWorkoutIndex(0);
      lastDayIndex.current = 0;
    }
  }, [initialValues, isOpen]);

  // Auto-save when navigating away from a day
  useEffect(() => {
    if (lastDayIndex.current !== currentDayIndex) {
      const prevDay = daysOfWeek[lastDayIndex.current];
      setSavedDays((prev) => ({ ...prev, [prevDay]: true }));
      lastDayIndex.current = currentDayIndex;
    }
  }, [currentDayIndex]);

  // Dynamic workout templates based on workout days per week for Flexible Schedule
  useEffect(() => {
    if (builderMode === 'day') {
      setWorkoutTemplates((prev) => {
        const newTemplates: DayPlan[] = [];
        for (let i = 0; i < workoutDaysPerWeek; i++) {
          if (prev[i]) {
            // Preserve existing template data
            newTemplates.push(prev[i]);
          } else {
            // Create new template
            newTemplates.push({
              mode: "workout",
              type: "Single",
              groups: [{ type: "Single", exercises: [{ name: "", sets: "", reps: "" }] }],
              dayLabel: `Workout ${i + 1}`
            });
          }
        }
        return newTemplates;
      });
    }
  }, [builderMode, workoutDaysPerWeek]);

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
                  exercises: [{ name: "", sets: "", reps: "" }],
                },
              ],
            }
          : { mode },
    }));
  };

  const handleGroupTypeChange = (groupIdx: number, newType: WorkoutType) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
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
                      ? [{ name: "", sets: "", reps: "" }]
                      : newType === "Super Set"
                      ? [
                          { name: "", sets: "", reps: "" },
                          { name: "", sets: "", reps: "" },
                        ]
                      : [
                          { name: "", sets: "", reps: "" },
                          { name: "", sets: "", reps: "" },
                          { name: "", sets: "", reps: "" },
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
        { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
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
        { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
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
                    { name: "", sets: "", reps: "" },
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
        { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
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
        { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
      ];
      return {
        ...prev,
        [currentDay]: {
          ...prev[currentDay],
          groups: [
            ...groups,
            { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
          ],
        },
      };
    });
  };

  const removeGroup = (groupIdx: number) => {
    setWeekPlans((prev) => {
      const groups = prev[currentDay]?.groups || [
        { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
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

  // Functions for workout templates with groups (like Week Builder)
  const handleGroupTypeChangeForTemplate = (templateIdx: number, groupIdx: number, newType: WorkoutType) => {
    setWorkoutTemplates((prev) => {
      const newTemplates = [...prev];
      const template = newTemplates[templateIdx];
      if (template && template.groups) {
        const groups = [...template.groups]; // Create a new array
        const newGroups = groups.map((group, idx) =>
          idx === groupIdx
            ? {
                ...group,
                type: newType,
                exercises:
                  newType === "Single"
                    ? [{ name: "", sets: "", reps: "" }]
                    : newType === "Super Set"
                    ? [
                        { name: "", sets: "", reps: "" },
                        { name: "", sets: "", reps: "" },
                      ]
                    : [
                        { name: "", sets: "", reps: "" },
                        { name: "", sets: "", reps: "" },
                        { name: "", sets: "", reps: "" },
                      ],
              }
            : group
        );
        newTemplates[templateIdx] = {
          ...template,
          groups: newGroups
        };
      }
      return newTemplates;
    });
  };

  const handleExerciseChangeForTemplate = (
    templateIdx: number,
    groupIdx: number,
    exIdx: number,
    field: keyof WorkoutSection,
    value: string | number | File | undefined
  ) => {
    setWorkoutTemplates((prev) => {
      const newTemplates = [...prev];
      const template = newTemplates[templateIdx];
      if (template && template.groups && template.groups[groupIdx]) {
        const groups = [...template.groups]; // Create a new array
        const group = groups[groupIdx];
        const newExercises = group.exercises.map((ex, i) =>
          i === exIdx ? { ...ex, [field]: value } : ex
        );
        const newGroups = groups.map((g, idx) =>
          idx === groupIdx ? { ...g, exercises: newExercises } : g
        );
        newTemplates[templateIdx] = {
          ...template,
          groups: newGroups
        };
      }
      return newTemplates;
    });
  };

  const addExerciseToGroupInTemplate = (templateIdx: number, groupIdx: number) => {
    setWorkoutTemplates((prev) => {
      const newTemplates = [...prev];
      const template = newTemplates[templateIdx];
      if (template && template.groups && template.groups[groupIdx]) {
        const groups = [...template.groups]; // Create a new array
        const group = groups[groupIdx];
        const newExercises = [
          ...group.exercises,
          { name: "", sets: "", reps: "" },
        ];
        const newGroups = groups.map((g, idx) =>
          idx === groupIdx ? { ...g, exercises: newExercises } : g
        );
        newTemplates[templateIdx] = {
          ...template,
          groups: newGroups
        };
      }
      return newTemplates;
    });
  };

  const removeExerciseFromGroupInTemplate = (templateIdx: number, groupIdx: number, exIdx: number) => {
    setWorkoutTemplates((prev) => {
      const newTemplates = [...prev];
      const template = newTemplates[templateIdx];
      if (template && template.groups && template.groups[groupIdx]) {
        const groups = [...template.groups]; // Create a new array
        const group = groups[groupIdx];
        const newExercises = group.exercises.filter((_, i) => i !== exIdx);
        const newGroups = groups.map((g, idx) =>
          idx === groupIdx ? { ...g, exercises: newExercises } : g
        );
        newTemplates[templateIdx] = {
          ...template,
          groups: newGroups
        };
      }
      return newTemplates;
    });
  };

  const addGroupToTemplate = (templateIdx: number) => {
    setWorkoutTemplates((prev) => {
      const newTemplates = [...prev];
      const template = newTemplates[templateIdx];
      if (template) {
        const groups = template.groups || [
          { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
        ];
        newTemplates[templateIdx] = {
          ...template,
          groups: [
            ...groups,
            { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
          ],
        };
      }
      return newTemplates;
    });
  };

  const removeGroupFromTemplate = (templateIdx: number, groupIdx: number) => {
    setWorkoutTemplates((prev) => {
      const newTemplates = [...prev];
      const template = newTemplates[templateIdx];
      if (template && template.groups) {
        const groups = [...template.groups]; // Create a new array
        newTemplates[templateIdx] = {
          ...template,
          groups: groups.filter((_, idx) => idx !== groupIdx),
        };
      }
      return newTemplates;
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

  const handleWorkoutNav = (dir: -1 | 1) => {
    setCurrentWorkoutIndex((prev) => {
      let next = prev + dir;
      if (next < 0) next = workoutTemplates.length - 1;
      if (next >= workoutTemplates.length) next = 0;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (builderMode === 'week') {
      // Submit the week object as-is for Fixed Schedule
      onSubmit({ planName, builderMode, week: weekPlans });
    } else {
      // For Flexible Schedule, flatten the workout templates into a week structure
      const weekData: { [day: string]: DayPlan } = {};
      
      // Create workout days based on workout templates
      workoutTemplates.forEach((template, index) => {
        const dayName = daysOfWeek[index];
        weekData[dayName] = {
          mode: "workout",
          type: template.type,
          groups: template.groups,
          dayLabel: template.dayLabel
        };
      });
      
      // Fill remaining days as rest days
      daysOfWeek.forEach((day, index) => {
        if (index >= workoutTemplates.length) {
          weekData[day] = { mode: "rest" };
        }
      });
      
      onSubmit({ 
        planName, 
        builderMode, 
        workoutDaysPerWeek, 
        week: weekData 
      });
    }
    
    if (!initialValues) {
      setPlanName("");
      setBuilderMode('week');
      setWorkoutDaysPerWeek(7);
      setWeekPlans(
        daysOfWeek.reduce(
          (acc, day) => ({ ...acc, [day]: { mode: "rest" } }),
          {}
        )
      );
      setWorkoutTemplates([]);
      setCurrentDayIndex(0);
      setCurrentWorkoutIndex(0);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onClose} title={title} size="lg">
      <div className="relative">
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

          {/* Builder Mode Selection */}
          <div>
            <label htmlFor="builder-mode-week" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Builder Mode
            </label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  id="builder-mode-week"
                  type="radio"
                  name="builderMode"
                  checked={builderMode === "week"}
                  onChange={() => setBuilderMode("week")}
                  className="accent-primary h-4 w-4"
                />
                <span className="text-sm">Fixed Schedule</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  id="builder-mode-day"
                  type="radio"
                  name="builderMode"
                  checked={builderMode === "day"}
                  onChange={() => setBuilderMode("day")}
                  className="accent-primary h-4 w-4"
                />
                <span className="text-sm">Flexible Schedule</span>
              </label>
            </div>
          </div>

          {/* Workout Days Per Week (Flexible Schedule only) */}
          {builderMode === "day" && (
            <div>
              <label
                htmlFor="workoutDaysPerWeek"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Workout Days Per Week
              </label>
              <select
                id="workoutDaysPerWeek"
                value={workoutDaysPerWeek}
                onChange={(e) => setWorkoutDaysPerWeek(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Fixed Schedule UI */}
          {builderMode === "week" && (
            <>
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

              {/* Day Label */}
              <div>
                <label
                  htmlFor={`dayLabel-${currentDay}`}
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Day Label (optional)
                </label>
                <input
                  id={`dayLabel-${currentDay}`}
                  type="text"
                  value={currentPlan.dayLabel || ""}
                  onChange={(e) =>
                    setWeekPlans((prev) => ({
                      ...prev,
                      [currentDay]: { ...prev[currentDay], dayLabel: e.target.value }
                    }))
                  }
                  placeholder="e.g., Push Day, Pull Day, Legs Day"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                />
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
                          exercises: [{ name: "", sets: "", reps: "" }],
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
                                      type="text"
                                      value={exercise.sets}
                                      onChange={(e) =>
                                        handleExerciseChange(
                                          groupIdx,
                                          exIdx,
                                          "sets",
                                          e.target.value
                                        )
                                      }
                                      placeholder="e.g., 3, AMRAP, 5-8"
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
                                      type="text"
                                      value={exercise.reps}
                                      onChange={(e) =>
                                        handleExerciseChange(
                                          groupIdx,
                                          exIdx,
                                          "reps",
                                          e.target.value
                                        )
                                      }
                                      placeholder="e.g., 10, AMRAP, 8-12"
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
            </>
          )}

          {/* Flexible Schedule UI */}
          {builderMode === "day" && workoutTemplates.length > 0 && (
            <>
              {/* Workout Navigation */}
              <div className="flex items-center justify-between mb-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleWorkoutNav(-1)}
                >
                  &lt;
                </Button>
                <span className="font-semibold text-lg">
                  Workout {currentWorkoutIndex + 1} of {workoutTemplates.length}
                </span>
                <Button type="button" variant="ghost" onClick={() => handleWorkoutNav(1)}>
                  &gt;
                </Button>
              </div>

              {/* Workout Label */}
              <div>
                <label
                  htmlFor={`workoutLabel-${currentWorkoutIndex}`}
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Workout Label (optional)
                </label>
                <input
                  id={`workoutLabel-${currentWorkoutIndex}`}
                  type="text"
                  value={workoutTemplates[currentWorkoutIndex]?.dayLabel || ""}
                  onChange={(e) =>
                    setWorkoutTemplates((prev) => {
                      const newTemplates = [...prev];
                      newTemplates[currentWorkoutIndex] = {
                        ...newTemplates[currentWorkoutIndex],
                        dayLabel: e.target.value
                      };
                      return newTemplates;
                    })
                  }
                  placeholder="e.g., Push Day, Pull Day, Legs Day"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Workout Groups */}
              <div className="space-y-8">
                {(workoutTemplates[currentWorkoutIndex]?.groups || [
                  { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
                ]).map((group, groupIdx) => (
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
                            handleGroupTypeChangeForTemplate(
                              currentWorkoutIndex,
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
                      {(workoutTemplates[currentWorkoutIndex].groups?.length || 1) > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-500 ml-auto"
                          onClick={() => removeGroupFromTemplate(currentWorkoutIndex, groupIdx)}
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
                                    removeExerciseFromGroupInTemplate(currentWorkoutIndex, groupIdx, exIdx)
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
                                htmlFor={`exerciseName-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                              >
                                Exercise Name
                              </label>
                              <input
                                id={`exerciseName-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                type="text"
                                value={exercise.name}
                                onChange={(e) =>
                                  handleExerciseChangeForTemplate(
                                    currentWorkoutIndex,
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
                                  htmlFor={`sets-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                  Sets
                                </label>
                                <input
                                  id={`sets-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                  type="text"
                                  value={exercise.sets}
                                  onChange={(e) =>
                                    handleExerciseChangeForTemplate(
                                      currentWorkoutIndex,
                                      groupIdx,
                                      exIdx,
                                      "sets",
                                      e.target.value
                                    )
                                  }
                                  placeholder="e.g., 3, AMRAP, 5-8"
                                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                                  required
                                />
                              </div>
                              <div className="flex-1">
                                <label
                                  htmlFor={`reps-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                  Reps
                                </label>
                                <input
                                  id={`reps-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                  type="text"
                                  value={exercise.reps}
                                  onChange={(e) =>
                                    handleExerciseChangeForTemplate(
                                      currentWorkoutIndex,
                                      groupIdx,
                                      exIdx,
                                      "reps",
                                      e.target.value
                                    )
                                  }
                                  placeholder="e.g., 10, AMRAP, 8-12"
                                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                                  required
                                />
                              </div>
                            </div>
                            {/* Notes */}
                            <div>
                              <label
                                htmlFor={`notes-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                              >
                                Notes (optional)
                              </label>
                              <input
                                id={`notes-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                type="text"
                                value={exercise.notes || ""}
                                onChange={(e) =>
                                  handleExerciseChangeForTemplate(
                                    currentWorkoutIndex,
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
                                htmlFor={`videoFile-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                              >
                                Upload Video (optional)
                              </label>
                              <input
                                id={`videoFile-${currentWorkoutIndex}-${groupIdx}-${exIdx}`}
                                type="file"
                                accept="video/*"
                                onChange={(e) => {
                                  const file =
                                    e.target.files && e.target.files[0]
                                      ? e.target.files[0]
                                      : undefined;
                                  handleExerciseChangeForTemplate(
                                    currentWorkoutIndex,
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
                          onClick={() => addExerciseToGroupInTemplate(currentWorkoutIndex, groupIdx)}
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
                  onClick={() => addGroupToTemplate(currentWorkoutIndex)}
                  className="text-primary text-sm font-medium hover:underline px-2 py-1 bg-transparent border-none focus:outline-none"
                  style={{ background: "none" }}
                >
                  Add Workout
                </button>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Saving..." : submitLabel}
            </Button>
          </div>
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 dark:bg-night/80 flex items-center justify-center rounded-b-xl">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-secondary dark:text-alabaster">Saving workout plan...</p>
              </div>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
}
