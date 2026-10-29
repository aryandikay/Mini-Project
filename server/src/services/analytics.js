import { peakUsage, overlaps } from "./scheduler.js";
import {
  validateDate,
  timeToMinutes,
  minutesToTime,
  OPERATING_START,
  OPERATING_END,
} from "../utils/time.js";
import { idParam } from "../utils/validation.js";
import { invalid } from "../utils/errors.js";

const resources = [
  ["projectors", "projectorsRequired", "totalProjectors"],
  ["audioSystems", "audioRequired", "totalAudioSystems"],
  ["staff", "staffRequired", "totalStaff"],
];
const percent = (used, available) =>
  available === 0 ? null : (used / available) * 100;

export function utilization(date, start, end, venues, bookings) {
  const window = {
    reservedStartMinute: start,
    reservedEndMinute: end,
    projectorsRequired: 0,
    audioRequired: 0,
    staffRequired: 0,
  };
  const durationMinutes = end - start;
  const minutes = (b) =>
    Math.min(end, b.reservedEndMinute) - Math.max(start, b.reservedStartMinute);
  return {
    date,
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    durationMinutes,
    includesBuffers: true,
    venues: venues.map((venue) => {
      const relevant = bookings.filter(
        (b) =>
          b.status === "CONFIRMED" &&
          b.eventDate === date &&
          b.allocatedVenueId === venue.id &&
          overlaps(window, b),
      );
      const peak = peakUsage(window, relevant);
      return {
        id: venue.id,
        name: venue.name,
        confirmedBookings: relevant.length,
        resources: Object.fromEntries(
          resources.map(([name, field, inventory]) => {
            const capacity = venue[inventory];
            const resourceMinutes = relevant.reduce(
              (total, b) => total + minutes(b) * b[field],
              0,
            );
            return [
              name,
              {
                capacity,
                peak: peak[field],
                resourceMinutes,
                peakPercent: percent(peak[field], capacity),
                averageUtilizationPercent: percent(
                  resourceMinutes,
                  capacity * durationMinutes,
                ),
              },
            ];
          }),
        ),
        halls: venue.halls.map((hall) => {
          const reservations = relevant.filter((b) => b.hallId === hall.id);
          const occupiedMinutes = reservations.reduce(
            (total, b) => total + minutes(b),
            0,
          );
          return {
            id: hall.id,
            name: hall.name,
            capacity: hall.capacity,
            confirmedBookings: reservations.length,
            occupiedMinutes,
            occupancyPercent: percent(occupiedMinutes, durationMinutes),
          };
        }),
      };
    }),
  };
}

export function analyticsService(repo) {
  return (query) => {
    if (
      Object.keys(query).some(
        (key) => !["date", "startTime", "endTime", "venueId"].includes(key),
      )
    )
      invalid("Analytics accepts date, startTime, endTime and venueId only.");
    const date = validateDate(query.date);
    const start =
      query.startTime === undefined
        ? OPERATING_START
        : timeToMinutes(query.startTime);
    const end =
      query.endTime === undefined
        ? OPERATING_END
        : timeToMinutes(query.endTime);
    if (start < OPERATING_START || end > OPERATING_END || start >= end)
      invalid(
        "Analytics interval must have positive duration within 08:00–22:00.",
      );
    const venueId =
      query.venueId === undefined ? undefined : idParam(query.venueId);
    return repo.readTransaction(() => {
      const venues = repo
        .venues()
        .filter((v) => venueId === undefined || v.id === venueId);
      if (!venues.length) invalid("Selected venue does not exist.");
      return utilization(
        date,
        start,
        end,
        venues,
        repo.reservationsInRange(date, date),
      );
    });
  };
}
