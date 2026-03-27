import { Dialog } from "@headlessui/react";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import Button from "~/components/ui/Button";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type {
  CoachDraftEnvelope,
  HabitCustomizeDraftPayload,
} from "~/utils/coachDraftStorage";
import {
  clearHabitCustomizeDraft,
  flushHabitCustomizeDraft,
  loadHabitCustomizeDraftEnvelope,
  saveHabitCustomizeDraftDebounced,
  saveHabitCustomizeDraftSync,
} from "~/utils/coachDraftStorage";

export interface HabitPresetForModal {
  id: string;
  name: string;
  description: string | null;
  preset_type: string;
  target_default: number | null;
  target_unit: string | null;
}

export type CadenceOption = "daily" | "weekly" | "times_per_week";

const TIMES_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6, 7];
// 0=Mon, 1=Tue, ..., 6=Sun
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function defaultsFromPreset(preset: HabitPresetForModal) {
  return {
    habitName: preset.name,
    goalTarget: "",
    cadence: "daily" as CadenceOption,
    timesPerWeek: 3,
    scheduleDays: [] as number[],
    scheduleAnyDay: false,
    notesForClient: preset.description || "",
  };
}

interface CustomizeHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  preset: HabitPresetForModal | null;
  onAssign: (payload: {
    habitPresetId: string;
    customName: string;
    customDescription: string;
    targetValue: number | null;
    targetUnit: string | null;
    frequency: CadenceOption;
    timesPerWeek: number | null;
    scheduleDays: number[] | null;
  }) => void;
  isLoading?: boolean;
  /** When set, unsaved customize state is persisted locally per client + preset. */
  draftClientId?: string | null;
}

