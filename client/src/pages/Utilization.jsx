import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { PageTitle, Field, Feedback } from "../components/Common.jsx";

function Metric({ label, value }) {
  return (
    <div className="utilization-metric">
      <h3>{label}</h3>
      <p>
        Peak simultaneous use:{" "}
        <strong>
          {value.peak} / {value.capacity}
        </strong>
      </p>
      <p>
        Average utilization:{" "}
        <strong>
          {value.averageUtilizationPercent === null
            ? "N/A (no inventory)"
            : `${value.averageUtilizationPercent.toFixed(1)}%`}
        </strong>
      </p>
      {value.averageUtilizationPercent !== null && (
        <progress
          max="100"
          value={value.averageUtilizationPercent}
          aria-label={`${label} average utilization`}
        />
      )}
      <small>{value.resourceMinutes} resource-minutes consumed</small>
    </div>
  );
}
export default function Utilization({ venues, today, revision }) {
  const [date, setDate] = useState(today),
    [venueId, setVenueId] = useState("");
  const [startTime, setStart] = useState("08:00"),
    [endTime, setEnd] = useState("22:00");
  const [retry, setRetry] = useState(0),
    [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    api
      .utilization({
        date,
        startTime,
        endTime,
        ...(venueId ? { venueId } : {}),
      })
      .then((data) => {
        if (active) setState({ data });
      })
      .catch((error) => {
        if (active) setState({ error: error.message });
      });
    return () => {
      active = false;
    };
  }, [date, venueId, startTime, endTime, retry, revision]);
  return (
    <>
      <PageTitle title="Resource utilization" eyebrow="CONFIRMED RESERVATIONS">
        Actual hall, equipment and staff usage, including setup and cleanup. All
        times are venue-local.
      </PageTitle>
      <div className="filter-bar">
        <Field label="Utilization date">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </Field>
        <Field label="Venue">
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Interval start">
          <input
            type="time"
            min="08:00"
            max="22:00"
            required
            value={startTime}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Interval end">
          <input
            type="time"
            min="08:00"
            max="22:00"
            required
            value={endTime}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <p className="muted">
        Peak is the highest simultaneous demand. Average utilization is
        resource-minutes divided by inventory × selected minutes. Hall occupancy
        is reserved minutes divided by selected minutes.
      </p>
      {state.loading ? (
        <Feedback>Loading utilization…</Feedback>
      ) : state.error ? (
        <div className="panel">
          <Feedback error={state.error} />
          <button
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry utilization
          </button>
        </div>
      ) : (
        <>
          <p>
            {state.data.date} · {state.data.startTime}–{state.data.endTime} ·{" "}
            {state.data.durationMinutes} minutes
          </p>
          {state.data.venues.map((v) => (
            <section
              key={v.id}
              className="panel utilization-venue"
              aria-label={`${v.name} utilization`}
            >
              <h2>{v.name}</h2>
              <p>
                {v.confirmedBookings} confirmed bookings overlapping this
                interval
              </p>
              {!v.confirmedBookings && (
                <p className="muted">
                  No confirmed reservations in this interval. Usage is zero.
                </p>
              )}
              <div className="utilization-grid">
                <Metric label="Projectors" value={v.resources.projectors} />
                <Metric
                  label="Audio systems"
                  value={v.resources.audioSystems}
                />
                <Metric label="Staff" value={v.resources.staff} />
              </div>
              <h3>Hall occupancy</h3>
              {v.halls.map((h) => (
                <div className="hall-occupancy" key={h.id}>
                  <span>
                    {h.name} · capacity {h.capacity}
                  </span>
                  <strong>
                    {h.occupiedMinutes} reserved minutes ·{" "}
                    {h.occupancyPercent.toFixed(1)}%
                  </strong>
                  <progress
                    max="100"
                    value={h.occupancyPercent}
                    aria-label={`${h.name} occupancy`}
                  />
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </>
  );
}
