import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  hideCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  hideCloseButton = false,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle ESC key press
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden"; // Prevent scrolling when modal is open
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = ""; // Re-enable scrolling when modal is closed
    };
  }, [isOpen, onClose]);

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-none w-full h-full",
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <button
        className="fixed inset-0 z-40 bg-black/50 transition-opacity cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div
          ref={modalRef}
          className={`${sizeClasses[size]} w-full bg-white dark:bg-night rounded-xl shadow-lg transform transition-all duration-300 ease-in-out flex flex-col ${size === 'full' ? 'h-full' : 'max-h-[90vh]'}`}
        >
          {!hideCloseButton && (
            <div className="flex justify-between items-center p-5 border-b border-gray-light dark:border-davyGray shrink-0">
              <h3
                id="modal-title"
                className="text-lg font-semibold text-secondary dark:text-alabaster"
              >
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-dark hover:text-secondary dark:text-gray-light dark:hover:text-alabaster transition-colors duration-200"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  ></path>
                </svg>
              </button>
            </div>
          )}
          <div className={`${size === 'full' ? 'flex-1' : 'p-5'} overflow-y-auto`}>{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}
