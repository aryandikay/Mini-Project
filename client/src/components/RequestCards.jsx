import { Link } from "react-router-dom";
import { Status } from "./Common.jsx";
export function RequestCards({ bookings }) {
  return (
    <div className="request-list">
      {bookings.map((booking) => (
        <article className="request-card" key={booking.id}>
          <div className="request-top">
            <div>
              <p className="eyebrow">
                REQUEST #{String(booking.id).padStart(3, "0")}
              </p>
              <h3>
                <Link to={`/bookings/${booking.id}`}>{booking.eventName}</Link>
              </h3>
              <p className="muted">{booking.clientName}</p>
            </div>
            <Status value={booking.status} />
          </div>
          <dl className="request-facts">
            <div>
              <dt>Date & time</dt>
              <dd>
                {booking.eventDate}
                <br />
                {booking.startTime} – {booking.endTime}
              </dd>
            </div>
            <div>
              <dt>Preferred venue</dt>
              <dd>
                {booking.preferredVenueName}
                <br />
                {booking.attendees} attendees
              </dd>
            </div>
            <div>
              <dt>Requested resources</dt>
              <dd>
                {booking.projectorsRequired} projectors ·{" "}
                {booking.audioRequired} audio
                <br />
                {booking.staffRequired} support staff
              </dd>
            </div>
            <div>
              <dt>Hall allocation</dt>
              <dd>
                {booking.hallName
                  ? `${booking.allocatedVenueName} · ${booking.hallName}`
                  : "Not allocated"}
              </dd>
            </div>
          </dl>
          {booking.rejectionReason && (
            <p className="notice error">{booking.rejectionReason}</p>
          )}
        </article>
      ))}
    </div>
  );
}
