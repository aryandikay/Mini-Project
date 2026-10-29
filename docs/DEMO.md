# Reproducible technical demonstration

The dataset follows the supplied phase prompts. The separate official PDF is unavailable. Demo date is **2030-04-15**; select this date explicitly in Schedule and Utilization. If demonstrating after this date, the events remain in history and will no longer appear as upcoming.

## Prepare safely

Stop any process using the demo database, then run from the repository root:

```sh
npm ci
npm run demo:reset
```

This explicit command resets **only `server/demo-data/eventsync-demo.sqlite`**. It accepts no alternate filename, ignores `DB_PATH`, refuses symlinks at its target, and does not delete the normal database. It transactionally clears demo records, restores the supplied venue inventory, and loads deterministic events through the normal services. A failed assertion or load rolls back the reset. Repeated invocations reproduce IDs/decisions; creation timestamps naturally differ. Do not point a normal installation at this demo file if you want to retain its contents.

To run the demo on Linux/macOS:

```sh
DB_PATH=./demo-data/eventsync-demo.sqlite npm run dev
```

On PowerShell:

```powershell
$env:DB_PATH='./demo-data/eventsync-demo.sqlite'
npm run dev
```

Alternatively set `DB_PATH=./demo-data/eventsync-demo.sqlite` in your local `.env`. Restore the normal path afterwards. Startup never resets records. The normal database remains `server/data/eventsync.sqlite`.

For a production-mode demo, run `npm run build` and then `DB_PATH=./demo-data/eventsync-demo.sqlite npm start`; open port 3001. Development uses port 5173.

## Seeded records and walkthrough

All demo requests supply client, event name/date, event times, attendees, preferred venue and all three resource quantities. The command prints IDs and verifies expectations rather than forcing allocations.

| ID | Scenario on 2030-04-15 | Expected persisted outcome |
|---|---|---|
| 1 | Conference: A preferred, 120 attendees, 10:00–13:00, 1 projector, 0 audio, 3 staff | Confirmed A2 |
| 2 | Workshop: A preferred, 50 attendees, 11:00–14:00, 1 projector, 0 audio, 2 staff | Confirmed A1 |
| 3 | Buffered conflict: A preferred, 100 attendees, 13:15–15:15, 1 projector, 0 audio, 3 staff | Confirmed B1; A2 cleanup overlaps and A1 is too small |
| 4 | Same conference request but 7 staff | Rejected; all venues lack sufficient staff |
| 5 | C preferred, 250 attendees, 10:00–12:00, 1 projector, 0 audio, 3 staff | Confirmed C2 |
| 6 | C preferred, 250 attendees, 12:15–13:15, 1 projector, 0 audio, 3 staff | Rejected: buffered C2 overlap; alternatives available |
| 7 | A preferred, 50 attendees, 17:00–18:00, 2 projectors, 2 audio, 5 staff | Cancelled, historical allocation retained |
| 8 | Same evening slot/resources as #7, then moved to 18:00–19:00 | Confirmed A1; demonstrates reuse and successful reschedule |

1. Open Overview: five confirmed, two rejected, one cancelled, three venues, six halls. Inspect inventory and the two initial allocations. Open Clients to inspect the real saved client.
2. Open #3 and Schedule for the demo date. Explain the 30-minute buffers and fallback to B1. Open #4 to inspect per-venue resource explanations.
3. Open #1 → Reschedule booking → attendees 999 → Save. The API returns 409 and the original A2 booking remains intact. Discard the proposal. The reset command also executes this failed proposal and asserts preservation.
4. Open #8 to inspect the successful move to 18:00–19:00. Open #7 to see retained cancelled history. Optionally cancel #8 through its explicit confirmation UI and submit a new request for that slot to show live release.
5. Open rejected #6 → Search alternatives → select option 1 → Confirm alternative. It is submitted as a **new** request through transactional scheduling; #6 remains rejected. The default earliest closest feasible slot is 13:00–14:00 in C2.
6. For stale-preview behavior, reset the demo and search #6 in one tab. In another tab create a 250-attendee C-preferred event for the displayed alternative with the same quantities. Confirm the old suggestion in the first tab: revalidation rejects the conflicting request (only C2 has capacity). Search again.
7. Open Utilization, choose 2030-04-15 and Venue A, interval 09:00–15:00. Before manual changes: peak projectors **2/2**, average projector utilization **66.7%**, peak staff **5/5**, average staff utilization **66.7%**, A1 and A2 each **240 reserved minutes / 66.7% occupancy**. Explain why peak and average differ.
8. Restart with the same demo `DB_PATH`. Confirm manual changes, rejected history and cancellation/reschedule states persist. The automated backend and browser suites also verify restart persistence.
9. Run `npm run demo:reset` explicitly to return to the seeded state. Never reset during a running demo.

Automated coverage: `server/tests/demo.test.js` loads the fixture, checks counts/invariants and reopens the database; API/lifecycle/recommendation and browser tests cover the interactive paths and stale recommendation race. The reset CLI was executed twice and the normal database files were fingerprinted before/after to verify isolation.
