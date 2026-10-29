import { allocate } from "./scheduler.js";
import { bodyObject, integer } from "../utils/validation.js";
import { invalid } from "../utils/errors.js";
import { minutesToTime, reservationInterval, validateDate } from "../utils/time.js";

export const SEARCH = Object.freeze({ days: 1, maxDays: 7, limit: 5, maxLimit: 20,
  interval: 15, intervals: [5, 10, 15, 30, 60], earliest: 510, latest: 1290 });

export function normalizeSchedule(body) {
  bodyObject(body);
  return {
    eventDate: validateDate(body.eventDate),
    ...reservationInterval(body.startTime, body.endTime),
    attendees: integer(body.attendees, "Attendees", 1),
    preferredVenueId: integer(body.preferredVenueId, "preferredVenueId", 1),
    projectorsRequired: integer(body.projectorsRequired, "Projectors"),
    audioRequired: integer(body.audioRequired, "Audio systems"),
    staffRequired: integer(body.staffRequired, "Staff"),
  };
}

export function searchOptions(value = {}) {
  bodyObject(value);
  const allowed = ["searchDays", "limit", "intervalMinutes", "preferredVenueOnly"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid("Unknown search option.");
  const searchDays = integer(value.searchDays === undefined ? SEARCH.days : value.searchDays, "searchDays", 1);
  const limit = integer(value.limit === undefined ? SEARCH.limit : value.limit, "limit", 1);
  const intervalMinutes = integer(value.intervalMinutes === undefined ? SEARCH.interval : value.intervalMinutes, "intervalMinutes", 1);
  if (searchDays > SEARCH.maxDays || limit > SEARCH.maxLimit || !SEARCH.intervals.includes(intervalMinutes))
    invalid("Search allows 1–7 days, 1–20 results and increments of 5, 10, 15, 30 or 60 minutes.");
  if (value.preferredVenueOnly !== undefined && typeof value.preferredVenueOnly !== "boolean")
    invalid("preferredVenueOnly must be a boolean.");
  return { searchDays, limit, intervalMinutes, preferredVenueOnly: value.preferredVenueOnly ?? false };
}

export function candidateDates(date, count) {
  if (!Number.isInteger(count) || count < 1 || count > SEARCH.maxDays) invalid("Search horizon must be 1–7 days.");
  const start = new Date(`${validateDate(date)}T00:00:00Z`);
  return Array.from({ length: count }, (_, offset) => {
    const next = new Date(start);
    next.setUTCDate(next.getUTCDate() + offset);
    return validateDate(next.toISOString().slice(0, 10));
  });
}

export function candidateTimes(input, increment) {
  if (!SEARCH.intervals.includes(increment)) invalid("Invalid search increment.");
  const duration = input.endMinute - input.startMinute;
  const starts = new Set();
  for (let minute = SEARCH.earliest; minute + duration <= SEARCH.latest; minute += increment) starts.add(minute);
  if (input.startMinute >= SEARCH.earliest && input.endMinute <= SEARCH.latest) starts.add(input.startMinute);
  return [...starts].sort((a, b) => a - b).map((start) => ({
    startTime: minutesToTime(start), endTime: minutesToTime(start + duration),
    ...reservationInterval(minutesToTime(start), minutesToTime(start + duration)),
  }));
}

export function rankingTuple(result) {
  return [Number(!result.preferredVenuePreserved), Number(!result.originalDatePreserved),
    Math.abs(result.timeDifferenceMinutes), result.hallCapacity, result.venueId, result.hallId,
    result.eventDate, result.startTime];
}
export function rankRecommendations(results, limit) {
  const unique = new Map(results.map((r) => [`${r.eventDate}/${r.startTime}/${r.endTime}/${r.venueId}/${r.hallId}`, r]));
  return [...unique.values()].sort((a, b) => {
    const left = rankingTuple(a), right = rankingTuple(b);
    for (let i = 0; i < left.length; i++) {
      if (left[i] < right[i]) return -1;
      if (left[i] > right[i]) return 1;
    }
    return 0;
  }).slice(0, limit);
}

export function explain(result) {
  const venue = result.preferredVenuePreserved ? "Preserves your preferred venue" : "Uses an alternative venue";
  const date = result.originalDatePreserved ? "on your requested date" : `on ${result.eventDate}`;
  const time = result.timeDifferenceMinutes === 0 ? "at the requested clock time" :
    `${Math.abs(result.timeDifferenceMinutes)} minutes ${result.timeDifferenceMinutes < 0 ? "earlier" : "later"}`;
  return `${venue} ${date}, ${time}. ${result.hallName} seats ${result.hallCapacity}; its buffered interval and all requested shared resources are available in this snapshot.`;
}

export function findRecommendations(repo, input, options, excludeBookingId = null) {
  const dates = candidateDates(input.eventDate, options.searchDays);
  const times = candidateTimes(input, options.intervalMinutes);
  const venues = repo.venues();
  if (!venues.some((v) => v.id === input.preferredVenueId)) invalid("Selected venue does not exist.");
  const reservations = repo.reservationsBetween(dates[0], dates.at(-1), excludeBookingId);
  const byDate = new Map(dates.map((date) => [date, reservations.filter((b) => b.eventDate === date)]));
  const original = allocate(input, venues, byDate.get(input.eventDate));
  const results = [];
  // Evaluate every bounded candidate before ranking: traversal order cannot hide a better result.
  for (const eventDate of dates) for (const time of times) {
    const candidate = { ...input, ...time, eventDate };
    const decision = allocate(candidate, venues, byDate.get(eventDate));
    if (!decision.feasible || (options.preferredVenueOnly && decision.allocatedVenueId !== input.preferredVenueId)) continue;
    const venue = venues.find((v) => v.id === decision.allocatedVenueId);
    const hall = venue.halls.find((h) => h.id === decision.hallId);
    const result = { eventDate, startTime: time.startTime, endTime: time.endTime,
      reservedStartMinute: time.reservedStartMinute, reservedEndMinute: time.reservedEndMinute,
      venueId: venue.id, venueName: venue.name, hallId: hall.id, hallName: hall.name, hallCapacity: hall.capacity,
      attendees: input.attendees, projectorsRequired: input.projectorsRequired,
      audioRequired: input.audioRequired, staffRequired: input.staffRequired,
      timeDifferenceMinutes: time.startMinute - input.startMinute,
      preferredVenuePreserved: venue.id === input.preferredVenueId, originalDatePreserved: eventDate === input.eventDate,
      sameAsOriginalAllocation: eventDate === input.eventDate && time.startMinute === input.startMinute &&
        original.feasible && original.allocatedVenueId === venue.id && original.hallId === hall.id };
    result.ranking = rankingTuple(result);
    result.explanation = explain(result);
    results.push(result);
  }
  return { provisional: true, originalAllocation: original,
    search: { ...options, fromDate: dates[0], throughDate: dates.at(-1),
      earliestStart: "08:30", latestEnd: "21:30", candidatesEvaluated: dates.length * times.length },
    recommendations: rankRecommendations(results, options.limit),
    message: "Snapshot only; confirmation rechecks availability. Search covers the bounded time grid plus the exact requested clock time, not every possible minute." };
}

export function recommendationService(repo) {
  return (body) => {
    bodyObject(body);
    const input = normalizeSchedule(body), options = searchOptions(body.search);
    return repo.readTransaction(() => findRecommendations(repo, input, options));
  };
}
