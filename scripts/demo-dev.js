import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const demoPath = fileURLToPath(new URL("../server/data/eventsync-demo.sqlite", import.meta.url));
if (!existsSync(demoPath)) throw new Error("Run npm run demo:reset before starting the demo.");
process.env.DB_PATH = demoPath;
await import("./dev.js");
