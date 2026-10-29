// Shared by feasibility checks and analytics: simultaneous boundaries are aggregated
// before measuring the following half-open segment [start, end).
export const RESOURCE_FIELDS = Object.freeze([
  ["projectorsRequired", "totalProjectors", "Projectors"],
  ["audioRequired", "totalAudioSystems", "Audio systems"],
  ["staffRequired", "totalStaff", "Support staff"],
]);

export function resourceSegments(bookings, fromMinute, throughMinute) {
  const boundaries = new Map([[fromMinute, [0, 0, 0]], [throughMinute, [0, 0, 0]]]);
  function change(minute, booking, sign) {
    const delta = boundaries.get(minute) || [0, 0, 0];
    RESOURCE_FIELDS.forEach(([field], index) => { delta[index] += sign * booking[field]; });
    boundaries.set(minute, delta);
  }
  for (const booking of bookings) {
    const start = Math.max(fromMinute, booking.reservedStartMinute);
    const end = Math.min(throughMinute, booking.reservedEndMinute);
    if (start >= end) continue;
    change(start, booking, 1);
    change(end, booking, -1);
  }
  const minutes = [...boundaries.keys()].sort((a, b) => a - b);
  const demand = [0, 0, 0], segments = [];
  for (let i = 0; i < minutes.length - 1; i++) {
    boundaries.get(minutes[i]).forEach((delta, index) => { demand[index] += delta; });
    segments.push({ startMinute: minutes[i], endMinute: minutes[i + 1],
      usage: Object.fromEntries(RESOURCE_FIELDS.map(([field], index) => [field, demand[index]])) });
  }
  return segments;
}
