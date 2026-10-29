import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
import { allocate } from "../src/services/scheduler.js";
import { normalizeSchedule, candidateDates, candidateTimes, rankRecommendations, searchOptions } from "../src/services/recommendations.js";
import { createApp } from "../src/app.js";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const request = { clientId: 1, eventName: "Alternatives", eventDate: "2099-01-01",
  startTime: "10:07", endTime: "12:07", attendees: 120, preferredVenueId: 1,
  projectorsRequired: 1, audioRequired: 1, staffRequired: 2 };
function setup(t) {
  const db = openDatabase(":memory:"), repo = createRepository(db), service = createService(repo);
  service.createClient({ name: "Recommendation client" });
  t.after(() => db.close());
  return { db, repo, service };
}
function snapshot(db) {
  return ["clients", "venues", "halls", "bookings", "recommendation_confirmations"].map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
}
function selected(original, r, key = "recommendation-test") {
  return { ...original, eventDate: r.eventDate, startTime: r.startTime, endTime: r.endTime,
    preferredVenueId: r.venueId, selectedVenueId: r.venueId, confirmationKey: key };
}

test("candidate grid preserves duration/buffers, boundaries, off-grid time, uniqueness and order", () => {
  const input = normalizeSchedule(request), times = candidateTimes(input, 15);
  assert.equal(times[0].startTime, "08:30");
  assert.equal(times.at(-1).endTime, "21:30");
  assert.ok(times.some((slot) => slot.startTime === "10:07"));
  assert.equal(new Set(times.map((s) => s.startTime)).size, times.length);
  for (const slot of times) {
    assert.equal(slot.endMinute - slot.startMinute, 120);
    assert.equal(slot.reservedStartMinute, slot.startMinute - 30);
    assert.equal(slot.reservedEndMinute, slot.endMinute + 30);
    assert.ok(slot.reservedStartMinute >= 480 && slot.reservedEndMinute <= 1320);
  }
  assert.deepEqual(times, candidateTimes(input, 15));
  assert.deepEqual(candidateTimes(normalizeSchedule({ ...request, startTime: "08:30", endTime: "21:30" }), 5)
    .map((s) => s.startTime), ["08:30"]);
  assert.throws(() => normalizeSchedule({ ...request, startTime: "08:00", endTime: "22:00" }));
  assert.throws(() => candidateTimes(input, 0));
  assert.throws(() => candidateDates(request.eventDate, 8));
});

for (const field of ["projectorsRequired", "audioRequired", "staffRequired"]) {
  test(`existing shared ${field} usage can block a free hall and is released at buffered boundaries`, (t) => {
    const { service } = setup(t);
    const total = { projectorsRequired: 2, audioRequired: 2, staffRequired: 5 }[field];
    service.createBooking({ ...request, attendees: 50, startTime: "10:00", endTime: "12:00", [field]: total });
    const result = service.recommendations({ ...request, search: { preferredVenueOnly: true, limit: 20 } });
    assert.ok(!result.recommendations.some((r) => r.startTime === request.startTime));
    assert.ok(result.recommendations.some((r) => r.startTime === "13:00"));
  });
}

