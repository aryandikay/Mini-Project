import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
process.env.DB_PATH = fileURLToPath(new URL("../server/data/eventsync-demo.sqlite", import.meta.url));
if (!existsSync(process.env.DB_PATH)) throw new Error("Run npm run demo:reset before provisioning a demo administrator.");
process.argv.splice(2, 0, "bootstrap");
await import("./accounts.js");
