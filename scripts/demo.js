import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { openDatabase } from "../server/src/db/connection.js";
import { createDemo } from "../server/test-support/demo-scenarios.js";

if (process.argv.length !== 3 || process.argv[2] !== "--reset")
  throw new Error("Use npm run demo:reset to explicitly reset the dedicated demo database.");
// Fixed workspace target: never use DB_PATH or a caller-supplied path for demo reset.
const demoPath = fileURLToPath(new URL("../server/data/eventsync-demo.sqlite", import.meta.url));
const db = openDatabase(demoPath);
try {
  const manifest = db.transaction(() => {
    db.exec("DELETE FROM recommendation_confirmations; DELETE FROM bookings; DELETE FROM clients;");
    return createDemo(db);
  }).immediate();
  writeFileSync(new URL("../server/data/demo-manifest.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Verified demonstration dataset reset at ${demoPath}`);
  console.log(JSON.stringify(manifest, null, 2));
} finally { db.close(); }
