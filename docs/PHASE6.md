# Phase 6 technical completion report

## A. Implementation and initial audit

Implemented a public EventSync website, real organizer/staff authentication, controlled account provisioning, protected operational APIs, profiles/password settings and a reusable responsive workspace layout. Existing booking, scheduling, recommendations, resource intelligence and simulation pages remain connected to their original backend services.

Work was performed on `new-face` from the clean Phase 5 commit `6b24559`. Before changing code, inspected React entry/routing, existing CSS/Tailwind conventions, shared fields/feedback/cards, centralized API access, Express middleware, SQLite schema/initialization, scheduling/lifecycle services, dependencies and tests. No user accounts or authentication existed. No applicable AGENTS.md or official problem-statement PDF was found; the accessible Phase 6 prompt and verified repository behavior defined scope.

The initial audit identified that `/` was the private dashboard, all operational endpoints were anonymous, navigation was a horizontal topbar, and startup seeding reasserted existing inventory values. The implementation retains the established cream/forest-green typography, form controls, request cards and timelines. It introduces public/protected layouts rather than rewriting feature pages. Risks addressed were accidental client/user conflation, anonymous data access, stale UI auth state, unsafe account creation, cookie/session handling and preserving historical data during additive initialization.

Independently reran the baseline before modifications: **148 backend tests passed, 11 browser workflows passed, production build passed (56 modules)**. No earlier business assertions were removed or skipped.

## B. Public website

`/` is now the public homepage. It contains working desktop/mobile navigation, a product hero, eight descriptions of verified features, a workflow explanation, account-access entry and a functional footer. The reservation illustration is explicitly labeled illustrative and makes no live availability claim. No fictional testimonials, customers, metrics, partnerships or AI guarantees were added.

`/login` provides actual backend credential verification, email/password fields, show/hide, busy state, duplicate-submission locking, generic credential errors and an account-help link. `/access` explains administrator provisioning, first-admin setup and real operator-assisted recovery; it does not pretend to register arbitrary public users or send email. Unknown public URLs render a useful not-found page.

The homepage remains accessible to logged-in users, with an Open dashboard action. Feature/How it works anchors navigate to substantive sections. Mobile menus use native links/buttons, accessible names, expanded state and Escape/focus behavior.

## C. Authentication architecture

### Workspace and account model

Users are authorized organizers/staff; clients remain event customers. Existing event records remain shared organization-level records accessible to authorized ADMIN and STAFF accounts. No historical booking ownership was invented and no tenant isolation is claimed.

The first account is created only through `npm run admin:bootstrap`, using local server/database access. It creates ADMIN once, under a protected immediate transaction, and refuses when accounts already exist. Administrators create STAFF accounts using the real Staff accounts screen or protected API. Accounts are active by default; administrators can disable/enable staff. Disabling revokes their sessions. The bootstrap administrator cannot be disabled through that screen/API, preventing accidental removal of the only administrator. Role escalation through profile or staff-creation payloads is rejected.

There is no public registration or invitation endpoint. Administrators select initial credentials and must arrange secure manual delivery; staff can change passwords afterward. The local operator recovery command resets an account password and revokes that account's sessions. Recovery does not silently enable a disabled account.

### Passwords

