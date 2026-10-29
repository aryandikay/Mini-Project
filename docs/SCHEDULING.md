# Phase 2 scheduling and handoff

`services/scheduler.js` is a pure deterministic allocator, independent of HTTP and SQLite. `normalizeBooking` in `services/index.js` reuses the established strict date/time and numeric validation. Booking input fields are unchanged. Operating-hour violations remain validation errors (400, no insertion), while capacity/conflict/resource infeasibility is a persisted REJECTED decision (201).

## Policy and resource calculation

Reserved intervals include 30 minutes before/after the event and use `[start,end)` semantics. Only CONFIRMED records on the same date reserve anything. Preferred venue is evaluated first; the smallest feasible hall wins. Only when it fails are all other venues evaluated. Fallback sorts by hall capacity, venue ID, hall ID; within a venue, capacity then hall ID. This tie-breaker is an implementation assumption from the Phase 2 prompt, not a verified quotation from the unavailable official PDF.

The resource sweep clips existing reservations to the candidate interval, adds the candidate's demand, aggregates deltas at equal boundaries, and measures peak concurrent projectors, audio and staff. Adjacent reservations do not double-count usage. Each venue has its own inventory. A free eligible hall and all three resource constraints must succeed. Reasons summarize each venue's failed constraints, with no other clients' identifiers or event details.

## Transactions and schema

`createService.createBooking` validates input, then invokes the repository's synchronous `transaction`, backed by better-sqlite3 12.4.1 `transaction(fn).immediate()`. All entity checks, inventory reads, confirmed-reservation reads, allocation and insertion occur under that writer lock. The write commits atomically or rolls back; there are no asynchronous callbacks inside it. SQLite permits one writer, even in WAL mode. Busy timeout is 5000 ms; contention beyond that can fail safely through the existing generic 500 error response. It cannot silently confirm a request on stale data.

`checkAvailability` uses a deferred read transaction for a consistent snapshot and does not insert. The final POST always reevaluates. `connection.js` additively adds a `reason_details` JSON-text column with `[]` default to existing databases, inside an immediate migration transaction. It preserves existing records and statuses. Rejection prose remains in `rejection_reason`; responses expose the parsed details as `reasons`. No historical PENDING requests are scheduled automatically.

## Actual complexity

Let V be venues, H total halls, n the overlapping confirmed rows returned for the date, and n_v the relevant rows at a venue. Each evaluated venue filters the n input rows: O(n). Hall sorting costs O(h_v log h_v); checking eligible halls by scanning reservations costs at most O(h_v n_v). Its resource sweep sorts at most 2(n_v+1) boundaries: O(n_v log(n_v+1)) time and O(n_v) auxiliary space. Fallback sorting adds O(V log V). The implementation's worst-case bound is O(Vn + Hn + H log(H+1) + n log(n+1) + V log(V+1)), with O(n+H+V) storage including input/results. Preferred success short-circuits later venue evaluation.

The repository queries only confirmed rows intersecting the requested date/interval, but SQLite's existing date/status/interval indexes do not guarantee a constant-time overlap query. Venue loading groups all halls using filtering, costing O(VH) for that small dataset. Database row reads add their own cost; the policy is not globally optimal for future utilization.

## Verification

Run `npm test`, `npm run build`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` in this cloud machine. API and browser tests use temporary databases. Tests cover the supplied conference/workshop/fallback scenario, half-open boundaries, preference and tie rules, independent resources, peak-vs-total demand, preview revalidation, rollback after a real insert, and legacy database upgrade.

Concurrency testing releases two worker threads with independent SQLite connections from a shared-memory barrier. Both contend for the only capacity-eligible hall (250 attendees); exactly one confirms and the other rejects. This is real concurrent database access, not two sequential HTTP calls. It is a focused race regression, not a distributed-system or load benchmark.

## Lifecycle integration (implemented in Phase 3)

`services/lifecycle.js` uses the same transaction owner and allocator for rescheduling, excluding only the booking being replaced from reservations and updating atomically on success. Cancellation changes status so the confirmed-only query stops counting it. No resource counters are used. See [LIFECYCLE.md](LIFECYCLE.md) for stale edit handling, state transitions and tests. Recommendations reuse this allocator and are implemented; see [RECOMMENDATIONS.md](RECOMMENDATIONS.md).
