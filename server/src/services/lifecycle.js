import { allocate } from "./scheduler.js";
import { AppError, invalid } from "../utils/errors.js";
import { bodyObject } from "../utils/validation.js";
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
function confirmed(repo, id, expectedUpdatedAt) {
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
          (key) => !fields.includes(key) && key !== "expectedUpdatedAt",
        )
      )
        invalid(
          "Rescheduling accepts scheduling fields and expectedUpdatedAt only.",
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
        if (!repo.venue(input.preferredVenueId))
          invalid("Selected venue does not exist.");
        const decision = allocate(
          input,
          repo.venues(),
          repo.reservations(input, id),
        );
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
