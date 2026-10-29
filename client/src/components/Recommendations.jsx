import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";
import { Field, Feedback } from "./Common.jsx";
export default function Recommendations({ booking, onChanged }) {
  const [horizon, setHorizon] = useState("1"),
    [preferVenue, setPreferVenue] = useState(true),
    [result, setResult] = useState(null),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState(null);
  const request = Object.fromEntries(
    [
      "clientId",
      "eventName",
      "eventDate",
      "startTime",
      "endTime",
      "attendees",
      "preferredVenueId",
      "projectorsRequired",
      "audioRequired",
      "staffRequired",
    ].map((key) => [key, booking[key]]),
  );
  async function search(event) {
    event.preventDefault();
    setBusy("search");
    setError("");
    setSelected(null);
    setResult(null);
    setOutcome(null);
    try {
      setResult(
        await api.recommendations({
          request,
          search: { horizonDays: Number(horizon), preferVenue },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function confirm() {
    setBusy("confirm");
    setError("");
    try {
      const created = await api.createBooking({
        ...request,
        eventDate: selected.eventDate,
        startTime: selected.startTime,
        endTime: selected.endTime,
        preferredVenueId: selected.allocatedVenueId,
      });
      setOutcome(created);
      setSelected(null);
      setResult(null);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      className="panel"
      aria-label="Alternative recommendations"
      style={{ marginTop: 20 }}
    >
      <h2>Find an alternative</h2>
      <p>
        Your attendance, duration and resource requirements stay unchanged.
        Suggestions do not reserve a hall. The original rejected request stays
        in your history.
      </p>
      <form onSubmit={search} className="form-stack">
        <div className="form-grid">
          <Field label="Search date range">
            <select
              disabled={!!busy}
              value={horizon}
              onChange={(e) => {
                setHorizon(e.target.value);
                setResult(null);
                setSelected(null);
              }}
            >
              <option value="1">Requested date only</option>
              <option value="3">Requested date and next 2 days</option>
              <option value="7">Requested date and next 6 days</option>
            </select>
          </Field>
          <Field label="Ranking priority">
            <select
              disabled={!!busy}
              value={String(preferVenue)}
              onChange={(e) => {
                setPreferVenue(e.target.value === "true");
                setResult(null);
                setSelected(null);
              }}
            >
              <option value="true">Preferred venue first</option>
              <option value="false">Date and time proximity first</option>
            </select>
          </Field>
        </div>
        <button className="button" disabled={!!busy}>
          {busy === "search" ? "Searching…" : "Search alternatives"}
        </button>
      </form>
      {error && <Feedback error={error} />}
      {outcome && (
        <>
          <Feedback
            error={
              outcome.status === "REJECTED"
                ? `Availability changed: ${outcome.rejectionReason}`
                : undefined
            }
          >
            {outcome.status === "CONFIRMED"
              ? `New booking #${outcome.id} confirmed: ${outcome.allocatedVenueName} · ${outcome.hallName}.`
              : undefined}
          </Feedback>
          <Link className="text-link" to={`/bookings/${outcome.id}`}>
            View new request #{outcome.id} →
          </Link>
        </>
      )}
      {result && (
        <>
          <Feedback>{result.message}</Feedback>
          <div className="request-list">
            {result.recommendations.map((r) => (
              <article
                className="request-card"
                key={`${r.eventDate}-${r.startTime}-${r.hallId}`}
              >
                <h3>
                  Option {r.rank}: {r.allocatedVenueName} · {r.hallName}
                </h3>
                <p>
                  {r.eventDate} · {r.startTime} – {r.endTime}
                </p>
                <p>
                  Reserved: {r.reservedStartTime} – {r.reservedEndTime} ·
                  Capacity {r.hallCapacity}
                </p>
                <p>
                  {r.attendees} attendees · {r.projectorsRequired} projectors ·{" "}
                  {r.audioRequired} audio · {r.staffRequired} staff
                </p>
                <p>
                  Start difference: {r.timeDifferenceMinutes} minutes ·{" "}
                  {r.preferredVenuePreserved
                    ? "Preferred venue preserved"
                    : "Alternative venue"}
                </p>
                <p>{r.explanation}</p>
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => {
                    setSelected(r);
                    setError("");
                  }}
                >
                  Select option {r.rank}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {selected && (
        <div className="notice">
          <h3>Confirm selected alternative</h3>
          <p>
            {selected.eventDate}, {selected.startTime} – {selected.endTime},
            preference {selected.allocatedVenueName}. The server determines the
            final hall and may use another venue if availability changed.
          </p>
          <button className="button" disabled={!!busy} onClick={confirm}>
            {busy === "confirm" ? "Confirming…" : "Confirm alternative"}
          </button>
        </div>
      )}
    </section>
  );
}
