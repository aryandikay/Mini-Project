export const STATUS = { CONFIRMED: "CONFIRMED", REJECTED: "REJECTED" };
export const REASON = {
  CAPACITY: "INSUFFICIENT_HALL_CAPACITY",
  CONFLICT: "HALL_TIME_CONFLICT",
  PROJECTORS: "INSUFFICIENT_PROJECTORS",
  AUDIO: "INSUFFICIENT_AUDIO",
  STAFF: "INSUFFICIENT_STAFF",
};
const resources = [
  ["projectorsRequired", "totalProjectors", REASON.PROJECTORS, "projectors"],
  ["audioRequired", "totalAudioSystems", REASON.AUDIO, "audio systems"],
  ["staffRequired", "totalStaff", REASON.STAFF, "support staff"],
];
export function overlaps(a, b) {
  return (
    a.reservedStartMinute < b.reservedEndMinute &&
    b.reservedStartMinute < a.reservedEndMinute
  );
}
export function peakUsage(request, bookings) {
  const changes = new Map();
  function boundary(time, booking, sign) {
    const delta = changes.get(time) || [0, 0, 0];
    resources.forEach(([field], i) => {
      delta[i] += sign * booking[field];
    });
    changes.set(time, delta);
  }
  for (const booking of [request, ...bookings]) {
    if (!overlaps(request, booking)) continue;
    boundary(
      Math.max(request.reservedStartMinute, booking.reservedStartMinute),
      booking,
      1,
    );
    boundary(
      Math.min(request.reservedEndMinute, booking.reservedEndMinute),
      booking,
      -1,
    );
  }
  const current = [0, 0, 0],
    peak = [0, 0, 0];
  // Aggregate simultaneous ends/starts before measuring the following half-open segment.
  for (const time of [...changes.keys()].sort((a, b) => a - b)) {
    changes.get(time).forEach((delta, i) => {
      current[i] += delta;
      peak[i] = Math.max(peak[i], current[i]);
    });
  }
  return Object.fromEntries(resources.map(([field], i) => [field, peak[i]]));
}
function evaluateVenue(request, venue, bookings) {
  const relevant = bookings.filter(
    (b) =>
      b.status === STATUS.CONFIRMED &&
      b.eventDate === request.eventDate &&
      b.allocatedVenueId === venue.id &&
      overlaps(request, b),
  );
  const eligible = venue.halls
    .filter((h) => h.capacity >= request.attendees)
    .sort((a, b) => a.capacity - b.capacity || a.id - b.id);
  const reasons = [];
  const reason = (code, message, details = {}) =>
    reasons.push({
      code,
      venueId: venue.id,
      message: `${venue.name}: ${message}`,
      ...details,
    });
  if (!eligible.length)
    reason(
      REASON.CAPACITY,
      `No hall seats ${request.attendees} attendees. Maximum capacity is ${Math.max(0, ...venue.halls.map((h) => h.capacity))}.`,
    );
  const hall = eligible.find((h) => !relevant.some((b) => b.hallId === h.id));
  if (eligible.length && !hall)
    reason(
      REASON.CONFLICT,
      "All halls with sufficient capacity overlap existing reservations, including setup and cleanup.",
    );
  const peak = peakUsage(request, relevant);
  for (const [field, inventory, code, label] of resources) {
    if (peak[field] > venue[inventory])
      reason(
        code,
        `Peak demand for ${label} is ${peak[field]}; inventory is ${venue[inventory]}.`,
        {
          requested: request[field],
          peak: peak[field],
          available: venue[inventory],
        },
      );
  }
  return { hall, venue, reasons };
}
export function allocate(request, venues, bookings) {
  const preferred = venues.find((v) => v.id === request.preferredVenueId);
  const results = [];
  if (preferred) {
    const result = evaluateVenue(request, preferred, bookings);
    if (!result.reasons.length) return success(request, result);
    results.push(result);
  }
  for (const venue of venues
    .filter((v) => v.id !== request.preferredVenueId)
    .sort((a, b) => a.id - b.id))
    results.push(evaluateVenue(request, venue, bookings));
  const feasible = results
    .filter((r) => !r.reasons.length)
    .sort(
      (a, b) =>
        a.hall.capacity - b.hall.capacity ||
        a.venue.id - b.venue.id ||
        a.hall.id - b.hall.id,
    );
  if (feasible.length) return success(request, feasible[0]);
  return {
    feasible: false,
    status: STATUS.REJECTED,
    allocatedVenueId: null,
    hallId: null,
    reasons: results.flatMap((r) => r.reasons),
    reservedStartMinute: request.reservedStartMinute,
    reservedEndMinute: request.reservedEndMinute,
  };
}
function success(request, { venue, hall }) {
  return {
    feasible: true,
    status: STATUS.CONFIRMED,
    allocatedVenueId: venue.id,
    allocatedVenueName: venue.name,
    hallId: hall.id,
    hallName: hall.name,
    reasons: [],
    reservedStartMinute: request.reservedStartMinute,
    reservedEndMinute: request.reservedEndMinute,
  };
}
