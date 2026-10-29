import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService, normalizeBooking } from "../src/services/index.js";
import { allocate, peakUsage, overlaps } from "../src/services/scheduler.js";
const request = {
  clientId: 1,
  eventName: "Event",
  eventDate: "2027-05-10",
  startTime: "10:00",
  endTime: "13:00",
  attendees: 50,
  preferredVenueId: 1,
  projectorsRequired: 0,
  audioRequired: 0,
  staffRequired: 0,
};
function fixture(t) {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const repo = createRepository(db),
    service = createService(repo);
  service.createClient({ name: "Test" });
  return { db, repo, service };
}
test("official conference/workshop and fully specified fallback example", (t) => {
  const { service } = fixture(t);
  const first = service.createBooking({
    ...request,
    attendees: 120,
    projectorsRequired: 1,
    staffRequired: 3,
  });
  assert.equal(first.hallName, "Hall A2");
  assert.equal(first.status, "CONFIRMED");
  assert.equal(first.reservedEndMinute, 810);
  const second = service.createBooking({
    ...request,
    startTime: "11:00",
    endTime: "14:00",
    projectorsRequired: 1,
    staffRequired: 2,
  });
  assert.equal(second.hallName, "Hall A1");
  const third = service.createBooking({
    ...request,
    startTime: "13:15",
    endTime: "15:15",
    attendees: 100,
    projectorsRequired: 1,
    staffRequired: 1,
  });
  assert.equal(third.hallName, "Hall B1");
  assert.equal(third.reservedStartMinute, 765);
});
test("smallest hall, exact capacity, preferred priority, larger available hall, fallback", (t) => {
  const { service } = fixture(t);
  assert.equal(
    service.createBooking({ ...request, attendees: 60 }).hallName,
    "Hall A1",
  );
  assert.equal(service.createBooking(request).hallName, "Hall A2");
  assert.equal(service.createBooking(request).hallName, "Hall C1");
  assert.equal(
    service.createBooking({
      ...request,
      eventDate: "2027-05-11",
      attendees: 90,
    }).hallName,
    "Hall A2",
  );
  assert.equal(
    service.createBooking({
      ...request,
      eventDate: "2027-05-12",
      attendees: 250,
    }).hallName,
    "Hall C2",
  );
  assert.equal(
    service.createBooking({ ...request, attendees: 251 }).status,
    "REJECTED",
  );
});
test("reserved boundary adjacency, cleanup conflicts and dates", (t) => {
  const { service } = fixture(t);
  assert.equal(service.createBooking(request).hallName, "Hall A1");
  assert.equal(
    service.createBooking({ ...request, startTime: "13:30", endTime: "15:30" })
      .hallName,
    "Hall A2",
  );
  assert.equal(
    service.createBooking({ ...request, startTime: "14:00", endTime: "15:00" })
      .hallName,
    "Hall A1",
  );
  assert.equal(
    service.createBooking({ ...request, eventDate: "2027-05-11" }).hallName,
    "Hall A1",
  );
  assert.equal(
    overlaps(
      { reservedStartMinute: 570, reservedEndMinute: 810 },
      { reservedStartMinute: 810, reservedEndMinute: 900 },
    ),
    false,
  );
});
test("sweep clips intervals and does not sum non-simultaneous usage", () => {
  const candidate = {
    reservedStartMinute: 570,
    reservedEndMinute: 810,
    projectorsRequired: 1,
    audioRequired: 0,
    staffRequired: 0,
  };
  const booking = (start, end) => ({
    ...candidate,
    reservedStartMinute: start,
    reservedEndMinute: end,
  });
  assert.equal(
    peakUsage(candidate, [booking(500, 690), booking(690, 900)])
      .projectorsRequired,
    2,
  );
  assert.equal(
    peakUsage(candidate, [booking(500, 700), booking(690, 900)])
      .projectorsRequired,
    3,
  );
  assert.equal(peakUsage(candidate, [booking(810, 900)]).projectorsRequired, 1);
  assert.equal(
    peakUsage(
      { ...candidate, reservedStartMinute: 660, reservedEndMinute: 720 },
      [{ ...booking(600, 780), projectorsRequired: 2 }],
    ).projectorsRequired,
    3,
  );
});
for (const [field, quantity, code] of [
  ["projectorsRequired", 4, "INSUFFICIENT_PROJECTORS"],
  ["audioRequired", 3, "INSUFFICIENT_AUDIO"],
  ["staffRequired", 7, "INSUFFICIENT_STAFF"],
]) {
  test(`${field} shortage persists accurate reasons and reserves nothing`, (t) => {
    const { service } = fixture(t);
    const rejected = service.createBooking({ ...request, [field]: quantity });
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.hallId, null);
    assert.equal(rejected.allocatedVenueId, null);
    assert.ok(rejected.reasons.some((r) => r.code === code));
    assert.deepEqual(service.booking(rejected.id), rejected);
    assert.equal(service.createBooking(request).hallName, "Hall A1");
  });
}
test("venue resources isolated; exact inventory and zero demands", (t) => {
  const { service } = fixture(t);
  assert.equal(
    service.createBooking({
      ...request,
      projectorsRequired: 2,
      audioRequired: 2,
      staffRequired: 5,
    }).hallName,
    "Hall A1",
  );
  assert.equal(
    service.createBooking({ ...request, projectorsRequired: 1 }).hallName,
    "Hall C1",
  );
  assert.equal(service.createBooking(request).hallName, "Hall A2");
});
test("preview writes nothing and submission revalidates; rollback after insert failure", (t) => {
  const { db, repo, service } = fixture(t);
  const input = { ...request, attendees: 250 };
  assert.equal(service.checkAvailability(input).feasible, true);
  assert.equal(service.bookings({}).length, 0);
  assert.equal(service.createBooking(input).status, "CONFIRMED");
  assert.equal(service.createBooking(input).status, "REJECTED");
  const count = service.bookings({}).length;
  const broken = createService({
    ...repo,
    createBooking(input) {
      repo.createBooking(input);
      throw new Error("injected failure after insert");
    },
  });
  assert.throws(() => broken.createBooking(request), /injected failure/);
  assert.equal(service.bookings({}).length, count);
  assert.equal(db.inTransaction, false);
});
test("historical pending, cancelled and rejected requests do not reserve", (t) => {
  const { db, service } = fixture(t);
  const record = service.createBooking(request);
  db.prepare(
    "UPDATE bookings SET status='PENDING', hall_id=NULL, allocated_venue_id=NULL WHERE id=?",
  ).run(record.id);
  const pending = service.booking(record.id);
  assert.equal(service.createBooking(request).hallName, "Hall A1");
  assert.deepEqual(service.booking(record.id), pending);
  db.prepare(
    "UPDATE bookings SET status='CANCELLED' WHERE status='CONFIRMED'",
  ).run();
  assert.equal(service.createBooking(request).hallName, "Hall A1");
});
test("fallback and within-venue ties use stable numeric IDs regardless of input order", () => {
  const input = normalizeBooking({ ...request, preferredVenueId: 99 });
  const venue = (id) => ({
    id,
    name: `Venue ${id}`,
    totalProjectors: 2,
    totalAudioSystems: 2,
    totalStaff: 5,
    halls: [
      { id: id * 10 + 2, capacity: 60 },
      { id: id * 10 + 1, capacity: 60 },
    ],
  });
  for (const venues of [
    [venue(2), venue(1)],
    [venue(1), venue(2)],
  ]) {
    const result = allocate(input, venues, []);
    assert.equal(result.allocatedVenueId, 1);
    assert.equal(result.hallId, 11);
  }
});
test("simultaneous independent SQLite connections cannot both confirm the only eligible hall", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "eventsync-concurrency-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "test.sqlite");
  const db = openDatabase(path);
  createService(createRepository(db)).createClient({ name: "Concurrent" });
  db.close();
  const barrier = new SharedArrayBuffer(4);
  const flag = new Int32Array(barrier);
  const workers = [0, 1].map(
    () =>
      new Worker(new URL("../test-support/concurrent.js", import.meta.url), {
        workerData: { path, barrier, input: { ...request, attendees: 250 } },
      }),
  );
  t.after(() => Promise.all(workers.map((w) => w.terminate())));
  const results = workers.map(
    (w) =>
      new Promise((resolve, reject) => {
        w.on("error", reject);
        w.on("message", (m) => {
          if (m !== "ready") resolve(m);
        });
      }),
  );
  await Promise.all(
    workers.map((w) => new Promise((resolve) => w.once("message", resolve))),
  );
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0, 2);
  assert.deepEqual((await Promise.all(results)).sort(), [
    "CONFIRMED",
    "REJECTED",
  ]);
  const reopened = openDatabase(path);
  assert.equal(
    reopened
      .prepare("SELECT count(*) n FROM bookings WHERE status='CONFIRMED'")
      .get().n,
    1,
  );
  reopened.close();
});
test("database sweep accepts candidate spanning disjoint reservations in another hall", (t) => {
  const { service } = fixture(t);
  service.createBooking({
    ...request,
    endTime: "11:00",
    projectorsRequired: 1,
  });
  service.createBooking({
    ...request,
    startTime: "12:00",
    endTime: "13:00",
    projectorsRequired: 1,
  });
  const spanning = service.createBooking({ ...request, projectorsRequired: 1 });
  assert.equal(spanning.hallName, "Hall A2");
  assert.equal(spanning.status, "CONFIRMED");
});
test("additive upgrade preserves historical pending records across repeated startup", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "eventsync-upgrade-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "old.sqlite");
  let db = openDatabase(path);
  let service = createService(createRepository(db));
  service.createClient({ name: "Legacy" });
  const old = service.createBooking(request);
  db.exec(
    "UPDATE bookings SET status='PENDING',hall_id=NULL,allocated_venue_id=NULL; ALTER TABLE bookings DROP COLUMN reason_details",
  );
  const before = db.prepare("SELECT * FROM bookings WHERE id=?").get(old.id);
  db.close();
  for (let i = 0; i < 2; i++) {
    db = openDatabase(path);
    const row = db.prepare("SELECT * FROM bookings WHERE id=?").get(old.id);
    const { reason_details, ...rest } = row;
    assert.deepEqual(rest, before);
    assert.equal(reason_details, "[]");
    db.close();
  }
});
for (const [field, total] of [
  ["projectorsRequired", 2],
  ["audioRequired", 2],
  ["staffRequired", 5],
]) {
  test(`concurrent ${field} exhaustion forces fallback despite a free hall`, (t) => {
    const { service } = fixture(t);
    assert.equal(
      service.createBooking({ ...request, [field]: total }).hallName,
      "Hall A1",
    );
    assert.equal(
      service.createBooking({ ...request, [field]: 1 }).hallName,
      "Hall C1",
    );
  });
}

