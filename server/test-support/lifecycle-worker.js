import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/db/connection.js";
import { createRepository } from "../src/repositories/index.js";
import { createService } from "../src/services/index.js";
const db = openDatabase(workerData.path),
  service = createService(createRepository(db));
parentPort.postMessage("ready");
Atomics.wait(new Int32Array(workerData.barrier), 0, 0);
try {
  const result =
    workerData.operation === "createBooking"
      ? service.createBooking(workerData.body)
      : service[workerData.operation](workerData.id, workerData.body);
  parentPort.postMessage({ ok: true, status: result.status });
} catch (e) {
  if (!e.code) throw e;
  parentPort.postMessage({ ok: false, code: e.code });
} finally {
  db.close();
}
