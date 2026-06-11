import React, { useEffect, useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => Promise<void>;
  submitting?: boolean;
}

export default function CreatePollModal({
  isOpen,
  onClose,
  onSubmit,
  submitting = false,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  useEffect(() => {
    if (isOpen) {
      setQuestion("");
      setOptions(["", ""]);
    }
  }, [isOpen]);

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;

      const isLast = index === next.length - 1;
      if (isLast && value.trim() && next.length < 12) {
        next.push("");
      }

      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || trimmedOptions.length < 2) return;
    await onSubmit(question.trim(), trimmedOptions);
  };

  const filledCount = options.filter((o) => o.trim()).length;
  const canSubmit = question.trim().length > 0 && filledCount >= 2 && !submitting;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create a poll" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 -mt-1">
        <div>
          <label
            htmlFor="poll-question"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Question
          </label>
          <input
            id="poll-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            maxLength={200}
            className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Options
          </span>
          <div className="flex flex-col gap-2">
            {options.map((opt, index) => (
              <input
                key={index}
                type="text"
                value={opt}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                maxLength={100}
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            Start typing an option to add another (min 2, max 12).
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Creating..." : "Create poll"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
