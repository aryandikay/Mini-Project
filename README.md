# EventSync — Phase 6

EventSync is a local campus event-planning workspace that allocates halls and shared equipment, explains conflicts, recommends alternative arrangements, and lets managers inspect resources and simulate changes before committing them.

## Problem and scope

Multiple clients compete for halls, projectors, audio systems and support staff. A hall can be free while its venue's shared equipment is exhausted. Setup and cleanup also reserve capacity. EventSync evaluates those constraints together and preserves historical booking records.

The separate official problem-statement PDF was unavailable. The rules below follow the supplied implementation prompts; full compliance with an inaccessible document is not claimed. This is a single-organization prototype with controlled staff accounts and server-side authentication.

## Features

- Public product homepage, organizer login, protected workspace, profile/settings and administrator staff management.
- Client management and the official three-venue/six-hall directory.
- Automatic confirmation or persisted rejection with constraint explanations.
- Atomic cancellation and rescheduling, including preservation after failed proposals.
- Daily schedule, lifecycle counts, upcoming events and request filters.
- Ranked alternative time/date/venue recommendations with explicit confirmation.
- Resource intelligence by venue/date, concurrent usage inspection, peak/full-use intervals, and hall/resource timelines.
- Read-only what-if simulation for new events and confirmed-booking changes, with original/proposed comparison and a separate protected apply action.
- Deterministic, isolated demonstration data and automated database/API/browser tests.

## Allocation constraints and algorithm

| Venue | Halls and capacity | Projectors | Audio systems | Staff |
| --- | --- | --- | --- | --- |
| Venue A | A1: 60; A2: 150 | 2 | 2 | 5 |
| Venue B | B1: 100; B2: 200 | 2 | 1 | 4 |
| Venue C | C1: 80; C2: 250 | 3 | 2 | 6 |

Operating hours are 08:00–22:00. Each event reserves 30 minutes before and after execution, so events must fit 08:30–21:30 on one date with positive duration. Attendance and resource quantities are validated integers. Past dates are allowed by the supplied requirements.

Reservation intervals are half-open: `[start, end)`. A reservation ending at 12:30 can be followed by one beginning at 12:30 without overlap. Bookings use their complete buffered interval for hall and shared-resource checks.

The pure `allocate()` evaluator tries the preferred venue first and chooses its smallest free hall that seats the attendees, provided venue-wide resources remain feasible throughout the interval. Otherwise it evaluates other venues, with capacity, venue-ID and hall-ID tie breaks. Resources are counted by a boundary sweep: aggregate simultaneous starts/ends, then measure the following segment. Disjoint reservations are not incorrectly summed as concurrent demand.

Creation rechecks current reservations inside a SQLite immediate transaction. Feasible requests become CONFIRMED; infeasible normal submissions persist as REJECTED without reserving resources. Only CONFIRMED rows consume capacity. Cancellation retains historical allocation but releases it. Rescheduling excludes itself, checks a proposal and commits atomically; an infeasible proposal leaves all original fields unchanged. The UI sends `expectedUpdatedAt` to reject stale edits.

## Recommendations

The engine evaluates a bounded grid plus the exact requested clock time, using the same allocator. Duration, attendance and resources stay unchanged. Defaults are a 15-minute grid, original date only and five results; the API supports up to seven dates and 20 results. Ranking prioritizes preferred venue, original date, absolute clock-time difference, hall capacity and stable IDs/date/time.

Previews are provisional, not reservations. Selected confirmation uses the existing booking endpoint, revalidates current availability and requires the chosen venue. A different venue is never silently substituted. Creation retries use persisted confirmation keys; same key/input returns the same current booking, different input returns a conflict, and failed transactions leave no orphaned key. Keys do not expire in this prototype. Details: [Phase 4 report and contract](docs/PHASE4.md).

## Resource intelligence and timeline

Open **Resources**, select date/venue, and inspect a time within 08:00–22:00. The API returns confirmed bookings scoped to that venue/date, a full-day usage sweep, inventory, daily peaks, peak intervals and full-use intervals. At the inspection time, the UI looks up the corresponding backend segment and shows used/available units. At 22:00 the operating window is closed and usage is zero.

No ambiguous utilization percentages are displayed. Peak means the maximum simultaneous unit demand over the operating window; instantaneous usage means demand in the selected half-open segment. Idle resources have no peak-demand intervals, and zero inventory is not labeled fully utilized. Inconsistent persisted over-capacity demand is exposed rather than silently clamped.

All hall and resource rows share the same time scale. Light reservation ends show setup/cleanup and solid centers show execution. Booking bars and the accompanying reservation list open actual details. Small screens scroll within the timeline rather than overflowing the page.

## What-if simulator

Open **What-if** or choose **Explore a what-if change** from a confirmed booking. New hypothetical requests need scheduling requirements only. Existing-booking simulations fetch fresh details, require the current concurrency token and exclude only that validated CONFIRMED record. Change date, time, attendance, resources or preferred venue and select **Simulate proposal**.

