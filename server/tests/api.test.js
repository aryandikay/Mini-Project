import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db/connection.js";
import { seed } from "../src/db/seed.js";
import { createApp } from "../src/app.js";
const directory = mkdtempSync(join(tmpdir(), "eventsync-test-"));
const path = join(directory, "test.sqlite");
let db, server, base, client, venue, booking;
async function start() {
  db = openDatabase(path);
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  await new Promise((resolve) => server.close(resolve));
  db.close();
}
async function request(
  route,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const valid = () => ({
  clientId: client.id,
  eventName: "Research Symposium",
  eventDate: "2027-02-28",
  startTime: "08:30",
  endTime: "21:30",
  attendees: 70,
  preferredVenueId: venue.id,
  projectorsRequired: 1,
  audioRequired: 1,
  staffRequired: 2,
});
before(start);
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});
test("health actually checks SQLite", async () => {
  const result = await request("/health");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { status: "ok", database: "ok" });
});
test("schema, exact official dataset, venue inventory, and idempotent seed", async () => {
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  seed(db);
  seed(db);
  const result = await request("/venues");
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.data.map((v) => [
      v.name,
      v.totalProjectors,
      v.totalAudioSystems,
      v.totalStaff,
      v.halls.map((h) => [h.name, h.capacity]),
    ]),
    [
      [
        "Venue A",
        2,
        2,
        5,
        [
          ["Hall A1", 60],
          ["Hall A2", 150],
        ],
      ],
      [
        "Venue B",
        2,
        1,
        4,
        [
          ["Hall B1", 100],
          ["Hall B2", 200],
        ],
      ],
      [
        "Venue C",
        3,
        2,
        6,
        [
          ["Hall C1", 80],
          ["Hall C2", 250],
        ],
      ],
    ],
  );
  venue = result.body.data[0];
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO halls(venue_id,name,capacity) VALUES(999,?,60)")
        .run("Bad"),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO halls(venue_id,name,capacity) VALUES(?,?,0)")
        .run(venue.id, "Bad"),
    /CHECK/,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO halls(venue_id,name,capacity) VALUES(?,?,60)")
        .run(venue.id, "Hall A1"),
    /UNIQUE/,
  );
  assert.throws(
    () =>
      db.prepare("UPDATE venues SET total_staff=-1 WHERE id=?").run(venue.id),
    /CHECK/,
  );
});
test("create and retrieve persisted clients; contact fields optional", async () => {
  const created = await request("/clients", {
    name: "  Campus Society  ",
    email: "events@example.com",
    phone: "+91 12345",
  });
  assert.equal(created.status, 201);
  client = created.body.data;
  assert.equal(client.name, "Campus Society");
  assert.deepEqual((await request("/clients")).body.data, [client]);
  const optional = await request("/clients", { name: "Second client" });
  assert.equal(optional.status, 201);
  assert.equal(optional.body.data.email, null);
});
test("client validation rejects malformed inputs", async () => {
  for (const input of [
    {},
    { name: "  " },
    { name: 12 },
    { name: "A", email: "invalid" },
    { name: "A", phone: [] },
    null,
    [],
  ])
    assert.equal((await request("/clients", input)).status, 400);
});
test("valid booking is confirmed by the scheduler, ignoring caller allocation fields", async () => {
  const created = await request("/bookings", {
    ...valid(),
    status: "CONFIRMED",
    hallId: 1,
    allocatedVenueId: venue.id,
  });
  assert.equal(created.status, 201);
  booking = created.body.data;
  assert.equal(booking.status, "CONFIRMED");
  assert.equal(booking.hallName, "Hall A2");
  assert.equal(booking.allocatedVenueId, venue.id);
  assert.equal(booking.reservedStartMinute, 480);
  assert.equal(booking.reservedEndMinute, 1320);
  assert.equal(booking.startTime, "08:30");
  assert.equal(booking.clientName, client.name);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id=?").get(booking.id).status,
    "CONFIRMED",
  );
});
test("booking lists, details and combined filters query stored data", async () => {
  assert.deepEqual((await request("/bookings")).body.data, [booking]);
  assert.deepEqual(
    (await request(`/bookings/${booking.id}`)).body.data,
    booking,
  );
  assert.equal(
    (await request("/bookings?date=2027-02-28&status=CONFIRMED")).body.data
      .length,
    1,
  );
  assert.equal(
    (await request("/bookings?date=2027-02-27")).body.data.length,
    0,
  );
  assert.equal((await request("/bookings?status=PENDING")).body.data.length, 0);
  for (const route of [
    "/bookings?status=UNKNOWN",
    "/bookings?date=2027-02-29",
    "/bookings/1x",
  ])
    assert.equal((await request(route)).status, 400);
  assert.equal((await request("/bookings/9999")).status, 404);
});
test("booking validation rejects missing, malformed and out-of-range inputs without writes", async (t) => {
  const cases = [
    ["empty event", { eventName: "  " }],
    ["missing client", { clientId: undefined }],
    ["nonexistent client", { clientId: 9999 }],
    ["nonexistent venue", { preferredVenueId: 9999 }],
    ["invalid date", { eventDate: "2027-02-29" }],
    ["bad time", { startTime: "8:30" }],
    ["equal times", { startTime: "10:00", endTime: "10:00" }],
    ["reversed times", { startTime: "11:00", endTime: "10:00" }],
    ["setup outside", { startTime: "08:29" }],
    ["cleanup outside", { endTime: "21:31" }],
    ["zero attendees", { attendees: 0 }],
    ["negative attendees", { attendees: -1 }],
    ["string attendees", { attendees: "10" }],
    ["fractional resource", { projectorsRequired: 1.5 }],
    ["negative resource", { audioRequired: -1 }],
    ["missing resource", { staffRequired: undefined }],
    ["unsafe integer", { staffRequired: Number.MAX_SAFE_INTEGER + 1 }],
  ];
  for (const [name, patch] of cases)
    await t.test(name, async () => {
      const result = await request("/bookings", { ...valid(), ...patch });
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, "VALIDATION_ERROR");
    });
  assert.equal((await request("/bookings")).body.data.length, 1);
});
test("infeasible requests persist as rejected with reasons", async () => {
  const result = await request("/bookings", {
    ...valid(),
    attendees: 1000,
    projectorsRequired: 50,
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.status, "REJECTED");
  assert.ok(result.body.data.reasons.length > 0);
  assert.equal(result.body.data.hallId, null);
});
test("database constraints defend status, foreign keys, intervals, integers and allocation consistency", () => {
  for (const sql of [
    "UPDATE bookings SET status='UNKNOWN'",
    "UPDATE bookings SET client_id=99999",
    "UPDATE bookings SET reserved_end_minute=1300",
    "UPDATE bookings SET attendees=0",
    "UPDATE bookings SET audio_required=1.5",
    "UPDATE bookings SET status='CONFIRMED'",
    "UPDATE bookings SET hall_id=1",
    "UPDATE bookings SET status='CONFIRMED',hall_id=3,allocated_venue_id=1",
  ])
    assert.throws(() => db.exec(sql));
});
test("JSON and missing-route errors use safe consistent envelopes", async () => {
  const response = await fetch(`${base}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_JSON");
  const missing = await request("/unknown");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});
test("unexpected database failures return safe errors", async () => {
  const fakeDb = {
    prepare() {
      throw new Error("private SQL details");
    },
  };
  const app = createApp(fakeDb).listen(0, "127.0.0.1");
  await new Promise((resolve) => app.once("listening", resolve));
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const response = await fetch(
      `http://127.0.0.1:${app.address().port}/api/health`,
    );
    assert.equal(response.status, 500);
    const json = await response.json();
    assert.equal(json.error.code, "INTERNAL_ERROR");
    assert.ok(!JSON.stringify(json).includes("private SQL"));
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
    await new Promise((resolve) => app.close(resolve));
  }
});
test("application restart and repeated initialization preserve clients and requests", async () => {
  await stop();
  await start();
  seed(db);
  assert.deepEqual(
    (await request(`/bookings/${booking.id}`)).body.data,
    booking,
  );
  assert.equal((await request("/clients")).body.data.length, 2);
  assert.equal((await request("/bookings")).body.data.length, 2);
});

test("availability endpoint is non-persistent and uses validated input", async () => {
  const before = (await request("/bookings")).body.data.length;
  const preview = await request("/availability/check", {
    ...valid(),
    eventDate: "2028-01-01",
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.feasible, true);
  assert.equal(preview.body.data.snapshot, true);
  assert.equal((await request("/bookings")).body.data.length, before);
  assert.equal(
    (await request("/availability/check", { ...valid(), attendees: 0 })).status,
    400,
  );
});
