import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface CheckInNote {
  id: string;
  date: string;
  notes: string;
}

interface CheckInHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkIns: CheckInNote[];
  onLoadMore: () => void;
  hasMore: boolean;
}

export default function CheckInHistoryModal({
  isOpen,
  onClose,
  checkIns,
  onLoadMore,
  hasMore,
}: CheckInHistoryModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Check In History" size="lg">
      <div className="space-y-4">
        {checkIns.map((checkIn) => (
          <div
            key={checkIn.id}
            className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
          >
            <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
              {new Date(checkIn.date).toLocaleDateString()}
            </div>
            <p className="text-sm text-secondary dark:text-alabaster">
              {checkIn.notes}
            </p>
          </div>
        ))}

        {hasMore && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={onLoadMore} className="text-sm">
              ...Load More
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
