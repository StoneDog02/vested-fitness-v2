import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  memo,
  useCallback,
} from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import type { CoachDraftEnvelope, WorkoutDraftPayload } from "~/utils/coachDraftStorage";
import {
  clearWorkoutDraft,
  flushWorkoutDraft,
  loadWorkoutDraftEnvelope,
  saveWorkoutDraftDebounced,
  saveWorkoutDraftSync,
} from "~/utils/coachDraftStorage";

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
    instructions: string;
    builderMode: 'week' | 'day';
    workoutDaysPerWeek?: number;
    week: { [day: string]: DayPlan };
  }) => void;
  initialValues?: {
    planName: string;
    instructions?: string;
    builderMode?: 'week' | 'day';
    workoutDaysPerWeek?: number;
    week: { [day: string]: DayPlan };
  };
  title?: string;
  submitLabel?: string;
  isLoading?: boolean;
  draftClientId?: string | null;
  draftPlanId?: string | null;
}

function stripVideoFilesFromWeekPlans(week: {
  [day: string]: DayPlan;
}): { [day: string]: DayPlan } {
  const out: { [day: string]: DayPlan } = {};
  for (const day of Object.keys(week)) {
    const p = week[day];
    if (!p || p.mode === "rest") {
      out[day] = { mode: "rest" };
      continue;
    }
    out[day] = {
      ...p,
      groups: p.groups?.map((g) => ({
        ...g,
        exercises: g.exercises.map(({ videoFile: _f, ...ex }) => ({ ...ex })),
      })),
    };
  }
  return out;
}

