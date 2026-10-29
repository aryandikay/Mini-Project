import { minutesToTime } from "../utils/time.js";
function camelRow(row) {
  return (
    row &&
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
        value,
      ]),
    )
  );
}
function bookingRow(row) {
  const result = camelRow(row);
  if (result)
    Object.assign(result, {
      startTime: minutesToTime(result.startMinute),
      endTime: minutesToTime(result.endMinute),
      reasons: JSON.parse(result.reasonDetails || "[]"),
    });
  if (result) delete result.reasonDetails;
  return result;
}
const bookingSelect = `SELECT b.*, c.name AS client_name, v.name AS preferred_venue_name,
  av.name AS allocated_venue_name, h.name AS hall_name
  FROM bookings b JOIN clients c ON c.id=b.client_id JOIN venues v ON v.id=b.preferred_venue_id
  LEFT JOIN venues av ON av.id=b.allocated_venue_id LEFT JOIN halls h ON h.id=b.hall_id`;
export function createRepository(db) {
  return {
    health: () => db.prepare("SELECT 1 AS ok").get(),
    clients: () =>
      db.prepare("SELECT * FROM clients ORDER BY id DESC").all().map(camelRow),
    client: (id) => db.prepare("SELECT id FROM clients WHERE id=?").get(id),
    venue: (id) => db.prepare("SELECT id FROM venues WHERE id=?").get(id),
    createClient: ({ name, email, phone }) =>
      camelRow(
        db
          .prepare(
            "INSERT INTO clients(name,email,phone) VALUES(?,?,?) RETURNING *",
          )
          .get(name, email, phone),
      ),
    venues() {
      const halls = db
        .prepare("SELECT * FROM halls ORDER BY id")
        .all()
        .map(camelRow);
      return db
        .prepare("SELECT * FROM venues ORDER BY id")
        .all()
        .map((row) => ({
          ...camelRow(row),
          halls: halls.filter((h) => h.venueId === row.id),
        }));
    },
    bookings({ date, status, venueId } = {}) {
      const clauses = [],
        params = [];
      if (date) {
        clauses.push("b.event_date=?");
        params.push(date);
      }
      if (status) {
        clauses.push("b.status=?");
        params.push(status);
      }
      if (venueId) {
        clauses.push("b.allocated_venue_id=?");
        params.push(venueId);
      }
      return db
        .prepare(
          `${bookingSelect}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY b.id DESC`,
        )
        .all(...params)
        .map(bookingRow);
    },
    booking: (id) =>
      bookingRow(db.prepare(`${bookingSelect} WHERE b.id=?`).get(id)),
    reservationsInRange(first, last) {
      return db
        .prepare(
          "SELECT * FROM bookings WHERE status='CONFIRMED' AND event_date BETWEEN ? AND ? ORDER BY event_date,id",
        )
        .all(first, last)
        .map(camelRow);
    },
    reservations(input, excludeBookingId = null) {
      return db
        .prepare(
          `SELECT * FROM bookings WHERE status='CONFIRMED' AND event_date=?
        AND reserved_start_minute < ? AND reserved_end_minute > ? AND (? IS NULL OR id != ?)`,
        )
        .all(
          input.eventDate,
          input.reservedEndMinute,
          input.reservedStartMinute,
          excludeBookingId,
          excludeBookingId,
        )
        .map(camelRow);
    },
    createBooking(input) {
      const result = db
        .prepare(
          `INSERT INTO bookings(client_id,event_name,event_date,start_minute,end_minute,reserved_start_minute,reserved_end_minute,attendees,preferred_venue_id,projectors_required,audio_required,staff_required,status,allocated_venue_id,hall_id,rejection_reason,reason_details)
        VALUES(@clientId,@eventName,@eventDate,@startMinute,@endMinute,@reservedStartMinute,@reservedEndMinute,@attendees,@preferredVenueId,@projectorsRequired,@audioRequired,@staffRequired,@status,@allocatedVenueId,@hallId,@rejectionReason,@reasonDetails)`,
        )
        .run(input);
      return this.booking(Number(result.lastInsertRowid));
    },
    cancelBooking(id, previousUpdatedAt, updatedAt) {
      return db
        .prepare(
          "UPDATE bookings SET status='CANCELLED',updated_at=? WHERE id=? AND status='CONFIRMED' AND updated_at=?",
        )
        .run(updatedAt, id, previousUpdatedAt);
    },
    rescheduleBooking(input) {
      return db
        .prepare(
          `UPDATE bookings SET event_date=@eventDate,start_minute=@startMinute,end_minute=@endMinute,
        reserved_start_minute=@reservedStartMinute,reserved_end_minute=@reservedEndMinute,attendees=@attendees,
        preferred_venue_id=@preferredVenueId,allocated_venue_id=@allocatedVenueId,hall_id=@hallId,
        projectors_required=@projectorsRequired,audio_required=@audioRequired,staff_required=@staffRequired,
        rejection_reason=NULL,reason_details='[]',updated_at=@updatedAt
        WHERE id=@id AND status='CONFIRMED' AND updated_at=@previousUpdatedAt`,
        )
        .run(input);
    },
    dashboard(now) {
      const counts = { PENDING: 0, CONFIRMED: 0, REJECTED: 0, CANCELLED: 0 };
      for (const row of db
        .prepare(
          "SELECT status,count(*) AS count FROM bookings GROUP BY status",
        )
        .all())
        counts[row.status] = row.count;
      return {
        counts,
        totalBookings: Object.values(counts).reduce((a, b) => a + b, 0),
        totalVenues: db.prepare("SELECT count(*) n FROM venues").get().n,
        totalHalls: db.prepare("SELECT count(*) n FROM halls").get().n,
        upcoming: db
          .prepare(
            `${bookingSelect} WHERE b.status='CONFIRMED' AND (b.event_date>? OR (b.event_date=? AND b.start_minute>=?)) ORDER BY b.event_date,b.start_minute,b.id LIMIT 10`,
          )
          .all(now.date, now.date, now.minute)
          .map(bookingRow),
        today: now.date,
        timeZone: now.timeZone,
      };
    },
    transaction: (fn) => db.transaction(fn).immediate(),
    readTransaction: (fn) => db.transaction(fn)(),
  };
}
