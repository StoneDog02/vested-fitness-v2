import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface AddCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (thisWeek: string) => void;
  lastWeekNotes: string;
}

export default function AddCheckInModal({
  isOpen,
  onClose,
  onSubmit,
  lastWeekNotes,
}: AddCheckInModalProps) {
  const [thisWeek, setThisWeek] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!thisWeek.trim()) return;
    onSubmit(thisWeek);
    setThisWeek("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Check In Notes"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
            Last Week
          </h4>
          <p className="text-sm text-gray-dark dark:text-gray-light mb-4 p-3 bg-gray-50 dark:bg-davyGray rounded-lg">
            {lastWeekNotes}
          </p>
        </div>

        <div>
          <label
            htmlFor="thisWeek"
            className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
          >
            This Week
          </label>
          <textarea
            id="thisWeek"
            name="thisWeek"
            required
            rows={4}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
            placeholder="Enter this week's check-in notes..."
            value={thisWeek}
            onChange={(e) => setThisWeek(e.target.value)}
          />
        </div>

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!thisWeek.trim()}>
            Save Notes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
