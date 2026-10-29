import { allocate } from "./scheduler.js";
import { findRecommendations, searchOptions } from "./recommendations.js";
import { selectedVenue, requireSelectedVenue } from "./selection.js";
import { AppError, invalid } from "../utils/errors.js";
import { bodyObject, text } from "../utils/validation.js";
const fields = [
  "eventDate",
  "startTime",
  "endTime",
  "attendees",
  "preferredVenueId",
  "projectorsRequired",
  "audioRequired",
  "staffRequired",
];
export function confirmed(repo, id, expectedUpdatedAt) {
  const booking = repo.booking(id);
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking not found.");
  if (booking.status !== "CONFIRMED")
    throw new AppError(
      409,
      "INVALID_STATE",
      `Only confirmed bookings can be changed. Current status: ${booking.status}.`,
    );
  if (
    expectedUpdatedAt !== undefined &&
    expectedUpdatedAt !== booking.updatedAt
  )
    throw new AppError(
      409,
      "STALE_BOOKING",
      "This booking changed. Refresh its details before trying again.",
    );
  return booking;
}
function timestamp(booking) {
  return new Date(
    Math.max(Date.now(), Date.parse(booking.updatedAt) + 1),
  ).toISOString();
}
function checkedWrite(result) {
  if (result.changes !== 1)
    throw new AppError(
      409,
      "STALE_BOOKING",
      "Booking changed during this operation. Refresh and try again.",
    );
}
export function lifecycle(repo, normalize) {
  return {
    rescheduleRecommendations(id, body) {
      bodyObject(body);
      if (Object.keys(body).some((key) => !fields.includes(key) && !["expectedUpdatedAt", "search"].includes(key)))
        invalid("Unknown rescheduling recommendation field.");
      text(body.expectedUpdatedAt, "expectedUpdatedAt", 40);
      const options = searchOptions(body.search);
      return repo.readTransaction(() => {
        const original = confirmed(repo, id, body.expectedUpdatedAt);
        const changes = Object.fromEntries(fields.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
        return findRecommendations(repo, normalize({ ...original, ...changes }), options, id);
      });
    },
    cancelBooking(id, body = {}) {
      bodyObject(body);
      if (Object.keys(body).some((key) => key !== "expectedUpdatedAt"))
        invalid("Cancellation accepts only expectedUpdatedAt.");
      return repo.transaction(() => {
        const original = confirmed(repo, id, body.expectedUpdatedAt);
        checkedWrite(
          repo.cancelBooking(id, original.updatedAt, timestamp(original)),
        );
        return repo.booking(id);
      });
    },
    rescheduleBooking(id, body) {
      bodyObject(body);
      if (
        Object.keys(body).some(
          (key) => !fields.includes(key) && !["expectedUpdatedAt", "selectedVenueId"].includes(key),
        )
      )
        invalid(
          "Rescheduling accepts scheduling fields, expectedUpdatedAt and selectedVenueId only.",
        );
      if (!fields.some((key) => Object.hasOwn(body, key)))
        invalid("Provide at least one scheduling change.");
      return repo.transaction(() => {
        const original = confirmed(repo, id, body.expectedUpdatedAt);
        const changes = Object.fromEntries(
          fields
            .filter((key) => Object.hasOwn(body, key))
            .map((key) => [key, body[key]]),
        );
        const input = normalize({ ...original, ...changes });
        const venueId = selectedVenue(body.selectedVenueId, input.preferredVenueId);
        if (!repo.venue(input.preferredVenueId))
          invalid("Selected venue does not exist.");
        const decision = allocate(
          input,
          repo.venues().filter((v) => venueId === undefined || v.id === venueId),
          repo.reservations(input, id),
        );
        requireSelectedVenue(decision, venueId);
        if (!decision.feasible) {
          const error = new AppError(
            409,
            "RESCHEDULE_INFEASIBLE",
            "Rescheduling was not accepted. The original booking is unchanged.",
          );
          error.details = {
            bookingId: id,
            originalPreserved: true,
            reasons: decision.reasons,
          };
          throw error;
        }
        checkedWrite(
          repo.rescheduleBooking({
            ...input,
            id,
            hallId: decision.hallId,
            allocatedVenueId: decision.allocatedVenueId,
            previousUpdatedAt: original.updatedAt,
            updatedAt: timestamp(original),
          }),
        );
        return repo.booking(id);
      });
    },
  };
}