Uses server-only bcryptjs **3.0.3**, cost **12**, with generated salts and its maintained `hash`/`compare` implementation. The actual package API and 72-byte behavior were checked against the [official bcryptjs documentation](https://github.com/dcodeIO/bcrypt.js). No custom password hashing algorithm is implemented.

New passwords require at least 12 Unicode characters, cannot be whitespace-only and cannot exceed 72 UTF-8 bytes. Login validation accepts a nonempty password within the byte bound and returns generic incorrect-email/password errors for unknown, disabled or mismatched accounts. Ordinary API responses never include password hashes or credentials. Unknown accounts perform a dummy bcrypt comparison rather than skipping verification work; no formal timing indistinguishability guarantee is claimed.

### Sessions and cookies

Login generates a new 32-byte random opaque session identifier. Only its SHA-256 hash, user foreign key and absolute expiry are stored. The original identifier is sent only in the `eventsync_session` cookie, not in JSON or browser storage. Cookies are HttpOnly, SameSite=Strict, Path=/, and have an eight-hour lifetime. Secure is enabled when `NODE_ENV=production`. Production startup requires an HTTPS `APP_ORIGIN`. A supplied prior session is invalidated on successful login, preventing reuse/fixation of that session identifier.

Every protected request resolves the current account through the database and rejects missing, expired, forged, duplicated-cookie or disabled-account sessions. Sessions persist across server/browser refresh. Expiry is absolute, not sliding. Expired session/attempt rows are removed during login cleanup; they are already invalid even before cleanup.

Logout invalidates the stored session and clears its cookie. The frontend then loads a fresh public document, clearing authenticated React state and pending workspace requests. Browser tests exposed redirect races in the original transition; document-level logout and a centralized password-change notice resolved them. Password changes require the current password and revoke every session belonging to that user, including the active one. The login page displays the backend's success message and requests the new password.

### Request protection and throttling

All unsafe API methods require an Origin matching `APP_ORIGIN` or the request's exact own origin. Missing, `null` or foreign origins are rejected, including on login/logout. The frontend uses same-origin `/api` requests, with cookies managed by the browser. No bearer secrets are stored in localStorage.

Persistent attempt buckets limit login to five attempts per IP/email and 30 per IP within a fixed 15-minute window. A successful login clears its account bucket; the IP bucket still bounds aggregate attempts. Expired buckets clear on subsequent login. Invalid credentials use a generic error; 429 indicates the bounded window. The proxy/IP deployment assumptions require review before hosting behind a shared reverse proxy.

API responses use `Cache-Control: no-store`; responses also set nosniff and same-origin referrer policy. Cookie protection and API authorization are backend-enforced, independent of hidden frontend links.

## D. Database changes and preservation

Additive tables:

| Table | Fields and constraints |
| --- | --- |
| `users` | ID, required name, normalized unique email, password hash, ADMIN/STAFF role, active boolean, created/updated timestamps |
| `sessions` | Hashed token primary key, user foreign key with cascade, expiry; user/expiry indexes |
| `login_attempts` | Hashed IP/account or IP bucket key, bounded attempt count and reset time |

Initialization remains repeatable with foreign keys enabled. No clients, bookings, rejected/cancelled history, confirmation keys or accounts are deleted on startup. The inventory seed now supports preserving existing records; normal startup only fills missing official inventory and retains stored venue/hall values. Internal explicit seed calls retain their original supplied-dataset behavior.

The migration test constructs a legacy database without auth tables containing all demo booking states and confirmation keys, changes inventory/capacity, reopens it and compares every original row. It then provisions an account, establishes a session, reopens again and verifies all records and the valid session survive, with a clean foreign-key check.

The demo reset still affects only demo event records and preserves auth state. No application user ownership column was added to historical bookings.

## E. Frontend architecture and routes

`AuthProvider` centralizes session restoration, user state, login/logout, expiry events and password-change notices. Protected content does not mount before the session check succeeds. A failed network session check offers retry; expired operational requests clear workspace state and lead to login. Session-restoration generations prevent an old response from overriding a newer login, and restored browser documents recheck their session.

Public layout: shared wordmark/header/footer, Home, Login, Account access and not-found experience.

Protected layout: desktop sidebar, active links, current page title, account menu, profile/settings/logout and a mobile collapsible navigation. Native controls remain keyboard-accessible; Escape closes menus and restores focus. Shared inventory cards were extracted into `VenueDirectory` and reused on dashboard/venues rather than copied.

| Route | Experience |
| --- | --- |
| `/` | Public product homepage |
| `/login`, `/access` | Credential entry and controlled access/recovery information |
| `/app` | Authenticated dashboard; `/app/dashboard` redirects here |
| `/new`, `/bookings`, `/bookings/:id` | Existing request/lifecycle/recommendation flows |
| `/clients`, `/schedule`, `/venues` | Event customers, daily schedule and shared inventory |
| `/resources`, `/simulation` | Existing resource intelligence and what-if tools |
| `/profile`, `/settings` | Display-name update, account details and password change |
| `/users` | Administrator-only staff management; backend role check remains authoritative |

Other existing feature URLs remain unchanged. Deep links preserve only safe internal destinations through login. Password-change sign-out returns to the dashboard after the next login. Unknown routes have useful return navigation. No separate redundant recommendation page was introduced; recommendations remain in the relevant rejected/failed-reschedule workflows.

## F. Authentication/account API contracts

Existing success/error envelopes remain `{data: ...}` and `{error: {code,message,details?}}`. Public user objects contain only `id`, `name`, `email`, `role`, `active`, `createdAt`, `updatedAt`.

| Endpoint | Access and actual behavior |
| --- | --- |
| `GET /api/health` | Public SQLite health check |
| `POST /api/auth/login` | Public, origin-checked and throttled; `{email,password}`; sets cookie and returns public user |
| `POST /api/auth/logout` | Origin-checked, idempotent even without a valid session; revokes token and clears cookie |
| `GET /api/auth/me` | Authenticated current public profile/session check |
| `PATCH /api/auth/profile` | Authenticated `{name}` only; role/email updates rejected |
| `POST /api/auth/change-password` | Authenticated `{currentPassword,newPassword}`; returns success message, revokes user's sessions and clears cookie |
| `GET /api/users` | ADMIN-only public account list |
| `POST /api/users` | ADMIN-only `{name,email,password}`; creates STAFF, returns public account with 201 |
| `PATCH /api/users/:id/status` | ADMIN-only `{active:boolean}`; staff enable/disable, revoking sessions on disable |

No bootstrap, public registration, fake email recovery or role-promotion endpoint exists. Missing/invalid input is 400; missing/expired/disabled sessions are 401 `AUTH_REQUIRED`; bad credentials are generic 401 `INVALID_CREDENTIALS`; insufficient roles or origins are 403; duplicate account email/already initialized bootstrap are 409; throttled login is 429. Existing safe unexpected/database error behavior is preserved.

Every operational booking/client/venue/dashboard/recommendation/availability/resource/simulation endpoint is behind the reusable backend session guard. Programmatic mutations must send an allowed Origin and authenticated cookie; merely opening a protected frontend URL grants no API access.

## G. Existing feature integration

The scheduling engine, pure allocator, resource sweep, ranking policy and transaction-protected lifecycle were not rewritten. Historical data remains workspace-wide. Real browser workflows still exercise client/request creation, confirmed/rejected details, persistence, cancellation, successful/failed rescheduling, ranked alternatives, stale selected-venue rejection, history preservation, resources, filters/timelines, read-only simulation and safe application.

All earlier HTTP tests now create an isolated organizer and log in through the actual endpoint. Browser fixtures bootstrap a random test-only organizer in an isolated database and establish a real cookie session before legacy workflows. No production credential was hardcoded and no development authentication bypass was added. Earlier business assertions remain active.

## H. Code structure and significant files

- Backend: `repositories/auth.js`, `services/auth.js`, `utils/passwords.js`, `controllers/auth.js`, `routes/auth.js`, `middleware/auth.js` separate SQL, account logic, hashing, HTTP behavior and guards.
- `db/schema.sql`, `seed.js`, `connection.js` add auth state and preserve existing inventory during startup.
- `scripts/accounts.js`, `demo-account.js`, package scripts provide controlled hidden-password bootstrap/recovery and demo account setup. Protected stdin is supported for automation; malformed JSON is reported generically without echoing potential credentials.
- Frontend: `auth/AuthContext.jsx`, `layouts/PublicLayout.jsx`, `layouts/AppLayout.jsx`, `App.jsx` and `Workspace.jsx` separate authentication/public/protected responsibilities while retaining feature pages.
- `pages/Home.jsx`, `Login.jsx`, `Access.jsx`, `Account.jsx`, `Users.jsx` implement functional public/account flows.
- `components/VenueDirectory.jsx`, `pages/Dashboard.jsx`, API client, styles and HTML metadata provide consistent reuse, personalized welcome, session-aware errors and responsive presentation.
- `server/tests/auth.test.js`, `server/test-support/auth.js` and existing API/browser fixture updates verify auth without weakening prior scheduling tests. bcryptjs is the only added dependency; its exact version is locked.

## I. Actual verification

Executed on Windows with Node 22.18.0/npm 10.9.3. Sockets, workers and Chromium used permitted execution outside the command sandbox. Test databases and random credentials are isolated from development/demo records.

| Command | Actual result |
| --- | --- |
| `npm test` (baseline capture: `phase6-baseline-tests.log`) | 148 passed, zero failed/skipped |
| `npm run test:e2e` (baseline capture: `phase6-baseline-e2e.log`) | Eleven passed, zero failed, 52.1 seconds |
| `npm run build` (baseline) | Passed, 56 modules |
| `npm test` (capture: `npm test *> phase6-tests.log`) | **163 passed, zero failed/skipped** |
| `npm run test:e2e` (capture: `npm run test:e2e *> phase6-e2e.log`) | **16 passed, zero failed**, reported 1.3 minutes |
| `npm run test:e2e -- --grep 'invalid login, protected\|administrator provisions'` | Focused redirect/account regression rerun: two passed after corrections |
| `npm run build` (final) | Passed, 66 modules; frontend JS approximately 296 kB / 91 kB gzip |
| `git diff --check` | Passed during implementation and checked again at handoff |
| Running local HTTP smoke checks | Homepage 200, SQLite health OK, anonymous clients API 401 |

Authentication tests assert real bcrypt hashes and bounds, normalized email uniqueness, controlled bootstrap/CLI behavior, staff permissions/status, generic invalid/unknown/disabled login errors, opaque/hash-only session storage, cookie flags, expiry, logout invalidation, rotation, CSRF origin checks, persistent attempt limits, profile role protection, current-password verification, session revocation/recovery, protected API coverage and legacy migration/restart preservation.

Browser coverage retains all eleven prior scenarios and adds homepage/anchors/access/help/not-found, invalid/valid login, safe deep links, actual cookie restoration, profile persistence, logout and blocked post-logout access, real administrator staff creation/status, staff authorization, password-change logout/login, session-check loading/error recovery, expiry handling, responsive sidebar and Escape interaction. Desktop (1280px), tablet (900px) and mobile (390px) layouts were exercised, with page overflow assertions. Homepage, login, dashboard, tablet and mobile profile screenshots were rendered and visually inspected.

Initial account-transition tests exposed logout navigation and password-change notice races. Those were fixed rather than changing expected behavior: logout now discards the authenticated document, and the central guard carries the real password-change notice to login. No unresolved failures remain in the final executed suites. No comprehensive accessibility or production security audit is claimed.

## J. Security and delivery limitations

This is a single shared organization workspace, not a multi-tenant system. MFA, email verification, external invitations, automated recovery email, forced first-login password changes, password breach screening and an authentication audit trail are not implemented. The server operator remains trusted because they can access the SQLite database. Secure manual delivery of administrator-created staff credentials is an operational responsibility.

Development HTTP intentionally uses non-Secure cookies; use HTTPS, `NODE_ENV=production` and a correct HTTPS `APP_ORIGIN` for deployment. The server binds to all interfaces. Reverse-proxy TLS/host/IP handling, rate-limit behavior for shared proxy addresses, CSP, deployment hardening and external penetration testing need a separate production review. Session identifiers are protected by hashes, but SQLite files/backups are not encrypted by this implementation and require filesystem protection. No certification or complete security guarantee is claimed.

Sessions expire after eight hours and expired-row cleanup occurs on login. Confirmation keys retain their earlier no-expiry policy. General booking/client lists remain unpaginated; recommendation search remains bounded to its declared grid/horizon. Earlier no-auth/startup-seeding descriptions in historical Phase 1–5 reports describe those stages and are superseded by this report. The official problem-statement PDF remains unavailable.

## K. Exact application access

For a new development database, from the repository root:

```sh
npm ci
npm run db:init
npm run admin:bootstrap
npm run dev
```

Enter your own administrator display name, email and password at the terminal prompts. Password input is hidden; no default account or password is supplied. Open http://localhost:5173, choose Log in, and use the account you created. The protected dashboard is http://localhost:5173/app. To provision staff, open Staff accounts as the administrator. To recover an existing account, the trusted operator runs `npm run admin:recover` against that database.

For the dedicated demonstration database:

```sh
npm run demo:reset
npm run demo:admin
npm run demo:dev
```

Run `demo:admin` only for its first account; a repeated bootstrap correctly refuses. Resetting demo event records does not delete accounts or reset passwords. Stop any running service before resetting its demo data. Follow [DEMO.md](DEMO.md) after login for the thirteen scheduling/resource/simulation scenarios. The usual development database is not reset.

Copy `.env.example` to `.env` if needed. `DB_PATH` chooses the database (relative paths resolve from `server/`), `PORT`/`API_PROXY_TARGET` configure API proxying, `VENUE_TIME_ZONE` configures dashboard civil-time comparisons, and `APP_ORIGIN` declares the browser origin. A local production-style build can use `npm run build` then `npm start`; real deployment must use HTTPS/production cookie configuration.

Tests: `npm test`; install Chromium once using `npx playwright install chromium`, then run `npm run test:e2e`. Do not create real operator credentials in test source, logs or command arguments. This report contains no account password or session secret.

Phase 6 is complete within the verified scope. No additional phase or hosting deployment was performed.
