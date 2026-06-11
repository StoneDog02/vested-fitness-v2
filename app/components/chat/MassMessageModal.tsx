import React, { useEffect, useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface Client {
  id: string;
  name: string;
}

interface MassMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
}

export default function MassMessageModal({
  isOpen,
  onClose,
  onSent,
}: MassMessageModalProps) {
  const [content, setContent] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/chat-conversations")
      .then((r) => r.json())
      .then((data) => {
        const dmClients = (data.conversations ?? [])
          .filter((c: { type: string }) => c.type === "dm")
          .map((c: { client_id: string; name: string }) => ({
            id: c.client_id,
            name: c.name,
          }));
        setClients(dmClients);
      });
  }, [isOpen]);

  const toggleClient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAll(false);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(clients.map((c) => c.id)));
      setSelectAll(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/chat-mass-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: Array.from(selectedIds),
          content: content.trim(),
        }),
      });
      if (res.ok) {
        setContent("");
        setSelectedIds(new Set());
        onSent();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mass Message" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Send the same message to multiple clients as individual direct messages.
        </p>
        <div>
          <label htmlFor="mass-message-content" className="block text-sm font-medium mb-1">
            Message
          </label>
          <textarea
            id="mass-message-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={4}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-night"
            placeholder="Your message..."
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Recipients</span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-primary hover:underline"
            >
              {selectAll ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
            {clients.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleClient(c.id)}
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {selectedIds.size} client{selectedIds.size !== 1 ? "s" : ""} selected
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !content.trim() || selectedIds.size === 0}
          >
            {submitting ? "Sending..." : `Send to ${selectedIds.size}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
