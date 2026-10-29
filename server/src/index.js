import { openDatabase } from "./db/connection.js";
import { createApp } from "./app.js";
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const db = openDatabase();
const server = createApp(db).listen(port, "0.0.0.0", () =>
  console.log(`EventSync API listening on port ${port}`),
);
server.on("error", (error) => {
  console.error(error.message);
  db.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
