# Resource utilization

`GET /api/analytics/utilization?date=2030-04-15&venueId=1&startTime=09:00&endTime=15:00`

The `date` is required, strictly validated YYYY-MM-DD. Optional `venueId` is a positive existing venue ID. Times are HH:mm, default 08:00–22:00, and must define a positive interval inside operating hours. The endpoint accepts one date only; unknown options, malformed dates/times, repeated query values, and nonexistent venues return 400 `VALIDATION_ERROR`. Success uses the existing `{data: ...}` envelope; unexpected database failures use the existing safe 500 handler.

The response contains `date`, `startTime`, `endTime`, `durationMinutes`, `includesBuffers: true`, and `venues`. Each venue contains its ID/name, count of confirmed reservations intersecting the selected interval, `resources` and `halls`.

Resources (`projectors`, `audioSystems`, `staff`) expose:

- `capacity`: venue-wide inventory, not duplicated per hall.
- `peak`: maximum simultaneous demand during the selected interval.
- `peakPercent`: peak / capacity × 100. This is not average utilization.
- `resourceMinutes`: sum of quantity × clipped reserved duration across confirmed bookings.
- `averageUtilizationPercent`: resourceMinutes / (capacity × selected duration) × 100.

Each hall exposes ID/name/capacity, overlapping confirmed booking count, `occupiedMinutes`, and `occupancyPercent` (occupiedMinutes / selected duration × 100). Valid confirmed hall reservations are disjoint, so their clipped durations can be summed. This endpoint reports data; it does not silently fix an invalid database. The test-only independent invariant checker detects overbooked halls/resources.

Zero inventory produces `null` percentages (UI “N/A”), while empty schedules with positive inventory produce zero. Backend percentages retain floating-point precision; UI rounds to one decimal. Interval ends are exclusive, and setup/cleanup are included. Pending, rejected and cancelled bookings are excluded. A successful reschedule moves usage to its new date/time/venue immediately on the next read.

Example: two adjacent 120-minute reservations each using one projector in a six-hour window, with inventory two, produce peak **1**, resource-minutes **240**, average utilization **33.3%**, and peak/capacity **50%**. Summing projector counts would incorrectly report peak two.

The service validates once and reads inventory/reservations in a SQLite read transaction. It reuses the allocator's `peakUsage` with a zero-demand window and the repository's confirmed-date query. No writes, resource counters or cache are introduced. For n date reservations, V venues and H halls: filtering O(Vn), boundary sorting O(n log(n+1)), hall summaries O(Hn) worst case, and O(n+H+V) storage. This is a bounded date query, not a workload benchmark or a guarantee of bounded row count.

The UI provides date, venue and interval filters, accessible native progress bars, inventory, peak/average metrics, hall occupancy, and loading/error/retry/zero states. Stale filter responses are ignored on cleanup. Tests are in `server/tests/analytics.test.js` and the utilization browser workflow in `e2e/phase1.spec.js`.
