import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
import { resourceSegments } from "../src/services/resourceSweep.js";
import { createApp } from "../src/app.js";
import { authenticatedHeaders } from "../test-support/auth.js";
import { createDemo } from "../test-support/demo-scenarios.js";

const input = { clientId: 1, eventName: "Intelligence event", eventDate: "2095-05-01",
  startTime: "10:00", endTime: "11:00", attendees: 120, preferredVenueId: 1,
  projectorsRequired: 1, audioRequired: 1, staffRequired: 2 };
const schedule = (value) => Object.fromEntries(["eventDate", "startTime", "endTime", "attendees", "preferredVenueId",
  "projectorsRequired", "audioRequired", "staffRequired"].map((key) => [key, value[key]]));
function setup(t) {
  const db = openDatabase(":memory:"), repo = createRepository(db), service = createService(repo);
  service.createClient({ name: "Intelligence test client" });
  t.after(() => db.close());
  return { db, repo, service };
}
function snapshot(db) {
  return ["clients", "venues", "halls", "bookings", "recommendation_confirmations"]
    .map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
}
const analytics = (service, overrides = {}) => service.resourceAnalytics({ venueId: "1", date: input.eventDate, ...overrides });
const usageAt = (data, minute, key = "projectorsRequired") => data.segments.find((s) => s.startMinute <= minute && minute < s.endMinute)?.usage[key] ?? 0;

test("all deterministic demo scenarios execute against an isolated database", () => {
  const db = openDatabase(":memory:");
  try {
    const manifest = createDemo(db);
    assert.equal(manifest.date, "2030-03-20");
    assert.equal(manifest.counts.REJECTED, 1); assert.equal(manifest.counts.CANCELLED, 1);
    assert.ok(manifest.counts.CONFIRMED >= 10);
    assert.throws(() => createDemo(db), /empty client dataset/);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); }
});

test("analytics returns exact inventory and empty operating window without writes", (t) => {
  const { service, db } = setup(t);
  const before = snapshot(db), data = analytics(service);
  assert.equal(data.venue.name, "Venue A");
  assert.deepEqual(data.resources.map((r) => r.inventory), [2, 2, 5]);
  assert.equal(data.confirmedEventCount, 0); assert.equal(data.halls.length, 2);
  assert.deepEqual(data.segments, [{ startMinute: 480, endMinute: 1320,
    usage: { projectorsRequired: 0, audioRequired: 0, staffRequired: 0 } }]);
  assert.ok(data.resources.every((r) => r.peak === 0 && !r.peakIntervals.length && !r.fullyUtilizedIntervals.length));
  assert.deepEqual(snapshot(db), before);
});

test("analytics uses buffered concurrent peaks across halls and half-open adjacency", (t) => {
  const { service, db } = setup(t);
  const a = service.createBooking(input);
  const b = service.createBooking({ ...input, attendees: 50, staffRequired: 3 });
  const c = service.createBooking({ ...input, startTime: "12:00", endTime: "13:00" });
  const before = snapshot(db), data = analytics(service);
  assert.equal(data.confirmedEventCount, 3);
  assert.notEqual(a.hallId, b.hallId); assert.equal(c.hallId, a.hallId);
  assert.deepEqual(data.resources.map((r) => r.peak), [2, 2, 5]);
  assert.deepEqual(data.resources[0].peakIntervals, [{ startMinute: 570, endMinute: 690 }]);
  assert.deepEqual(data.resources[0].fullyUtilizedIntervals, [{ startMinute: 570, endMinute: 690 }]);
  assert.equal(usageAt(data, 569), 0); assert.equal(usageAt(data, 570), 2);
  assert.equal(usageAt(data, 689), 2); assert.equal(usageAt(data, 690), 1);
  assert.equal(usageAt(data, 810), 0); assert.equal(usageAt(data, 1320), 0);
  for (const resource of data.resources) for (const segment of data.segments)
    assert.ok(segment.usage[resource.key] <= resource.inventory);
  assert.deepEqual(snapshot(db), before);
});

test("non-confirmed history and other dates/venues never consume analytics inventory", (t) => {
  const { service, db } = setup(t);
  const cancelled = service.createBooking(input); service.cancelBooking(cancelled.id);
  service.createBooking({ ...input, attendees: 999 });
  const pending = service.createBooking(input);
  db.prepare("UPDATE bookings SET status='PENDING',hall_id=NULL,allocated_venue_id=NULL WHERE id=?").run(pending.id);
  service.createBooking({ ...input, preferredVenueId: 2 });
  service.createBooking({ ...input, eventDate: "2095-05-02" });
  const data = analytics(service);
  assert.equal(data.confirmedEventCount, 0); assert.equal(data.resources[0].peak, 0);
  assert.equal(analytics(service, { venueId: "2" }).confirmedEventCount, 1);
  assert.equal(analytics(service, { date: "2095-05-02" }).confirmedEventCount, 1);
});

