import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db/connection.js";
import { loadDemo } from "../src/demo/dataset.js";
import { createRepository } from "../src/repositories/index.js";
import { assertDatabaseInvariants } from "../test-support/invariants.js";
test("reproducible demo runs normal allocation and lifecycle services and survives restart", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "eventsync-demo-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "demo.sqlite");
  let db = openDatabase(path);
  try {
    const report = loadDemo(db);
    assert.equal(report.failedReschedulePreserved, true);
    assertDatabaseInvariants(db);
    const before = createRepository(db).bookings();
    assert.equal(before.length, 8);
    assert.equal(before.filter((b) => b.status === "CONFIRMED").length, 5);
    assert.equal(before.filter((b) => b.status === "REJECTED").length, 2);
    assert.equal(before.filter((b) => b.status === "CANCELLED").length, 1);
    db.close();
    db = openDatabase(path);
    assert.deepEqual(createRepository(db).bookings(), before);
    assertDatabaseInvariants(db);
  } finally {
    if (db.open) db.close();
  }
});
