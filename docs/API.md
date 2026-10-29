# EventSync Phase 4 REST contract

Base path `/api`. JSON requests use `Content-Type: application/json`. Success: `{ "data": ... }`. Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable explanation." } }`. All JSON properties use camelCase. Submissions perform atomic scheduling; availability checks return a non-reserving snapshot.

| Method / path       | Status | Data                                                                   |
| ------------------- | ------ | ---------------------------------------------------------------------- |
| `GET /health`       | 200    | `{ "status": "ok", "database": "ok" }`, after executing a SQLite query |
| `POST /clients`     | 201    | Created client                                                         |
| `GET /clients`      | 200    | Client array, newest ID first                                          |
| `GET /venues`       | 200    | Venue array with nested halls, ordered by ID                           |
| `POST /bookings`    | 201    | Persisted confirmed or rejected request; `Location: /api/bookings/:id` |
| `GET /bookings`     | 200    | Request array, newest ID first                                         |
| `GET /bookings/:id` | 200    | One request or 404                                                     |

`GET /bookings?date=2027-03-20&status=PENDING` supports either or both exact filters. Status must be `PENDING`, `CONFIRMED`, `REJECTED`, or `CANCELLED`. Invalid filters or IDs return 400; valid IDs without records return 404. List endpoints return an empty array when there are no matches. Pagination is not implemented. Lifecycle endpoints are documented below.

## Clients

Request:

```json
{
  "name": "Campus Society",
  "email": "events@example.com",
  "phone": "+91 12345"
}
```

`name` is trimmed and must contain 1–120 characters. `email` is optional (null/empty/missing stored as null), at most 254 characters, and checked for a basic email structure. `phone` is optional, at most 40 characters. No uniqueness restriction on client names or email addresses is imposed. Response adds integer `id` and UTC `createdAt` timestamp.

## Venues

Each venue contains integer `id`, string `name`, integer `totalProjectors`, `totalAudioSystems`, `totalStaff`, and `halls`. Each hall contains `id`, `venueId`, `name`, `capacity`. Inventory represents totals, **not currently available quantities**.

## Event requests

Request (all fields required):

```json
{
  "clientId": 1,
  "eventName": "Campus Innovation Day",
  "eventDate": "2027-03-20",
  "startTime": "10:00",
  "endTime": "12:00",
  "attendees": 85,
  "preferredVenueId": 2,
  "projectorsRequired": 1,
  "audioRequired": 1,
  "staffRequired": 2
}
```

IDs must be positive safe JSON integers referencing existing records. Event names must contain 1–160 trimmed characters. Attendees must be a positive safe integer; each resource quantity must be a nonnegative safe integer. Numeric strings, fractional quantities, booleans and missing quantities are rejected. Dates must be valid `YYYY-MM-DD` Gregorian dates (years 0001–9999). Time strings must be exact 24-hour `HH:mm`. End must follow start on the same date. The 30-minute setup and cleanup buffers must lie within 08:00–22:00 inclusive. Dates/times use venue-local civil time, never implicit browser/server timezone conversion.

Example response data (IDs and timestamps vary):

```json
{
  "id": 1,
  "clientId": 1,
  "clientName": "Campus Society",
  "eventName": "Campus Innovation Day",
  "eventDate": "2027-03-20",
  "startTime": "10:00",
  "endTime": "12:00",
  "startMinute": 600,
  "endMinute": 720,
  "reservedStartMinute": 570,
  "reservedEndMinute": 750,
  "attendees": 85,
  "preferredVenueId": 2,
  "preferredVenueName": "Venue B",
  "allocatedVenueId": 2,
  "allocatedVenueName": "Venue B",
  "hallId": 3,
  "hallName": "Hall B1",
  "projectorsRequired": 1,
  "audioRequired": 1,
  "staffRequired": 2,
  "status": "CONFIRMED",
  "reasons": [],
  "rejectionReason": null,
  "createdAt": "2027-03-01T10:00:00.000Z",
  "updatedAt": "2027-03-01T10:00:00.000Z"
}
```

Only listed input fields are consumed; caller status/allocation fields cannot override the scheduling decision. Both CONFIRMED and REJECTED outcomes return 201 because the decision is persisted. Check `data.status` to distinguish them. Rejections contain null allocation fields, a readable `rejectionReason`, and `reasons` objects with `code`, `venueId`, `message`, and resource `requested`, `peak`, `available` quantities where relevant. No other clients' booking details appear. Historical pending requests remain unchanged and return an empty reasons array.

### POST /availability/check

