# Phase 3 lifecycle and transaction design

## State and history

Only CONFIRMED → CANCELLED and CONFIRMED → updated CONFIRMED are permitted. PENDING, REJECTED and CANCELLED records cannot be rescheduled or cancelled. Repeated cancellation consistently returns 409 without additional writes. Cancelled records retain event details and historical allocations, which the UI labels as released. Existing pending records remain unchanged. No additional schema migration or dependency is needed.

`services/lifecycle.js` owns lifecycle orchestration. Input validation and normalization reuse Phase 2, and allocation calls the existing pure `allocate()` function. No second scheduling algorithm exists. Repository `reservations(input, excludeBookingId)` excludes the rescheduled ID at query time; other confirmed reservations remain constraints.

## Atomicity and concurrent editing

Every lifecycle operation uses `repository.transaction`, backed by better-sqlite3's synchronous immediate transaction. It reads the current booking under the writer lock, checks its status and optional expected timestamp, validates changes and availability, and performs a conditional update. Writes require CONFIRMED status and the previous timestamp; exactly one affected row is mandatory. Errors roll back updates. Infeasible rescheduling throws before any write, preserving every field including `updated_at`, and leaves the original allocation active.

Successful updates set a UTC timestamp strictly later than the previous value (the greater of current wall-clock milliseconds or previous + 1 ms). This avoids same-millisecond stale-edit ambiguity without a new version column. The UI always submits `expectedUpdatedAt`; stale writes fail with 409. API callers may omit it and explicitly accept serialized edits against the latest record. This guarantees allocation consistency but not prevention of semantic overwrites by clients that omit the token.

Cancelled bookings disappear from the confirmed-only reservation dataset. Successful rescheduling updates the original row, releasing the old interval and reserving the new one in the same commit. WAL still allows only one writer; existing 5-second busy timeout and safe server-error behavior remain unchanged.

## UI and time

The centralized API service handles lifecycle requests and structured errors. Details show current booking, client contacts, timestamps, requested resources and buffered intervals. Cancellation uses a confirmation step; rescheduling uses a prefilled form and only permitted fields. Changes are applied after successful responses, followed by shared data refetch. Failed rescheduling retains the current allocation and proposed form values with the server explanation.

The daily schedule queries confirmed records for its selected date/venue and groups them by venue, ordered by event start and ID. Dashboard aggregates and upcoming events come from a consistent read transaction. Event dates/times remain venue-local civil values. For the meaning of 'now', use `VENUE_TIME_ZONE` (UTC by default; explicit IANA setting for the campus). Upcoming means start date/minute at or after current venue date/minute, not an occupancy claim. Browser timezone never changes stored event times.

## Verification and scope

Tests use temporary databases and exercise cancellation release, preservation of unrelated rows, self-exclusion, fallback, old/new interval occupancy, field-for-field failed-reschedule preservation, repeated cancellation, invalid states, malformed and stale edits, actual post-update rollback, and restart persistence. Independent SQLite connections in worker threads compete for rescheduling/new allocation, rescheduling/rescheduling, and cancellation/rescheduling. Same-booking stale-edit races allow exactly one mutation.

Browser tests use the actual frontend, API and SQLite, covering submission, successful rescheduling, a failed proposal with original allocation still visible, schedule movement, cancellation confirmation, persisted cancelled status, dashboard counts and mobile overflow. These focused races are not a load or distributed-deployment benchmark. Windows remains unverified. The separate official PDF is unavailable; implementation follows the supplied Phase 3 prompt.

## Recommendation and analytics integration

Phase 4 implements bounded alternative-slot search and ranking using the same allocator and confirmed reservation queries. Previews are non-persistent and final selection revalidates inside an immediate transaction; see [RECOMMENDATIONS.md](RECOMMENDATIONS.md). Optional recommendations for rescheduling remain deferred. Phase 5 analytics derives peak and time-weighted metrics from current confirmed intervals, including buffers; see [ANALYTICS.md](ANALYTICS.md). Cancellation and successful rescheduling affect the next analytics snapshot.
