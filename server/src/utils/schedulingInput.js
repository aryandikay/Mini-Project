import { integer } from "./validation.js";
import { invalid } from "./errors.js";
import {
  validateDate,
  timeToMinutes,
  reservationInterval,
  BUFFER,
} from "./time.js";
export function normalizeScheduling(body, enforceOperatingHours = true) {
  const startMinute = timeToMinutes(body.startTime),
    endMinute = timeToMinutes(body.endTime);
  if (endMinute <= startMinute)
    invalid("End time must be after start time on the same day.");
  return {
    eventDate: validateDate(body.eventDate),
    ...(enforceOperatingHours
      ? reservationInterval(body.startTime, body.endTime)
      : {
          startMinute,
          endMinute,
          reservedStartMinute: startMinute - BUFFER,
          reservedEndMinute: endMinute + BUFFER,
        }),
    attendees: integer(body.attendees, "Attendees", 1),
    preferredVenueId: integer(body.preferredVenueId, "preferredVenueId", 1),
    projectorsRequired: integer(body.projectorsRequired, "Projectors"),
    audioRequired: integer(body.audioRequired, "Audio systems"),
    staffRequired: integer(body.staffRequired, "Staff"),
  };
}
