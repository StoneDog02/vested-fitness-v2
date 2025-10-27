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
  onClick,
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
    sm: "py-2 px-4 text-sm font-medium min-h-[44px] min-w-[44px]", // Mobile-friendly touch targets
    md: "py-3 px-6 text-base font-semibold min-h-[48px] min-w-[48px]",
    lg: "py-4 px-8 text-lg font-bold min-h-[52px] min-w-[52px]",
  };

  // Enhanced click handler for mobile compatibility
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    // Don't prevent default if button is inside an anchor tag
    const isInsideAnchor = e.currentTarget.closest('a');
    
    // Only prevent default for non-submit buttons to avoid breaking form submissions
    // and only if not inside an anchor tag
    if (props.type !== 'submit' && !isInsideAnchor) {
      // Prevent double-tap zoom on mobile for non-submit buttons
      e.preventDefault();
    }
    
    // Add a small delay to ensure touch events are properly handled
    setTimeout(() => {
      if (onClick) {
        onClick(e);
      }
    }, 0);
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-all duration-300 ease-out
      ${variantClasses[variant]} ${sizeClasses[size]} ${className || ""} button-hover
      touch-manipulation select-none`} // Mobile optimizations
      disabled={disabled}
      onClick={handleClick}
      style={{
        WebkitTapHighlightColor: 'transparent', // Remove tap highlight on iOS
        WebkitTouchCallout: 'none', // Disable callout on iOS
        WebkitUserSelect: 'none', // Disable text selection
        userSelect: 'none',
      }}
      {...props}
    >
      {icon && <span className="mr-2 flex items-center">{icon}</span>}
      {children}
    </button>
  );
}
