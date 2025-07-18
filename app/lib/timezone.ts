import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Timezone constant for Northern Utah
export const USER_TIMEZONE = "America/Denver";

// Helper function to get current date in user timezone
export function getCurrentDate() {
  return dayjs().tz(USER_TIMEZONE).startOf("day");
}

// Helper function to get current date as ISO string
export function getCurrentDateISO() {
  return dayjs().tz(USER_TIMEZONE).startOf("day").toISOString();
}

// Helper function to get current timestamp as ISO string
export function getCurrentTimestampISO() {
  return dayjs().tz(USER_TIMEZONE).toISOString();
}

// Helper function to convert a date to user timezone
export function toUserTimezone(date: string | Date | dayjs.Dayjs) {
  return dayjs(date).tz(USER_TIMEZONE);
}

// Helper function to get start of week in user timezone
export function getStartOfWeek(date?: string | Date | dayjs.Dayjs) {
  const targetDate = date ? dayjs(date).tz(USER_TIMEZONE) : getCurrentDate();
  return targetDate.startOf("week");
}

// Helper function to get end of week in user timezone
export function getEndOfWeek(date?: string | Date | dayjs.Dayjs) {
  const targetDate = date ? dayjs(date).tz(USER_TIMEZONE) : getCurrentDate();
  return targetDate.endOf("week");
}

// Helper function to check if a date is today in user timezone
export function isToday(date: string | Date | dayjs.Dayjs) {
  const targetDate = dayjs(date).tz(USER_TIMEZONE).startOf("day");
  const today = getCurrentDate();
  return targetDate.isSame(today, "day");
}

// Helper function to check if a date is in the future in user timezone
export function isFuture(date: string | Date | dayjs.Dayjs) {
  const targetDate = dayjs(date).tz(USER_TIMEZONE).startOf("day");
  const today = getCurrentDate();
  return targetDate.isAfter(today, "day");
}

// Helper function to check if a date is in the past in user timezone
export function isPast(date: string | Date | dayjs.Dayjs) {
  const targetDate = dayjs(date).tz(USER_TIMEZONE).startOf("day");
  const today = getCurrentDate();
  return targetDate.isBefore(today, "day");
} 