export default function CustomizeHabitModal({
  isOpen,
  onClose,
  preset,
  onAssign,
  isLoading = false,
  draftClientId = null,
}: CustomizeHabitModalProps) {
  const [habitName, setHabitName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [cadence, setCadence] = useState<CadenceOption>("daily");
  const [timesPerWeek, setTimesPerWeek] = useState<number>(3);
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleAnyDay, setScheduleAnyDay] = useState(false);
  const [notesForClient, setNotesForClient] = useState("");

  const prevOpenRef = useRef(false);
  const [draftReady, setDraftReady] = useState(!draftClientId);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingDraftEnvelope, setPendingDraftEnvelope] =
    useState<CoachDraftEnvelope<HabitCustomizeDraftPayload> | null>(null);
  const draftReadyRef = useRef(!draftClientId);
  const showDraftPromptRef = useRef(false);
  const habitBaselineRef = useRef("");
  const habitNeedsBaselineCommitRef = useRef(false);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const lastHabitPresetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (preset?.id) lastHabitPresetIdRef.current = preset.id;
  }, [preset?.id]);

  useEffect(() => {
    draftReadyRef.current = draftReady;
  }, [draftReady]);

  useEffect(() => {
    showDraftPromptRef.current = showDraftPrompt;
  }, [showDraftPrompt]);

  useEffect(() => {
    if (preset) {
      const d = defaultsFromPreset(preset);
      setHabitName(d.habitName);
      setGoalTarget(d.goalTarget);
      setCadence(d.cadence);
      setTimesPerWeek(d.timesPerWeek);
      setScheduleDays(d.scheduleDays);
      setScheduleAnyDay(d.scheduleAnyDay);
      setNotesForClient(d.notesForClient);
    }
  }, [preset]);

  useEffect(() => {
    if (cadence === "weekly" && scheduleDays.length > 1) {
      setScheduleDays(scheduleDays.slice(0, 1));
    }
    if (cadence === "times_per_week" && scheduleDays.length > timesPerWeek) {
      setScheduleDays(scheduleDays.slice(0, timesPerWeek));
    }
  }, [cadence, timesPerWeek]);

  const payloadFromForm = (): HabitCustomizeDraftPayload => ({
    habitName,
    goalTarget,
    cadence,
    timesPerWeek,
    scheduleDays,
    scheduleAnyDay,
    notesForClient,
  });

  const commitHabitBaseline = () => {
    habitBaselineRef.current = JSON.stringify(payloadFromForm());
  };

  useLayoutEffect(() => {
    if (!habitNeedsBaselineCommitRef.current || !isOpen) return;
    commitHabitBaseline();
    habitNeedsBaselineCommitRef.current = false;
  });

  const habitPresetId = preset?.id;

  useEffect(() => {
    if (!isOpen) {
      const cid = draftClientId;
      const pid = lastHabitPresetIdRef.current;
      if (cid && pid) {
        flushHabitCustomizeDraft(cid, pid);
        if (draftReadyRef.current && !showDraftPromptRef.current) {
          saveHabitCustomizeDraftSync(cid, pid, payloadFromForm());
        }
      }
      setShowDraftPrompt(false);
      setPendingDraftEnvelope(null);
      setDraftReady(!draftClientId);
      prevOpenRef.current = false;
      return;
    }

    if (!prevOpenRef.current && preset) {
      if (draftClientId && habitPresetId) {
        setDraftReady(false);
        const env = loadHabitCustomizeDraftEnvelope(draftClientId, habitPresetId);
        if (env) {
          setPendingDraftEnvelope(env);
          setShowDraftPrompt(true);
        } else {
          setShowDraftPrompt(false);
          setPendingDraftEnvelope(null);
          setDraftReady(true);
          habitNeedsBaselineCommitRef.current = true;
        }
        prevOpenRef.current = true;
      } else {
        setDraftReady(true);
        setShowDraftPrompt(false);
        setPendingDraftEnvelope(null);
        habitNeedsBaselineCommitRef.current = true;
        prevOpenRef.current = true;
      }
    }
  }, [isOpen, draftClientId, habitPresetId, preset]);

  useEffect(() => {
    if (
      !isOpen ||
      !draftClientId ||
      !habitPresetId ||
      !draftReady ||
      showDraftPrompt ||
      isLoading
    ) {
      return;
    }
    saveHabitCustomizeDraftDebounced(
      draftClientId,
      habitPresetId,
      payloadFromForm()
    );
  }, [
    isOpen,
    draftClientId,
    habitPresetId,
    draftReady,
    showDraftPrompt,
    isLoading,
    habitName,
    goalTarget,
    cadence,
    timesPerWeek,
    scheduleDays,
    scheduleAnyDay,
    notesForClient,
  ]);

  const isDirty =
    !!draftClientId &&
    !!habitPresetId &&
    draftReady &&
    JSON.stringify(payloadFromForm()) !== habitBaselineRef.current;

  useEffect(() => {
    if (!draftClientId) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) return;
      if (showDraftPrompt || isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftClientId, isLoading, showDraftPrompt, isDirty]);

  const handleRestoreDraft = () => {
    if (!pendingDraftEnvelope) return;
    const p = pendingDraftEnvelope.payload;
    setHabitName(p.habitName);
    setGoalTarget(p.goalTarget);
    setCadence(p.cadence as CadenceOption);
    setTimesPerWeek(p.timesPerWeek);
    setScheduleDays(p.scheduleDays ?? []);
    setScheduleAnyDay(p.scheduleAnyDay);
    setNotesForClient(p.notesForClient ?? "");
    setShowDraftPrompt(false);
    setPendingDraftEnvelope(null);
    setDraftReady(true);
    habitNeedsBaselineCommitRef.current = true;
  };

  const handleStartFreshDraft = () => {
    const p = presetRef.current;
    if (!draftClientId || !habitPresetId || !p) return;
    clearHabitCustomizeDraft(draftClientId, habitPresetId);
    const d = defaultsFromPreset(p);
    setHabitName(d.habitName);
    setGoalTarget(d.goalTarget);
    setCadence(d.cadence);
    setTimesPerWeek(d.timesPerWeek);
    setScheduleDays(d.scheduleDays);
    setScheduleAnyDay(d.scheduleAnyDay);
    setNotesForClient(d.notesForClient);
    setShowDraftPrompt(false);
    setPendingDraftEnvelope(null);
    setDraftReady(true);
    habitNeedsBaselineCommitRef.current = true;
  };

  const toggleDay = (dayIndex: number) => {
    if (cadence === "weekly") {
      setScheduleDays(scheduleDays.includes(dayIndex) ? [] : [dayIndex]);
      return;
    }
    if (cadence === "times_per_week") {
      if (scheduleDays.includes(dayIndex)) {
        setScheduleDays(scheduleDays.filter((d) => d !== dayIndex));
      } else if (scheduleDays.length < timesPerWeek) {
        setScheduleDays([...scheduleDays, dayIndex].sort((a, b) => a - b));
      }
    }
  };

  const canSubmitSchedule =
    cadence === "daily" ||
    (cadence === "weekly" && scheduleDays.length === 1) ||
    (cadence === "times_per_week" && (scheduleAnyDay || scheduleDays.length === timesPerWeek));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!preset || isLoading || !canSubmitSchedule) return;
    const trimmed = goalTarget.trim();
    onAssign({
      habitPresetId: preset.id,
      customName: habitName.trim() || preset.name,
      customDescription: notesForClient.trim(),
      targetValue: null,
      targetUnit: trimmed || null,
      frequency: cadence,
      timesPerWeek: cadence === "times_per_week" ? timesPerWeek : null,
      scheduleDays:
        cadence === "weekly"
          ? scheduleDays.length > 0
            ? scheduleDays
            : null
          : cadence === "times_per_week"
            ? scheduleAnyDay
              ? null
              : scheduleDays.length > 0
                ? scheduleDays
                : null
            : null,
    });
    onClose();
  };

  const handleClose = () => {
    if (!isLoading) onClose();
  };

  if (!preset) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      className="fixed inset-0 z-10 overflow-y-auto"
    >
      <div className="fixed inset-0 bg-black/50 transition-opacity" />
      <div className="flex min-h-screen items-center justify-center p-4 relative z-20">
        <Dialog.Panel className="relative mx-auto max-w-lg rounded-xl bg-white dark:bg-gray-800 p-6 w-full shadow-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-6">
            <div>
              <Dialog.Title className="text-xl font-semibold text-secondary dark:text-alabaster">
                Customize Habit
              </Dialog.Title>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Set goal, cadence, and days, then assign to the client.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {showDraftPrompt && pendingDraftEnvelope && (
              <div
                className="rounded-lg border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 flex flex-col gap-2"
                role="status"
              >
                <p className="text-sm text-secondary dark:text-alabaster">
                  You have an unsaved local draft
                  {pendingDraftEnvelope.updatedAt
                    ? ` from ${new Date(pendingDraftEnvelope.updatedAt).toLocaleString()}`
                    : ""}
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={handleRestoreDraft}>
                    Restore draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleStartFreshDraft}
                  >
                    Start fresh
                  </Button>
                </div>
              </div>
            )}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Details
              </h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="customize-habit-name" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                    Habit name
                  </label>
                  <input
                    id="customize-habit-name"
                    type="text"
                    value={habitName}
                    onChange={(e) => setHabitName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                    placeholder="e.g. Water Intake"
                  />
                </div>
                <div>
                  <label htmlFor="customize-habit-goal-target" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                    Goal target
                  </label>
                  <input
                    id="customize-habit-goal-target"
                    type="text"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="e.g. 100 oz, 10 min, 8 hours, 10000 steps"
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                  />
                </div>
                <div>
                  <label htmlFor="customize-habit-cadence" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                    Cadence
                  </label>
                  <select
                    id="customize-habit-cadence"
                    value={cadence}
                    onChange={(e) =>
                      setCadence(e.target.value as CadenceOption)
                    }
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="times_per_week">Times per week</option>
                  </select>
                </div>
                {cadence === "times_per_week" && (
                  <div>
                    <label htmlFor="customize-habit-times-per-week" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                      Times per week
                    </label>
                    <select
                      id="customize-habit-times-per-week"
                      value={timesPerWeek}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setTimesPerWeek(n);
                        if (scheduleDays.length > n) {
                          setScheduleDays(scheduleDays.slice(0, n));
                        }
                      }}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                    >
                      {TIMES_PER_WEEK_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}x per week
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {cadence === "times_per_week" && (
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="schedule-any-day"
                      checked={scheduleAnyDay}
                      onChange={(e) => setScheduleAnyDay(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-primary focus:ring-primary"
                    />
                    <label htmlFor="schedule-any-day" className="text-sm text-secondary dark:text-alabaster">
                      Any day – habit shows every day; compliance is based on hitting the target count for the week.
                    </label>
                  </div>
                )}
                {(cadence === "weekly" || (cadence === "times_per_week" && !scheduleAnyDay)) && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Schedule
                    </h3>
                    <span className="block text-sm font-medium text-secondary dark:text-alabaster mb-2">
                      Choose days
                    </span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose days">
                      {DAY_LABELS.map((label, dayIndex) => {
                        const selected = scheduleDays.includes(dayIndex);
                        return (
                          <button
                            key={dayIndex}
                            type="button"
                            onClick={() => toggleDay(dayIndex)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              selected
                                ? "bg-primary text-white border border-primary"
                                : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary/50"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {cadence === "weekly"
                        ? "Pick the day this happens each week."
                        : `Pick ${timesPerWeek} day${timesPerWeek > 1 ? "s" : ""} for this habit (${scheduleDays.length}/${timesPerWeek} selected).`}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Notes
              </h3>
              <div>
                <label htmlFor="customize-habit-notes-for-client" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                  Notes for client
                </label>
                <textarea
                  id="customize-habit-notes-for-client"
                  value={notesForClient}
                  onChange={(e) => setNotesForClient(e.target.value)}
                  rows={3}
                  placeholder="Optional note to show the client"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster resize-y"
                />
              </div>
            </section>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading || !canSubmitSchedule}
              >
                {isLoading ? "Assigning…" : "Assign to client"}
              </Button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
