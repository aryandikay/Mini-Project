import { assertDatabaseInvariants } from "./invariants.js";
import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
const db = openDatabase(workerData.path),
  service = createService(createRepository(db));
parentPort.postMessage("ready");
Atomics.wait(new Int32Array(workerData.barrier), 0, 0);
try {
  let outcome;
  try {
    const result =
      workerData.operation === "createBooking"
        ? service.createBooking(workerData.body)
        : service[workerData.operation](workerData.id, workerData.body);
    outcome = { ok: true, status: result.status };
  } catch (e) {
    if (!e.code) throw e;
    outcome = { ok: false, code: e.code };
  }
  // Validate before reporting completion so the parent cannot finish early.
  assertDatabaseInvariants(db);
  parentPort.postMessage(outcome);
} finally {
  db.close();
}
