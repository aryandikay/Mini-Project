import assert from "node:assert/strict";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";

// This builder only accepts an empty dataset; the CLI decides which dedicated DB to reset.
export function createDemo(db) {
  const service = createService(createRepository(db));
  assert.equal(service.clients().length, 0, "Demo builder requires an empty client dataset.");
  assert.equal(service.bookings({}).length, 0, "Demo builder requires an empty booking dataset.");
  const client = service.createClient({ name: "Campus Demo Society", email: "demo@example.com" });
  const venues = service.venues();
  const venueId = (name) => venues.find((venue) => venue.name === name).id;
  const request = { clientId: client.id, eventName: "Campus conference", eventDate: "2030-03-20",
    startTime: "10:00", endTime: "12:00", attendees: 120, preferredVenueId: venueId("Venue A"),
    projectorsRequired: 1, audioRequired: 1, staffRequired: 2 };
  const conference = service.createBooking(request);
  assert.equal(conference.hallName, "Hall A2");
  const workshop = service.createBooking({ ...request, eventName: "Parallel workshop", attendees: 50, staffRequired: 3 });
  assert.equal(workshop.hallName, "Hall A1");
  const fallback = service.createBooking({ ...request, eventName: "Hall conflict fallback" });
  assert.equal(fallback.allocatedVenueName, "Venue B");
  service.createBooking({ ...request, eventName: "Equipment-intensive lab", eventDate: "2030-03-21",
    attendees: 50, projectorsRequired: 2, audioRequired: 0, staffRequired: 0 });
  const resourceFallback = service.createBooking({ ...request, eventName: "Shared projector fallback", eventDate: "2030-03-21" });
  assert.equal(resourceFallback.allocatedVenueName, "Venue B");
  service.createBooking({ ...request, eventName: "Buffered morning event", eventDate: "2030-03-22" });
  const bufferFallback = service.createBooking({ ...request, eventName: "Setup overlaps cleanup", eventDate: "2030-03-22", startTime: "12:30", endTime: "13:30" });
  assert.equal(bufferFallback.allocatedVenueName, "Venue B");
  service.createBooking({ ...request, eventName: "All-day exhibition", preferredVenueId: venueId("Venue C"), attendees: 250,
    startTime: "08:30", endTime: "21:30", projectorsRequired: 0, audioRequired: 0, staffRequired: 0 });
  const rejectedInput = { ...request, eventName: "Large event seeking alternatives", attendees: 250, preferredVenueId: venueId("Venue C") };
  const rejected = service.createBooking(rejectedInput);
  assert.equal(rejected.status, "REJECTED");
  const recommendations = service.recommendations({ ...rejectedInput, search: { searchDays: 2 } });
  const alternative = recommendations.recommendations[0];
  assert.equal(alternative.eventDate, "2030-03-21");
  const accepted = service.createBooking({ ...rejectedInput, eventDate: alternative.eventDate,
    startTime: alternative.startTime, endTime: alternative.endTime, preferredVenueId: alternative.venueId,
    selectedVenueId: alternative.venueId, confirmationKey: "demo-alternative" });
  assert.equal(accepted.status, "CONFIRMED"); assert.deepEqual(service.booking(rejected.id), rejected);
  const toCancel = service.createBooking({ ...request, eventName: "Cancelled seminar", eventDate: "2030-03-23" });
  const cancelled = service.cancelBooking(toCancel.id);
  const released = service.createBooking({ ...request, eventName: "Reused released capacity", eventDate: "2030-03-23" });
  assert.equal(released.hallId, toCancel.hallId);
  const moved = service.rescheduleBooking(released.id, { eventDate: "2030-03-24", expectedUpdatedAt: released.updatedAt });
  assert.equal(moved.id, released.id);
  assert.throws(() => service.rescheduleBooking(moved.id, { attendees: 999, expectedUpdatedAt: moved.updatedAt }), { code: "RESCHEDULE_INFEASIBLE" });
  assert.deepEqual(service.booking(moved.id), moved);
  const analytics = service.resourceAnalytics({ venueId: String(venueId("Venue A")), date: request.eventDate });
  assert.deepEqual(analytics.resources.map((r) => r.peak), [2, 2, 5]);
  const simulation = service.simulation({ bookingId: conference.id, expectedUpdatedAt: conference.updatedAt,
    proposal: { startTime: "15:00", endTime: "17:00" } });
  assert.equal(simulation.feasible, true); assert.deepEqual(service.booking(conference.id), conference);
  return { date: request.eventDate, clientId: client.id, conferenceId: conference.id, workshopId: workshop.id,
    fallbackId: fallback.id, resourceFallbackId: resourceFallback.id, bufferFallbackId: bufferFallback.id,
    rejectedId: rejected.id, acceptedAlternativeId: accepted.id, cancelledId: cancelled.id,
    rescheduledId: moved.id, counts: service.dashboard().counts };
}
