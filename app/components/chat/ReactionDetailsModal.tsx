import React from "react";
import Modal from "~/components/ui/Modal";

interface ReactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reaction: string;
  userNames: string[];
}

export default function ReactionDetailsModal({
  isOpen,
  onClose,
  reaction,
  userNames,
}: ReactionDetailsModalProps) {
  const title =
    userNames.length === 1
      ? `${reaction} · 1 reaction`
      : `${reaction} · ${userNames.length} reactions`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {userNames.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No reactions yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {userNames.map((name, index) => (
            <li
              key={`${name}-${index}`}
              className="py-2.5 text-sm text-gray-800 dark:text-gray-200"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
