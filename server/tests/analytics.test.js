import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
import { createApp } from "../src/app.js";
import { utilization } from "../src/services/analytics.js";
const input = {
  clientId: 1,
  eventName: "Analytics",
  eventDate: "2099-07-01",
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
  const repo = createRepository(db),
    service = createService(repo);
  service.createClient({ name: "Analytics" });
  return { db, repo, service };
}
const query = {
  date: input.eventDate,
  startTime: "09:00",
  endTime: "15:00",
  venueId: "1",
};
test("analytics empty schedule and exact inventory, zero denominators have explicit null percentages", (t) => {
  const { repo, service } = setup(t);
  const data = service.utilization({ date: input.eventDate });
  assert.equal(data.durationMinutes, 840);
  assert.equal(data.venues.length, 3);
  for (const v of data.venues) {
    assert.equal(v.confirmedBookings, 0);
    for (const r of Object.values(v.resources)) {
      assert.equal(r.peak, 0);
      assert.equal(r.averageUtilizationPercent, 0);
    }
  }
  assert.deepEqual(
    data.venues.map((v) => Object.values(v.resources).map((r) => r.capacity)),
    [
      [2, 2, 5],
      [2, 1, 4],
      [3, 2, 6],
    ],
  );
  const venues = repo.venues();
  venues[0].totalProjectors = 0;
  assert.equal(
    utilization(input.eventDate, 480, 1320, venues, []).venues[0].resources
      .projectors.averageUtilizationPercent,
    null,
  );
});
test("non-overlapping and adjacent reservations do not inflate peak; weighted averages include clipped buffers", (t) => {
  const { service } = setup(t);
  service.createBooking(input);
  service.createBooking({ ...input, startTime: "12:00", endTime: "13:00" });
  const v = service.utilization(query).venues[0];
  assert.equal(v.confirmedBookings, 2);
  assert.equal(v.resources.projectors.peak, 1);
  assert.equal(v.resources.projectors.resourceMinutes, 240);
  assert.ok(
    Math.abs(v.resources.projectors.averageUtilizationPercent - 100 / 3) <
      1e-10,
  );
  assert.equal(v.resources.staff.resourceMinutes, 480);
  assert.equal(v.halls[0].occupiedMinutes, 240);
  const clipped = service.utilization({
    ...query,
    startTime: "10:00",
    endTime: "12:00",
  }).venues[0];
  assert.equal(clipped.resources.projectors.resourceMinutes, 120);
  assert.equal(clipped.resources.projectors.peak, 1);
  assert.equal(clipped.halls[0].occupancyPercent, 100);
});
test("overlapping halls produce simultaneous peak; cancelled and rejected excluded; reschedule moves analytics", (t) => {
  const { db, service } = setup(t);
  const a = service.createBooking(input);
  const b = service.createBooking({ ...input, attendees: 120 });
  service.createBooking({ ...input, attendees: 999 });
  let v = service.utilization(query).venues[0];
  assert.equal(v.resources.projectors.peak, 2);
  assert.equal(v.resources.audioSystems.peak, 2);
  assert.equal(v.resources.staff.peak, 4);
  assert.equal(v.confirmedBookings, 2);
  assert.equal(v.resources.projectors.peakPercent, 100);
  service.cancelBooking(a.id);
  assert.equal(
    service.utilization(query).venues[0].resources.projectors.peak,
    1,
  );
  service.rescheduleBooking(b.id, { eventDate: "2099-07-02" });
  assert.equal(service.utilization(query).venues[0].confirmedBookings, 0);
  assert.equal(
    service.utilization({ ...query, date: "2099-07-02" }).venues[0]
      .confirmedBookings,
    1,
  );
  const before = db.prepare("SELECT total_changes() n").get().n;
  service.utilization(query);
  assert.equal(db.prepare("SELECT total_changes() n").get().n, before);
});
test("analytics rejects malformed/unbounded queries", (t) => {
  const { service } = setup(t);
  for (const q of [
    {},
    { date: "2099-02-30" },
    { ...query, startTime: "07:59" },
    { ...query, endTime: "22:01" },
    { ...query, endTime: "09:00" },
    { ...query, venueId: "999" },
    { ...query, venueId: ["1"] },
    { ...query, date: ["2099-07-01"] },
    { ...query, unknown: "x" },
  ])
    assert.throws(
      () => service.utilization(q),
      (e) => e.status === 400,
    );
});
test("analytics HTTP routes return consistent live metrics and safe validation errors", async (t) => {
  const { db, service } = setup(t);
  service.createBooking(input);
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/analytics/utilization`;
  const response = await fetch(`${base}?${new URLSearchParams(query)}`);
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).data.venues[0].resources.projectors.peak,
    1,
  );
  const bad = await fetch(base);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, "VALIDATION_ERROR");
});
