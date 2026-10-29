# Reproducible EventSync demonstration

Run with Node >=22.13 after `npm ci` and `npx playwright install chromium` if browser tests are desired. Stop existing dev services before starting demo services on the same ports.

```sh
npm run demo:reset
npm run demo:dev
```

Open http://localhost:5173. The reset command explicitly resets only `server/data/eventsync-demo.sqlite`, ignores `DB_PATH`, builds scenarios using real services and asserts actual outcomes. Failure rolls back the reset transaction. It does not delete database files or touch `server/data/eventsync.sqlite`. The launch command uses the dedicated path and refuses to run if it has not been initialized. Do not reset while a demo server is running. Restart with `npm run dev` to return to normal development data.

The fixed date is 2030-03-20; use the date selectors even if the current calendar date differs. Initial records are deterministic, with 10 CONFIRMED, one REJECTED and one CANCELLED request. IDs below match a fresh reset; the generated `server/data/demo-manifest.json` is authoritative.

| Scenario | Verified record / action |
| --- | --- |
| 1. Successful booking | #1 Campus conference, 2030-03-20 10:00–12:00, Venue A / Hall A2 |
| 2. Preferred venue and smallest hall | #2 Parallel workshop, 50 attendees, same time in Venue A / Hall A1 |
| 3. Alternative venue fallback | #3 Hall conflict fallback, 120 attendees, Venue B / Hall B2 because A2 is occupied |
| 4. Shared-resource conflict | On 2030-03-21 #4 uses both Venue A projectors in A1; #5 falls back to B2 even though A2 is free |
| 5. Setup/cleanup conflict | On 2030-03-22 #6 ends at 12:00 and reserves through 12:30; #7 starts at 12:30 but its setup begins 12:00, so it falls back to B2 |
| 6. Rejection | #8 reserves C2 for a full-day exhibition on March 20; #9 needs 250 seats and is rejected that day |
| 7. Alternative recommendation | The builder searches #9's requirements over March 20–21 and verifies C2 on March 21 at 10:00 |
| 8. Successful recommendation confirmation | #10 is the real selected March 21 C2 booking; #9 remains REJECTED |
| 9. Cancellation and resource release | #11 Cancelled seminar retains historical A2 allocation on March 23; #12 successfully reuses that capacity before moving |
| 10. Atomic rescheduling | #12 retains its ID and is moved from March 23 to March 24 |
| 11. Failed reschedule preservation | Builder attempts to move #12 with 999 attendees, verifies failure and compares all original fields |
| 12. Resource timeline | Resources → March 20 / Venue A / 10:00 shows two halls and peaks of 2 projectors, 2 audio, 5 staff; inspect 12:30 to see zero usage |
| 13. What-if simulation | Open #1 → Explore a what-if change → 15:00–17:00 → Simulate. The result is feasible and #1 remains unchanged unless explicitly applied |

## Live presentation procedure

1. Overview: inspect venue inventory, lifecycle counts and existing requests. Open Schedule on March 20 to explain the event and buffered intervals.
2. Resources: choose March 20 / Venue A. Inspect 09:30 (setup already consumes inventory), 10:00 (both events active), and 12:30 (cleanup has ended). Open a timeline bar to show database-backed booking details.
3. What-if: open #1 and simulate 15:00–17:00. Show original/proposed intervals and explain that no reservation changed. Set attendees to 999 and simulate again to show a true capacity failure without mutation. Restore values and apply only if you intend to change the demo state.
4. Rejected history: open #9, search the requested date (empty), then expand to seven dates. Because #10 is already confirmed on March 21, the current search reflects that constraint and can propose March 22 at the original time. Confirming creates an additional real booking and leaves #9 rejected.
5. Atomic lifecycle: open #12, attempt a 999-attendee reschedule and show unchanged details. Cancel #12 to demonstrate historical status/resource release, or move it to a free date to demonstrate identity preservation.
6. Reset explicitly and restart the demo before another presentation to restore all deterministic outcomes.

The demo builder and browser tests verify the underlying services/UI. Demonstration suggestions are not hardcoded frontend outcomes. Any interactive changes affect subsequent availability and must be explained as real database state.
