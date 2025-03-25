import React from "react";

interface CardProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export default function Card({
  title,
  children,
  className,
  action,
}: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-night rounded-xl shadow-sm overflow-hidden transition-colors duration-200 ${
        className || ""
      }`}
    >
      {title && (
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-light dark:border-davyGray transition-colors duration-200">
          {typeof title === "string" ? (
            <h3 className="font-semibold text-secondary dark:text-alabaster transition-colors duration-200">
              {title}
            </h3>
          ) : (
            title
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5 text-secondary dark:text-alabaster">{children}</div>
    </div>
  );
}
