import { Router } from "express";
import { idParam } from "../utils/validation.js";
export function authRoutes(controller, requireUser, requireAdmin) {
  const router = Router();
  router.post("/auth/login", controller.login);
  router.post("/auth/logout", controller.logout);
  router.get("/auth/me", requireUser, controller.me);
  router.patch("/auth/profile", requireUser, controller.profile);
  router.post("/auth/change-password", requireUser, controller.changePassword);
  router.get("/users", requireUser, requireAdmin, controller.users);
  router.post("/users", requireUser, requireAdmin, controller.createStaff);
  router.patch("/users/:id/status", requireUser, requireAdmin, (req, res, next) => {
    req.accountId = idParam(req.params.id); next();
  }, controller.status);
  return router;
}
