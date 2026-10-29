import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRepository } from "./repositories/index.js";
import { createService } from "./services/index.js";
import { createControllers } from "./controllers/index.js";
import { apiRoutes } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errors.js";
export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/api",
    apiRoutes(createControllers(createService(createRepository(db)))),
  );
  app.use("/api", notFound);
  const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  if (existsSync(`${dist}/index.html`)) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) => res.sendFile(`${dist}/index.html`));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
