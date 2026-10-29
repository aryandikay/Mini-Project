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
    });
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
    bookings({ date, status } = {}) {
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
      return db
        .prepare(
          `${bookingSelect}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY b.id DESC`,
        )
        .all(...params)
        .map(bookingRow);
    },
    booking: (id) =>
      bookingRow(db.prepare(`${bookingSelect} WHERE b.id=?`).get(id)),
    createBooking(input) {
      const result = db
        .prepare(
          `INSERT INTO bookings(client_id,event_name,event_date,start_minute,end_minute,reserved_start_minute,reserved_end_minute,attendees,preferred_venue_id,projectors_required,audio_required,staff_required,status)
        VALUES(@clientId,@eventName,@eventDate,@startMinute,@endMinute,@reservedStartMinute,@reservedEndMinute,@attendees,@preferredVenueId,@projectorsRequired,@audioRequired,@staffRequired,'PENDING')`,
        )
        .run(input);
      return this.booking(Number(result.lastInsertRowid));
    },
    transaction: (fn) => db.transaction(fn)(),
  };
}
