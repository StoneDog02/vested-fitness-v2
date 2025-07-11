import React, { ReactNode, useState, useRef } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const show = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setVisible(true);
  };
  const hide = () => {
    timeoutRef.current = window.setTimeout(() => setVisible(false), 100);
  };

  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <span className="absolute left-1/2 -translate-x-1/2 -top-2 z-50 mb-2 px-6 py-2 rounded bg-gray-900 text-white text-xs max-w-xl min-w-[16rem] shadow-lg text-left leading-relaxed whitespace-pre-line" role="tooltip" style={{whiteSpace: 'pre-line'}}>
          {content}
        </span>
      )}
    </span>
  );
};

export default Tooltip; 