import React, { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import { DAY_NAMES } from "~/lib/checkInFormConstants";

interface CheckInForm {
  id: string;
  title: string;
  description?: string;
  created_at: string;
}

export type RecurringScheduleConfig = {
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
};

interface SendCheckInFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onContinue: (
    formId: string,
    expiresInDays: number,
    recurring?: RecurringScheduleConfig
  ) => void;
}

export default function SendCheckInFormModal({
  isOpen,
  onClose,
  clientName,
  onContinue,
}: SendCheckInFormModalProps) {
  const [forms, setForms] = useState<CheckInForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(4);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setSelectedFormId("");
    setExpiresInDays(7);
    setIsRecurring(false);
    setFrequency("weekly");
    setDayOfWeek(4);
    setDayOfMonth(1);
    setTimeOfDay("09:00");
  };

  useEffect(() => {
    if (isOpen) {
      fetchForms();
    } else {
      resetForm();
    }
  }, [isOpen]);

  const fetchForms = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/get-check-in-forms");
      if (response.ok) {
        const data = await response.json();
        setForms(data.forms || []);
      }
    } catch (error) {
      console.error("Error fetching forms:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFormId) return;

    setIsSubmitting(true);
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      if (isMobile) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const recurring: RecurringScheduleConfig | undefined = isRecurring
        ? {
            frequency,
            timeOfDay,
            ...(frequency === "weekly" ? { dayOfWeek } : {}),
            ...(frequency === "monthly" ? { dayOfMonth } : {}),
          }
        : undefined;

      await onContinue(selectedFormId, expiresInDays, recurring);
      resetForm();
      onClose();
    } catch (submitError) {
      console.error("Form submission error:", submitError);
      alert(
        `Failed to continue: ${submitError instanceof Error ? submitError.message : "Unknown error"}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectClassName =
    "w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster";
  const labelClassName =
    "block text-sm font-medium text-secondary dark:text-alabaster mb-2";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send Check-In Form to ${clientName}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="form-select" className={labelClassName}>
            Select Form
          </label>
          {isLoading ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              Loading forms...
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p>No forms available.</p>
              <p className="text-sm mt-1">Create a form first to send to your client.</p>
            </div>
          ) : (
            <select
              id="form-select"
              value={selectedFormId}
              onChange={(e) => setSelectedFormId(e.target.value)}
              className={selectClassName}
              required
            >
              <option value="">Choose a form...</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedFormId && (
          <div>
            <label htmlFor="expires-select" className={labelClassName}>
              Expires In
            </label>
            <select
              id="expires-select"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
              className={selectClassName}
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={30}>1 month</option>
            </select>
          </div>
        )}

        {selectedFormId && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-gray-light text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium text-secondary dark:text-alabaster">
              Set up recurring sending
            </span>
          </label>
        )}

        {selectedFormId && isRecurring && (
          <div className="rounded-lg border border-gray-light dark:border-davyGray p-4 space-y-4">
            <div>
              <label htmlFor="frequency-select" className={labelClassName}>
                Frequency
              </label>
              <select
                id="frequency-select"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as "daily" | "weekly" | "monthly")
                }
                className={selectClassName}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {frequency === "weekly" && (
              <div>
                <label htmlFor="day-of-week-select" className={labelClassName}>
                  Day of Week
                </label>
                <select
                  id="day-of-week-select"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                  className={selectClassName}
                >
                  {DAY_NAMES.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {frequency === "monthly" && (
              <div>
                <label htmlFor="day-of-month-select" className={labelClassName}>
                  Day of Month
                </label>
                <select
                  id="day-of-month-select"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                  className={selectClassName}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="time-of-day" className={labelClassName}>
                Time of Day
              </label>
              <input
                id="time-of-day"
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className={selectClassName}
                required
              />
            </div>
          </div>
        )}

        {selectedFormId && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                {isRecurring
                  ? `You'll review and customize the form before scheduling recurring sends to ${clientName}.`
                  : `You'll review and can customize the form before sending it to ${clientName}.`}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-light dark:border-davyGray">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!selectedFormId || isSubmitting}
            className="mobile-touch-target"
            style={{
              minHeight: "44px",
              minWidth: "44px",
              touchAction: "manipulation",
            }}
          >
            {isSubmitting ? "Loading..." : "Continue"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
