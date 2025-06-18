import Modal from "~/components/ui/Modal";

interface Update {
  id: string;
  message: string;
  created_at: string;
}

interface UpdateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  updates: Update[];
  emptyMessage?: string;
}

export default function UpdateHistoryModal({
  isOpen,
  onClose,
  updates,
  emptyMessage,
}: UpdateHistoryModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update History" size="lg">
      <div className="space-y-4">
        {updates.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">
            {emptyMessage || "No updates yet."}
          </div>
        ) : (
          updates.map((update) => (
            <div
              key={update.id}
              className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
            >
              <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                {new Date(update.created_at).toLocaleDateString()}
              </div>
              <p className="text-sm text-secondary dark:text-alabaster">
                {update.message}
              </p>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
} 