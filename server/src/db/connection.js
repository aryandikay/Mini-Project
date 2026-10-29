import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "./seed.js";
const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
export function openDatabase(
  filename = process.env.DB_PATH || "data/eventsync.sqlite",
) {
  const path =
    filename === ":memory:"
      ? filename
      : isAbsolute(filename)
        ? filename
        : resolve(serverRoot, filename);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.transaction(() =>
      db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8")),
    )();
    seed(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
