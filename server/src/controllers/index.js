import { idParam } from "../utils/validation.js";
export function createControllers(service) {
  return {
    utilization: (req, res) =>
      res.json({ data: service.utilization(req.query) }),
    recommendations: (req, res) =>
      res.json({ data: service.recommendations(req.body) }),
    dashboard: (req, res) => res.json({ data: service.dashboard() }),
    cancelBooking: (req, res) =>
      res.json({
        data: service.cancelBooking(idParam(req.params.id), req.body),
        message: "Booking cancelled. Hall and resources released.",
      }),
    rescheduleBooking: (req, res) =>
      res.json({
        data: service.rescheduleBooking(idParam(req.params.id), req.body),
      }),
    checkAvailability: (req, res) =>
      res.json({ data: service.checkAvailability(req.body) }),
    health: (req, res) => res.json({ data: service.health() }),
    clients: (req, res) => res.json({ data: service.clients() }),
    createClient: (req, res) => {
      const data = service.createClient(req.body);
      res.status(201).json({ data });
    },
    venues: (req, res) => res.json({ data: service.venues() }),
    bookings: (req, res) => res.json({ data: service.bookings(req.query) }),
    createBooking: (req, res) => {
      const data = service.createBooking(req.body);
      res.location(`/api/bookings/${data.id}`).status(201).json({ data });
    },
    booking: (req, res) =>
      res.json({ data: service.booking(idParam(req.params.id)) }),
  };
}
