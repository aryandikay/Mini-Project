import { invalid } from "./errors.js";
export function validateDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    invalid("eventDate must be a valid date in YYYY-MM-DD format.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    invalid("eventDate must be a valid calendar date.");
  return value;
}
export function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    invalid("Times must use valid 24-hour HH:mm format.");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function reservationInterval(startTime, endTime) {
  const startMinute = timeToMinutes(startTime),
    endMinute = timeToMinutes(endTime);
  if (endMinute <= startMinute)
    invalid("End time must be after start time on the same day.");
  const reservedStartMinute = startMinute - 30,
    reservedEndMinute = endMinute + 30;
  if (reservedStartMinute < 480 || reservedEndMinute > 1320)
    invalid(
      "Include 30 minutes for setup and cleanup within 08:00–22:00. Event times must fall within 08:30–21:30.",
    );
  return { startMinute, endMinute, reservedStartMinute, reservedEndMinute };
}
