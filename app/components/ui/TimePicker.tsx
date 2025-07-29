import { useState, useEffect, useRef } from "react";

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  className?: string;
}

export default function TimePicker({ value, onChange, className = "" }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hour, setHour] = useState(() => {
    return value ? parseInt(value.split(':')[0]) : 6;
  });
  const [minute, setMinute] = useState(() => {
    return value ? parseInt(value.split(':')[1]) : 0;
  });
  const [isAM, setIsAM] = useState(() => {
    if (!value) return true;
    const hour24 = parseInt(value.split(':')[0]);
    return hour24 < 12;
  });
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Update internal state when value changes
  useEffect(() => {
    if (value) {
      const [hourStr, minuteStr] = value.split(':');
      const hour24 = parseInt(hourStr);
      setHour(hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24);
      setMinute(parseInt(minuteStr));
      setIsAM(hour24 < 12);
    }
  }, [value]);

  const handleTimeChange = (newHour: number, newMinute: number, newIsAM: boolean) => {
    setHour(newHour);
    setMinute(newMinute);
    setIsAM(newIsAM);
    
    // Convert to 24-hour format
    let hour24 = newHour;
    if (newHour === 12) {
      hour24 = newIsAM ? 0 : 12;
    } else if (!newIsAM) {
      hour24 = newHour + 12;
    }
    
    const timeString = `${hour24.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
    onChange(timeString);
  };

  const formatDisplayTime = () => {
    if (!value) return 'Select time';
    const [hourStr, minuteStr] = value.split(':');
    const hour24 = parseInt(hourStr);
    const displayHour = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 < 12 ? 'AM' : 'PM';
    return `${displayHour}:${minuteStr} ${ampm}`;
  };

  const renderHourButtons = () => {
    const hours = [];
    for (let h = 1; h <= 12; h++) {
      hours.push(
        <button
          key={h}
          onClick={() => handleTimeChange(h, minute, isAM)}
          className={`
            w-10 h-10 rounded-full text-sm font-medium transition-colors
            ${hour === h 
              ? 'bg-primary text-white' 
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
        >
          {h}
        </button>
      );
    }
    return hours;
  };

  const renderMinuteButtons = () => {
    const minutes = [];
    for (let m = 0; m < 60; m += 15) {
      minutes.push(
        <button
          key={m}
          onClick={() => handleTimeChange(hour, m, isAM)}
          className={`
            px-3 py-1 rounded text-sm font-medium transition-colors
            ${minute === m 
              ? 'bg-primary text-white' 
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
        >
          {m.toString().padStart(2, '0')}
        </button>
      );
    }
    return minutes;
  };

  return (
    <div className={`relative ${className}`} ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-left text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <span>{formatDisplayTime()}</span>
          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50">
          <div className="p-4">
            {/* Hours */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hour</h3>
              <div className="grid grid-cols-4 gap-2">
                {renderHourButtons()}
              </div>
            </div>

            {/* Minutes */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Minute</h3>
              <div className="flex gap-2">
                {renderMinuteButtons()}
              </div>
            </div>

            {/* AM/PM */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AM/PM</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => handleTimeChange(hour, minute, true)}
                  className={`
                    px-4 py-2 rounded text-sm font-medium transition-colors
                    ${isAM 
                      ? 'bg-primary text-white' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  AM
                </button>
                <button
                  onClick={() => handleTimeChange(hour, minute, false)}
                  className={`
                    px-4 py-2 rounded text-sm font-medium transition-colors
                    ${!isAM 
                      ? 'bg-primary text-white' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  PM
                </button>
              </div>
            </div>

            {/* Current selection display */}
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <p className="text-lg font-semibold text-primary">
                {formatDisplayTime()}
              </p>
            </div>

            {/* Done button */}
            <div className="mt-4 text-center">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:bg-primary/80 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 