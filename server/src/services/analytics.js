import { resourceSegments, RESOURCE_FIELDS } from "./resourceSweep.js";
import { idParam } from "../utils/validation.js";
import { validateDate } from "../utils/time.js";
import { AppError } from "../utils/errors.js";

export function resourceAnalytics(repo, query) {
  const venueId = idParam(query.venueId), date = validateDate(query.date);
  return repo.readTransaction(() => {
    const venue = repo.venues().find((v) => v.id === venueId);
    if (!venue) throw new AppError(404, "NOT_FOUND", "Venue not found.");
    const bookings = repo.bookings({ venueId, date, status: "CONFIRMED" });
    const segments = resourceSegments(bookings, 480, 1320);
    const resources = RESOURCE_FIELDS.map(([key, inventoryField, label]) => {
      const inventory = venue[inventoryField];
      const peak = segments.reduce((max, segment) => Math.max(max, segment.usage[key]), 0);
      const intervals = (predicate) => segments.filter((s) => predicate(s.usage[key]))
        .map(({ startMinute, endMinute }) => ({ startMinute, endMinute }));
      return { key, label, inventory, peak, availableAtPeak: inventory - peak,
        peakIntervals: peak > 0 ? intervals((usage) => usage === peak) : [],
        fullyUtilizedIntervals: inventory > 0 ? intervals((usage) => usage === inventory) : [],
        overInventory: peak > inventory };
    });
    return { venue, date, operatingStartMinute: 480, operatingEndMinute: 1320,
      confirmedEventCount: bookings.length, resources, segments,
      halls: venue.halls.map((hall) => ({ ...hall, bookings: bookings.filter((b) => b.hallId === hall.id)
        .sort((a, b) => a.reservedStartMinute - b.reservedStartMinute || a.id - b.id) })) };
  });
}
