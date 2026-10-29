# Phase 4 completion report

## Implementation summary

Implemented intelligent alternative-slot recommendations against actual SQLite reservations, integrated with rejected booking details and failed atomic reschedules. Results preserve duration, attendance and all resource quantities. Users can search the original date or expand to seven dates, restrict to the preferred venue, inspect explanations, and confirm a real allocation. No external libraries or subsequent-phase features were added.

The initial repository inspection is in [PHASE4-ANALYSIS.md](PHASE4-ANALYSIS.md). The official problem-statement PDF was not available; the supplied Phase 4 prompt and verified repository behavior were used.

## Significant files

| File | Responsibility |
| --- | --- |
| `server/src/services/recommendations.js` | Shared scheduling normalization, search validation, calendar/grid candidates, snapshot evaluation, deduplication, ranking, explanations |
| `server/src/services/selection.js` | Strict selected-venue validation and changed-availability errors |
| `server/src/services/index.js` | Existing creation transaction extended with strict venue selection and idempotent retries; recommendation service wiring |
| `server/src/services/lifecycle.js` | Trusted reschedule recommendation context and strict selected-venue atomic rescheduling |
| `server/src/repositories/index.js` | One bounded confirmed-reservation query and confirmation-key persistence |
| `server/src/db/schema.sql` | Additive confirmation-key table; no existing booking columns changed |
| `server/src/routes/index.js`, `controllers/index.js` | Thin HTTP endpoints using existing envelopes |
| `client/src/components/Recommendations.jsx` | Search controls, real results, explanations, loading/errors/empty states, protected confirmation |
| `client/src/components/LifecycleActions.jsx` | Alternatives after failed proposals; clears outdated results when proposal inputs change |
| `client/src/components/RequestCards.jsx`, `pages/BookingDetail.jsx` | Rejected-request entry point and navigation to newly confirmed records |
| `client/src/services/api.js`, `App.jsx` | Centralized API calls and Phase 4 label |
| `server/tests/recommendations.test.js` | Candidate, ranking, database, API, lifecycle, rollback and independent-connection race tests |
| `e2e/phase1.spec.js` | Three additional real-browser Phase 4 workflows; four earlier workflows retained |

The earlier local Windows cleanup fix in `server/tests/lifecycle.test.js` is retained. It closes SQLite before removing test directories and waits for worker exit. No existing assertions were removed.

## Recommendation algorithm

1. Normalize scheduling fields using the same function now used by booking creation and rescheduling. Strict calendar/time parsing, safe integers, positive duration and the existing reservation interval validator remain authoritative.
2. Generate one to seven calendar dates starting at the requested date. UTC calendar operations are used only on date labels, never to convert venue-local event times. Reject a horizon extending beyond the application's four-digit year domain.
3. Generate starts from 08:30 in the configured increment, retaining only intervals ending by 21:30. Add the exact requested clock time even when off-grid. Preserve duration and deduplicate starts. Validate each buffered interval using the existing time utility.
4. In one read transaction, load venues/halls and confirmed bookings across the date range. Group reservations by date. Evaluate every candidate using the unchanged pure `allocate()` engine. Its hall availability, preferred-first selection, smallest feasible hall, resource sweep and stable fallback all remain shared with confirmation.
5. Return one scheduler-selected allocation per candidate date/time. If the preferred venue is feasible, recommendations do not invent additional venues that override that policy. Otherwise the scheduler's deterministic fallback applies. Preferred-only search filters fallback results.
6. Deduplicate arrangements by date/start/end/venue/hall, rank the complete feasible set and truncate only after sorting. No early first-five cutoff is used.

Ranking tuple, ascending:

`[preferred venue changed, original date changed, absolute clock-start difference, hall capacity, venue ID, hall ID, date, start time]`

Date and time labels have validated fixed formats, so their final lexicographic tie breaks match chronological ordering. `timeDifferenceMinutes` is signed clock-time difference; date preservation is reported separately. A preferred venue on another date can rank before a different venue on the requested date by this declared policy. Earlier start wins an otherwise equal earlier/later tie through the final time label. These are product defaults, not claimed official optimization requirements.

Explanations describe the actual preserved/changed venue, date and clock time, checked hall capacity and available buffered resources in the snapshot. They do not invent the cause of the original rejection. `sameAsOriginalAllocation` labels a result already available through normal automatic allocation, including same-time fallback; it is not presented as a novel discovery.

## API contract

Responses retain the existing `{ "data": ... }` success and `{ "error": { "code", "message", "details"? } }` failure envelopes.

