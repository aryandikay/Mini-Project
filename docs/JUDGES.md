# Judges' technical reference

**Problem.** Coordinate clients competing for capacity-limited halls and venue-wide projectors, audio systems and staff. Event time alone is insufficient: each reservation includes 30 minutes of setup and cleanup inside 08:00–22:00. The supplied prompts are our requirements source; the separate official problem statement was unavailable.

**Architecture.** React owns forms, presentation and API state. Express separates routing, thin controllers, validated services and SQL repositories. SQLite stores clients, venues, halls and booking history. The pure scheduler has no HTTP or database dependencies, allowing focused tests. This structure supports the college prototype without extra services or state-management dependencies.

**Why SQLite?** A local database is easy to initialize, persist and demonstrate, and provides foreign keys, constraints and ACID transactions. WAL permits readers while a writer works, but there is still one writer. This is not a distributed or high-throughput architecture. No load benchmark or scalability guarantee is claimed.

**How do you prevent double bookings?** The service begins an immediate transaction before availability-sensitive reads. It reads confirmed bookings, computes allocation and writes the decision under one writer lock. Independent worker connections contend at a barrier in tests. Hall races, resource races, reschedule/new, reschedule/reschedule and cancel/reschedule are exercised. Tests also run an independent whole-database invariant oracle, rather than trusting only returned statuses.

**How are intervals handled?** Reserved interval = event interval expanded by 30 minutes at both ends. Half-open overlap is `a.start < b.end && b.start < a.end`. Adjacent reserved intervals may meet exactly. Equipment and staff are held for the buffered interval too.

**How are resources shared?** Each venue owns one inventory. The scheduler clips overlapping confirmed reservations to the candidate interval and sweeps start/end deltas, including the new request. Equal-time changes are aggregated before measuring the next segment. The maximum simultaneous usage for each resource must fit the inventory. Summing every overlapping booking would overestimate demand when those bookings do not overlap each other.

**Why deterministic?** Preferred venue is evaluated first, choosing its smallest capacity-eligible unoccupied hall if all resources fit. Otherwise fallback uses hall capacity, venue ID and hall ID. Stable tie-breaks make decisions reproducible; they are documented assumptions, not a claim of global optimality.

**Cancellation and rescheduling.** Cancellation retains the historical record and changes status; confirmed-only queries immediately release its reservations. Rescheduling excludes only itself, validates the full proposal and updates atomically. Failure leaves the entire original row unchanged. The UI sends an expected timestamp to reject stale edits; API callers can omit it and receive serialized latest-state behavior.

**Recommendation innovation.** A bounded grid searches the requested date and up to six following dates, preserving duration, attendance and resource needs. Every candidate passes the same allocator. Ranking favors preferred venue (optional), requested date, time-of-day proximity, then capacity/IDs/time. At most 371 candidates are evaluated with current bounds. Preview writes nothing and is not a reservation. Selection creates a new request through the normal transaction; a stale suggestion may be rejected or validly fall back. This makes rejection actionable without falsely promising availability. It is useful integration of deterministic scheduling and alternatives, not an unsupported novelty or optimality claim.

**Analytics.** Actual confirmed reservations provide peak simultaneous demand, resource-minutes, time-weighted utilization and hall occupancy for a selected date/interval. Cancellation and rescheduling change the next snapshot. Peak divided by capacity is explicitly distinguished from average utilization. No fabricated charts or cached availability are used.

**Complexity.** See [SCHEDULING.md](SCHEDULING.md) for exact implementation bounds. With a fixed six halls/three venues, resource interval sorting is O(n log(n+1)); candidate recommendations multiply allocator work by bounded candidate count. Analytics filters by date and sweeps actual reservations. Large histories still need pagination, measured query tuning and possibly a different deployment architecture.

**Limits.** Local trusted-user prototype: no authentication, authorization, payment, email, multi-timezone conversion, multi-day events or distributed lock service. Dates/times are venue-local; upcoming events use a configurable IANA timezone (default UTC). Past dates are allowed. Optional reschedule recommendations and what-if UI are deferred. Database constraints do not independently encode every cross-row scheduling rule: supported writes must go through services. Busy-timeout exhaustion fails safely but currently uses a generic error. No full accessibility certification or cross-browser matrix has been performed.

## Rubric evidence (not predicted marks)

| Supplied category | Evidence |
|---|---|
| Problem Understanding — 15 | Traceability matrix, exact inventory, buffered intervals, shared-resource explanation |
| Algorithm Design — 20 | Pure deterministic allocator, interval sweep, bounded recommendations, documented complexity |
| Technical Implementation — 30 | React/Express/SQLite integration, transaction-safe lifecycle, analytics and automated verification |
| Project Demonstration — 15 | Separate deterministic demo database, repeatable walkthrough, actual browser flows and restart checks |
| Judges' Questions — 20 | This reference, API/algorithm documents, explicit tradeoffs and known limits |
