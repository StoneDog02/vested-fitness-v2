import React, { ReactNode, useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'bottom' });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const [isClient, setIsClient] = useState(false);

  const show = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setVisible(true);
  };
  const hide = () => {
    timeoutRef.current = window.setTimeout(() => setVisible(false), 100);
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    
    if (visible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const spacing = 8; // px between badge and tooltip
      let top = triggerRect.bottom + spacing;
      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      let placement: 'top' | 'bottom' = 'bottom';

      // If not enough space below, flip to top
      if (top + tooltipRect.height > window.innerHeight) {
        top = triggerRect.top - tooltipRect.height - spacing;
        placement = 'top';
      }
      // If not enough space above, force bottom
      if (top < 0) {
        top = triggerRect.bottom + spacing;
        placement = 'bottom';
      }
      // Clamp horizontally
      if (left < 8) left = 8;
      if (left + tooltipRect.width > window.innerWidth - 8) left = window.innerWidth - tooltipRect.width - 8;
      setPosition({ top, left, placement });
    }
  }, [visible, isClient]);

  // Tooltip element
  const tooltipEl = visible && isClient ? (
    ReactDOM.createPortal(
      <div
        ref={tooltipRef}
        className="z-[9999] fixed pointer-events-none animate-fade-in"
        style={{ top: position.top, left: position.left }}
        role="tooltip"
      >
        <div className="relative">
          {/* Arrow */}
          {position.placement === 'bottom' && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 overflow-hidden">
              <div className="w-3 h-3 bg-gray-900 rotate-45 mx-auto shadow-lg" style={{ marginTop: '-6px' }} />
            </div>
          )}
          {position.placement === 'top' && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 overflow-hidden">
              <div className="w-3 h-3 bg-gray-900 rotate-45 mx-auto shadow-lg" style={{ marginBottom: '-6px' }} />
            </div>
          )}
          <div className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs max-w-xs min-w-[10rem] shadow-lg text-left leading-relaxed whitespace-pre-line font-medium border border-gray-800">
            {content}
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <span
      className={`relative inline-block focus:outline-none ${className || ""}`}
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      role="button"
      aria-describedby={visible ? "tooltip" : undefined}
      style={{ cursor: "pointer" }}
    >
      {children}
      {tooltipEl}
    </span>
  );
};

export default Tooltip;

// Add animation
// In your global CSS (e.g., tailwind.css), add:
// @keyframes fade-in { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none; } }
// .animate-fade-in { animation: fade-in 0.18s cubic-bezier(0.4,0,0.2,1); } 