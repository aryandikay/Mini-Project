import { assertDatabaseInvariants } from "./invariants.js";
import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/db/connection.js";
import { createService } from "../src/services/index.js";
import { createRepository } from "../src/repositories/index.js";
const db = openDatabase(workerData.path);
const flag = new Int32Array(workerData.barrier);
parentPort.postMessage("ready");
Atomics.wait(flag, 0, 0);
const result = createService(createRepository(db)).createBooking(
  workerData.input,
);
assertDatabaseInvariants(db);
db.close();
parentPort.postMessage(result.status);
