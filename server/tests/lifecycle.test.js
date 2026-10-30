import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
import { createApp } from "../src/app.js";
import { authenticatedHeaders } from "../test-support/auth.js";
import { venueNow } from "../src/utils/venueClock.js";
const input = {
  clientId: 1,
  eventName: "Lifecycle",
  eventDate: "2099-01-01",
  startTime: "10:00",
  endTime: "13:00",
  attendees: 120,
  preferredVenueId: 1,
  projectorsRequired: 1,
  audioRequired: 1,
  staffRequired: 3,
};
function setup(t, path = ":memory:") {
  const db = openDatabase(path),
    repo = createRepository(db),
    service = createService(repo);
  service.createClient({ name: "Client" });
  t.after(() => {
    if (db.open) db.close();
  });
  return { db, repo, service };
}
test("cancellation preserves history, releases hall and all resources; repeated cancellation conflicts", (t) => {
  const { service } = setup(t);
  const first = service.createBooking(input),
    other = service.createBooking({
      ...input,
      attendees: 50,
      staffRequired: 2,
    });
  assert.notEqual(service.checkAvailability(input).allocatedVenueId, 1);
  const cancelled = service.cancelBooking(first.id, {
    expectedUpdatedAt: first.updatedAt,
  });
  assert.equal(cancelled.status, "CANCELLED");
  assert.notEqual(cancelled.updatedAt, first.updatedAt);
  for (const key of Object.keys(first).filter(
    (k) => !["status", "updatedAt"].includes(k),
  ))
    assert.deepEqual(cancelled[key], first[key]);
  assert.deepEqual(service.booking(other.id), other);
  assert.equal(service.createBooking(input).hallName, "Hall A2");
  assert.throws(
    () => service.cancelBooking(first.id),
    (e) => e.code === "INVALID_STATE",
  );
  assert.deepEqual(service.booking(first.id), cancelled);
});
test("rescheduling excludes itself, preserves identity, reallocates and frees old interval", (t) => {
  const { service } = setup(t);
  const original = service.createBooking(input);
  const same = service.rescheduleBooking(original.id, { startTime: "10:00" });
  assert.equal(same.hallName, "Hall A2");
  const moved = service.rescheduleBooking(original.id, {
    eventDate: "2099-01-02",
    preferredVenueId: 2,
    staffRequired: 4,
  });
  assert.equal(moved.id, original.id);
  assert.equal(moved.clientId, original.clientId);
  assert.equal(moved.createdAt, original.createdAt);
  assert.equal(moved.status, "CONFIRMED");
  assert.equal(moved.allocatedVenueId, 2);
  assert.equal(service.checkAvailability(input).hallName, "Hall A2");
  assert.notEqual(
    service.checkAvailability({
      ...input,
      eventDate: "2099-01-02",
      preferredVenueId: 2,
    }).allocatedVenueId,
    2,
  );
  assert.equal(service.bookings({}).length, 1);
});
test("infeasible reschedule leaves every persisted field unchanged and old reservation active", (t) => {
  const { db, service } = setup(t);
  const original = service.createBooking({ ...input, attendees: 250 });
  const before = db
    .prepare("SELECT * FROM bookings WHERE id=?")
    .get(original.id);
  assert.throws(
    () => service.rescheduleBooking(original.id, { projectorsRequired: 99 }),
    (e) =>
      e.code === "RESCHEDULE_INFEASIBLE" &&
      e.details.originalPreserved &&
      e.details.reasons.length > 0,
  );
  assert.deepEqual(
    db.prepare("SELECT * FROM bookings WHERE id=?").get(original.id),
    before,
  );
  assert.equal(
    service.createBooking({ ...input, attendees: 250 }).status,
    "REJECTED",
  );
});
test("fallback reuses policy and invalid patches or stale edits leave record intact", (t) => {
  const { service } = setup(t);
  const original = service.createBooking(input);
  service.createBooking({ ...input, eventDate: "2099-01-02" });
  const moved = service.rescheduleBooking(original.id, {
    eventDate: "2099-01-02",
  });
  assert.equal(moved.hallName, "Hall B2");
  for (const patch of [
    {},
    { clientId: 2 },
    { status: "CANCELLED" },
    { startTime: "08:00" },
    { attendees: -1 },
    { audioRequired: 1.5 },
    { preferredVenueId: 999 },
  ])
    assert.throws(() => service.rescheduleBooking(original.id, patch));
  assert.throws(
    () =>
      service.rescheduleBooking(original.id, {
        eventDate: "2099-01-03",
        expectedUpdatedAt: original.updatedAt,
      }),
    (e) => e.code === "STALE_BOOKING",
  );
  assert.throws(
    () =>
      service.cancelBooking(original.id, {
        expectedUpdatedAt: original.updatedAt,
      }),
    (e) => e.code === "STALE_BOOKING",
  );
  assert.deepEqual(service.booking(original.id), moved);
});
for (const status of ["CANCELLED", "REJECTED", "PENDING"])
  test(`${status} cannot be cancelled or rescheduled`, (t) => {
    const { db, service } = setup(t);
    const b = service.createBooking(input);
    db.prepare(
      "UPDATE bookings SET status=?,hall_id=NULL,allocated_venue_id=NULL WHERE id=?",
    ).run(status === "CANCELLED" ? "PENDING" : status, b.id);
    if (status === "CANCELLED")
      db.prepare("UPDATE bookings SET status='CANCELLED' WHERE id=?").run(b.id);
    assert.throws(
      () => service.cancelBooking(b.id),
      (e) => e.code === "INVALID_STATE",
    );
    assert.throws(
      () => service.rescheduleBooking(b.id, { endTime: "14:00" }),
      (e) => e.code === "INVALID_STATE",
    );
  });