### Search new-booking alternatives

`POST /api/recommendations`

```json
{
  "eventDate": "2099-01-01",
  "startTime": "10:07",
  "endTime": "12:07",
  "attendees": 120,
  "preferredVenueId": 1,
  "projectorsRequired": 1,
  "audioRequired": 1,
  "staffRequired": 2,
  "search": {
    "searchDays": 7,
    "limit": 5,
    "intervalMinutes": 15,
    "preferredVenueOnly": false
  }
}
```

Example request only: IDs must exist and no example implies guaranteed availability. Client ID/name are not needed for read-only search. All eight scheduling fields are required. Existing operating-hour validation also applies to the original interval; malformed/out-of-hours requests receive 400 rather than an alternative interpretation. `search` is optional. Defaults: one date, five results, 15-minute grid, fallback permitted. Bounds: 1–7 inclusive dates, 1–20 results, increments of 5/10/15/30/60 minutes. Unknown search keys, invalid types/values, unknown venues and invalid calendar horizons receive 400.

Returned `data` contains:

- `provisional: true`, `message`: preview limitations and recheck requirement.
- `originalAllocation`: actual shared scheduler decision for the original request.
- `search`: normalized options, `fromDate`, `throughDate`, earliest/latest event window and `candidatesEvaluated`.
- `recommendations`: possibly empty ranked array. Each item includes `eventDate`, `startTime`, `endTime`, buffered start/end minutes, venue/hall IDs and names, hall capacity, attendance/resource quantities, signed `timeDifferenceMinutes`, preservation booleans, `sameAsOriginalAllocation`, ranking tuple and explanation.

A valid empty search is 200 with `recommendations: []`. A database failure propagates to the existing safe 500 handler and is never converted to an empty search. Search performs SELECTs only inside its snapshot transaction.

### Search a proposed reschedule

`POST /api/bookings/:id/recommendations`

Supply a current `expectedUpdatedAt` and any proposed scheduling fields, plus optional `search`. Unspecified scheduling fields come from the stored record. Status must be CONFIRMED; missing records return 404, stale tokens or invalid states return 409, and malformed IDs/body/unknown fields return 400. The service validates the stored booking and token inside the read transaction before excluding its reservation. New-booking search never accepts an exclusion ID. There is no new authorization model: the prototype's existing unrestricted API access remains unchanged.

### Confirm selection through existing endpoints

Use `POST /api/bookings` with the normal client/name and scheduling fields, setting `preferredVenueId` to the recommended venue, plus:

```json
{ "selectedVenueId": 1, "confirmationKey": "a-client-generated-unique-attempt-key" }
```

The selected venue must equal the proposed preferred venue. The backend recalculates the hall with the existing allocator and current reservations inside its immediate transaction. For explicit selections, only the chosen venue is eligible: unavailability returns 409 `ALTERNATIVE_UNAVAILABLE` with actual selected-venue constraint reasons, rather than silently falling back. No failed replacement row or confirmation key is inserted. Normal requests without selection fields retain their existing automatic fallback and persisted-rejection behavior.

`confirmationKey` is a required nonempty string of at most 100 characters for selected creation. The additive `recommendation_confirmations` table records a hash of normalized booking input and the resulting booking ID in the same transaction. Retrying the same key/input returns the same stored booking; reuse with different input returns 409 `CONFIRMATION_KEY_REUSED`. An idempotent replay returns the record's current state (including subsequent lifecycle changes), not a new reservation. Keys are persisted without expiry in this prototype. They protect retries of one confirmation attempt, not independently submitted keys or separate deliberate submissions. The UI retains a key per result for retries and disables all confirmation buttons while a request is active.

Use `PATCH /api/bookings/:id/reschedule` with selected scheduling fields, `selectedVenueId` and the original current `expectedUpdatedAt` for recommended rescheduling. The existing lifecycle transaction checks status/token, excludes only itself, revalidates selected-venue constraints and updates atomically. Failure leaves all original fields unchanged. Stale retries fail rather than overwrite a newer edit. The frontend always supplies the concurrency token.

## Frontend and database safety

Rejected cards link to saved details, keeping the original rejection and input visible. The shared alternatives component has working date-expansion and preferred-only controls, backend results, explanations, per-result confirmation, empty range feedback, network failure feedback and disabled busy controls. Creation success navigates to the actual newly persisted ID and refreshes shared lists/dashboard. Schedule fetches current confirmed data when opened. Rejected history is never rewritten.

