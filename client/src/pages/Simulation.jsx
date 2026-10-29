import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api.js";
import { PageTitle, Field, Feedback } from "../components/Common.jsx";
import { schedulingInput } from "../components/Recommendations.jsx";
import { formatMinute } from "../utils/time.js";

const numeric = ["attendees", "preferredVenueId", "projectorsRequired", "audioRequired", "staffRequired"];
const fields = [["eventDate", "Proposed date", "date"], ["startTime", "Proposed start", "time"], ["endTime", "Proposed end", "time"],
  ["attendees", "Proposed attendees", "number"], ["projectorsRequired", "Proposed projectors", "number"],
  ["audioRequired", "Proposed audio systems", "number"], ["staffRequired", "Proposed support staff", "number"]];
const interval = (value) => `${value.eventDate} · ${value.startTime}–${value.endTime} (reserved ${formatMinute(value.reservedStartMinute)}–${formatMinute(value.reservedEndMinute)})`;

export default function Simulation({ venues, clients, bookings, today, onApplied }) {
  const [params] = useSearchParams(), navigate = useNavigate();
  const [bookingId, setBookingId] = useState(params.get("bookingId") || ""), [reload, setReload] = useState(0);
  const [original, setOriginal] = useState(null), [form, setForm] = useState({}), [busy, setBusy] = useState("loading");
  const [clientId, setClient] = useState(""), [eventName, setName] = useState("What-if event");
  const [error, setError] = useState(""), [result, setResult] = useState(null);
  const lock = useRef(false), key = useRef(null);
  useEffect(() => {
    let active = true;
    setError(""); setResult(null); setOriginal(null); setBusy("loading");
    if (!bookingId) {
      setForm({ eventDate: today, startTime: "10:00", endTime: "12:00", attendees: "50", preferredVenueId: String(venues[0]?.id || ""),
        projectorsRequired: "0", audioRequired: "0", staffRequired: "0" });
      setBusy(""); return;
    }
    api.booking(bookingId).then((booking) => {
      if (!active) return;
      if (booking.status !== "CONFIRMED") throw new Error("Only confirmed bookings can be simulated as moves.");
      setOriginal(booking);
      setForm(Object.fromEntries(Object.entries(schedulingInput(booking)).map(([field, value]) => [field, String(value)])));
    }).catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  }, [bookingId, reload, today, venues]);
  function edit(field, value) { setForm((current) => ({ ...current, [field]: value })); setResult(null); setError(""); }
  async function evaluate(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy("simulation"); setError(""); setResult(null);
    try {
      const proposal = { ...form, ...Object.fromEntries(numeric.map((field) => [field, Number(form[field])])) };
      const response = await api.simulate({ proposal, ...(original ? { bookingId: original.id, expectedUpdatedAt: original.updatedAt } : {}) });
      setResult(response); key.current = null;
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(""); }
  }
  async function apply() {
    if (lock.current || !result?.feasible) return;
    lock.current = true; setBusy("apply"); setError("");
    try {
      const proposal = { ...schedulingInput(result.proposal), preferredVenueId: result.allocation.allocatedVenueId,
        selectedVenueId: result.allocation.allocatedVenueId };
      let booking;
      if (original) booking = await api.reschedule(original.id, { ...proposal, expectedUpdatedAt: original.updatedAt });
      else {
        if (!clientId || !eventName.trim()) throw new Error("Select a client and enter an event name before applying.");
        if (!key.current) key.current = crypto.randomUUID();
        booking = await api.createBooking({ ...proposal, clientId: Number(clientId), eventName, confirmationKey: key.current });
      }
      await onApplied(); navigate(`/bookings/${booking.id}`);
    } catch (e) { setError([e.message, ...(e.details?.reasons || []).map((r) => r.message)].join(" ")); }
    finally { lock.current = false; setBusy(""); }
  }
  return <>
    <PageTitle title="What-if simulator" eyebrow="EXPLORE BEFORE YOU COMMIT">
      Test proposed changes without changing any booking. Applying a proposal is a separate availability check.
    </PageTitle>
    <div className="filter-bar">
      <Field label="Simulation source"><select value={bookingId} disabled={!!busy} onChange={(e) => setBookingId(e.target.value)}>
        <option value="">New hypothetical event</option>
        {bookings.filter((b) => b.status === "CONFIRMED").map((b) => <option key={b.id} value={b.id}>#{b.id} · {b.eventName}</option>)}
      </select></Field>
      {bookingId && <button className="button secondary" disabled={!!busy} onClick={() => setReload((value) => value + 1)}>Reload original booking</button>}
    </div>
    {busy === "loading" && <Feedback>Loading simulation inputs…</Feedback>}
    {error && <Feedback error={error} />}
    {busy !== "loading" && (!bookingId || original) && <form className="panel form-stack" onSubmit={evaluate}>
      <h2>{original ? `Propose changes to ${original.eventName}` : "New hypothetical requirements"}</h2>
      <div className="form-grid">
        {fields.map(([field, label, type]) => <Field key={field} label={label}>
          <input type={type} required disabled={!!busy} value={form[field] || ""}
            min={type === "number" ? field === "attendees" ? 1 : 0 : type === "time" ? "08:30" : undefined}
            max={type === "time" ? "21:30" : undefined} step={type === "number" ? 1 : undefined}
            onChange={(e) => edit(field, e.target.value)} />
        </Field>)}
        <Field label="Proposed preferred venue"><select required value={form.preferredVenueId || ""} disabled={!!busy} onChange={(e) => edit("preferredVenueId", e.target.value)}>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></Field>
      </div>
      <button className="button" disabled={!!busy}>{busy === "simulation" ? "Simulating…" : "Simulate proposal"}</button>
      {busy === "simulation" && <Feedback>Evaluating current reservations…</Feedback>}
    </form>}
    {result && <section className="panel" aria-label="Simulation result">
      <h2>{result.feasible ? "Proposal is feasible" : "Proposal is not feasible"}</h2><p>{result.message}</p>
      <div className="comparison-grid">
        <article><h3>Original booking</h3>{result.original ? <>
          <p><Link to={`/bookings/${result.original.id}`}>{result.original.eventName}</Link></p>
          <p>{result.original.allocatedVenueName} · {result.original.hallName}</p><p>{interval(result.original)}</p>
          <p>{result.original.attendees} attendees · Projectors {result.original.projectorsRequired} · Audio {result.original.audioRequired} · Staff {result.original.staffRequired}</p>
        </> : <p>New hypothetical event; no existing allocation.</p>}</article>
        <article><h3>Proposed arrangement</h3><p>{interval(result.proposal)}</p>
          <p>{result.feasible ? `${result.allocation.allocatedVenueName} · ${result.allocation.hallName}` : "No feasible allocation"}</p>
          <p>{result.proposal.attendees} attendees · Projectors {result.proposal.projectorsRequired} · Audio {result.proposal.audioRequired} · Staff {result.proposal.staffRequired}</p>
        </article>
      </div>
      {!!result.changes.length && <p>Changed fields: {result.changes.map((entry) => entry.field).join(", ")}</p>}
      {result.preferredVenueReasons.length > 0 && <div className="notice"><strong>Preferred-venue constraints</strong>
        {result.preferredVenueReasons.map((r, index) => <p key={index}>{r.message}</p>)}
      </div>}
      {!result.feasible && result.allocation.reasons.map((r, index) => <p className="notice error" key={index}>{r.message}</p>)}
      {!!result.overlappingReservations.length && <p>Other reservations overlapping the proposed preferred-venue interval: {result.overlappingReservations.map((b, index) => <span key={b.id}>
        {index > 0 && ", "}<Link to={`/bookings/${b.id}`}>{b.eventName}</Link>
      </span>)}. An overlap in another hall is only a constraint when hall or shared-resource limits are affected.</p>}
      {result.feasible && <div className="form-stack">
        {!original && <div className="form-grid">
          <Field label="Client for confirmation"><select value={clientId} disabled={!!busy} onChange={(e) => { setClient(e.target.value); key.current = null; }}>
            <option value="">Select client to apply</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></Field>
          <Field label="Event name for confirmation"><input value={eventName} maxLength={160} disabled={!!busy} onChange={(e) => { setName(e.target.value); key.current = null; }} /></Field>
        </div>}
        <button className="button" disabled={!!busy} onClick={apply}>{busy === "apply" ? "Applying…" : original ? "Apply proposed reschedule" : "Create booking from proposal"}</button>
        <p className="muted">The selected venue must still be available. The scheduler chooses the current smallest feasible hall at confirmation.</p>
      </div>}
    </section>}
  </>;
}
