# Current Phase 2 verification

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
