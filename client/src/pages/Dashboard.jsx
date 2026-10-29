import { Link } from "react-router-dom";
import { PageTitle, Empty } from "../components/Common.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
export default function Dashboard({ venues, bookings, dashboard }) {
  const stats = [
    ["Venues", dashboard.totalVenues, "Across the event campus"],
    ["Halls", dashboard.totalHalls, "Event spaces"],
    ["Submitted requests", dashboard.totalBookings, "All states"],
    ...Object.entries(dashboard.counts).map(([status, count]) => [
      status.charAt(0) + status.slice(1).toLowerCase(),
      count,
      "Persisted bookings",
    ]),
  ];
  return (
    <>
      <PageTitle
        eyebrow="YOUR EVENT WORKSPACE"
        title="A little planning. A great event."
        action={
          <Link className="button" to="/new">
            + New event request
          </Link>
        }
      >
        Your venues, people and event requests, together in one place.
      </PageTitle>
      <section className="planning-tools" aria-label="Planning tools">
        <Link className="panel" to="/resources"><h2>Resource intelligence & timeline →</h2><p>Inspect hall reservations and shared-resource demand by venue and date.</p></Link>
        <Link className="panel" to="/simulation"><h2>What-if simulator →</h2><p>Compare proposed arrangements without changing bookings.</p></Link>
      </section>
      <section className="stats" aria-label="Campus and request statistics">
        {stats.map(([label, value, caption], i) => (
          <article className="stat" key={label}>
            <div className={`stat-symbol symbol-${i}`} aria-hidden="true">
              {["▦", "▥", "▤", "◷"][i % 4]}
            </div>
            <p>{label}</p>
            <strong>{value}</strong>
            <small>{caption}</small>
          </article>
        ))}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>Find your space</h2>
            <p>Three venues. Six halls. Plenty of possibilities.</p>
          </div>
          <span className="section-label">VENUE DIRECTORY</span>
        </div>
        <div className="venue-grid">
          {venues.map((v, i) => (
            <article className={`venue-card venue-${i}`} key={v.id}>
              <div className="venue-art" aria-hidden="true">
                <span className="venue-letter">
                  {v.name.replace("Venue ", "")}
                </span>
                <div className="building">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span className="art-caption">THE EVENT CAMPUS</span>
              </div>
              <div className="venue-body">
                <div className="venue-title">
                  <h3>{v.name}</h3>
                  <span>{v.halls.length} halls</span>
                </div>
                <div className="hall-list">
                  {v.halls.map((h) => (
                    <div key={h.id}>
                      <span>{h.name}</span>
                      <strong>
                        {h.capacity}
                        <small> guests</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="inventory-label">SHARED VENUE INVENTORY</p>
                <div className="inventory">
                  <span>
                    <b>{v.totalProjectors}</b> Projectors
                  </span>
                  <span>
                    <b>{v.totalAudioSystems}</b> Audio
                  </span>
                  <span>
                    <b>{v.totalStaff}</b> Staff
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="footnote">
          Inventory is shared between halls. Availability is assessed during
          allocation.
        </p>
      </section>
      <section>
        <div className="section-heading">
          <h2>Upcoming confirmed events</h2>
          <span className="muted">{dashboard.timeZone}</span>
        </div>
        {dashboard.upcoming.length ? (
          <RequestCards bookings={dashboard.upcoming} />
        ) : (
          <Empty title="No upcoming confirmed events">
            Events appear here when their confirmed start time is in the future.
          </Empty>
        )}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>Recent requests</h2>
            <p>Keep track of what’s coming together.</p>
          </div>
          <Link className="text-link" to="/bookings">
            View all requests →
          </Link>
        </div>
        {bookings.length ? (
          <RequestCards bookings={bookings.slice(0, 3)} />
        ) : (
          <Empty
            title="Your next event starts here"
            action={
              <Link className="button secondary" to="/new">
                Create an event request →
              </Link>
            }
          >
            No event requests yet. Add a client, then tell us what you’re
            planning.
          </Empty>
        )}
      </section>
    </>
  );
}
