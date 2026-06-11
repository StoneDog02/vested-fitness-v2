import React from "react";
import Modal from "~/components/ui/Modal";

export interface GroupMember {
  id: string;
  name: string;
  avatar_url?: string | null;
  role?: "coach" | "client";
}

interface GroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  members: GroupMember[];
  currentUserId?: string;
  loading?: boolean;
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

export default function GroupMembersModal({
  isOpen,
  onClose,
  groupName,
  members,
  currentUserId,
  loading = false,
}: GroupMembersModalProps) {
  const title =
    members.length === 1
      ? `${groupName} · 1 member`
      : `${groupName} · ${members.length} members`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No members found.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {members.map((member) => {
            const isMe = !!currentUserId && member.id === currentUserId;
            const displayName = isMe ? "Me" : member.name;

            return (
            <li key={member.id} className="flex items-center gap-3 py-2.5">
              {member.avatar_url ? (
                <img
                  src={member.avatar_url}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className={`w-9 h-9 rounded-full text-white flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarColor(member.id)}`}
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate block">
                  {displayName}
                </span>
                {!isMe && member.role === "coach" && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Coach</span>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
