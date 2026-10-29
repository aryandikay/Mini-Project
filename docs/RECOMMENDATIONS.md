# Phase 4 alternative scheduling

## Architecture and policy

`services/recommendations.js` separates input/settings validation, date and slot generation, ranking, explanations and read-only orchestration. `utils/schedulingInput.js` shares scheduling normalization with booking creation and rescheduling. Operating-hour constants and candidate reservation validation come from `utils/time.js`.

Every candidate invokes the existing pure `allocate()` engine. No hall/resource feasibility rule is duplicated, and preferred-venue-first allocation is unchanged. A single deferred read transaction loads venue/hall inventory and confirmed bookings across the selected date range; in-memory grouping avoids queries per candidate. Nothing is inserted, updated or reserved. Database errors propagate as errors, never empty availability.

Candidate event duration, attendance and all resource quantities remain fixed. Start times use a grid anchored at 08:30, with 15-minute default increment; 30 or 60 minutes are also supported. The exact original start is included if it fits, even off-grid. Candidate ends are duration-relative and need not land on the grid. Setup/cleanup are 30 minutes each, within 08:00–22:00. Original out-of-hours requests may be searched, but every returned candidate must fit. A positive duration longer than the 780-minute event window yields zero candidates. Malformed/nonpositive durations are errors.

Search spans the requested date and optionally subsequent dates: default one total day, maximum seven total days. UTC calendar arithmetic is used only for date increments; it does not convert venue-local event times. Past dates remain permitted consistently with prior phases. Horizons beyond year 9999 are rejected. Results are unique by date/time/allocation because date/start candidates are deduplicated and the allocator yields one deterministic allocation per candidate.

## Ranking

Sort lexicographically by:

1. Preferred venue mismatch (omitted as a preference when `preferVenue=false`).
2. Calendar day offset from the requested date.
3. Absolute difference in start time of day.
4. Allocated hall capacity.
5. Stable venue ID, then hall ID.
6. Candidate start minute, so equally distant earlier/later times are deterministic.

This deliberately allows a preferred-venue result on a later date to rank above a same-day alternative venue. Setting `preferVenue=false` prioritizes date and time proximity while leaving the allocator's per-candidate venue rules unchanged. Explanations describe actual venue/date/time changes and validated feasibility; they do not claim global optimality or expose other clients' events.

## API

`POST /api/recommendations` accepts:

```json
{
  "request": {
    "clientId": 1,
    "eventName": "Conference",
    "eventDate": "2099-04-01",
    "startTime": "10:00",
    "endTime": "12:00",
    "attendees": 120,
    "preferredVenueId": 1,
    "projectorsRequired": 1,
    "audioRequired": 1,
    "staffRequired": 3
  },
  "search": {
    "horizonDays": 1,
    "stepMinutes": 15,
    "limit": 5,
    "preferVenue": true
  }
}
```

`clientId` and `eventName` are optional for search; if supplied they must validate. Client IDs and preferred venues must exist. Full client/name fields are still required for final booking creation. Search limits: horizon 1–7, result limit 1–10, step 15/30/60, boolean preference. Unknown keys, including arbitrary booking exclusions, are rejected.

200 `{ data }` includes `originalRequest`, `originalDecision`, `settings`, `searchedDates`, `evaluatedCandidates`, `totalFeasible`, `count`, `recommendations`, `provisional: true`, and `message`. Valid no-results searches return 200 with an empty array and a bounded-search explanation. Invalid input returns 400; database failures use the existing safe 500 envelope.

Each recommendation includes event and reserved times, allocated venue/hall IDs and names, hall capacity, preserved attendee/resources, `preferredVenuePreserved`, `dayOffset`, `timeDifferenceMinutes` (signed whole civil-time displacement including dates), `startTimeDifferenceMinutes` (signed time-of-day difference), explanation, ranking tuple and one-based rank. If the original arrangement is feasible, it can appear as a candidate and is labeled as the requested time, not a fabricated change.

## Selection, safety and UI

Rejected request cards link to details, where users can search, choose a date horizon/ranking preference, select an option, and explicitly confirm it. The UI displays the proposed date/time/venue and states that the final allocation may change. It preserves the original request's client, event name, attendance and resources; uses the selected date/times and recommended venue as the new preference; and calls existing `POST /api/bookings`.

The immediate booking transaction reads current availability and determines the actual hall/venue. A stale option can yield another valid allocation under normal fallback, or a new REJECTED record with real reasons. It cannot force the suggested hall. Both outcomes preserve the original rejected record and have a distinct new request ID. The UI reports the actual result, refetches shared state, and permits a new search after changed availability. Confirmation disables duplicate actions and clears the consumed selection.

Optional recommendations for rescheduling are deferred. No booking is excluded by the recommendation endpoint, and no existing confirmed booking is modified during search. Phase 3's rescheduling and rollback guarantees remain intact. The service is still a local prototype without account authorization, so arbitrary booking-ID exclusions were deliberately not introduced.

## Complexity and limits

For duration d minutes and increment s, each date has at most `floor((780-d)/s)+1` grid starts plus one unique original off-grid start, or zero if d exceeds 780. At seven days, minimum step 15 and positive whole-minute duration, at most 371 candidates are evaluated. Let K be candidates and N confirmed bookings in range. Grouping costs O(N); candidate generation O(K), excluding per-date start sorting O(D S log S).

Each candidate invokes the existing allocator with only bookings for its date. Its documented venue/hall factors still apply: O(Vn + Hn + H log(H+1) + n log(n+1) + V log(V+1)) worst-case per candidate with n bookings on that date. Ranking up to K feasible results costs O(K log K); limiting happens after sorting, not by early termination. Venue grouping in the repository costs O(VH). Database range access depends on SQLite's existing indexes and query planning. Working memory is O(N + H + V + K). No new cache or dependency is used.

This is a bounded discretized search, not an exhaustive minute-by-minute search or global optimization. It returns one allocation per candidate, rather than enumerating every feasible hall. The supplied prompt defines these defaults and assumptions; the separate official PDF is unavailable.

## Verification and future scope

Tests cover grid/calendar boundaries, long and impossible durations, settings validation, original-time preservation on later dates, ranking, repeated deterministic outputs, capacity/equipment/staff constraints, unchanged database rows/timestamps/change counter, actual API errors, and stale selection revalidation. Existing concurrent-confirmation and lifecycle tests exercise the unchanged final transaction path. Browser tests use real HTTP/SQLite fixtures and verify new IDs, preserved rejections, stale recommendations, refresh, empty results, errors and mobile overflow.

Rescheduling recommendations, utilization visuals, what-if simulation, conflict timelines and waitlists remain future work. No load benchmark, Windows verification or global-optimality claim is made.
