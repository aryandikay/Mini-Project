import { Router } from "express";
export function apiRoutes(controller) {
  const router = Router();
  router.get("/analytics/resources", controller.resourceAnalytics);
  router.post("/simulation", controller.simulation);
  router.post("/recommendations", controller.recommendations);
  router.post("/bookings/:id/recommendations", controller.rescheduleRecommendations);
  router.get("/dashboard", controller.dashboard);
  router.patch("/bookings/:id/cancel", controller.cancelBooking);
  router.patch("/bookings/:id/reschedule", controller.rescheduleBooking);
  router.post("/availability/check", controller.checkAvailability);
  router.get("/health", controller.health);
  router.get("/clients", controller.clients);
  router.post("/clients", controller.createClient);
  router.get("/venues", controller.venues);
  router.get("/bookings", controller.bookings);
  router.post("/bookings", controller.createBooking);
  router.get("/bookings/:id", controller.booking);
  return router;
}