The response compares original/proposed intervals and allocations, explains infeasibility or preferred-venue fallback, and lists overlapping preferred-venue reservations without claiming every overlap blocks the request. Simulation performs no inserts, updates, cancellations or confirmation-key writes.

A feasible preview can be applied separately: select a client/name for a new booking or apply the existing booking's reschedule. Both use existing protected endpoints, recheck current availability and require the simulated venue. The scheduler may choose another suitable hall within that venue if state has changed. Stale tokens or unavailable selections produce errors and preserve the original booking. Reload original inputs or rerun the simulation to recover.

## Stack and architecture

Node.js >=22.13, npm workspaces, React 19.2, React Router 7, Vite 7, Tailwind CSS 4, Express 5, better-sqlite3 12.4, bcryptjs 3.0.3 and Playwright 1.56. No external services or charting dependencies are required.

- `client/src/pages/`: overview, clients, request creation/list/details, daily schedule, resources and simulation.
- `client/src/components/`: shared forms/feedback, lifecycle actions, recommendations and SVG timelines.
- `client/src/services/api.js`: centralized success/error decoding and same-origin HTTP calls.
- `server/src/routes/` and `controllers/`: thin HTTP handling.
- `server/src/services/`: validation, scheduling, shared resource sweep, recommendations, analytics, simulation and transaction ownership.
- `server/src/repositories/`: parameterized SQL and response mapping.
- `server/src/db/`: schema, connections, additive initialization and official data seeding.
- `server/tests/`, `e2e/`: isolated database/API/concurrency and real-browser verification.

SQLite stores clients, venues, halls, bookings, recommendation confirmation keys, users, sessions and login-attempt buckets. Foreign keys, status/interval/type checks and indexes are enabled. WAL and a five-second busy timeout are configured. Resource usage is derived, never stored as mutable counters. Startup additively creates missing schema and missing official inventory while preserving existing inventory, clients, bookings, keys and accounts.

## Accounts and access

The public website is `/`; the protected dashboard is `/app`. Existing `/bookings`, `/clients`, `/schedule`, `/resources` and `/simulation` URLs remain protected and functional. `/venues`, `/profile`, `/settings` and administrator-only `/users` complete the workspace. Unauthenticated deep links go to login and return to a validated internal destination after authentication.

Event clients are customers, not login users. Authorized ADMIN and STAFF accounts share the organization's existing event records; no tenant isolation or per-booking ownership is claimed. There is no public signup endpoint.

For a new installation, run `npm run admin:bootstrap` from the root. Supply your own name, email and password in the interactive terminal; password entry is hidden. This command creates the first administrator only and refuses to run after accounts exist. No default password is shipped. Administrators create STAFF accounts at **Staff accounts** and arrange a secure credential handover. Staff can change their password in Settings.

Passwords use salted bcrypt with cost 12. New passwords require at least 12 Unicode characters, must not be whitespace-only, and cannot exceed bcrypt's 72 UTF-8 byte limit. Passwords/hashes never appear in ordinary account responses. Session credentials are random opaque values in HttpOnly, SameSite=Strict cookies; only token hashes are stored server-side. Sessions expire absolutely after eight hours. Password changes and operator recovery revoke all sessions; disabling staff revokes theirs. Logout invalidates the session, clears its cookie and loads a fresh public document to discard authenticated React state and pending requests.

There is no email recovery service. A trusted server operator can run `npm run admin:recover`, supply the account email and enter a new password privately. These CLI operations require access to the server and its database. Keep the database and terminal restricted to trusted operators. Advanced automation can use `-- --stdin` with protected JSON input; never put passwords in command arguments or commit credentials.

State-changing HTTP requests must include the configured browser Origin or the request's exact same origin. Cookies are sent automatically by the same-origin frontend API client. Login attempts are bounded per IP/account and per IP in persistent 15-minute windows. This is targeted application security, not a comprehensive audit or a production certification. See [Phase 6 security and configuration report](docs/PHASE6.md).

## Main API endpoints

