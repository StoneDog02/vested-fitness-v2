import dayjs from "dayjs";
import { DAY_NAMES } from "~/lib/checkInFormConstants";

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export function formatScheduleSummary(schedule: {
  frequency: ScheduleFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  time_of_day: string;
  next_send_at: string;
  title: string;
}): string {
  const [hours, minutes] = schedule.time_of_day.split(":").map(Number);
  const timeLabel = dayjs()
    .hour(hours)
    .minute(minutes)
    .format("h:mm A");

  let cadence = "";
  if (schedule.frequency === "daily") {
    cadence = `Daily at ${timeLabel}`;
  } else if (schedule.frequency === "weekly") {
    const dayName = DAY_NAMES[schedule.day_of_week ?? 0];
    cadence = `Weekly on ${dayName} at ${timeLabel}`;
  } else {
    cadence = `Monthly on day ${schedule.day_of_month} at ${timeLabel}`;
  }

  const nextSend = dayjs(schedule.next_send_at).format("MMM D, YYYY");
  return `${schedule.title}: ${cadence} — next send ${nextSend}`;
}
