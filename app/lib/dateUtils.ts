// Shared date utility functions to ensure consistent date handling across components

/**
 * Format a Date object as YYYY-MM-DD string in local timezone
 */
export const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse a YYYY-MM-DD string as a local Date object (not UTC)
 */
export const parseDateLocal = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 */
export const getTodayString = (): string => {
  return formatDateLocal(new Date());
};

/**
 * Get tomorrow's date as YYYY-MM-DD string in local timezone
 */
export const getTomorrowString = (): string => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateLocal(tomorrow);
}; 