async function concurrentConfirmations(path, bodies) {
  const barrier = new SharedArrayBuffer(4), flag = new Int32Array(barrier);
  const workers = bodies.map((body) => new Worker(new URL("../test-support/lifecycle-worker.js", import.meta.url), {
    workerData: { path, barrier, operation: "createBooking", body },
  }));
  const exits = workers.map((w) => new Promise((resolve, reject) => {
    w.once("error", reject);
    w.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Worker exited ${code}`)));
  }));
  const results = workers.map((w) => new Promise((resolve, reject) => {
    w.once("error", reject); w.on("message", (message) => { if (message !== "ready") resolve(message); });
  }));
  try {
    await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
      w.once("error", reject); w.once("message", resolve);
    })));
    Atomics.store(flag, 0, 1); Atomics.notify(flag, 0, workers.length);
    const completed = await Promise.all(results);
    await Promise.all(exits);
    return completed;
  } finally { await Promise.all(workers.map((w) => w.terminate())); }
}

for (const sameKey of [false, true]) {
  test(`independent connections serialize ${sameKey ? "duplicate retry keys" : "competing selected confirmations"}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "eventsync-recommendation-race-"));
    const path = join(directory, "db.sqlite"), db = openDatabase(path);
    try {
      const service = createService(createRepository(db));
      service.createClient({ name: "Concurrent recommendations" });
      const input = { ...request, attendees: 250 };
      const r = service.recommendations(input).recommendations[0];
      const results = await concurrentConfirmations(path, [
        selected(input, r, "race-key"), selected(input, r, sameKey ? "race-key" : "other-key"),
      ]);
      assert.equal(results.filter((result) => result.ok).length, sameKey ? 2 : 1);
      if (!sameKey) assert.equal(results.find((result) => !result.ok).code, "ALTERNATIVE_UNAVAILABLE");
      assert.equal(service.bookings({}).length, 1);
      assert.equal(db.prepare("SELECT count(*) n FROM recommendation_confirmations").get().n, 1);
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
}

test("calendar arithmetic covers leap day, year boundary and bounded horizon", () => {
  assert.deepEqual(candidateDates("2028-02-28", 3), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(candidateDates("2099-12-31", 2), ["2099-12-31", "2100-01-01"]);
  assert.equal(candidateDates(request.eventDate, 7).at(-1), "2099-01-07");
  assert.throws(() => candidateDates("9999-12-31", 2));
});

test("validation rejects malformed requirements and excessive configuration", async (t) => {
  const { service } = setup(t);
  const cases = [null, [], {}, ...[
    ["eventDate", "2099-02-30"], ["startTime", "25:00"], ["endTime", "10:07"],
    ["attendees", 0], ["attendees", 2.5], ["preferredVenueId", 99], ["projectorsRequired", -1],
    ["audioRequired", 1.5], ["staffRequired", "2"], ["eventDate", undefined],
  ].map(([key, value]) => ({ ...request, [key]: value })),
    ...[{ searchDays: 0 }, { searchDays: 8 }, { searchDays: 1.5 }, { limit: 0 }, { limit: 21 },
      { intervalMinutes: 0 }, { intervalMinutes: 17 }, { intervalMinutes: null }, { limit: null },
      { searchDays: null }, { preferredVenueOnly: "true" }, { bogus: true }]
      .map((search) => ({ ...request, search }))];
  for (const [index, body] of cases.entries()) await t.test(`invalid case ${index}`, () => assert.throws(() => service.recommendations(body)));
  assert.deepEqual(searchOptions(), { searchDays: 1, limit: 5, intervalMinutes: 15, preferredVenueOnly: false });
});

test("read-only deterministic search uses actual reservations and never changes history or inventory", (t) => {
  const { db, service, repo } = setup(t);
  service.createBooking({ ...request, startTime: "08:30", endTime: "21:30" });
  service.createBooking({ ...request, attendees: 999 });
  const cancelled = service.createBooking({ ...request, eventDate: "2099-01-02" });
  service.cancelBooking(cancelled.id);
  const before = snapshot(db);
  const result = service.recommendations({ ...request, search: { searchDays: 7, limit: 20 } });
  assert.deepEqual(snapshot(db), before);
  assert.deepEqual(result, service.recommendations({ ...request, search: { searchDays: 7, limit: 20 } }));
  assert.equal(result.provisional, true);
  assert.equal(result.originalAllocation.allocatedVenueId, 2);
  assert.equal(result.recommendations.length, 20);
  // A full search must discover exact-time preferred-venue results on later dates.
  assert.equal(result.recommendations[0].eventDate, "2099-01-02");
  assert.equal(result.recommendations[0].startTime, "10:07");
  for (const r of result.recommendations) {
    const input = normalizeSchedule({ ...request, ...r });
    const actual = allocate(input, repo.venues(), repo.reservations(input));
    assert.equal(actual.feasible, true);
    assert.equal(actual.allocatedVenueId, r.venueId);
    assert.equal(actual.hallId, r.hallId);
    assert.equal(r.attendees, request.attendees);
    assert.equal(r.staffRequired, request.staffRequired);
    assert.match(r.explanation, /snapshot/);
  }
});

test("lexicographic ranking, stable ties, deduplication and result limits", () => {
  const base = { preferredVenuePreserved: true, originalDatePreserved: true, timeDifferenceMinutes: 0,
    hallCapacity: 150, venueId: 1, hallId: 2, eventDate: "2099-01-01", startTime: "10:00", endTime: "12:00" };
  const preferredNextDay = { ...base, originalDatePreserved: false, eventDate: "2099-01-02" };
  const otherVenue = { ...base, preferredVenuePreserved: false, venueId: 2 };
  const later = { ...base, startTime: "10:15", endTime: "12:15", timeDifferenceMinutes: 15 };
  const earlier = { ...base, startTime: "09:45", endTime: "11:45", timeDifferenceMinutes: -15 };
  const values = [otherVenue, preferredNextDay, later, earlier, base, { ...base }];
  assert.deepEqual(rankRecommendations(values, 20), [base, earlier, later, preferredNextDay, otherVenue]);
  assert.deepEqual(rankRecommendations(values.reverse(), 2), [base, earlier]);
  const small = { ...base, hallCapacity: 100, hallId: 4 };
  const idTie = { ...base, hallId: 3 };
  assert.deepEqual(rankRecommendations([idTie, base, small], 3), [small, base, idTie]);
});

test("preferred venue, smallest hall and existing same-time fallback are accurately identified", (t) => {
  const { service } = setup(t);
  const initial = service.recommendations(request).recommendations[0];
  assert.equal(initial.venueId, 1); assert.equal(initial.hallName, "Hall A2");
  assert.equal(initial.sameAsOriginalAllocation, true);
  service.createBooking(request);
  const result = service.recommendations({ ...request, search: { intervalMinutes: 60, limit: 20 } });
  const fallback = result.recommendations.find((r) => r.startTime === request.startTime);
  assert.equal(fallback.venueId, 2); assert.equal(fallback.sameAsOriginalAllocation, true);
});

test("reservation boundary adjacency and buffered hall conflict affect candidates", (t) => {
  const { service } = setup(t);
  service.createBooking({ ...request, startTime: "10:00", endTime: "12:00" });
  const result = service.recommendations({ ...request, startTime: "13:00", endTime: "15:00",
    search: { preferredVenueOnly: true, limit: 20 } });
  assert.equal(result.recommendations[0].startTime, "13:00");
  assert.ok(!result.recommendations.some((r) => r.startTime === "12:45"));
});

for (const [field, demand] of [["projectorsRequired", 3], ["audioRequired", 2], ["staffRequired", 6]]) {
  test(`${field} limits and isolated venue inventories are respected`, (t) => {
    const { service } = setup(t);
    const input = { ...request, preferredVenueId: field === "audioRequired" ? 2 : 1, [field]: demand };
    const result = service.recommendations(input);
    assert.ok(result.recommendations.length);
    assert.ok(result.recommendations.every((r) => r.venueId === (field === "audioRequired" ? 1 : 3)));
    assert.deepEqual(service.recommendations({ ...input, search: { preferredVenueOnly: true } }).recommendations, []);
  });
}

test("peak usage across disjoint reservations is reused, with zero-resource and whole-day cases", (t) => {
  const { service } = setup(t);
  for (const [startTime, endTime] of [["08:30", "10:00"], ["12:00", "13:00"]])
    service.createBooking({ ...request, startTime, endTime, attendees: 50, projectorsRequired: 1, audioRequired: 0, staffRequired: 0 });
  const result = service.recommendations({ ...request, startTime: "09:00", endTime: "13:00", audioRequired: 0, staffRequired: 0 });
  assert.equal(result.recommendations[0].startTime, "09:00");
  assert.equal(result.recommendations[0].venueId, 1);
  assert.ok(service.recommendations({ ...request, projectorsRequired: 0, audioRequired: 0, staffRequired: 0 }).recommendations.length);
});

test("fully booked day and impossible capacity return accurate bounded empty results", (t) => {
  const { service } = setup(t);
  for (const attendees of [250, 200, 150, 100, 80, 60])
    service.createBooking({ ...request, attendees, startTime: "08:30", endTime: "21:30", projectorsRequired: 0, audioRequired: 0, staffRequired: 0 });
  const result = service.recommendations(request);
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.search.fromDate, result.search.throughDate);
  assert.equal(service.recommendations({ ...request, search: { searchDays: 2 } }).recommendations[0].eventDate, "2099-01-02");
  assert.deepEqual(service.recommendations({ ...request, attendees: 251, search: { searchDays: 7 } }).recommendations, []);
});

test("selected confirmation is real, idempotent and preserves rejected history", (t) => {
  const { service, db } = setup(t);
  const rejected = service.createBooking({ ...request, attendees: 999 });
  const r = service.recommendations(request).recommendations[0];
  const body = selected(request, r);
  const booking = service.createBooking(body);
  assert.equal(booking.status, "CONFIRMED"); assert.equal(booking.hallId, r.hallId);
  assert.equal(service.createBooking(body).id, booking.id);
  assert.deepEqual(service.booking(rejected.id), rejected);
  assert.equal(service.bookings({}).length, 2);
  assert.equal(db.prepare("SELECT count(*) n FROM recommendation_confirmations").get().n, 1);
  assert.throws(() => service.createBooking({ ...body, eventName: "Different event" }), { code: "CONFIRMATION_KEY_REUSED" });
  assert.throws(() => service.createBooking({ ...body, selectedVenueId: 3 }));
  assert.throws(() => service.createBooking({ ...body, confirmationKey: undefined }));
});

test("stale selected venue never silently falls back or writes a rejected replacement", (t) => {
  const { service, db } = setup(t);
  const r = service.recommendations(request).recommendations[0];
  service.createBooking(request);
  const before = snapshot(db);
  assert.throws(() => service.createBooking(selected(request, r)), (e) => {
    assert.equal(e.code, "ALTERNATIVE_UNAVAILABLE");
    assert.ok(e.details.reasons.some((reason) => reason.code === "HALL_TIME_CONFLICT"));
    return true;
  });
  assert.deepEqual(snapshot(db), before);
  assert.equal(service.checkAvailability(request).allocatedVenueId, 2);
});

test("confirmation-key persistence failure rolls back the booking insert", (t) => {
  const { service, repo, db } = setup(t);
  const r = service.recommendations(request).recommendations[0];
  const broken = createService({ ...repo, saveConfirmation() { throw new Error("write failed"); } });
  const before = snapshot(db);
  assert.throws(() => broken.createBooking(selected(request, r)), /write failed/);
  assert.deepEqual(snapshot(db), before);
});

test("trusted reschedule preview excludes only the validated original and preserves all fields on failure", (t) => {
  const { service, db } = setup(t);
  const original = service.createBooking(request);
  const before = snapshot(db);
  assert.throws(() => service.rescheduleRecommendations(original.id, request));
  assert.throws(() => service.rescheduleRecommendations(original.id, { expectedUpdatedAt: "stale" }), { code: "STALE_BOOKING" });
  assert.throws(() => service.rescheduleRecommendations(999, { expectedUpdatedAt: original.updatedAt }), { code: "NOT_FOUND" });
  const result = service.rescheduleRecommendations(original.id, { expectedUpdatedAt: original.updatedAt });
  assert.equal(result.recommendations[0].hallId, original.hallId);
  assert.equal(result.recommendations[0].startTime, original.startTime);
  assert.deepEqual(snapshot(db), before);
  const moved = { eventDate: "2099-01-02", expectedUpdatedAt: original.updatedAt };
  const r = service.rescheduleRecommendations(original.id, moved).recommendations[0];
  service.createBooking({ ...request, eventDate: r.eventDate });
  const unchanged = service.booking(original.id);
  assert.throws(() => service.rescheduleBooking(original.id, { ...moved, preferredVenueId: r.venueId, selectedVenueId: r.venueId }), { code: "ALTERNATIVE_UNAVAILABLE" });
  assert.deepEqual(service.booking(original.id), unchanged);
  const fresh = service.rescheduleRecommendations(original.id, { ...moved, search: { preferredVenueOnly: true } }).recommendations[0];
  const updated = service.rescheduleBooking(original.id, { eventDate: fresh.eventDate, startTime: fresh.startTime,
    endTime: fresh.endTime, preferredVenueId: fresh.venueId, selectedVenueId: fresh.venueId, expectedUpdatedAt: original.updatedAt });
  assert.equal(updated.id, original.id); assert.equal(updated.hallId, fresh.hallId);
  assert.notEqual(updated.updatedAt, original.updatedAt);
  service.cancelBooking(original.id);
  assert.throws(() => service.rescheduleRecommendations(original.id, { expectedUpdatedAt: updated.updatedAt }), { code: "INVALID_STATE" });
});

test("API validates, returns real/empty snapshots, confirms via booking endpoint and propagates DB errors", async (t) => {
  const { db, service, repo } = setup(t);
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const post = async (path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    const response = await post("/recommendations", request);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.recommendations[0].venueName, "Venue A");
    assert.equal((await post("/recommendations", { ...request, attendees: 251 })).body.data.recommendations.length, 0);
    assert.equal((await post("/recommendations", { ...request, search: { searchDays: 8 } })).status, 400);
    assert.equal((await post("/recommendations", {})).status, 400);
    const confirmation = await post("/bookings", selected(request, response.body.data.recommendations[0]));
    assert.equal(confirmation.status, 201); assert.equal(confirmation.body.data.status, "CONFIRMED");
    assert.equal((await post(`/bookings/${confirmation.body.data.id}/recommendations`, { expectedUpdatedAt: confirmation.body.data.updatedAt })).status, 200);
    assert.equal((await post("/bookings/999/recommendations", { expectedUpdatedAt: "x" })).status, 404);
    assert.equal((await post("/bookings/1/recommendations", {})).status, 400);
    assert.equal((await post("/bookings", selected(request, response.body.data.recommendations[0], "stale-key"))).status, 409);
    const broken = createService({ ...repo, reservationsBetween() { throw new Error("database unavailable"); } });
    assert.throws(() => broken.recommendations(request), /database unavailable/);
    assert.equal(service.bookings({}).length, 1);
    db.exec("ALTER TABLE bookings RENAME TO unavailable_bookings");
    try {
      const failure = await post("/recommendations", request);
      assert.equal(failure.status, 500);
      assert.equal(failure.body.error.code, "INTERNAL_ERROR");
      assert.equal(failure.body.data, undefined);
    } finally { db.exec("ALTER TABLE unavailable_bookings RENAME TO bookings"); }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
