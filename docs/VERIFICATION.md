# Current Phase 4 verification

- `npm test`: **82 passed, 0 failed, 0 skipped**, including earlier-phase regressions and independent-connection concurrency tests.
- `npm run build`: passed, 53 modules transformed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: **7 passed, 0 failed**.
- `git diff --check`: passed.

Recommendation tests cover grid and buffer boundaries, safe calendar arithmetic, duration/requirements preservation, bounded settings, ranking and deterministic tie-breaking, every returned result passing the allocator, capacity/projector/audio/staff infeasibility, multi-date searches, and zero resources. Snapshot tests compare every booking/client/venue/hall row and SQLite total_changes before and after search. Actual database errors return errors rather than fake empty results.

A later-date test exposed ranking by total elapsed minutes rather than time-of-day deviation; the ranking was corrected, preserving the test expectation. Browser fixture selectors were narrowed to exact event headings because blocker events shared the same client name. All final checks passed.

Real-browser tests verify the rejected-request action, returned options, explicit selection/confirmation, distinct new request ID, preserved original rejection, actual allocation, changed availability between search and confirmation, refresh, no-results, network-error recovery and mobile overflow. The existing protected confirmation path retains its independent-connection race tests; these are focused correctness checks, not load benchmarks. Tests use isolated databases.

Optional rescheduling recommendation integration is deferred; its optional recommendation-specific tests are not claimed as executed. Prior rescheduling preservation and concurrency tests still pass. Windows, load testing and the separately unavailable official PDF remain unverified. See [RECOMMENDATIONS.md](RECOMMENDATIONS.md) for exact defaults, grid limitations and complexity.

---

# Historical Phase 3 verification

- `npm test`: **67 passed, 0 failed, 0 skipped** (includes Phase 1/2 regressions).
- `npm run build`: passed, 52 modules transformed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: **4 passed, 0 failed**.
- `git diff --check`: passed.

Lifecycle tests verify real cancellation/resource release, preserved historical data, successful and failed rescheduling, identity stability, field-for-field failed-proposal preservation, invalid state transitions, repeated cancellation, stale edits, conditional updates, post-write rollback and restart persistence. Four independent-connection race cases cover reschedule/new creation, competing reschedules, cancel/reschedule, and stale same-record edits. API tests cover the new routes, structured conflicts, filters and dashboard counts/time boundaries.

Real-browser tests cover creation, allocated details, successful rescheduling, an infeasible proposal retaining both original allocation and editable proposed values, schedule movement, explicit cancellation confirmation, persisted cancelled status, updated dashboard counts and responsive overflow checks. The existing browser assertion was narrowed to the confirmation status when the new list loading indicator introduced a second status element; the original assertion's intent is retained.

All tests use isolated databases. HTTP/browser tests ran outside the command sandbox because local sockets are restricted. No existing scheduler regression tests were removed, no dependencies changed, and no development bookings were created by verification. Windows and load testing remain unverified. The separate official PDF was unavailable. See [LIFECYCLE.md](LIFECYCLE.md) for the UTC-default venue clock assumption and optional API concurrency token semantics.

---

# Historical Phase 2 verification

- `npm test`: 52 passed, 0 failed, 0 skipped.
- `npm run build`: production build passed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 3 passed, 0 failed.
- `git diff --check`: passed.

Scheduling tests cover the supplied official scenario, deterministic selection, buffers and boundaries, peak resource usage, all three resource shortages across halls, database/API persistence, non-reserving previews, rollback, concurrent independent connections, and repeated additive upgrade of a legacy database. Browser tests verify confirmed venue/hall display and restart persistence, rejected explanations after reload, and network-error recovery. Tests use isolated databases; no test bookings were inserted into development data. No package changes were required.

Windows and large-scale load testing remain unverified. The separate official PDF is still unavailable. Concurrency verification is a focused two-connection race, documented in [SCHEDULING.md](SCHEDULING.md). Phase 1 submission expectations were intentionally updated from pending to confirmed/rejected; unrelated regressions are retained.

The following is the historical Phase 1 verification record, not the current scheduling behavior.

---

# Phase 1 verification

Validated on Linux with Node.js 24.19.0, npm 11.9.0, and system Chromium. Scope is the accessible Phase 1 prompt; the separate official problem statement was unavailable.

| Executed command | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund --cache /tmp/eventsync-npm-cache` | Passed; lockfile installation reproduced dependencies |
| `npm run db:init` | Passed; 3 venues and 6 halls |
| `npm run db:seed` | Passed; repeated initialization preserved counts |
| `npm test` | 34 passed, 0 failed, 0 skipped |
| `npm run build` | Vite production build passed |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 2 browser tests passed |
| `npm run dev` | Started; frontend HTML, proxied venue API, database health, and full process-tree shutdown checked |
| `npm start` | Started after development shutdown; built frontend, direct React routes, database health, unknown API 404 and shutdown checked |

HTTP and browser checks ran with permitted access outside the command sandbox because it restricts local sockets. No TLS or package integrity checks were disabled. npm emitted an upstream deprecation notice for better-sqlite3's transitive prebuild-install helper; installation and native database use succeeded.

The 34 Node tests include exact venue/hall/inventory records, idempotent seeding, relational/numeric/status constraints, strict calendar and time validation, setup/cleanup boundaries, clients, submission, listing, details, filtering, error handling, and database persistence across reopening. Invalid submissions cannot insert records. Caller-supplied status/allocation fields cannot confirm a request. Oversized demand and overlapping requests remain pending, as required for Phase 1.

The main browser test uses real Vite → Express → SQLite communication: load the empty dashboard, inspect all venues/halls, create a client, open the event form, reject reversed times, submit a valid request, see pending status and no hall allocation, retrieve details, restart the backend using the same database, reload and find the request again, filter by status, and inspect a 390px mobile layout without horizontal overflow. No browser page errors were observed. A second test injects a network failure and verifies visible error feedback and recovery against the real API after retry.

Browser screenshots are generated in the ignored `test-results/` directory and were visually inspected. Browser and API fixtures use isolated temporary databases. The development database remains free of test clients and requests, containing only the seeded venue dataset.

Not verified: Windows execution, publication/restoration into a new cloud task, or consistency with the missing separate official statement. No Phase 2 allocation or lifecycle functionality was implemented or tested. There is no public deployment or authentication in this local prototype.
