import { api } from "../services/api.js";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageTitle, Feedback, Empty, Field } from "../components/Common.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
export default function Bookings({ bookings, venues }) {
  const [date, setDate] = useState(""),
    [status, setStatus] = useState("");
  const location = useLocation();
  const [venueId, setVenue] = useState(""),
    [filtered, setFiltered] = useState(bookings),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .bookings({
        ...(date ? { date } : {}),
        ...(status ? { status } : {}),
        ...(venueId ? { venueId } : {}),
      })
      .then((rows) => {
        if (active) setFiltered(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, status, venueId, bookings]);
  return (
    <>
      <PageTitle
        eyebrow="FROM IDEA TO REQUEST"
        title="Your event requests."
        action={
          <Link className="button" to="/new">
            + New event request
          </Link>
        }
      >
        A clear view of every submission, all in one place.
      </PageTitle>
      {location.state?.message && (
        <Feedback
          error={
            location.state.outcome === "REJECTED"
              ? location.state.message
              : undefined
          }
        >
          {location.state.message}
        </Feedback>
      )}
      <div className="filter-bar">
        <Field label="Event date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
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
        <button
          className="button secondary"
          onClick={() => {
            setDate("");
            setStatus("");
            setVenue("");
          }}
        >
          Clear filters
        </button>
        <span className="muted">
          {filtered.length} request{filtered.length === 1 ? "" : "s"}
        </span>
      </div>
      {loading ? (
        <Feedback>Loading requests…</Feedback>
      ) : error ? (
        <Feedback error={error} />
      ) : filtered.length ? (
        <RequestCards bookings={filtered} />
      ) : (
        <Empty
          title={
            bookings.length
              ? "No matching requests"
              : "A clean slate for your next event"
          }
          action={
            !bookings.length && (
              <Link className="button secondary" to="/new">
                Create an event request →
              </Link>
            )
          }
        >
          {bookings.length
            ? "Try a different date or status."
            : "Your submitted requests will appear here. Nothing is allocated until scheduling is complete."}
        </Empty>
      )}
    </>
  );
}
