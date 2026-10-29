import { lifecycle } from "./lifecycle.js";
import { resourceAnalytics } from "./analytics.js";
import { simulate } from "./simulation.js";
import { normalizeSchedule, recommendationService } from "./recommendations.js";
import { confirmationKey, requireSelectedVenue, selectedVenue } from "./selection.js";
import { createHash } from "node:crypto";
import { venueNow } from "../utils/venueClock.js";
import { allocate } from "./scheduler.js";
import { AppError, invalid } from "../utils/errors.js";
import {
  bodyObject,
  integer,
  text,
  statuses,
  idParam,
} from "../utils/validation.js";
import { validateDate } from "../utils/time.js";
export function createService(repo) {
  return {
    ...lifecycle(repo, normalizeBooking),
    recommendations: recommendationService(repo),
    resourceAnalytics: (query) => resourceAnalytics(repo, query),
    simulation: (body) => simulate(repo, body),
    dashboard: () => repo.readTransaction(() => repo.dashboard(venueNow())),
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
      const venueId = selectedVenue(body.selectedVenueId, input.preferredVenueId);
      const key = confirmationKey(body, venueId);
      const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      return repo.transaction(() => {
        const previous = key && repo.confirmation(key);
        if (previous) {
          if (previous.requestFingerprint !== fingerprint)
            throw new AppError(409, "CONFIRMATION_KEY_REUSED", "This confirmation key was already used for a different request.");
          return repo.booking(previous.bookingId);
        }
        if (!repo.client(input.clientId))
          invalid("Selected client does not exist.");
        if (!repo.venue(input.preferredVenueId))
          invalid("Selected venue does not exist.");
        const decision = allocate(
          input,
          repo.venues().filter((v) => venueId === undefined || v.id === venueId),
          repo.reservations(input),
        );
        requireSelectedVenue(decision, venueId);
        const booking = repo.createBooking({
          ...input,
          status: decision.status,
          hallId: decision.hallId,
          allocatedVenueId: decision.allocatedVenueId,
          rejectionReason: decision.feasible
            ? null
            : decision.reasons.map((r) => r.message).join(" "),
          reasonDetails: JSON.stringify(decision.reasons),
        });
        if (key) repo.saveConfirmation(key, fingerprint, booking.id);
        return booking;
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
      const venueId =
        query.venueId === undefined ? undefined : idParam(query.venueId);
      return repo.bookings({ date, status, venueId });
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
    ...normalizeSchedule(body),
  };
}
