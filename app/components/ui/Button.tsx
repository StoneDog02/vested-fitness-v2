import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  className,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: "bg-primary hover:bg-primary text-white hover:text-black",
    secondary: "bg-secondary hover:bg-secondary-light text-white",
    outline:
      "border border-primary text-primary hover:bg-primary hover:!text-black dark:border-primary dark:text-primary",
    ghost: "text-primary hover:bg-gray-light dark:hover:bg-secondary-light",
  };

  const sizeClasses = {
    sm: "py-1.5 px-3 text-sm",
    md: "py-2 px-4 text-base",
    lg: "py-2.5 px-5 text-lg",
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-200
      ${variantClasses[variant]} ${sizeClasses[size]} ${className || ""}`}
      {...props}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
}
