import React, { useEffect, useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface Client {
  id: string;
  name: string;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateGroupModal({
  isOpen,
  onClose,
  onCreated,
}: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
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
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const toggleClient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/chat-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          clientIds: Array.from(selectedIds),
        }),
      });
      if (res.ok) {
        setName("");
        setDescription("");
        setSelectedIds(new Set());
        onCreated();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Group" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="group-name" className="block text-sm font-medium mb-1">
            Group Name
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-night"
            placeholder="e.g. January Challenge"
          />
        </div>
        <div>
          <label htmlFor="group-description" className="block text-sm font-medium mb-1">
            Description (optional)
          </label>
          <textarea
            id="group-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-night"
          />
        </div>
        <div>
          <span className="block text-sm font-medium mb-2">Add Clients</span>
          {loading ? (
            <p className="text-sm text-gray-500">Loading clients...</p>
          ) : (
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
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !name.trim() || selectedIds.size === 0}
          >
            {submitting ? "Creating..." : "Create Group"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