test("zero inventory is not described as full utilization; inconsistent data is exposed", (t) => {
  const { service, db } = setup(t);
  db.prepare("UPDATE venues SET total_projectors=0 WHERE id=1").run();
  assert.deepEqual(analytics(service).resources[0].fullyUtilizedIntervals, []);
  db.prepare("UPDATE venues SET total_projectors=2 WHERE id=1").run();
  service.createBooking(input);
  db.prepare("UPDATE venues SET total_projectors=0 WHERE id=1").run();
  assert.equal(analytics(service).resources[0].overInventory, true);
  assert.equal(analytics(service).resources[0].availableAtPeak, -1);
});

test("shared sweep aggregates simultaneous starts/ends and clips boundaries", () => {
  const booking = (start, end, count) => ({ reservedStartMinute: start, reservedEndMinute: end,
    projectorsRequired: count, audioRequired: count, staffRequired: count });
  const segments = resourceSegments([booking(450, 600, 2), booking(600, 1400, 1)], 480, 1320);
  assert.deepEqual(segments.map((s) => [s.startMinute, s.endMinute, s.usage.projectorsRequired]), [[480, 600, 2], [600, 1320, 1]]);
});

test("new simulation reuses preferred/smallest-hall policy without any writes", (t) => {
  const { service, db } = setup(t), before = snapshot(db);
  const result = service.simulation({ proposal: schedule(input) });
  assert.equal(result.provisional, true); assert.equal(result.original, null); assert.equal(result.feasible, true);
  assert.equal(result.allocation.allocatedVenueId, 1); assert.equal(result.allocation.hallName, "Hall A2");
  assert.equal(result.proposal.reservedStartMinute, 570); assert.equal(result.proposal.reservedEndMinute, 690);
  assert.deepEqual(snapshot(db), before);
});

test("trusted existing simulation excludes only itself, reports changes and leaves original intact", (t) => {
  const { service, db } = setup(t), original = service.createBooking(input), before = snapshot(db);
  const same = service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt, proposal: {} });
  assert.equal(same.allocation.hallId, original.hallId); assert.deepEqual(same.changes, []);
  const moved = service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt,
    proposal: { eventDate: "2095-06-02", startTime: "14:00", endTime: "16:00", attendees: 50, staffRequired: 1, preferredVenueId: 2 } });
  assert.equal(moved.feasible, true); assert.equal(moved.allocation.hallName, "Hall B1");
  assert.ok(moved.changes.some((c) => c.field === "eventDate" && c.before === input.eventDate && c.after === "2095-06-02"));
  assert.deepEqual(snapshot(db), before); assert.deepEqual(service.booking(original.id), original);
});

test("other reservations constrain existing simulation and explain preferred-venue fallback", (t) => {
  const { service, db } = setup(t), original = service.createBooking(input);
  const blocker = service.createBooking({ ...input, eventDate: "2095-05-02" });
  const before = snapshot(db);
  const result = service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt, proposal: { eventDate: blocker.eventDate } });
  assert.equal(result.feasible, true); assert.equal(result.allocation.allocatedVenueId, 2);
  assert.ok(result.preferredVenueReasons.some((r) => r.code === "HALL_TIME_CONFLICT"));
  assert.equal(result.overlappingReservations[0].id, blocker.id);
  assert.deepEqual(snapshot(db), before);
});

for (const [field, value, code] of [["attendees", 251, "INSUFFICIENT_HALL_CAPACITY"], ["projectorsRequired", 4, "INSUFFICIENT_PROJECTORS"],
  ["audioRequired", 3, "INSUFFICIENT_AUDIO"], ["staffRequired", 7, "INSUFFICIENT_STAFF"]]) {
  test(`infeasible ${field} simulation explains the actual constraint without mutation`, (t) => {
    const { service, db } = setup(t), original = service.createBooking(input), before = snapshot(db);
    const result = service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt, proposal: { [field]: value } });
    assert.equal(result.feasible, false); assert.ok(result.allocation.reasons.some((r) => r.code === code));
    assert.deepEqual(snapshot(db), before);
  });
}

