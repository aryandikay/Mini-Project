# Local setup and repository review

Reviewed on 29 October 2026 on Windows, Node 22.18.0 and npm 10.9.3.
Source: https://github.com/aryandikay/Mini-Project, branch `main`, base commit `c41b60e`.

## Setup and verification

- Installed exact dependencies with `npm ci --no-audit --no-fund`.
- Created ignored `.env` from `.env.example`; set `VENUE_TIME_ZONE=Asia/Kolkata` for this local setup. Change this if the venue uses another timezone.
- Initialized `server/data/eventsync.sqlite`: three venues and six halls, no demo clients/bookings.
- `npm run build`: passed, 52 modules transformed.
- `npm test`: 67 passed, zero failed after the Windows test cleanup fix below.
- `npm run test:e2e`: all four Chromium workflows passed, including desktop/mobile, restart persistence, network recovery, rejection reasons, rescheduling and cancellation.
- `git diff --check`: passed before this report was added.

Run `npm run dev` from the repository root. UI: http://localhost:5173; API: http://localhost:3001/api/health. For production-style local use, run `npm run build` then `npm start` and open http://localhost:3001.

Test HTTP servers and browser processes require execution outside this environment's command sandbox. Initial sandbox failures were environmental; the four remaining unrestricted failures were a real Windows test cleanup issue.

## Architecture and behavior

The root is an npm workspace with a React 19/Vite 7/Tailwind 4 client and an Express 5/better-sqlite3 server. React Router provides overview, clients, creation, list, detail and daily-schedule pages. `client/src/services/api.js` centralizes HTTP access and error decoding.

The server follows routes → controllers → services → repositories → SQLite. Services validate input and own transactions; repositories use parameterized SQL. SQLite enables foreign keys, WAL and a five-second busy timeout. Tables are clients, venues, halls and bookings, with relationships and interval/status checks.

`server/src/services/scheduler.js` is a pure allocator. It tries the preferred venue first, picks the smallest available eligible hall, and then tries other venues with deterministic capacity/ID tie breaks. Thirty-minute setup and cleanup buffers must fit 08:00–22:00. Hall overlaps use half-open intervals. Shared projectors, audio and staff are checked using peak simultaneous usage, rather than simply summing every overlapping booking.

Creation checks and writes inside an immediate transaction. Rejections persist their reasons without reserving resources. Cancellation retains history but releases capacity because only confirmed rows participate in reservations. Rescheduling excludes the original booking during evaluation and commits only a feasible replacement; failure leaves the original unchanged. Conditional updates and optional `expectedUpdatedAt` tokens guard concurrent edits. Dashboard reads use a consistent read transaction.

## Findings and priorities

1. **Deployment boundary:** there is no authentication or authorization. Every reachable caller can read client contact data and mutate bookings. Both the API and development server bind to `0.0.0.0`. Appropriate for a controlled prototype; restrict binding/network access or add identity and role checks before wider use. Relevant files: `server/src/index.js`, `server/src/routes/index.js`, `scripts/dev.js`.
2. **Booking detail refresh can stay stale:** the footer refresh reloads shared app data, but `BookingDetail` fetches its own record only when `id` changes. A booking changed in another session can retain old details and its old concurrency token after Refresh data. Pass a revision to the detail page or explicitly invalidate/refetch the record. Relevant files: `client/src/App.jsx`, `client/src/pages/BookingDetail.jsx`.
3. **Unbounded list loading:** app startup and each shared refresh fetch all clients and bookings; the list page fetches bookings again. There is no pagination. This increases response size, memory and refresh latency as history grows. Add pagination and route-specific fetching before scaling. Relevant files: `client/src/App.jsx`, `client/src/pages/Bookings.jsx`, `server/src/repositories/index.js`.
4. **Operational data is hardcoded:** every database open upserts the official venue inventory and hall capacities. Manual inventory changes will be reset at startup. Introduce deliberate migrations and separate initial seed data if administrators need editable inventory. Relevant files: `server/src/db/connection.js`, `server/src/db/seed.js`.
5. **Concurrency protection is optional for API callers:** the UI sends `expectedUpdatedAt`, but other clients may omit it, allowing sequential overwrites of earlier edits. This is documented behavior, not a scheduler transaction failure. Require the token if all callers need stale-edit protection. Relevant file: `server/src/services/lifecycle.js`.
6. **Configuration errors surface late:** an invalid `VENUE_TIME_ZONE` throws when the dashboard is requested. Validate it at startup for a clear configuration failure. Relevant file: `server/src/utils/venueClock.js`.
7. **Delivery/maintenance gaps:** no CI workflow or lint script is present. Add automated backend/build/browser checks. The transitive `prebuild-install` package emits a deprecation warning; installation and native SQLite usage succeeded. No dependency vulnerability audit or production load test was performed.

## Local code change

Only `server/tests/lifecycle.test.js` was changed: register temporary-directory deletion after the database-close hook, and wait for worker exit after receiving results. Windows cannot unlink an open SQLite file; Unix can conceal this cleanup-order issue. Assertions and application behavior are unchanged. The complete backend suite passed after the fix.

## Assessment

The implemented Phase 3 booking flow is coherent and well covered by meaningful database, API, race and browser tests. It is ready for local development and demonstration. Wider deployment needs access controls and operational decisions; larger datasets need bounded queries. Recommendations/alternative-slot suggestions remain deferred. The separate original problem statement is absent, so full requirement compliance cannot be established from this repository alone.
