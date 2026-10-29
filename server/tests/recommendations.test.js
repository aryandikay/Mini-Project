import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService, normalizeBooking } from "../src/services/index.js";
import {
  normalizeSearch,
  candidateDates,
  generateCandidates,
  rankRecommendations,
} from "../src/services/recommendations.js";
import { allocate } from "../src/services/scheduler.js";
import { createApp } from "../src/app.js";
const input = {
  clientId: 1,
  eventName: "Recommendations",
  eventDate: "2099-04-01",
  startTime: "10:00",
  endTime: "12:00",
  attendees: 120,
  preferredVenueId: 1,
  projectorsRequired: 1,
  audioRequired: 1,
  staffRequired: 3,
};
function setup(t) {
  const db = openDatabase(":memory:"),
    repo = createRepository(db),
    service = createService(repo);
  service.createClient({ name: "Client" });
  t.after(() => {
    if (db.open) db.close();
  });
  return { db, repo, service };
}
test("candidate grid, exact duration and buffers, off-grid request and bounded unique slots", () => {
  const { request, settings } = normalizeSearch({
    request: { ...input, startTime: "10:07", endTime: "12:07" },
  });
  const slots = generateCandidates(request, settings, [request.eventDate]);
  assert.equal(slots[0].startMinute, 510);
  assert.equal(slots.at(-1).endMinute, 1290);
  assert.ok(slots.some((s) => s.startTime === "10:07"));
  assert.equal(new Set(slots.map((s) => s.startTime)).size, slots.length);
  for (const s of slots) {
    assert.equal(s.endMinute - s.startMinute, 120);
    assert.equal(s.startMinute - s.reservedStartMinute, 30);
    assert.equal(s.reservedEndMinute - s.endMinute, 30);
    assert.ok(s.reservedStartMinute >= 480 && s.reservedEndMinute <= 1320);
  }
});
test("safe calendar arithmetic handles leap/year transitions and maximum year", () => {
  assert.deepEqual(candidateDates("2028-02-28", 3), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
  assert.deepEqual(candidateDates("2027-12-31", 2), [
    "2027-12-31",
    "2028-01-01",
  ]);
  assert.throws(() => candidateDates("9999-12-31", 2));
});
test("long events and opening violations have honest bounded results; past dates remain supported", (t) => {
  const { service } = setup(t);
  assert.equal(
    service.recommendations({
      request: { ...input, startTime: "08:30", endTime: "21:30" },
    }).evaluatedCandidates,
    1,
  );
  const impossible = service.recommendations({
    request: { ...input, startTime: "08:00", endTime: "22:00" },
  });
  assert.equal(impossible.count, 0);
  assert.equal(impossible.evaluatedCandidates, 0);
  const corrected = service.recommendations({
    request: {
      ...input,
      eventDate: "2020-01-01",
      startTime: "08:00",
      endTime: "09:00",
    },
  });
  assert.ok(corrected.count > 0);
  assert.equal(corrected.originalDecision.feasible, false);
});
test("malformed inputs and unsupported or excessive search options are rejected", (t) => {
  const { service } = setup(t);
  for (const patch of [
    { eventDate: "2027-02-29" },
    { startTime: "8:30" },
    { endTime: "09:00" },
    { attendees: 0 },
    { staffRequired: -1 },
    { audioRequired: 0.5 },
    { preferredVenueId: 999 },
    { excludeBookingId: 1 },
  ])
    assert.throws(() =>
      service.recommendations({ request: { ...input, ...patch } }),
    );
  for (const search of [
    { horizonDays: 8 },
    { horizonDays: 0 },
    { limit: 11 },
    { limit: "5" },
    { stepMinutes: 1 },
    { stepMinutes: "15" },
    { preferVenue: 1 },
    { extra: 1 },
    null,
  ])
    assert.throws(() => service.recommendations({ request: input, search }));
  assert.throws(() =>
    service.recommendations({ request: input, excludeBookingId: 1 }),
  );
});
test("same venue later ranks above fallback now; optional proximity-first respects allocator", (t) => {
  const { service } = setup(t);
  service.createBooking(input);
  const preferred = service.recommendations({ request: input });
  assert.equal(preferred.recommendations[0].allocatedVenueId, 1);
  assert.equal(preferred.recommendations[0].startTime, "13:00");
  const timeFirst = service.recommendations({
    request: input,
    search: { preferVenue: false },
  });
  assert.equal(timeFirst.recommendations[0].startTime, "10:00");
  assert.equal(timeFirst.recommendations[0].allocatedVenueId, 2);
  // Once the preferred venue is feasible, its larger hall still wins over a globally smaller alternative.
  const priority = service.recommendations({
    request: { ...input, eventDate: "2099-04-02", attendees: 90 },
  });
  assert.equal(priority.recommendations[0].hallName, "Hall A2");
});
test("ranking compares date, deviation, capacity and stable IDs independently", () => {
  const tuples = [
    [0, 1, 1440, 60, 1, 1, 600],
    [0, 0, 30, 60, 1, 1, 630],
    [0, 0, 15, 100, 2, 3, 615],
    [0, 0, 15, 60, 2, 4, 615],
    [0, 0, 15, 60, 1, 2, 615],
    [0, 0, 15, 60, 1, 1, 585],
  ];
  assert.deepEqual(
    rankRecommendations(tuples.map((ranking) => ({ ranking }))).map(
      (r) => r.ranking,
    ),
    [tuples[5], tuples[4], tuples[3], tuples[2], tuples[1], tuples[0]],
  );
});
test("every recommendation passes the original allocator, preserves requirements and is deterministic", (t) => {
  const { repo, service } = setup(t);
  service.createBooking(input);
  service.createBooking({
    ...input,
    attendees: 50,
    staffRequired: 2,
    startTime: "11:00",
    endTime: "13:00",
  });
  const body = { request: input, search: { horizonDays: 7, limit: 10 } };
  const result = service.recommendations(body);
  assert.deepEqual(service.recommendations(body), result);
  assert.ok(result.count <= 10);
  assert.equal(result.searchedDates.length, 7);
  for (const r of result.recommendations) {
    const normalized = normalizeBooking({
      ...input,
      ...{ eventDate: r.eventDate, startTime: r.startTime, endTime: r.endTime },
    });
    const decision = allocate(
      normalized,
      repo.venues(),
      repo.reservations(normalized),
    );
    assert.equal(decision.feasible, true);
    assert.equal(decision.hallId, r.hallId);
    assert.equal(decision.allocatedVenueId, r.allocatedVenueId);
    for (const key of [
      "attendees",
      "projectorsRequired",
      "audioRequired",
      "staffRequired",
    ])
      assert.equal(r[key], input[key]);
    assert.equal(normalized.endMinute - normalized.startMinute, 120);
  }
});
for (const [field, value] of [
  ["attendees", 251],
  ["projectorsRequired", 4],
  ["audioRequired", 3],
  ["staffRequired", 7],
])
  test(`${field} shortage returns no fictional alternatives`, (t) => {
    const { service } = setup(t);
    const result = service.recommendations({
      request: { ...input, [field]: value },
      search: { horizonDays: 7 },
    });
    assert.equal(result.count, 0);
    assert.equal(result.originalDecision.feasible, false);
    assert.match(result.message, /No feasible/);
  });
test("later dates and zero resources supported when requested day is fully occupied", (t) => {
  const { service } = setup(t);
  service.createBooking({
    ...input,
    attendees: 250,
    startTime: "08:30",
    endTime: "21:30",
    projectorsRequired: 0,
    audioRequired: 0,
    staffRequired: 0,
  });
  const req = {
    ...input,
    attendees: 250,
    projectorsRequired: 0,
    audioRequired: 0,
    staffRequired: 0,
  };
  assert.equal(service.recommendations({ request: req }).count, 0);
  const result = service.recommendations({
    request: req,
    search: { horizonDays: 2 },
  });
  assert.equal(result.recommendations[0].eventDate, "2099-04-02");
  assert.equal(result.recommendations[0].startTime, "10:00");
});
test("search leaves all rows, statuses, timestamps, inventory and change counter untouched", (t) => {
  const { db, service } = setup(t);
  service.createBooking(input);
  service.createBooking({ ...input, attendees: 999 });
  const snapshot = () =>
    ["bookings", "clients", "venues", "halls"].map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    );
  const before = snapshot(),
    changes = db.prepare("SELECT total_changes() n").get().n;
  service.recommendations({ request: input, search: { horizonDays: 7 } });
  assert.deepEqual(snapshot(), before);
  assert.equal(db.prepare("SELECT total_changes() n").get().n, changes);
});
test("stale recommendation rechecks confirmation; rejection history remains unchanged", (t) => {
  const { service } = setup(t);
  const req = { ...input, attendees: 250 };
  const blocker = service.createBooking(req);
  const rejected = service.createBooking(req);
  const result = service.recommendations({ request: req });
  const r = result.recommendations[0];
  assert.ok(r);
  const selected = {
    ...req,
    eventDate: r.eventDate,
    startTime: r.startTime,
    endTime: r.endTime,
    preferredVenueId: r.allocatedVenueId,
  };
  const winner = service.createBooking(selected);
  assert.equal(winner.status, "CONFIRMED");
  const loser = service.createBooking(selected);
  assert.equal(loser.status, "REJECTED");
  assert.deepEqual(service.booking(rejected.id), rejected);
  assert.deepEqual(service.booking(blocker.id), blocker);
});
test("HTTP recommendations use actual availability; invalid input and database failures remain errors", async (t) => {
  const { db, service } = setup(t);
  service.createBooking(input);
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  async function call(body) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/recommendations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, ...(await response.json()) };
  }
  const count = service.bookings({}).length;
  const result = await call({ request: input });
  assert.equal(result.status, 200);
  assert.equal(result.data.recommendations[0].startTime, "13:00");
  assert.equal(service.bookings({}).length, count);
  assert.equal(
    (await call({ request: { ...input, attendees: 0 } })).status,
    400,
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    db.close();
    const failure = await call({ request: input });
    assert.equal(failure.status, 500);
    assert.equal(failure.error.code, "INTERNAL_ERROR");
    assert.equal(failure.data, undefined);
  } finally {
    console.error = originalError;
  }
});
