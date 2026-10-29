import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";
import { PageTitle, Field, Feedback } from "../components/Common.jsx";
import ResourceTimeline from "../components/ResourceTimeline.jsx";
import { formatMinute } from "../utils/time.js";

export default function Resources({ venues, today, revision }) {
  const [date, setDate] = useState(today), [venueId, setVenue] = useState(String(venues[0]?.id || ""));
  const [time, setTime] = useState("10:00"), [refresh, setRefresh] = useState(0), [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    if (!venueId) { setState({ error: "No venues available." }); return; }
    setState({ loading: true });
    api.resources({ venueId, date }).then((data) => { if (active) setState({ data }); })
      .catch((e) => { if (active) setState({ error: e.message }); });
    return () => { active = false; };
  }, [venueId, date, revision, refresh]);
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const data = state.data;
  const segment = data?.segments.find((s) => s.startMinute <= minute && minute < s.endMinute);
  return <>
    <PageTitle title="Resource intelligence" eyebrow="RESERVATIONS AND SHARED INVENTORY">
      Inspect confirmed reservations, concurrent demand and available resources. Setup and cleanup consume resources too.
    </PageTitle>
    <div className="filter-bar">
      <Field label="Resource date"><input type="date" required value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /></Field>
      <Field label="Resource venue"><select value={venueId} onChange={(e) => setVenue(e.target.value)}>
        {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select></Field>
      <Field label="Inspect time"><input type="time" min="08:00" max="22:00" value={time} onChange={(e) => {
        if (e.target.value >= "08:00" && e.target.value <= "22:00") setTime(e.target.value);
      }} /></Field>
      <button className="button secondary" onClick={() => setRefresh((value) => value + 1)}>Refresh resources</button>
    </div>
    {state.loading ? <Feedback>Loading resource intelligence…</Feedback> : state.error ? <Feedback error={state.error} /> : <>
      <h2>{data.venue.name} · {date}</h2>
      <p>{data.confirmedEventCount} confirmed events · Inspection time {time}{minute === 1320 ? " (operating window closed)" : ""}</p>
      {!data.confirmedEventCount && <Feedback>No confirmed reservations for this venue and date. All halls and inventory are available during operating hours.</Feedback>}
      <div className="resource-metrics">
        {data.resources.map((r) => {
          const used = segment?.usage[r.key] || 0;
          return <article className="panel" key={r.key} aria-label={`${r.label} metrics`}>
            <h3>{r.label}</h3><p>Inventory <strong>{r.inventory}</strong></p>
            <p>In use at {time}: <strong>{used}</strong> · Available: <strong>{r.inventory - used}</strong></p>
            <p>Daily peak: <strong>{r.peak}</strong> · Available at peak: {r.availableAtPeak}</p>
            <p className="muted">Peak intervals: {r.peakIntervals.length ? r.peakIntervals.map((s) => `${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)}`).join(", ") : "No usage"}</p>
            <p>{r.fullyUtilizedIntervals.length ? "Fully utilized during part of the day" : r.inventory === 0 ? "No inventory in this category" : "Inventory remains below full use"}</p>
            {r.overInventory && <Feedback error="Persisted demand exceeds inventory. Review these reservations." />}
          </article>;
        })}
      </div>
      <ResourceTimeline data={data} selectedMinute={minute} />
      <section className="panel" aria-label="Confirmed resource reservations"><h2>Confirmed reservations</h2>
        {data.halls.map((hall) => <div key={hall.id}><h3>{hall.name}</h3>
          {hall.bookings.length ? hall.bookings.map((b) => <p key={b.id}><Link to={`/bookings/${b.id}`}>{b.eventName}</Link>
            {` · Event ${b.startTime}–${b.endTime} · Setup ${formatMinute(b.reservedStartMinute)}–${b.startTime} · Cleanup ${b.endTime}–${formatMinute(b.reservedEndMinute)}`}</p>) : <p>No reservations</p>}
        </div>)}
      </section>
    </>}
  </>;
}
