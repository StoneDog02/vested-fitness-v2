import { json } from "@remix-run/node";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const loader = async () => {
  // Return the current date in Mountain Time (America/Denver)
  const USER_TIMEZONE = "America/Denver";
  
  try {
    const now = dayjs().tz(USER_TIMEZONE);
    const today = now.startOf("day");
    
    return json({
      currentDate: today.format("YYYY-MM-DD"),
      currentTime: now.format("YYYY-MM-DD HH:mm:ss"),
      timezone: USER_TIMEZONE,
      utcTime: now.utc().format("YYYY-MM-DD HH:mm:ss"),
      isValid: now.isValid(),
      timestamp: now.valueOf()
    });
  } catch (error) {
    // Fallback to UTC if timezone conversion fails
    const now = dayjs().utc();
    const today = now.startOf("day");
    
    return json({
      currentDate: today.format("YYYY-MM-DD"),
      currentTime: now.format("YYYY-MM-DD HH:mm:ss"),
      timezone: "UTC (fallback)",
      utcTime: now.format("YYYY-MM-DD HH:mm:ss"),
      isValid: now.isValid(),
      timestamp: now.valueOf(),
      error: "Timezone conversion failed, using UTC fallback"
    });
  }
};
