# EventSync — Phase 4

A local event-request workspace for clients, campus venues, and automatically allocated bookings. React + Vite + Tailwind CSS, Express 5, and SQLite via better-sqlite3. No external accounts or paid services are needed.

New requests are automatically **CONFIRMED** with a venue/hall or **REJECTED** with constraint explanations. Capacity, buffered hall conflicts and peak shared-resource usage are checked atomically. Historical Phase 1 pending requests remain unchanged. Confirmed bookings can now be cancelled or rescheduled from their details page. Failed rescheduling preserves the original reservation. See [lifecycle design](docs/LIFECYCLE.md) and [scheduling design](docs/SCHEDULING.md).

## Quick start

Use Node.js **22.13 or newer** (tested on 24.19.0) and npm. Run from the repository root:

```sh
npm ci
npm run db:init
npm run dev
```

The dashboard runs on port 5173 and the API on port 3001. Vite proxies `/api` to Express. `npm run dev` starts both processes; Ctrl+C stops them. Alternatively, run `npm run dev:server` and `npm run dev:client` in separate terminals. Commands work with npm on Windows as well as Linux; native better-sqlite3 builds may require platform build tools if a prebuilt binary is unavailable.

Optional: copy `.env.example` to `.env`. `PORT` changes the API port; update `API_PROXY_TARGET` to match, then restart both services. `DB_PATH` is resolved relative to `server/` unless absolute; the default is `server/data/eventsync.sqlite`. Database files and `.env` are ignored by Git. No secrets are required. Dates and times represent **venue-local civil time**, without timezone conversion; timestamps use UTC. The venue's geographic timezone was not supplied. `VENUE_TIME_ZONE` defaults to UTC for dashboard time comparisons; set an IANA zone such as `Asia/Kolkata` for the campus. Stored event dates/times are never converted.

## Use the application

1. View all three venues and their six halls on Overview. Inventory is venue-wide, shared by its halls.
2. Open Clients and create a client (name required; email and phone optional).
3. Create an event request. Select the client and preferred venue and fill in event details and resource quantities.
4. Submit to receive a confirmed allocation or a persisted rejection with explanations. Event requests displays stored requests and supports date/status filters. Click an event name for its database-backed details.
5. Restart the application or refresh the browser: clients and requests remain in SQLite. The footer's Refresh data action retrieves changes made by other sessions.

Each event includes 30 minutes of setup and 30 minutes of cleanup within 08:00–22:00. Therefore the earliest event start is 08:30 and latest event end is 21:30. Same-day positive durations only; past dates are permitted because the supplied requirements do not prohibit them. No allocation is implied by the venue directory.

## Commands

| Command              | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `npm run dev`        | Start frontend and backend                                   |
| `npm run dev:client` | Vite development server                                      |
| `npm run dev:server` | Express with Node watch mode                                 |
| `npm run db:init`    | Create missing tables and seed official data                 |
| `npm run db:seed`    | Same idempotent initialization and seeding                   |
| `npm test`           | Isolated SQLite, time, and HTTP integration tests            |
| `npm run build`      | Build React into `client/dist`                               |
| `npm start`          | Express API; also serves built frontend if present           |
| `npm run test:e2e`   | Real-browser workflow against isolated database and services |

