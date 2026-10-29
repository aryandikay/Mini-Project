import assert from "node:assert/strict";
import { createRepository } from "../repositories/index.js";
import { createService } from "../services/index.js";

export const DEMO_DATE = "2030-04-15";
// Caller supplies an empty, explicitly selected demo DB. All decisions use normal services.
export function loadDemo(db) {
  return db
    .transaction(() => {
      const service = createService(createRepository(db));
      const client = service.createClient({
        name: "Campus Events Team",
        email: "events@example.edu",
        phone: "+91 90000 00000",
      });
      const venues = service.venues();
      const venueId = (name) => venues.find((v) => v.name === name).id;
      const base = {
        clientId: client.id,
        eventName: "Conference",
        eventDate: DEMO_DATE,
        startTime: "10:00",
        endTime: "13:00",
        attendees: 120,
        preferredVenueId: venueId("Venue A"),
        projectorsRequired: 1,
        audioRequired: 0,
        staffRequired: 3,
      };
      const conference = service.createBooking(base);
      const workshop = service.createBooking({
        ...base,
        eventName: "Workshop",
        startTime: "11:00",
        endTime: "14:00",
        attendees: 50,
        staffRequired: 2,
      });
      assert.equal(conference.hallName, "Hall A2");
      assert.equal(workshop.hallName, "Hall A1");
      const fallback = service.createBooking({
        ...base,
        eventName: "Buffered conflict → alternative venue",
        startTime: "13:15",
        endTime: "15:15",
        attendees: 100,
      });
      assert.equal(fallback.allocatedVenueName, "Venue B");
      const shortage = service.createBooking({
        ...base,
        eventName: "Staff shortage — inspect reasons",
        staffRequired: 7,
      });
      assert.equal(shortage.status, "REJECTED");
      const blocker = service.createBooking({
        ...base,
        eventName: "Large hall session",
        preferredVenueId: venueId("Venue C"),
        attendees: 250,
        endTime: "12:00",
      });
      const rejected = service.createBooking({
        ...base,
        eventName: "Buffer conflict — find alternatives",
        preferredVenueId: venueId("Venue C"),
        attendees: 250,
        startTime: "12:15",
        endTime: "13:15",
      });
      assert.equal(blocker.status, "CONFIRMED");
      assert.equal(rejected.status, "REJECTED");
      const before = service.booking(conference.id);
      assert.throws(
        () => service.rescheduleBooking(conference.id, { attendees: 999 }),
        (e) => e.code === "RESCHEDULE_INFEASIBLE",
      );
      assert.deepEqual(service.booking(conference.id), before);
      const evening = {
        ...base,
        eventName: "Cancelled evening session",
        attendees: 50,
        startTime: "17:00",
        endTime: "18:00",
        projectorsRequired: 2,
        audioRequired: 2,
        staffRequired: 5,
      };
      const cancelled = service.createBooking(evening);
      service.cancelBooking(cancelled.id);
      const replacement = service.createBooking({
        ...evening,
        eventName: "Released resources reused",
      });
      assert.equal(replacement.hallId, cancelled.hallId);
      assert.equal(replacement.status, "CONFIRMED");
      const moved = service.rescheduleBooking(replacement.id, {
        startTime: "18:00",
        endTime: "19:00",
      });
      assert.equal(moved.startTime, "18:00");
      const alternatives = service.recommendations({
        request: {
          ...base,
          preferredVenueId: venueId("Venue C"),
          attendees: 250,
          startTime: "12:15",
          endTime: "13:15",
        },
      });
      assert.ok(alternatives.count > 0);
      return {
        date: DEMO_DATE,
        conferenceId: conference.id,
        workshopId: workshop.id,
        fallbackId: fallback.id,
        resourceRejectionId: shortage.id,
        recommendationRequestId: rejected.id,
        cancelledId: cancelled.id,
        rescheduledId: moved.id,
        recommendations: alternatives.count,
        failedReschedulePreserved: true,
      };
    })
    .immediate();
}
