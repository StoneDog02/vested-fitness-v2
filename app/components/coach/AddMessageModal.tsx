import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface AddMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
}

export default function AddMessageModal({
  isOpen,
  onClose,
  onSubmit,
}: AddMessageModalProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit(message);
    setMessage("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Message" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="message"
            className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
          >
            Message
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={4}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
            placeholder="Enter your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!message.trim()}>
            Send Message
          </Button>
        </div>
      </form>
    </Modal>
  );
}
