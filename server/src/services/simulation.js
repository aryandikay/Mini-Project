import { allocate } from "./scheduler.js";
import { normalizeSchedule } from "./recommendations.js";
import { confirmed } from "./lifecycle.js";
import { bodyObject, integer, text } from "../utils/validation.js";
import { invalid } from "../utils/errors.js";
import { minutesToTime } from "../utils/time.js";

export const SCHEDULE_FIELDS = Object.freeze(["eventDate", "startTime", "endTime", "attendees", "preferredVenueId",
  "projectorsRequired", "audioRequired", "staffRequired"]);

export function simulate(repo, body) {
  bodyObject(body);
  if (Object.keys(body).some((key) => !["bookingId", "expectedUpdatedAt", "proposal"].includes(key)))
    invalid("Simulation accepts bookingId, expectedUpdatedAt and proposal only.");
  bodyObject(body.proposal);
  if (Object.keys(body.proposal).some((key) => !SCHEDULE_FIELDS.includes(key))) invalid("Unknown simulation proposal field.");
  const bookingId = body.bookingId === undefined ? undefined : integer(body.bookingId, "bookingId", 1);
  if (bookingId !== undefined) text(body.expectedUpdatedAt, "expectedUpdatedAt", 40);
  else if (body.expectedUpdatedAt !== undefined) invalid("expectedUpdatedAt requires a bookingId.");
  return repo.readTransaction(() => {
    const original = bookingId === undefined ? null : confirmed(repo, bookingId, body.expectedUpdatedAt);
    const input = normalizeSchedule({ ...original, ...body.proposal });
    const proposal = { ...input, startTime: minutesToTime(input.startMinute), endTime: minutesToTime(input.endMinute) };
    const venues = repo.venues();
    if (!venues.some((v) => v.id === input.preferredVenueId)) invalid("Selected venue does not exist.");
    const reservations = repo.reservations(input, bookingId ?? null);
    const allocation = allocate(input, venues, reservations);
    const preferredVenueReasons = allocation.allocatedVenueId === input.preferredVenueId ? [] :
      allocate(input, venues.filter((v) => v.id === input.preferredVenueId), reservations).reasons;
    const comparison = original ? [...SCHEDULE_FIELDS, "allocatedVenueId", "hallId"].map((field) => ({
      field, before: original[field], after: Object.hasOwn(proposal, field) ? proposal[field] : allocation[field],
    })).filter((entry) => entry.before !== entry.after) : [];
    return { provisional: true, original, proposal, feasible: allocation.feasible, allocation,
      preferredVenueReasons, changes: comparison,
      overlappingReservations: reservations.filter((b) => b.allocatedVenueId === input.preferredVenueId)
        .map((b) => ({ id: b.id, hallId: b.hallId, eventName: b.eventName,
          reservedStartMinute: b.reservedStartMinute, reservedEndMinute: b.reservedEndMinute })),
      message: "Simulation only. No records or resources have been changed. Applying requires current availability to be checked again." };
  });
}