Accepts the exact same full booking payload and validation as submission. Returns 200 `{ data: { feasible, status, allocatedVenueId, hallId, reservedStartMinute, reservedEndMinute, reasons, snapshot: true, message } }`; feasible results additionally include allocated venue/hall names. Uses the same scheduler in a consistent read transaction. No records are written. Submission always rechecks inside an immediate write transaction, so a feasible preview is not a guarantee.

Operating-hour violations continue returning 400 with no record, preserving Phase 1 validation and database interval constraints. Valid but unschedulable requests return persisted REJECTED decisions.

## Errors

- 400 `VALIDATION_ERROR`: invalid fields, filters, references or malformed ID.
- 400 `INVALID_JSON`: invalid JSON request syntax.
- 404 `NOT_FOUND`: missing request or unknown API endpoint.
- 413 `BODY_TOO_LARGE`: JSON payload above 32 KiB.
- 500 `INTERNAL_ERROR`: unexpected database or application failure; SQL and stack traces are never returned.

The health response reports database success only when a query succeeds; a database failure uses the same safe 500 envelope. APIs currently have no authentication and are intended for local development.

## Phase 3 lifecycle

`PATCH /bookings/:id/cancel` accepts `{ "expectedUpdatedAt": "<timestamp from GET>" }` or `{}`. It returns 200 `{ data: <cancelled booking>, message: "Booking cancelled. Hall and resources released." }`. All event/allocation fields are preserved for history; cancelled allocations are not active. Repeated cancellation returns 409 `INVALID_STATE` with no further changes.

`PATCH /bookings/:id/reschedule` accepts any nonempty subset of `eventDate`, `startTime`, `endTime`, `attendees`, `preferredVenueId`, `projectorsRequired`, `audioRequired`, and `staffRequired`, plus optional `expectedUpdatedAt`. Unknown fields are rejected; identity, client and event name cannot change. Validation applies after merging with the original record. Success returns 200 `{ data: <updated confirmed booking> }` with the same ID and creation timestamp.

Both operations allow only CONFIRMED records. Missing IDs return 404; malformed IDs/patches return 400. Stale `expectedUpdatedAt` returns 409 `STALE_BOOKING`. The frontend always sends the timestamp; API callers omitting it opt into serialized updates against the latest record.

Infeasible rescheduling returns 409:

```json
{
  "error": {
    "code": "RESCHEDULE_INFEASIBLE",
    "message": "Rescheduling was not accepted. The original booking is unchanged.",
    "details": {
      "bookingId": 1,
      "originalPreserved": true,
      "reasons": [
        {
          "code": "INSUFFICIENT_HALL_CAPACITY",
          "venueId": 1,
          "message": "Venue A: No hall seats 999 attendees. Maximum capacity is 150."
        }
      ]
    }
  }
}
```

The reasons above illustrate one venue; actual responses contain all computed failures. No original fields, timestamp or rejection reason change. No separate rejected booking is inserted.

`GET /bookings?date=2099-01-01&status=CONFIRMED&venueId=1` combines optional exact filters. Venue filtering uses allocated venue, including historical allocations on cancelled records; unallocated pending/rejected records do not match a venue. Ordering remains newest ID first.

`GET /dashboard` returns `{ data: { counts: { PENDING, CONFIRMED, REJECTED, CANCELLED }, totalBookings, totalVenues, totalHalls, upcoming, today, timeZone } }`. Counts come from all persisted records. `upcoming` contains up to ten confirmed bookings ordered by date, start minute, ID whose start is at or after the current venue-local minute. `VENUE_TIME_ZONE` defaults to UTC and accepts an IANA timezone. This is a documented default, not an inferred campus location. Invalid timezone configuration causes a safe server error; correct it and restart.

## Phase 4 recommendations

`POST /api/recommendations` accepts `{ request: <scheduling fields with optional clientId/eventName>, search?: { horizonDays, stepMinutes, limit, preferVenue } }`. It returns 200 `{ data: { originalRequest, originalDecision, settings, searchedDates, evaluatedCandidates, totalFeasible, count, recommendations, provisional, message } }` without any writes. Defaults: one total day, 15-minute step, five results, preferred venue first. Limits and result field definitions are in [RECOMMENDATIONS.md](RECOMMENDATIONS.md).

Selected options use the unchanged `POST /bookings` transaction with the suggested venue as a preference, never a forced allocation. The original rejection remains historical. Invalid searches return 400; valid empty searches return 200; database failures remain 500. No arbitrary reservation exclusion or rescheduling recommendation context is supported.