test("simulation validation rejects exclusion tricks, malformed fields, bad intervals and stale context", async (t) => {
  const { service, db } = setup(t), original = service.createBooking(input), before = snapshot(db);
  const cases = [null, [], {}, { proposal: [] }, { proposal: schedule(input), excludeBookingId: original.id },
    { proposal: { ...schedule(input), hallId: 1 } }, { proposal: schedule(input), bookingId: "1", expectedUpdatedAt: original.updatedAt },
    { proposal: {}, bookingId: original.id }, { proposal: schedule(input), expectedUpdatedAt: original.updatedAt },
    ...[["eventDate", "2095-02-29"], ["startTime", "08:00"], ["endTime", "22:00"], ["endTime", "09:00"],
      ["attendees", 0], ["projectorsRequired", -1], ["staffRequired", 1.5], ["preferredVenueId", 99]]
      .map(([key, value]) => ({ proposal: { ...schedule(input), [key]: value } }))];
  for (const [index, body] of cases.entries()) await t.test(`invalid simulation ${index}`, () => assert.throws(() => service.simulation(body)));
  assert.throws(() => service.simulation({ bookingId: 999, expectedUpdatedAt: "x", proposal: {} }), { code: "NOT_FOUND" });
  assert.throws(() => service.simulation({ bookingId: original.id, expectedUpdatedAt: "stale", proposal: {} }), { code: "STALE_BOOKING" });
  assert.deepEqual(snapshot(db), before);
  service.cancelBooking(original.id);
  assert.throws(() => service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt, proposal: {} }), { code: "INVALID_STATE" });
});

test("stale simulation cannot create a conflicting selected booking or change an original", (t) => {
  const { service } = setup(t), original = service.createBooking(input);
  const result = service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt, proposal: { eventDate: "2095-05-02" } });
  service.createBooking({ ...input, eventDate: result.proposal.eventDate });
  assert.throws(() => service.rescheduleBooking(original.id, { ...schedule(result.proposal), selectedVenueId: 1, expectedUpdatedAt: original.updatedAt }), { code: "ALTERNATIVE_UNAVAILABLE" });
  assert.deepEqual(service.booking(original.id), original);
  assert.throws(() => service.createBooking({ ...input, ...schedule(result.proposal), selectedVenueId: 1, confirmationKey: "stale-simulation" }), { code: "ALTERNATIVE_UNAVAILABLE" });
  const success = service.rescheduleBooking(original.id, { eventDate: "2095-05-03", expectedUpdatedAt: original.updatedAt, selectedVenueId: 1 });
  assert.equal(success.id, original.id); assert.equal(success.eventDate, "2095-05-03");
  assert.throws(() => service.simulation({ bookingId: original.id, expectedUpdatedAt: original.updatedAt, proposal: {} }), { code: "STALE_BOOKING" });
});

test("confirmation retries after reschedule/cancellation return current record and never restore old allocation", (t) => {
  const { service, db } = setup(t), body = { ...input, selectedVenueId: 1, confirmationKey: "lifecycle-retry" };
  const original = service.createBooking(body);
  const moved = service.rescheduleBooking(original.id, { eventDate: "2095-05-03" });
  assert.deepEqual(service.createBooking(body), moved);
  const cancelled = service.cancelBooking(original.id);
  assert.deepEqual(service.createBooking(body), cancelled);
  const before = snapshot(db);
  assert.throws(() => service.createBooking({ ...body, attendees: 50 }), { code: "CONFIRMATION_KEY_REUSED" });
  assert.deepEqual(snapshot(db), before); assert.equal(service.bookings({}).length, 1);
});

test("real analytics/simulation API envelopes, invalid input, stale IDs and DB failure", async (t) => {
  const { db, service } = setup(t), original = service.createBooking(input);
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const headers = await authenticatedHeaders(db, `http://127.0.0.1:${server.address().port}`);
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, body === undefined ? { headers } : {
      method: "POST", headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request(`/analytics/resources?venueId=1&date=${input.eventDate}`)).body.data.confirmedEventCount, 1);
    assert.equal((await request(`/analytics/resources?venueId=999&date=${input.eventDate}`)).status, 404);
    for (const path of ["/analytics/resources", "/analytics/resources?venueId=1%20OR%201=1&date=2095-05-01", "/analytics/resources?venueId=1&date=invalid"])
      assert.equal((await request(path)).status, 400);
    assert.equal((await request("/simulation", { proposal: schedule(input) })).body.data.feasible, true);
    assert.equal((await request("/simulation", { proposal: { ...schedule(input), attendees: 251 } })).body.data.feasible, false);
    assert.equal((await request("/simulation", { bookingId: 999, expectedUpdatedAt: "x", proposal: {} })).status, 404);
    assert.equal((await request("/simulation", { bookingId: original.id, expectedUpdatedAt: "stale", proposal: {} })).status, 409);
    assert.equal((await request("/simulation", {})).status, 400);
    db.exec("ALTER TABLE bookings RENAME TO unavailable_bookings");
    try {
      for (const [path, body] of [[`/analytics/resources?venueId=1&date=${input.eventDate}`, undefined], ["/simulation", { proposal: schedule(input) }]]) {
        const failure = await request(path, body); assert.equal(failure.status, 500);
        assert.equal(failure.body.error.code, "INTERNAL_ERROR"); assert.equal(failure.body.data, undefined);
      }
    } finally { db.exec("ALTER TABLE unavailable_bookings RENAME TO bookings"); }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