All successful results use `{data: ...}`; failures use `{error: {code, message, details?}}`. Operational endpoints require a valid session. Health and login remain public; logout can clear an absent/expired cookie.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout` | Establish/invalidate the cookie session |
| `GET /api/auth/me`, `PATCH /api/auth/profile` | Session restoration and display-name update |
| `POST /api/auth/change-password` | Verify current password, change it and revoke sessions |
| `GET/POST /api/users`, `PATCH /api/users/:id/status` | ADMIN-only staff provisioning/list/status |
| `GET /api/health` | SQLite health check |
| `GET/POST /api/clients` | List/create clients |
| `GET /api/venues` | Venues, halls and shared inventory |
| `GET/POST /api/bookings` | Filter/list or create requests |
| `GET /api/bookings/:id` | Persisted details |
| `PATCH /api/bookings/:id/cancel` | Cancel confirmed booking |
| `PATCH /api/bookings/:id/reschedule` | Atomic rescheduling |
| `GET /api/dashboard` | Counts and upcoming events |
| `POST /api/availability/check` | Existing availability preview |
| `POST /api/recommendations` | Read-only alternatives |
| `POST /api/bookings/:id/recommendations` | Trusted reschedule alternatives |
| `GET /api/analytics/resources?venueId=1&date=2030-03-20` | Venue/date resource intelligence |
| `POST /api/simulation` | Read-only new/existing what-if evaluation |

Exact contracts: [API documentation](docs/API.md), [Phase 4](docs/PHASE4.md), [Phase 5](docs/PHASE5.md), [Phase 6](docs/PHASE6.md).

## Installation and development

Use Node.js 22.13 or newer and npm. From the repository root:

```sh
npm ci
npm run db:init
npm run admin:bootstrap
npm run dev
```

Public homepage: http://localhost:5173. Log in at `/login`, then open `/app`. API health: http://localhost:3001/api/health. Vite proxies `/api` to Express. Ctrl+C stops both processes. Alternatively use `npm run dev:server` and `npm run dev:client` in separate terminals. Native SQLite builds may require platform build tools if no prebuilt binary is available.

Optionally copy `.env.example` to `.env`. Default database: `server/data/eventsync.sqlite`. Relative `DB_PATH` values resolve from `server/`. Set `APP_ORIGIN` to the actual frontend origin (default `http://localhost:5173`); update it if using a different host/port. If changing `PORT`, update `API_PROXY_TARGET` and restart both services. For deployment, use HTTPS, `NODE_ENV=production` and an HTTPS `APP_ORIGIN`; production startup rejects an HTTP application origin and enables Secure cookies. `VENUE_TIME_ZONE` defaults to UTC; this local workspace uses `Asia/Kolkata`. Event dates/times are venue-local civil values and are never timezone-converted; audit timestamps use UTC.

For a production-style local check, run `npm run build`, then `npm start` and open http://localhost:3001. Express serves the built frontend and React route fallback; unknown API routes remain JSON 404 errors. Rebuild before restarting to pick up frontend changes.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development UI and API |
| `npm run build` | Production frontend build |
| `npm start` | API and built frontend |
| `npm run db:init` / `npm run db:seed` | Non-destructive schema/official seed initialization |
| `npm test` | Backend, API, database, concurrency and demo tests |
| `npx playwright install chromium` | Install browser once |
| `npm run test:e2e` | Real-browser workflows on isolated ports 3101/5174 |
| `npm run demo:reset` | Explicitly replace only the dedicated demonstration dataset |
| `npm run demo:dev` | Start development services against the demonstration database |
| `npm run admin:bootstrap` | Create the first administrator in the configured database |
| `npm run admin:recover` | Operator-assisted password reset and session revocation |
| `npm run demo:admin` | First-admin setup for the dedicated demo database |

On managed environments, sockets, workers or browser execution may require permitted execution outside the command sandbox. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium; use your shell's syntax to set it. Test databases and randomly generated test accounts are isolated from development/demo records. Existing HTTP/browser tests authenticate through legitimate fixtures. Latest actual results and limitations are in [Phase 6 report](docs/PHASE6.md).

## Demonstration workflow

Stop any running development services, then:

```sh
npm run demo:reset
npm run demo:admin
npm run demo:dev
```

Reset affects only event demonstration records in `server/data/eventsync-demo.sqlite`, regardless of `DB_PATH`. It does not reset the normal development database or delete accounts/sessions. Run `demo:admin` only when that demo has no accounts; use operator recovery for an existing account. Do not reset the demo while its server is running. The verified manifest is written to `server/data/demo-manifest.json`. Log in with the administrator account you supplied.

Open Resources, select **2030-03-20 / Venue A / 10:00** for two occupied halls and peaks of **2 projectors, 2 audio systems and 5 staff**. Open the conference, explore a what-if move and compare results. Inspect rejected history, search alternatives, and demonstrate cancellation or atomic rescheduling. Full reproducible steps for all 13 scenarios: [Demo guide](docs/DEMO.md).

## Limitations and delivery status

The official PDF was unavailable. Payments, waitlists, cloud infrastructure and subsequent phases are not implemented. The servers bind to all interfaces; use a controlled local network and HTTPS for deployment. No comprehensive security audit, production load test or production-scale claim is made. MFA, email verification, automated recovery and invitation delivery are not implemented; access is controlled through the administrator/CLI model.

Recommendation search is bounded and may miss unsampled minutes. Simulations and analytics are snapshots, not live reservations. General client/booking lists remain unpaginated. Confirmation keys have no expiry. Windows was verified locally; other platforms were not reverified for Phase 5. Historical reports remain available in `docs/` and describe their respective implementation stages.