Failed-reschedule alternatives use a captured proposed-input snapshot with the current booking token. Editing a proposal invalidates those recommendations. Successful selected rescheduling uses the same original booking ID and refreshes lifecycle data; stale or infeasible selections do not cancel or modify the original.

Searches write no bookings, statuses, timestamps, clients or venue inventory, and no confirmation keys. Tests compare all persisted tables before/after searches. Only current confirmed rows constrain feasibility. Confirmation inserts and key recording commit together; an injected key-write failure verifies rollback of the booking insert. The schema addition uses `CREATE TABLE IF NOT EXISTS`, preserving existing data on startup.

## Algorithm complexity and limitations

Let D be dates (≤7), S be time slots per date, K=D×S, V venues, H halls per venue (maximum), N confirmed rows across the horizon and n the maximum per-date reservation count. For duration L minutes and increment g, S is at most `floor((780−L)/g)+1`, plus one off-grid original start. With positive minute durations and minimum g=5, S≤157 and K≤1099.

The range SELECT loads N rows once, in addition to venue/hall queries. Current grouping costs O(DN). Each unchanged allocator evaluation scans per-venue reservations, sorts eligible halls and resource sweep boundaries, and can test each hall against reservations. An upper bound is O(V×(H log H + Hn + n log n)) per candidate, plus venue/result sorting O(V log V). Ranking/deduplication is O(K log K) time and O(K) space. Overall time is O(DN + K×[V×(H log H + Hn + n log n) + V log V] + K log K), excluding database query execution and venue-directory construction. Search storage is O(N + VH + K), plus allocator working space, with D bounded. No performance benchmark or production throughput claim is made.

The grid is exhaustive only over the declared bounded candidates; a free interval at an unsampled minute can be missed unless it is the exact requested time. Only the requested date and following dates are searched, never earlier dates. The recommended allocation is provisional and the hall may change within the explicitly selected venue during final revalidation. No guarantee of continuous-time, all-future-date or global optimality is claimed.

## Verification

Executed on Windows with Node 22.18.0/npm 10.9.3. Tests use isolated in-memory/temporary SQLite databases; browser tests launch isolated API/Vite services. Commands requiring HTTP sockets or browser/worker execution ran with permitted execution access outside the command sandbox.

| Command | Actual result |
| --- | --- |
| `npm test` (captured with `npm test *> phase4-tests.log`) | 114 passed, zero failed/skipped, including prior Phase 1–3 regressions |
| `npm run test:e2e` (captured with `npm run test:e2e *> phase4-e2e.log`) | Seven passed, zero failed; final rerun completed in 51.2 seconds |
| `npm run build` | Passed, 53 modules transformed |
| `git diff --check` | Passed before this report was added; checked again at completion |

Backend tests cover validation, off-grid candidates, boundaries, long events, leap/year arithmetic, deterministic ranking/deduplication, full-space ranking, all resource shortages, disjoint peak use, venue isolation, hall conflicts/buffers, real empty searches, read-only snapshots, real HTTP success/400/404/409/500 behavior, strict confirmation, preserved rejection history, key reuse, rollback, trusted lifecycle preview and selected rescheduling. Independent worker connections verify competing selected confirmations yield one booking, and duplicate same-key submissions return success without duplicate insertion. Earlier scheduling/lifecycle races remain active. These are focused races, not a production load test or formal proof of every possible interleaving.

Browser tests retain the four earlier workflows and add: actual UI submission to persisted rejection, empty original-date search, seven-day results, a real competitor inserted before confirmation, visible stale-selection failure, refresh and successful confirmation, preserved rejected history, schedule visibility; loading/network recovery/empty extended range/mobile overflow; and failed-reschedule preview followed by atomic selected rescheduling. No hardcoded result arrays are used in the UI.

During development an accidentally removed integer-validation import caused test failures and was restored. Two new fixture expectations were corrected to match the declared date-first ranking and actual audio inventory. No existing tests or scheduling rules were weakened. All backend failures were resolved before the final run.

## Known issues and future extension points

All scoped Phase 4 flows are implemented, including optional failed-reschedule recommendations. The unavailable official statement limits independent requirement reconciliation. No production load test, dependency-security audit, authentication or multi-timezone deployment validation was performed. Existing local-prototype access controls, unbounded general booking lists, inventory reseeding and non-live cross-session detail refresh remain outside this phase.

The pure candidate/evaluation/ranking boundary can support future what-if simulation or improved search policies. Existing reservation intervals and resource sweeps can inform conflict timelines or utilization displays. A future waitlist could invoke the same read-only service and normal confirmation transaction. None of those additional features is implemented in Phase 4.