function stripVideoFilesFromTemplates(templates: DayPlan[]): DayPlan[] {
  return templates.map((p) => {
    if (!p || p.mode === "rest") return { mode: "rest" as const };
    return {
      ...p,
      groups: p.groups?.map((g) => ({
        ...g,
        exercises: g.exercises.map(({ videoFile: _f, ...ex }) => ({ ...ex })),
      })),
    };
  });
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


// Memoized exercise content to prevent re-renders
const ExerciseContent = memo(({ 
  exercise, 
  groupIdx, 
  exIdx, 
  groupType, 
  onExerciseChange, 
  onRemoveExercise 
}: {
  exercise: any;
  groupIdx: number;
  exIdx: number;
  groupType: string;
  onExerciseChange: (groupIdx: number, exIdx: number, field: keyof WorkoutSection, value: string | number | File | undefined) => void;
  onRemoveExercise?: (groupIdx: number, exIdx: number) => void;
}) => {
  console.log('🏗️ ExerciseContent render:', {
    groupIdx,
    exIdx,
    exercise,
    timestamp: new Date().toISOString()
  });

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 ml-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Exercise {exIdx + 1}
        </h3>
        {groupType === "Giant Set" &&
          onRemoveExercise &&
          exIdx >= 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRemoveExercise(groupIdx, exIdx)}
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
            ref={(el) => {
              if (el) {
                console.log('🏗️ Input field rendered:', {
                  id: el.id,
                  groupIdx,
                  exIdx,
                  timestamp: new Date().toISOString()
                });
              }
            }}
            onChange={(e) => {
              console.log('📝 Exercise Name onChange:', {
                groupIdx,
                exIdx,
                value: e.target.value,
                timestamp: new Date().toISOString()
              });
              onExerciseChange(groupIdx, exIdx, "name", e.target.value);
            }}
            onFocus={(e) => {
              console.log('🎯 Exercise Name onFocus:', {
                groupIdx,
                exIdx,
                target: e.target,
                timestamp: new Date().toISOString()
              });
            }}
            onBlur={(e) => {
              console.log('❌ Exercise Name onBlur:', {
                groupIdx,
                exIdx,
                target: e.target,
                timestamp: new Date().toISOString()
              });
            }}
            onClick={(e) => {
              console.log('🖱️ Input clicked:', {
                groupIdx,
                exIdx,
                timestamp: new Date().toISOString()
              });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
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
              onChange={(e) => {
                console.log('📝 Sets onChange:', {
                  groupIdx,
                  exIdx,
                  value: e.target.value,
                  timestamp: new Date().toISOString()
                });
                onExerciseChange(groupIdx, exIdx, "sets", e.target.value);
              }}
              onFocus={(e) => {
                console.log('🎯 Sets onFocus:', {
                  groupIdx,
                  exIdx,
                  target: e.target,
                  timestamp: new Date().toISOString()
                });
              }}
              onBlur={(e) => {
                console.log('❌ Sets onBlur:', {
                  groupIdx,
                  exIdx,
                  target: e.target,
                  timestamp: new Date().toISOString()
                });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
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
                onExerciseChange(groupIdx, exIdx, "reps", e.target.value)
              }
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
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
              onExerciseChange(groupIdx, exIdx, "notes", e.target.value)
            }
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
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
              onExerciseChange(groupIdx, exIdx, "videoFile", file);
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
  );
});

ExerciseContent.displayName = 'ExerciseContent';

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
  draftClientId = null,
  draftPlanId = null,
}: CreateWorkoutModalProps) {
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  const [planName, setPlanName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [builderMode, setBuilderMode] = useState<'week' | 'day'>('week');
  
  console.log('🔄 CreateWorkoutModal render:', {
    timestamp: new Date().toISOString(),
    isOpen,
    builderMode,
    currentDayIndex
  });
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

  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;
  const prevIsOpenRef = useRef(false);
  const [draftReady, setDraftReady] = useState(!draftClientId);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingDraftEnvelope, setPendingDraftEnvelope] =
    useState<CoachDraftEnvelope<WorkoutDraftPayload> | null>(null);
  const draftReadyRef = useRef(!draftClientId);
  const showDraftPromptRef = useRef(false);
  const workoutDraftBaselineRef = useRef("");
  const workoutNeedsBaselineCommitRef = useRef(false);

  useEffect(() => {
    draftReadyRef.current = draftReady;
  }, [draftReady]);

  useEffect(() => {
    showDraftPromptRef.current = showDraftPrompt;
  }, [showDraftPrompt]);

  const applyInitialValuesFromProps = useCallback(() => {
    const iv = initialValuesRef.current;
    if (iv) {
      setPlanName(iv.planName || "");
      setInstructions(iv.instructions || "");
      setBuilderMode(iv.builderMode || "week");
      setWorkoutDaysPerWeek(iv.workoutDaysPerWeek || 4);

      if (iv.week) {
        setWeekPlans(iv.week);
        setSavedDays(
          daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: true }), {})
        );
      }

      if (iv.builderMode === "day" && iv.workoutDaysPerWeek) {
        const existingTemplates: DayPlan[] = [];
        const dow = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];

        for (let i = 0; i < iv.workoutDaysPerWeek; i++) {
          const dayKey = dow[i];
          const dayPlan = iv.week[dayKey];

          if (dayPlan && dayPlan.mode === "workout") {
            existingTemplates.push(dayPlan);
          } else {
            existingTemplates.push({
              mode: "workout",
              type: "Single",
              groups: [
                { type: "Single", exercises: [{ name: "", sets: "", reps: "" }] },
              ],
              dayLabel: `Workout ${i + 1}`,
            });
          }
        }

        setWorkoutTemplates(existingTemplates);
      } else {
        setWorkoutTemplates([]);
      }
    } else {
      setPlanName("");
      setInstructions("");
      setBuilderMode("week");
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
  }, []);

  const buildWorkoutDraftPayload = useCallback((): WorkoutDraftPayload => {
    return {
      planName,
      instructions,
      builderMode,
      workoutDaysPerWeek,
      weekPlans: stripVideoFilesFromWeekPlans(weekPlans),
      workoutTemplates: stripVideoFilesFromTemplates(workoutTemplates),
      savedDays,
      currentDayIndex,
      currentWorkoutIndex,
    };
  }, [
    planName,
    instructions,
    builderMode,
    workoutDaysPerWeek,
    weekPlans,
    workoutTemplates,
    savedDays,
    currentDayIndex,
    currentWorkoutIndex,
  ]);

  const commitWorkoutBaseline = useCallback(() => {
    workoutDraftBaselineRef.current = JSON.stringify(buildWorkoutDraftPayload());
  }, [buildWorkoutDraftPayload]);

  /** Latest payload for close-save; avoids putting buildWorkoutDraftPayload in the open/close effect deps (that callback changes every keystroke and would cancel the IDB load). */
  const buildWorkoutDraftPayloadRef = useRef(buildWorkoutDraftPayload);
  buildWorkoutDraftPayloadRef.current = buildWorkoutDraftPayload;

  useLayoutEffect(() => {
    if (!workoutNeedsBaselineCommitRef.current || !isOpen) return;
    commitWorkoutBaseline();
    workoutNeedsBaselineCommitRef.current = false;
  });

  // Populate form when modal opens; optional local draft prompt
  useEffect(() => {
    if (!isOpen) {
      const cid = draftClientId;
      const pid = draftPlanId;
      if (cid) {
        flushWorkoutDraft(cid, pid);
        if (draftReadyRef.current && !showDraftPromptRef.current) {
          void saveWorkoutDraftSync(cid, pid, buildWorkoutDraftPayloadRef.current());
        }
      }
      setShowDraftPrompt(false);
      setPendingDraftEnvelope(null);
      setDraftReady(!draftClientId);
      prevIsOpenRef.current = false;
      return;
    }

    if (!prevIsOpenRef.current) {
      applyInitialValuesFromProps();
      if (draftClientId) {
        setDraftReady(false);
        let cancelled = false;
        void loadWorkoutDraftEnvelope(draftClientId, draftPlanId).then((env) => {
          if (cancelled) return;
          if (env) {
            setPendingDraftEnvelope(env);
            setShowDraftPrompt(true);
          } else {
            setShowDraftPrompt(false);
            setPendingDraftEnvelope(null);
            setDraftReady(true);
            workoutNeedsBaselineCommitRef.current = true;
          }
        });
        prevIsOpenRef.current = true;
        return () => {
          cancelled = true;
        };
      }
      setDraftReady(true);
      setShowDraftPrompt(false);
      setPendingDraftEnvelope(null);
      workoutNeedsBaselineCommitRef.current = true;
      prevIsOpenRef.current = true;
    }
  }, [isOpen, draftClientId, draftPlanId, applyInitialValuesFromProps]);

  const handleRestoreWorkoutDraft = () => {
    if (!pendingDraftEnvelope) return;
    const p = pendingDraftEnvelope.payload;
    setPlanName(p.planName);
    setInstructions(p.instructions);
    setBuilderMode(p.builderMode);
    setWorkoutDaysPerWeek(p.workoutDaysPerWeek);
    setWeekPlans(p.weekPlans as { [day: string]: DayPlan });
    setWorkoutTemplates((p.workoutTemplates || []) as DayPlan[]);
    setSavedDays(
      p.savedDays && typeof p.savedDays === "object"
        ? p.savedDays
        : daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: false }), {})
    );
    setCurrentDayIndex(
      typeof p.currentDayIndex === "number" ? p.currentDayIndex : 0
    );
    setCurrentWorkoutIndex(
      typeof p.currentWorkoutIndex === "number" ? p.currentWorkoutIndex : 0
    );
    lastDayIndex.current =
      typeof p.currentDayIndex === "number" ? p.currentDayIndex : 0;
    setShowDraftPrompt(false);
    setPendingDraftEnvelope(null);
    setDraftReady(true);
    workoutNeedsBaselineCommitRef.current = true;
  };

  const handleStartFreshWorkoutDraft = () => {
    if (!draftClientId) return;
    void clearWorkoutDraft(draftClientId, draftPlanId);
    applyInitialValuesFromProps();
    setShowDraftPrompt(false);
    setPendingDraftEnvelope(null);
    setDraftReady(true);
    workoutNeedsBaselineCommitRef.current = true;
  };

  useEffect(() => {
    if (
      !isOpen ||
      !draftClientId ||
      !draftReady ||
      showDraftPrompt ||
      isLoading
    ) {
      return;
    }
    saveWorkoutDraftDebounced(
      draftClientId,
      draftPlanId,
      buildWorkoutDraftPayload()
    );
  }, [
    isOpen,
    draftClientId,
    draftPlanId,
    draftReady,
    showDraftPrompt,
    isLoading,
    buildWorkoutDraftPayload,
  ]);

  const workoutIsDirty =
    !!draftClientId &&
    draftReady &&
    JSON.stringify(buildWorkoutDraftPayload()) !==
      workoutDraftBaselineRef.current;

  useEffect(() => {
    if (!draftClientId) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) return;
      if (showDraftPrompt || workoutIsDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftClientId, isLoading, showDraftPrompt, workoutIsDirty]);

  // Auto-save when navigating away from a day
  useEffect(() => {
    if (lastDayIndex.current !== currentDayIndex) {
      const prevDay = daysOfWeek[lastDayIndex.current];
      setSavedDays((prev) => {
        // Only update if the day isn't already saved to prevent unnecessary re-renders
        if (prev[prevDay]) return prev;
        return { ...prev, [prevDay]: true };
      });
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

  const currentDay = useMemo(() => daysOfWeek[currentDayIndex], [currentDayIndex]);
  const currentPlan = useMemo(() => weekPlans[currentDay] || { mode: "rest" }, [weekPlans, currentDay]);

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

  const handleExerciseChange = useCallback((
    groupIdx: number,
    exIdx: number,
    field: keyof WorkoutSection,
    value: string | number | File | undefined
  ) => {
    console.log('🔄 handleExerciseChange called:', {
      groupIdx,
      exIdx,
      field,
      value,
      currentDay,
      timestamp: new Date().toISOString()
    });
    
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
  }, [currentDay]);

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

  const removeExerciseFromGroup = useCallback((groupIdx: number, exIdx: number) => {
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
  }, [currentDay]);

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

  const handleExerciseChangeForTemplate = useCallback((
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
  }, []); // No dependencies since it doesn't use any external variables

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

  const removeExerciseFromGroupInTemplate = useCallback((templateIdx: number, groupIdx: number, exIdx: number) => {
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
  }, []); // No dependencies since it doesn't use any external variables

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
      onSubmit({ planName, instructions, builderMode, week: weekPlans });
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
        instructions, 
        builderMode, 
        workoutDaysPerWeek, 
        week: weekData 
      });
    }
    
    if (!initialValues) {
      setPlanName("");
      setInstructions("");
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
          {showDraftPrompt && pendingDraftEnvelope && (
            <div
              className="rounded-lg border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              role="status"
            >
              <p className="text-sm text-gray-800 dark:text-gray-100">
                You have an unsaved local workout draft
                {pendingDraftEnvelope.updatedAt
                  ? ` from ${new Date(pendingDraftEnvelope.updatedAt).toLocaleString()}`
                  : ""}
                . Restore it or start fresh from the saved plan.
              </p>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button type="button" size="sm" onClick={handleRestoreWorkoutDraft}>
                  Restore draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleStartFreshWorkoutDraft}
                >
                  Start fresh
                </Button>
              </div>
            </div>
          )}
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

          {/* Instructions */}
          <div>
            <label
              htmlFor="instructions"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Instructions (optional)
            </label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="e.g., Warm-up, Cool-down, Pre-requisites"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
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
                      <div key={groupIdx} className="border border-primary/40 rounded-lg p-4 bg-primary/5 dark:bg-primary/10 ml-6">
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
                                {/* COMMENTED OUT - OLD EXERCISE SECTION WITH FOCUS ISSUES */}
                                {/* {group.exercises.map((exercise, exIdx) => {
                                  console.log('🏗️ Rendering exercise:', {
                                    groupIdx,
                                    exIdx,
                                    exercise,
                                    currentDay,
                                    timestamp: new Date().toISOString()
                                  });
                                  
                                  return (
                                    <SortableExercise key={`${currentDay}-${groupIdx}-${exIdx}`} exerciseIndex={exIdx} groupIndex={groupIdx} day={currentDay}>
                                      <ExerciseContent
                                        key={`exercise-content-${currentDay}-${groupIdx}-${exIdx}-${exercise.name}-${exercise.sets}-${exercise.reps}`}
                                        exercise={exercise}
                                        groupIdx={groupIdx}
                                        exIdx={exIdx}
                                        groupType={group.type}
                                        onExerciseChange={handleExerciseChange}
                                        onRemoveExercise={group.type === "Giant Set" && group.exercises.length > 3 ? removeExerciseFromGroup : undefined}
                                      />
                                    </SortableExercise>
                                    );
                                  })} */}
                                
                                {/* NEW CLEAN EXERCISE SECTION */}
                                {group.exercises.map((exercise, exIdx) => (
                                  <div key={`exercise-${groupIdx}-${exIdx}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 ml-6">
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
                                            onClick={() => removeExerciseFromGroup(groupIdx, exIdx)}
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
                                          onChange={(e) => handleExerciseChange(groupIdx, exIdx, "name", e.target.value)}
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
                                            onChange={(e) => handleExerciseChange(groupIdx, exIdx, "sets", e.target.value)}
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
                                            onChange={(e) => handleExerciseChange(groupIdx, exIdx, "reps", e.target.value)}
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
                                          onChange={(e) => handleExerciseChange(groupIdx, exIdx, "notes", e.target.value)}
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
                                            const file = e.target.files && e.target.files[0] ? e.target.files[0] : undefined;
                                            handleExerciseChange(groupIdx, exIdx, "videoFile", file);
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
                    className="border border-primary/40 rounded-lg p-4 bg-primary/5 dark:bg-primary/10 ml-6"
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
                              {/* NEW CLEAN TEMPLATE EXERCISE SECTION - MATCHING FIXED SCHEDULE */}
                              {group.exercises.map((exercise, exIdx) => (
                                <div key={`exercise-${groupIdx}-${exIdx}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 ml-6">
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
                                          onClick={() => removeExerciseFromGroupInTemplate(currentWorkoutIndex, groupIdx, exIdx)}
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
                                        onChange={(e) => handleExerciseChangeForTemplate(currentWorkoutIndex, groupIdx, exIdx, "name", e.target.value)}
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
                                          onChange={(e) => handleExerciseChangeForTemplate(currentWorkoutIndex, groupIdx, exIdx, "sets", e.target.value)}
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
                                          onChange={(e) => handleExerciseChangeForTemplate(currentWorkoutIndex, groupIdx, exIdx, "reps", e.target.value)}
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
                                        onChange={(e) => handleExerciseChangeForTemplate(currentWorkoutIndex, groupIdx, exIdx, "notes", e.target.value)}
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
                                          const file = e.target.files && e.target.files[0] ? e.target.files[0] : undefined;
                                          handleExerciseChangeForTemplate(currentWorkoutIndex, groupIdx, exIdx, "videoFile", file);
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
