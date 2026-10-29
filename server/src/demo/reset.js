import { fileURLToPath } from "node:url";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { openDatabase } from "../db/connection.js";
import { seed } from "../db/seed.js";
import { loadDemo } from "./dataset.js";

// Fixed target: never accept DB_PATH or a caller-provided filename for destructive reset.
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = `${root}demo-data`;
const filename = `${directory}/eventsync-demo.sqlite`;
for (const path of [
  root,
  directory,
  filename,
  `${filename}-wal`,
  `${filename}-shm`,
]) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Error(`Demo reset refuses symlinks: ${path}`);
}
mkdirSync(directory, { recursive: true });
const db = openDatabase(filename);
try {
  const report = db
    .transaction(() => {
      db.exec(
        "DELETE FROM bookings; DELETE FROM clients; DELETE FROM halls; DELETE FROM venues;",
      );
      seed(db);
      return loadDemo(db);
    })
    .immediate();
  console.log(JSON.stringify({ database: filename, ...report }, null, 2));
} finally {
  db.close();
}
