import React from "react";
import Modal from "~/components/ui/Modal";
import type { PollVoter } from "~/lib/chat.types";

interface PollVotersModalProps {
  isOpen: boolean;
  onClose: () => void;
  optionLabel: string;
  voters: PollVoter[];
}

const AVATAR_PALETTE = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[hash];
}

export default function PollVotersModal({
  isOpen,
  onClose,
  optionLabel,
  voters,
}: PollVotersModalProps) {
  const title =
    voters.length === 1
      ? `1 vote · ${optionLabel}`
      : `${voters.length} votes · ${optionLabel}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {voters.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No votes yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {voters.map((voter) => (
            <li key={voter.user_id} className="flex items-center gap-3 py-2.5">
              {voter.avatar_url ? (
                <img
                  src={voter.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor(voter.user_id)}`}
                >
                  {voter.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                {voter.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
