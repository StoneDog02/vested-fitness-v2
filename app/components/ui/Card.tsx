import React from "react";

interface CardProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  variant?: "default" | "elevated" | "glass" | "gradient";
  hover?: boolean;
  style?: React.CSSProperties;
}

export default function Card({ 
  title, 
  children, 
  className, 
  action, 
  variant = "default", 
  hover = true,
  style 
}: CardProps) {
  const variantClasses = {
    default: "bg-white dark:bg-gray-800 shadow-soft border border-gray-100 dark:border-gray-700",
    elevated: "bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700 shadow-medium border border-gray-200 dark:border-gray-600",
    glass: "glass-effect shadow-soft",
    gradient: "bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 shadow-medium border border-gray-200 dark:border-gray-600",
  };

  const hoverClasses = hover ? "card-hover" : "";

  return (
    <div 
      className={`rounded-2xl overflow-hidden transition-all duration-300 ease-out ${variantClasses[variant]} ${hoverClasses} ${className || ""}`}
      style={style}
    >
      {title && (
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700 dark:to-gray-800 transition-colors duration-200">
          {typeof title === "string" ? (
            <h3 className="font-semibold text-secondary dark:text-alabaster transition-colors duration-200 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-primary to-primary-light rounded-full"></div>
              {title}
            </h3>
          ) : (
            title
          )}
          {action && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{action}</div>}
        </div>
      )}
      <div className="p-6 text-secondary dark:text-alabaster">
        {children}
      </div>
    </div>
  );
}
