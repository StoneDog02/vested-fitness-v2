import { Dialog } from "@headlessui/react";
import { useState, useEffect } from "react";
import Button from "~/components/ui/Button";
import { XMarkIcon } from "@heroicons/react/24/outline";

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
}

export default function CustomizeHabitModal({
  isOpen,
  onClose,
  preset,
  onAssign,
  isLoading = false,
}: CustomizeHabitModalProps) {
  const [habitName, setHabitName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [cadence, setCadence] = useState<CadenceOption>("daily");
  const [timesPerWeek, setTimesPerWeek] = useState<number>(3);
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleAnyDay, setScheduleAnyDay] = useState(false);
  const [notesForClient, setNotesForClient] = useState("");

  useEffect(() => {
    if (preset) {
      setHabitName(preset.name);
      setGoalTarget("");
      setNotesForClient(preset.description || "");
      setCadence("daily");
      setTimesPerWeek(3);
      setScheduleDays([]);
      setScheduleAnyDay(false);
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
