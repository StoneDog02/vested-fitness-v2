import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "gradient";
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
  disabled,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: disabled 
      ? "bg-gray-400 text-gray-600 cursor-not-allowed shadow-none" 
      : "bg-gradient-to-r from-primary to-primary-light hover:from-primary-dark hover:to-primary text-white hover:text-white shadow-soft hover:shadow-glow",
    secondary: disabled 
      ? "bg-gray-400 text-gray-600 cursor-not-allowed shadow-none" 
      : "bg-gradient-to-r from-secondary to-secondary-light hover:from-gray-700 hover:to-gray-600 text-white shadow-soft hover:shadow-medium",
    outline: disabled 
      ? "border border-gray-400 text-gray-500 cursor-not-allowed shadow-none" 
      : "border-2 border-primary text-primary hover:bg-primary hover:text-white dark:border-primary dark:text-primary dark:hover:bg-primary shadow-soft hover:shadow-glow",
    ghost: disabled 
      ? "text-gray-500 cursor-not-allowed" 
      : "text-primary hover:bg-primary/10 dark:hover:bg-primary/20 hover:shadow-soft",
    gradient: disabled
      ? "bg-gray-400 text-gray-600 cursor-not-allowed shadow-none"
      : "bg-gradient-to-r from-primary via-primary-light to-primary-dark text-white hover:from-primary-dark hover:via-primary hover:to-primary-light shadow-soft hover:shadow-glow-lg",
  };

  const sizeClasses = {
    sm: "py-2 px-4 text-sm font-medium",
    md: "py-3 px-6 text-base font-semibold",
    lg: "py-4 px-8 text-lg font-bold",
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-all duration-300 ease-out
      ${variantClasses[variant]} ${sizeClasses[size]} ${className || ""} button-hover`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="mr-2 flex items-center">{icon}</span>}
      {children}
    </button>
  );
}
