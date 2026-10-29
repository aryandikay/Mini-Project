import { allocate } from "./scheduler.js";
import { normalizeScheduling } from "../utils/schedulingInput.js";
import { bodyObject, integer, text } from "../utils/validation.js";
import { invalid } from "../utils/errors.js";
import {
  minutesToTime,
  reservationInterval,
  OPERATING_START,
  OPERATING_END,
  BUFFER,
} from "../utils/time.js";
export const SEARCH_DEFAULTS = Object.freeze({
  horizonDays: 1,
  stepMinutes: 15,
  limit: 5,
  preferVenue: true,
});
export function normalizeSearch(body) {
  bodyObject(body);
  if (Object.keys(body).some((key) => !["request", "search"].includes(key)))
    invalid("Only request and search are supported.");
  bodyObject(body.request);
  const allowed = [
    "clientId",
    "eventName",
    "eventDate",
    "startTime",
    "endTime",
    "attendees",
    "preferredVenueId",
    "projectorsRequired",
    "audioRequired",
    "staffRequired",
  ];
  if (Object.keys(body.request).some((key) => !allowed.includes(key)))
    invalid(
      "Unsupported recommendation request field. Booking exclusions are not supported.",
    );
  const request = normalizeScheduling(body.request, false);
  if (body.request.clientId !== undefined)
    request.clientId = integer(body.request.clientId, "clientId", 1);
  if (body.request.eventName !== undefined)
    request.eventName = text(body.request.eventName, "Event name", 160);
  const search = body.search === undefined ? {} : body.search;
  bodyObject(search);
  if (Object.keys(search).some((key) => !Object.hasOwn(SEARCH_DEFAULTS, key)))
    invalid("Unsupported search option.");
  const settings = { ...SEARCH_DEFAULTS, ...search };
  integer(settings.horizonDays, "horizonDays", 1);
  integer(settings.limit, "limit", 1);
  if (
    settings.horizonDays > 7 ||
    settings.limit > 10 ||
    ![15, 30, 60].includes(settings.stepMinutes) ||
    typeof settings.preferVenue !== "boolean"
  )
    invalid(
      "Use horizonDays 1–7, limit 1–10, stepMinutes 15/30/60, and boolean preferVenue.",
    );
  return { request, settings };
}
export function candidateDates(date, days) {
  const result = [],
    cursor = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    if (cursor.getUTCFullYear() > 9999)
      invalid("Search horizon exceeds supported year 9999.");
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
export function generateCandidates(request, settings, dates) {
  const duration = request.endMinute - request.startMinute,
    latest = OPERATING_END - BUFFER - duration;
  const starts = new Set();
  for (
    let start = OPERATING_START + BUFFER;
    start <= latest;
    start += settings.stepMinutes
  )
    starts.add(start);
  if (
    request.startMinute >= OPERATING_START + BUFFER &&
    request.startMinute <= latest
  )
    starts.add(request.startMinute);
  return dates.flatMap((eventDate, dayOffset) =>
    [...starts]
      .sort((a, b) => a - b)
      .map((start) => ({
        ...request,
        eventDate,
        dayOffset,
        startTime: minutesToTime(start),
        endTime: minutesToTime(start + duration),
        ...reservationInterval(
          minutesToTime(start),
          minutesToTime(start + duration),
        ),
      })),
  );
}
export function rankRecommendations(results) {
  return [...results].sort((a, b) => {
    for (let i = 0; i < a.ranking.length; i++) {
      const difference = a.ranking[i] - b.ranking[i];
      if (difference) return difference;
    }
    return 0;
  });
}
export function findRecommendations(
  request,
  settings,
  dates,
  venues,
  bookings,
) {
  const byDate = new Map(dates.map((date) => [date, []]));
  for (const b of bookings) byDate.get(b.eventDate)?.push(b);
  const candidates = generateCandidates(request, settings, dates),
    feasible = [];
  for (const candidate of candidates) {
    const decision = allocate(
      candidate,
      venues,
      byDate.get(candidate.eventDate),
    );
    if (!decision.feasible) continue;
    const venue = venues.find((v) => v.id === decision.allocatedVenueId),
      hall = venue.halls.find((h) => h.id === decision.hallId);
    const preferredVenuePreserved = venue.id === request.preferredVenueId;
    const timeDifferenceMinutes =
      candidate.dayOffset * 1440 + candidate.startMinute - request.startMinute;
    const explanation = `${preferredVenuePreserved ? "Preferred venue preserved" : "Alternative venue selected by the allocation policy"}. ${candidate.dayOffset ? "A later date" : candidate.startMinute === request.startMinute ? "Requested time" : candidate.startMinute > request.startMinute ? "A later start" : "An earlier start"}; the hall, equipment and staff satisfy the complete buffered interval in this snapshot.`;
    feasible.push({
      eventDate: candidate.eventDate,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      reservedStartTime: minutesToTime(candidate.reservedStartMinute),
      reservedEndTime: minutesToTime(candidate.reservedEndMinute),
      allocatedVenueId: venue.id,
      allocatedVenueName: venue.name,
      hallId: hall.id,
      hallName: hall.name,
      hallCapacity: hall.capacity,
      attendees: request.attendees,
      projectorsRequired: request.projectorsRequired,
      audioRequired: request.audioRequired,
      staffRequired: request.staffRequired,
      preferredVenuePreserved,
      dayOffset: candidate.dayOffset,
      timeDifferenceMinutes,
      startTimeDifferenceMinutes: candidate.startMinute - request.startMinute,
      explanation,
      ranking: [
        settings.preferVenue && !preferredVenuePreserved ? 1 : 0,
        candidate.dayOffset,
        Math.abs(candidate.startMinute - request.startMinute),
        hall.capacity,
        venue.id,
        hall.id,
        candidate.startMinute,
      ],
    });
  }
  const originalWithinHours =
    request.reservedStartMinute >= OPERATING_START &&
    request.reservedEndMinute <= OPERATING_END;
  const originalDecision = originalWithinHours
    ? allocate(request, venues, byDate.get(request.eventDate))
    : {
        feasible: false,
        reasons: [
          {
            code: "OPERATING_HOURS_VIOLATION",
            message: "Original buffered interval is outside 08:00–22:00.",
          },
        ],
      };
  const recommendations = rankRecommendations(feasible)
    .slice(0, settings.limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return {
    originalRequest: {
      ...request,
      startTime: minutesToTime(request.startMinute),
      endTime: minutesToTime(request.endMinute),
    },
    originalDecision,
    settings,
    searchedDates: dates,
    evaluatedCandidates: candidates.length,
    totalFeasible: feasible.length,
    count: recommendations.length,
    recommendations,
    provisional: true,
    message: recommendations.length
      ? "Availability snapshot only. Confirmation rechecks current availability."
      : "No feasible alternatives found within this search grid and date range. Attendance, duration and resource requirements were preserved.",
  };
}
export function recommendationService(repo) {
  return (body) => {
    const { request, settings } = normalizeSearch(body),
      dates = candidateDates(request.eventDate, settings.horizonDays);
    return repo.readTransaction(() => {
      if (!repo.venue(request.preferredVenueId))
        invalid("Selected venue does not exist.");
      if (request.clientId !== undefined && !repo.client(request.clientId))
        invalid("Selected client does not exist.");
      return findRecommendations(
        request,
        settings,
        dates,
        repo.venues(),
        repo.reservationsInRange(dates[0], dates.at(-1)),
      );
    });
  };
}
