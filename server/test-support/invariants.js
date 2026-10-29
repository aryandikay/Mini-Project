import assert from "node:assert/strict";
import { createRepository } from "../src/repositories/index.js";
import { validateDate } from "../src/utils/time.js";

// Independent minute-by-minute oracle for tests, deliberately not the allocator's sweep.
// Reads a consistent snapshot and reports violations; never repairs persisted data.
export function databaseViolations(db) {
  return db.transaction(() => {
    const repo = createRepository(db),
      venues = repo.venues();
    const errors = db
      .pragma("foreign_key_check")
      .map((row) => `Foreign key: ${JSON.stringify(row)}`);
    const bookings = repo.bookings({ status: "CONFIRMED" });
    const days = new Map();
    for (const b of bookings) {
      const venue = venues.find((v) => v.id === b.allocatedVenueId);
      const hall = venue?.halls.find((h) => h.id === b.hallId);
      if (!hall || b.attendees > hall.capacity)
        errors.push(`Booking ${b.id}: hall capacity/allocation`);
      try {
        validateDate(b.eventDate);
      } catch {
        errors.push(`Booking ${b.id}: invalid date`);
      }
      if (
        b.startMinute >= b.endMinute ||
        b.reservedStartMinute !== b.startMinute - 30 ||
        b.reservedEndMinute !== b.endMinute + 30 ||
        b.reservedStartMinute < 480 ||
        b.reservedEndMinute > 1320
      )
        errors.push(`Booking ${b.id}: invalid interval`);
      const key = `${b.eventDate}/${b.allocatedVenueId}`;
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(b);
    }
    for (const [key, rows] of days) {
      const venue = venues.find((v) => v.id === rows[0].allocatedVenueId);
      if (!venue) continue;
      for (let minute = 480; minute < 1320; minute++) {
        const active = rows.filter(
          (b) =>
            b.reservedStartMinute <= minute && minute < b.reservedEndMinute,
        );
        if (new Set(active.map((b) => b.hallId)).size !== active.length) {
          errors.push(`${key} at ${minute}: hall exclusivity`);
          break;
        }
      }
      for (const [field, inventory] of [
        ["projectorsRequired", "totalProjectors"],
        ["audioRequired", "totalAudioSystems"],
        ["staffRequired", "totalStaff"],
      ]) {
        for (let minute = 480; minute < 1320; minute++) {
          const demand = rows
            .filter(
              (b) =>
                b.reservedStartMinute <= minute && minute < b.reservedEndMinute,
            )
            .reduce((sum, b) => sum + b[field], 0);
          if (demand > venue[inventory]) {
            errors.push(`${key} at ${minute}: ${field} exceeds inventory`);
            break;
          }
        }
      }
    }
    return errors;
  })();
}
export function assertDatabaseInvariants(db) {
  assert.deepEqual(
    databaseViolations(db),
    [],
    "Confirmed booking database invariants",
  );
}
