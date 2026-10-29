import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";
import { PageTitle, Field, Feedback, Empty } from "../components/Common.jsx";
import { formatMinute } from "../utils/time.js";
export default function Schedule({ venues, revision, today }) {
  const [date, setDate] = useState(today),
    [venueId, setVenue] = useState(""),
    [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    api
      .bookings({ date, status: "CONFIRMED", ...(venueId ? { venueId } : {}) })
      .then((bookings) => {
        if (active) setState({ bookings });
      })
      .catch((e) => {
        if (active) setState({ error: e.message });
      });
    return () => {
      active = false;
    };
  }, [date, venueId, revision]);
  return (
    <>
      <PageTitle title="Daily schedule" eyebrow="CONFIRMED EVENTS">
        Event times and reserved setup/cleanup intervals in venue-local time.
      </PageTitle>
      <div className="filter-bar">
        <Field label="Schedule date">
          <input
            required
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </Field>
        <Field label="Venue">
          <select value={venueId} onChange={(e) => setVenue(e.target.value)}>
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {state.loading ? (
        <Feedback>Loading schedule…</Feedback>
      ) : state.error ? (
        <Feedback error={state.error} />
      ) : !state.bookings.length ? (
        <Empty title="No confirmed events">Choose another date or venue.</Empty>
      ) : (
        venues
          .filter((v) =>
            state.bookings.some((b) => b.allocatedVenueId === v.id),
          )
          .map((v) => (
            <section className="panel" key={v.id}>
              <h2>{v.name}</h2>
              {state.bookings
                .filter((b) => b.allocatedVenueId === v.id)
                .sort((a, b) => a.startMinute - b.startMinute || a.id - b.id)
                .map((b) => (
                  <article className="request-card" key={b.id}>
                    <h3>
                      <Link to={`/bookings/${b.id}`}>{b.eventName}</Link>
                    </h3>
                    <p>
                      {b.hallName} · {b.startTime} – {b.endTime}
                    </p>
                    <p className="muted">
                      Reserved: {formatMinute(b.reservedStartMinute)} –{" "}
                      {formatMinute(b.reservedEndMinute)} (setup and cleanup
                      included)
                    </p>
                  </article>
                ))}
            </section>
          ))
      )}
    </>
  );
}
