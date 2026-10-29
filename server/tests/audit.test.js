import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
import {
  databaseViolations,
  assertDatabaseInvariants,
} from "../test-support/invariants.js";
const request = {
  clientId: 1,
  eventName: "Audit",
  eventDate: "2099-06-01",
  startTime: "10:00",
  endTime: "11:00",
  attendees: 50,
  preferredVenueId: 1,
  projectorsRequired: 1,
  audioRequired: 1,
  staffRequired: 2,
};
function setup(t) {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const service = createService(createRepository(db));
  service.createClient({ name: "Audit" });
  return { db, service };
}

test("independent invariant checker detects actual database violations without repair", (t) => {
  const { db, service } = setup(t);
  const a = service.createBooking(request),
    b = service.createBooking({
      ...request,
      startTime: "13:00",
      endTime: "14:00",
    });
  assertDatabaseInvariants(db);
  db.prepare(
    "UPDATE bookings SET start_minute=600,end_minute=660,reserved_start_minute=570,reserved_end_minute=690,attendees=999,projectors_required=99 WHERE id=?",
  ).run(b.id);
  const before = db.prepare("SELECT * FROM bookings").all();
  const errors = databaseViolations(db).join(" ");
  assert.match(errors, /hall capacity/);
  assert.match(errors, /hall exclusivity/);
  assert.match(errors, /projectorsRequired/);
  assert.deepEqual(db.prepare("SELECT * FROM bookings").all(), before);
  assert.equal(a.hallId, b.hallId);
});

test("whole database invariants hold after a deterministic mix of creates, previews, cancellations and reschedules", (t) => {
  const { db, service } = setup(t);
  let seed = 12345;
  const next = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let i = 0; i < 60; i++) {
    const start = 9 + next(10);
    service.createBooking({
      ...request,
      eventName: `Audit ${i}`,
      eventDate: `2099-06-0${1 + next(3)}`,
      startTime: `${String(start).padStart(2, "0")}:00`,
      endTime: `${String(start + 1).padStart(2, "0")}:00`,
      attendees: [50, 100, 200, 999][next(4)],
      preferredVenueId: 1 + next(3),
      projectorsRequired: next(4),
      audioRequired: next(3),
      staffRequired: next(7),
    });
    assertDatabaseInvariants(db);
    const confirmed = service.bookings({ status: "CONFIRMED" });
    if (confirmed.length && i % 3 === 0) {
      const b = confirmed[next(confirmed.length)];
      if (i % 2) service.cancelBooking(b.id);
      else {
        const before = service.booking(b.id);
        try {
          service.rescheduleBooking(b.id, {
            startTime: "15:00",
            endTime: "16:00",
            attendees: i % 4 ? 80 : 999,
          });
        } catch (e) {
          assert.equal(e.code, "RESCHEDULE_INFEASIBLE");
          assert.deepEqual(service.booking(b.id), before);
        }
      }
      assertDatabaseInvariants(db);
    }
    if (i % 10 === 0) {
      const changes = db.prepare("SELECT total_changes() n").get().n;
      service.checkAvailability(request);
      service.recommendations({ request });
      assert.equal(db.prepare("SELECT total_changes() n").get().n, changes);
      assertDatabaseInvariants(db);
    }
  }
});
