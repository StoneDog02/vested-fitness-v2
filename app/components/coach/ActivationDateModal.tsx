import { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import DatePicker from "~/components/ui/DatePicker";
import TimePicker from "~/components/ui/TimePicker";
import { getTodayString, getTomorrowString } from "~/lib/dateUtils";
import dayjs from "dayjs";
import { USER_TIMEZONE } from "~/lib/timezone";

interface ActivationDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (activationDate: string) => void;
  planName: string;
  isLoading?: boolean;
}

// Use shared date utilities for consistent formatting

export default function ActivationDateModal({
  isOpen,
  onClose,
  onConfirm,
  planName,
  isLoading = false,
}: ActivationDateModalProps) {
  const [activationDate, setActivationDate] = useState(() => {
    // Default to tomorrow
    return getTomorrowString();
  });

  const [activationTime, setActivationTime] = useState("06:00"); // Default to 6 AM

  // Reset date when modal opens
  useEffect(() => {
    if (isOpen) {
      setActivationDate(getTomorrowString());
      setActivationTime("06:00"); // Default to 6 AM
    }
  }, [isOpen]);

  const handleConfirm = () => {
    // Create date in local timezone, then convert to ISO string
    const [year, month, day] = activationDate.split('-').map(Number);
    const [hour, minute] = activationTime.split(':').map(Number);
    
    // Create date in local timezone using dayjs to ensure proper timezone handling
    const localDateTime = dayjs.tz(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`, USER_TIMEZONE);
    
    // Convert to ISO string for storage
    onConfirm(localDateTime.toISOString());
  };

  const today = getTodayString();
  const isToday = activationDate === today;
  const isPast = activationDate < today;

  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onClose} title="Set Activation Date" size="md">
      <div className="space-y-6">
        <div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Choose when <span className="font-semibold">{planName}</span> should become active for your client.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="activation-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Activation Date
            </label>
            <DatePicker
              id="activation-date"
              value={activationDate}
              onChange={setActivationDate}
              minDate={today}
            />
          </div>

          <div>
            <label htmlFor="activation-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Activation Time
            </label>
            <TimePicker
              id="activation-time"
              value={activationTime}
              onChange={setActivationTime}
            />
            
            {/* Quick time presets */}
            <div className="mt-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Quick presets:</p>
              <div className="flex flex-wrap gap-2">
                {["06:00", "08:00", "12:00", "18:00", "20:00"].map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setActivationTime(time)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      activationTime === time
                        ? "bg-primary text-white border-primary"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {time === "06:00" ? "6 AM" : 
                     time === "08:00" ? "8 AM" : 
                     time === "12:00" ? "12 PM" : 
                     time === "18:00" ? "6 PM" : 
                     time === "20:00" ? "8 PM" : time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Preview of selected date/time */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Plan will activate:</span>
          </p>
          <p className="text-lg font-semibold text-primary mt-1">
            {(() => {
              const [year, month, day] = activationDate.split('-').map(Number);
              const [hour, minute] = activationTime.split(':').map(Number);
              const localDateTime = dayjs.tz(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`, USER_TIMEZONE);
              return localDateTime.format('dddd, MMMM D, YYYY [at] h:mm A');
            })()}
          </p>
        </div>

        {/* Warning messages */}
        {isPast && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-600 dark:text-red-400">
              ⚠️ You've selected a past date. The plan will activate immediately.
            </p>
          </div>
        )}

        {isToday && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              ℹ️ The plan will activate today. Your client will be able to see it immediately.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Setting Active..." : "Set Active"}
          </Button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-night/80 flex items-center justify-center rounded-b-xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-secondary dark:text-alabaster">Setting plan active...</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
} 