test("unexpected failures after actual update roll back cancellation and rescheduling", (t) => {
  const { repo, service } = setup(t);
  const b = service.createBooking(input);
  for (const operation of ["cancelBooking", "rescheduleBooking"]) {
    const broken = createService({
      ...repo,
      [operation](...args) {
        repo[operation](...args);
        throw new Error("injected update failure");
      },
    });
    assert.throws(
      () =>
        broken[operation](
          b.id,
          operation === "cancelBooking" ? {} : { endTime: "14:00" },
        ),
      /injected/,
    );
    assert.deepEqual(service.booking(b.id), b);
  }
});
test("lifecycle persists across restart and dashboard/filter results reflect database", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "eventsync-life-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "db.sqlite");
  const { db, service } = setup(t, path);
  const a = service.createBooking(input),
    b = service.createBooking({ ...input, eventDate: "2099-02-01" });
  const cancelled = service.cancelBooking(a.id),
    moved = service.rescheduleBooking(b.id, { eventDate: "2099-03-01" });
  db.close();
  const fresh = openDatabase(path);
  try {
    const repo = createRepository(fresh);
    assert.deepEqual(repo.booking(a.id), cancelled);
    assert.deepEqual(repo.booking(b.id), moved);
    const summary = repo.dashboard({
      date: "2099-03-01",
      minute: 600,
      timeZone: "UTC",
    });
    assert.equal(summary.counts.CANCELLED, 1);
    assert.equal(summary.counts.CONFIRMED, 1);
    assert.deepEqual(summary.upcoming, [moved]);
    assert.equal(
      repo.dashboard({ date: "2099-03-01", minute: 601, timeZone: "UTC" })
        .upcoming.length,
      0,
    );
    assert.equal(repo.bookings({ venueId: 1 }).length, 2);
    assert.equal(repo.bookings({ venueId: 2 }).length, 0);
  } finally {
    fresh.close();
  }
});
test("HTTP lifecycle contracts, malformed IDs, missing records, filters and conflicts", async (t) => {
  const { db } = setup(t);
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const headers = await authenticatedHeaders(db, `http://127.0.0.1:${server.address().port}`);
  t.after(() => new Promise((r) => server.close(r)));
  async function call(path, method = "GET", body) {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return { status: res.status, ...(await res.json()) };
  }
  const created = await call("/bookings", "POST", input);
  const id = created.data.id;
  assert.equal(
    (await call(`/bookings/${id}/reschedule`, "PATCH", { attendees: 999 }))
      .error.details.originalPreserved,
    true,
  );
  assert.equal(
    (await call(`/bookings/${id}/reschedule`, "PATCH", { endTime: "14:00" }))
      .data.endTime,
    "14:00",
  );
  assert.equal(
    (await call(`/bookings/${id}/cancel`, "PATCH", {})).data.status,
    "CANCELLED",
  );
  assert.equal((await call(`/bookings/${id}/cancel`, "PATCH", {})).status, 409);
  assert.equal((await call("/bookings/no/cancel", "PATCH", {})).status, 400);
  assert.equal((await call("/bookings/999/cancel", "PATCH", {})).status, 404);
  assert.equal((await call("/bookings?venueId=bad")).status, 400);
  assert.equal(
    (await call("/bookings?venueId=1&status=CANCELLED")).data.length,
    1,
  );
  assert.equal((await call("/dashboard")).data.counts.CANCELLED, 1);
});
test("venue clock uses explicit timezone across date boundaries", () => {
  const previous = process.env.VENUE_TIME_ZONE;
  process.env.VENUE_TIME_ZONE = "Asia/Kolkata";
  try {
    assert.deepEqual(venueNow(new Date("2027-01-01T20:00:00Z")), {
      date: "2027-01-02",
      minute: 90,
      timeZone: "Asia/Kolkata",
    });
  } finally {
    if (previous === undefined) delete process.env.VENUE_TIME_ZONE;
    else process.env.VENUE_TIME_ZONE = previous;
  }
});
async function race(t, path, jobs) {
  const barrier = new SharedArrayBuffer(4),
    flag = new Int32Array(barrier);
  const workers = jobs.map(
    (job) =>
      new Worker(
        new URL("../test-support/lifecycle-worker.js", import.meta.url),
        { workerData: { path, barrier, ...job } },
      ),
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
  // A result message can arrive before the worker closes its SQLite handle.
  const exits = workers.map(
    (w) => new Promise((resolve, reject) => {
      w.once("error", reject);
      w.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Worker exited with code ${code}`)));
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
  Atomics.notify(flag, 0, workers.length);
  const completed = await Promise.all(results);
  await Promise.all(exits);
  return completed;
}
for (const scenario of [
  "reschedule/new",
  "two reschedules",
  "cancel/reschedule",
])
  test(`concurrent ${scenario} serializes safely`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "eventsync-race-"));
    const path = join(dir, "db.sqlite");
    const { service } = setup(t, path);
    // Hooks run in registration order: close the database before deleting it.
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const a = service.createBooking({ ...input, attendees: 250 }),
      b = service.createBooking({
        ...input,
        attendees: 250,
        eventDate: "2099-01-02",
      });
    const move = {
      operation: "rescheduleBooking",
      id: a.id,
      body: { eventDate: "2099-01-03", expectedUpdatedAt: a.updatedAt },
    };
    let jobs = [
      move,
      {
        operation: "createBooking",
        body: { ...input, attendees: 250, eventDate: "2099-01-03" },
      },
    ];
    if (scenario === "two reschedules")
      jobs = [
        move,
        {
          ...move,
          id: b.id,
          body: { eventDate: "2099-01-03", expectedUpdatedAt: b.updatedAt },
        },
      ];
    if (scenario === "cancel/reschedule")
      jobs = [
        move,
        {
          operation: "cancelBooking",
          id: a.id,
          body: { expectedUpdatedAt: a.updatedAt },
        },
      ];
    const results = await race(t, path, jobs);
    if (scenario === "cancel/reschedule") {
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.equal(results.filter((r) => !r.ok).length, 1);
    } else {
      assert.equal(
        service.bookings({ date: "2099-01-03", status: "CONFIRMED" }).length,
        1,
      );
      assert.equal(results.filter((r) => r.status === "CONFIRMED").length, 1);
    }
  });
test("concurrent stale reschedules of the same booking cannot silently overwrite", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "eventsync-stale-"));
  const path = join(dir, "db.sqlite");
  const { service } = setup(t, path);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = service.createBooking(input);
  const results = await race(
    t,
    path,
    ["2099-02-01", "2099-03-01"].map((eventDate) => ({
      operation: "rescheduleBooking",
      id: a.id,
      body: { eventDate, expectedUpdatedAt: a.updatedAt },
    })),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.find((r) => !r.ok).code, "STALE_BOOKING");
  assert.equal(service.bookings({}).length, 1);
});
