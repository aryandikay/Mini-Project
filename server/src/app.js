import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRepository } from "./repositories/index.js";
import { createService } from "./services/index.js";
import { createControllers } from "./controllers/index.js";
import { apiRoutes } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { authMiddleware } from "./middleware/auth.js";
export function createApp(db, options = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  const auth = authMiddleware(db, options);
  app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use((req, res, next) => { res.set("X-Content-Type-Options", "nosniff"); res.set("Referrer-Policy", "same-origin"); next(); });
  const operational = createControllers(createService(createRepository(db)));
  app.get("/api/health", operational.health);
  app.use("/api", auth.resolve, auth.protectOrigin, auth.router, auth.requireUser);
  app.use(
    "/api",
    apiRoutes(operational),
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
