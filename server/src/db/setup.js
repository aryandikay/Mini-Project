import { openDatabase } from "./connection.js";
const db = openDatabase();
console.log(
  `Database initialized: ${db.prepare("SELECT count(*) AS count FROM venues").get().count} venues, ${db.prepare("SELECT count(*) AS count FROM halls").get().count} halls.`,
);
db.close();
