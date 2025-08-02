import React, { useState, useRef, useEffect } from "react";

interface AnimatedBackgroundProps {
  className?: string;
}

export default function AnimatedBackground({ className = "" }: AnimatedBackgroundProps) {
  const [animationFrame, setAnimationFrame] = useState(0); // 0-100 for animation progress
  const [isAnimating, setIsAnimating] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [position, setPosition] = useState({ x: 16, y: 16 }); // Default top-right position
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDarkMode, setIsDarkMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Individual wave frame controls
  const [wave1Frame, setWave1Frame] = useState(0);
  const [wave2Frame, setWave2Frame] = useState(0);
  const [wave3Frame, setWave3Frame] = useState(0);

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

  // Handle mouse down for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  };

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Keep within viewport bounds
        const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 300);
        const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 200);
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Calculate rotation based on frame (0-100 maps to 0-360 degrees)
  const rotation1 = isAnimating ? (animationFrame / 100) * 360 : (wave1Frame / 100) * 360;
  const rotation2 = isAnimating ? (animationFrame / 100) * 360 : (wave2Frame / 100) * 360;
  const rotation3 = isAnimating ? (animationFrame / 100) * 360 : (wave3Frame / 100) * 360;

  // Handle overall frame change in static mode
  const handleOverallFrameChange = (value: number) => {
    setAnimationFrame(value);
    if (!isAnimating) {
      setWave1Frame(value);
      setWave2Frame(value);
      setWave3Frame(value);
    }
  };

  return (
    <>
      <div className={`fixed inset-0 -z-10 ${className}`}>
        {/* Waving gradient background that moves with the waves */}
        <div
          className={isAnimating ? "animate-wave-gradient" : ""}
          style={{
            background: isDarkMode 
              ? 'linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0%, rgba(75, 85, 99, 0.2) 20%, rgba(107, 114, 128, 0.3) 40%, rgba(75, 85, 99, 0.25) 60%, rgba(0, 0, 0, 0.05) 80%, rgba(75, 85, 99, 0.15) 100%)'
              : 'linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 204, 3, 0.2) 20%, rgba(50, 225, 50, 0.3) 40%, rgba(0, 204, 3, 0.25) 60%, rgba(0, 0, 0, 0.05) 80%, rgba(0, 204, 3, 0.15) 100%)',
            backgroundSize: '200% 100%',
            ...(isAnimating ? {} : { backgroundPosition: `${animationFrame}% 50%` })
          }}
        ></div>

        {/* Rotating circular waves */}
        <div className="wave-container">
          <div 
            className={`rotating-wave wave-1 ${isAnimating ? "" : "no-animation"}`}
            style={isAnimating ? {} : { transform: `translate(-50%, -75%) rotate(${rotation1}deg)` }}
          ></div>
          <div 
            className={`rotating-wave wave-2 ${isAnimating ? "" : "no-animation"}`}
            style={isAnimating ? {} : { transform: `translate(-50%, -75%) rotate(${rotation2}deg)` }}
          ></div>
          <div 
            className={`rotating-wave wave-3 ${isAnimating ? "" : "no-animation"}`}
            style={isAnimating ? {} : { transform: `translate(-50%, -75%) rotate(${rotation3}deg)` }}
          ></div>
        </div>
      </div>

      {/* Background Generator Controls */}
      {isVisible && (
        <div 
          ref={containerRef}
          className="fixed z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200 dark:border-gray-700 cursor-move"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            userSelect: isDragging ? 'none' : 'auto'
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="drag-handle flex-1">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Background Generator</h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAnimating(!isAnimating)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  isAnimating 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {isAnimating ? 'Animated' : 'Static'}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ×
              </button>
            </div>
          </div>
          
          {!isAnimating && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Overall Frame: {Math.round(animationFrame)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={animationFrame}
                  onChange={(e) => handleOverallFrameChange(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Wave 1 (Green): {Math.round(wave1Frame)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={wave1Frame}
                    onChange={(e) => setWave1Frame(Number(e.target.value))}
                    className="w-full h-2 bg-green-200 dark:bg-green-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Wave 2 (Light Green): {Math.round(wave2Frame)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={wave2Frame}
                    onChange={(e) => setWave2Frame(Number(e.target.value))}
                    className="w-full h-2 bg-green-300 dark:bg-green-600 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Wave 3 (White): {Math.round(wave3Frame)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={wave3Frame}
                    onChange={(e) => setWave3Frame(Number(e.target.value))}
                    className="w-full h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAnimationFrame(0);
                    setWave1Frame(0);
                    setWave2Frame(0);
                    setWave3Frame(0);
                  }}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Reset All
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show Generator Button (when hidden) */}
      {!isVisible && (
        <button
          onClick={() => setIsVisible(true)}
          className="fixed top-4 right-4 z-50 p-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-900 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </>
  );
} 