import React, { useState, useEffect } from "react";

interface AnimatedBackgroundProps {
  className?: string;
}

export default function AnimatedBackground({ className = "" }: AnimatedBackgroundProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`fixed inset-0 -z-10 ${className}`}>
      {/* Waving gradient background that moves with the waves */}
      <div
        className="animate-wave-gradient"
        style={{
          background: isDarkMode 
            ? 'linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0%, rgba(75, 85, 99, 0.2) 20%, rgba(107, 114, 128, 0.3) 40%, rgba(75, 85, 99, 0.25) 60%, rgba(0, 0, 0, 0.05) 80%, rgba(75, 85, 99, 0.15) 100%)'
            : 'linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 204, 3, 0.2) 20%, rgba(50, 225, 50, 0.3) 40%, rgba(0, 204, 3, 0.25) 60%, rgba(0, 0, 0, 0.05) 80%, rgba(0, 204, 3, 0.15) 100%)',
          backgroundSize: '200% 100%'
        }}
      ></div>

      {/* Rotating circular waves */}
      <div className="wave-container">
        <div className="rotating-wave wave-1"></div>
        <div className="rotating-wave wave-2"></div>
        <div className="rotating-wave wave-3"></div>
      </div>
    </div>
  );
} 