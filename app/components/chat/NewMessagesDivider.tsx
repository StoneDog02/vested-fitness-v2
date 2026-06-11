import React from "react";

export default function NewMessagesDivider() {
  return (
    <div
      className="py-1 pointer-events-none select-none"
      role="separator"
      aria-label="New messages"
    >
      <p className="mb-1.5 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
        New Messages
      </p>
      <div className="h-[2px] w-full rounded-full bg-primary" />
    </div>
  );
}