For browser tests, install Chromium once with `npx playwright install chromium`. On this prepared cloud machine Chromium is installed at `/usr/bin/chromium`; run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` on Linux, or set the same variable using your shell's native syntax. Browser tests use ports 3101 and 5174; keep them free. Tests create temporary databases and remove them after completion. Socket/browser restrictions in managed sandboxes may require running test commands with the environment's permitted execution access.

For a local production-mode check, run `npm run build` followed by `npm start` and open port 3001. React routes fall back to `index.html`; unknown `/api` endpoints still return JSON 404 errors. The build is needed before starting Express to enable static serving.

## Architecture and ownership

- `client/src/pages/`: Overview, client management, request submission, request listing and details. Controlled native form inputs, loading/error/empty states and responsive layout.
- `client/src/components/`: page headings, fields, status/feedback and request presentation.
- `client/src/services/api.js`: the only frontend HTTP access layer; consistently decodes success/error responses. Same-origin `/api` supports both development proxy and Express static serving.
- `server/src/routes/` registers endpoints; `controllers/` handles HTTP orchestration; `services/` validates inputs and owns application transactions; `repositories/` owns parameterized SQL and camelCase response mapping.
- `server/src/utils/time.js`: strict calendar/time parsing, minutes-from-midnight conversion and reservation buffers, reused by the allocation engine.
- `server/src/db/`: centralized connections, non-destructive schema creation and transactional idempotent official seeding. WAL, foreign keys and busy timeout are enabled. Initialization never deletes clients or requests.
- `server/src/middleware/`: consistent errors with safe public messages; unexpected details are logged only on the server.
- `server/tests/` and `e2e/`: database/API/time and real-browser integration tests.

## Database

Four tables: `clients`, `venues`, `halls`, `bookings`. A client has many requests; a venue has many halls and venue-wide resource inventory. Requests reference clients and preferred venues. Nullable allocated venue/hall fields support future scheduling, with a composite foreign key preventing hall/venue mismatches. States are `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`; pending rows cannot have allocation and confirmed rows must have it. Numeric, interval, status and relationship constraints are enforced in SQLite, with stricter calendar/type validation in the service layer. Indexes cover date, status, hall/date/interval and allocated venue/date/interval.

Booking rows store event date, integer event and reserved start/end minutes, attendees, requested resources, allocation fields, status, optional rejection reason, and creation/update timestamps. Inventory is never duplicated onto halls and no mutable utilization counter is stored. Future lifecycle services must update `updated_at` explicitly; Phase 3 exposes guarded lifecycle updates but no delete endpoint. Startup additively migrates `reason_details` for structured rejection explanations without changing historical rows. Future schema changes require deliberate non-destructive migrations.

| Venue   | Halls and capacities       | Projectors | Audio systems | Support staff |
| ------- | -------------------------- | ---------- | ------------- | ------------- |
| Venue A | Hall A1: 60; Hall A2: 150  | 2          | 2             | 5             |
| Venue B | Hall B1: 100; Hall B2: 200 | 2          | 1             | 4             |
| Venue C | Hall C1: 80; Hall C2: 250  | 3          | 2             | 6             |

Seeding upserts this fixed inventory and hall capacities by stable unique names, preserving IDs and all clients/requests. Startup reasserts the supplied official data. Database contents persist on disk across restarts; back up the database appropriately before future migrations.

## API contract

See [docs/API.md](docs/API.md) for exact requests, fields, response shapes and errors. All endpoints are database-backed; no fake booking records are shipped.

## Scope, assumptions and handoff

The Phase 1 and Phase 2 implementation prompts were accessible. The separately referenced official problem statement and research reports remain unavailable. Rules and sample scenarios follow the supplied prompts. Equal choices use capacity, venue ID, then hall ID; this is a documented implementation assumption.

Cancellation and atomic rescheduling are implemented. Alternative recommendations for rejected requests are implemented; optional rescheduling recommendations remain deferred. No authentication is implemented; this is a local college prototype. See [lifecycle design and Phase 4 handoff](docs/LIFECYCLE.md) for transaction ownership, complexity and extension points.

## Manage bookings

Open a confirmed booking's details to reschedule or cancel it. Cancellation asks for confirmation and retains historical allocation details labeled as released. Rescheduling prefills current scheduling fields; failed proposals keep those entries for correction and leave the original booking visible. Only confirmed records expose lifecycle actions.

The daily Schedule view lists confirmed events for a selected date, grouped by venue, with event and buffered intervals. Booking lists filter by date, status and allocated venue. The dashboard uses `/api/dashboard` for all lifecycle counts and the next ten confirmed events. Successful mutations refetch shared data; other browser sessions can use Refresh data to retrieve changes.

## Search alternatives

Open a rejected request using **Find alternatives**, then choose **Search alternatives**. The default search uses a 15-minute grid on the requested date and returns up to five options. You can expand to three or seven total days and change ranking priority. Select an option and explicitly confirm it to submit a new booking; original rejected history remains unchanged. Availability is rechecked before confirmation.

See [recommendation design and API](docs/RECOMMENDATIONS.md) for search bounds, ranking, complexity, and deferred rescheduling recommendations.