for (const [resource, amount] of [
  ["projectorsRequired", 2],
  ["audioRequired", 2],
  ["staffRequired", 5],
])
  test(`independent writers competing for shared ${resource} cannot overbook different halls`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "eventsync-resource-race-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "db.sqlite");
    const db = openDatabase(path);
    const service = createService(createRepository(db));
    service.createClient({ name: "Resource race" });
    const barrier = new SharedArrayBuffer(4),
      flag = new Int32Array(barrier);
    const workers = [50, 120].map(
      (attendees) =>
        new Worker(new URL("../test-support/concurrent.js", import.meta.url), {
          workerData: {
            path,
            barrier,
            input: {
              ...request,
              attendees,
              projectorsRequired: 0,
              audioRequired: 0,
              staffRequired: 0,
              [resource]: amount,
            },
          },
        }),
    );
    t.after(async () => {
      await Promise.all(workers.map((w) => w.terminate()));
      db.close();
    });
    const results = workers.map(
      (w) =>
        new Promise((resolve, reject) => {
          w.on("error", reject);
          w.on("message", (m) => {
            if (m !== "ready") resolve(m);
          });
        }),
    );
    await Promise.all(
      workers.map(
        (w) =>
          new Promise((resolve, reject) => {
            w.on("error", reject);
            w.once("message", resolve);
          }),
      ),
    );
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0, 2);
    assert.deepEqual(await Promise.all(results), ["CONFIRMED", "CONFIRMED"]);
    const rows = service.bookings({ status: "CONFIRMED" });
    assert.equal(
      rows.filter((b) => b.allocatedVenueId === request.preferredVenueId)
        .length,
      1,
    );
    assert.equal(new Set(rows.map((b) => b.allocatedVenueId)).size, 2);
  });
