import { useState, useEffect, useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { formatDateLocal, parseDateLocal } from "~/lib/dateUtils";

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  className?: string;
  id?: string;
}

export default function DatePicker({ value, onChange, minDate, className = "", id }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = value ? new Date(value) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
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

  // Update current month when value changes
  useEffect(() => {
    if (value) {
      const date = new Date(value);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [value]);

  // Use shared date utilities for consistent formatting

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return formatDateLocal(date) === value;
  };

  const isDisabled = (date: Date) => {
    if (minDate) {
      return formatDateLocal(date) < minDate;
    }
    return false;
  };

  const handleDateClick = (date: Date) => {
    if (!isDisabled(date)) {
      onChange(formatDateLocal(date));
      setIsOpen(false);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const renderCalendarDays = () => {
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-8"></div>);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const disabled = isDisabled(date);
      const selected = isSelected(date);
      const today = isToday(date);

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(date)}
          disabled={disabled}
          className={`
            h-8 w-8 rounded-full text-sm font-medium transition-colors
            ${disabled 
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
              : selected
                ? 'bg-primary text-white'
                : today
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <div className={`relative ${className}`} ref={pickerRef}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-left text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <span>{value ? parseDateLocal(value).toLocaleDateString() : 'Select date'}</span>
          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={goToPreviousMonth}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="font-medium text-gray-900 dark:text-gray-100">{monthName}</span>
            <button
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Calendar */}
          <div className="p-3">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-gray-500 dark:text-gray-400">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {renderCalendarDays()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 