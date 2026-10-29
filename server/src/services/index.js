import { allocate } from "./scheduler.js";
import { AppError, invalid } from "../utils/errors.js";
import { bodyObject, integer, text, statuses } from "../utils/validation.js";
import { reservationInterval, validateDate } from "../utils/time.js";
export function createService(repo) {
  return {
    health() {
      repo.health();
      return { status: "ok", database: "ok" };
    },
    clients: () => repo.clients(),
    venues: () => repo.venues(),
    createClient(body) {
      bodyObject(body);
      const name = text(body.name, "Name", 120);
      const email =
        body.email === undefined || body.email === null || body.email === ""
          ? null
          : text(body.email, "Email", 254);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        invalid("Email must be a valid email address.");
      const phone =
        body.phone === undefined || body.phone === null || body.phone === ""
          ? null
          : text(body.phone, "Phone", 40);
      return repo.createClient({ name, email, phone });
    },
    createBooking(body) {
      const input = normalizeBooking(body);
      return repo.transaction(() => {
        if (!repo.client(input.clientId))
          invalid("Selected client does not exist.");
        if (!repo.venue(input.preferredVenueId))
          invalid("Selected venue does not exist.");
        const decision = allocate(
          input,
          repo.venues(),
          repo.reservations(input),
        );
        return repo.createBooking({
          ...input,
          status: decision.status,
          hallId: decision.hallId,
          allocatedVenueId: decision.allocatedVenueId,
          rejectionReason: decision.feasible
            ? null
            : decision.reasons.map((r) => r.message).join(" "),
          reasonDetails: JSON.stringify(decision.reasons),
        });
      });
    },
    checkAvailability(body) {
      const input = normalizeBooking(body);
      return repo.readTransaction(() => {
        if (!repo.client(input.clientId))
          invalid("Selected client does not exist.");
        if (!repo.venue(input.preferredVenueId))
          invalid("Selected venue does not exist.");
        return {
          ...allocate(input, repo.venues(), repo.reservations(input)),
          snapshot: true,
          message:
            "Availability snapshot only; submission rechecks and reserves atomically.",
        };
      });
    },
    bookings(query) {
      const date =
        query.date === undefined ? undefined : validateDate(query.date);
      const status = query.status;
      if (status !== undefined && !statuses.includes(status))
        invalid(`Status must be one of: ${statuses.join(", ")}.`);
      return repo.bookings({ date, status });
    },
    booking(id) {
      const record = repo.booking(id);
      if (!record)
        throw new AppError(404, "NOT_FOUND", "Event request not found.");
      return record;
    },
  };
}

export function normalizeBooking(body) {
  bodyObject(body);
  return {
    clientId: integer(body.clientId, "clientId", 1),
    eventName: text(body.eventName, "Event name", 160),
    eventDate: validateDate(body.eventDate),
    ...reservationInterval(body.startTime, body.endTime),
    attendees: integer(body.attendees, "Attendees", 1),
    preferredVenueId: integer(body.preferredVenueId, "preferredVenueId", 1),
    projectorsRequired: integer(body.projectorsRequired, "Projectors"),
    audioRequired: integer(body.audioRequired, "Audio systems"),
    staffRequired: integer(body.staffRequired, "Staff"),
  };
}
