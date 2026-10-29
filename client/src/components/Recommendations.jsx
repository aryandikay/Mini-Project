import { useRef, useState } from "react";
import { api } from "../services/api.js";
import { Feedback, Field } from "./Common.jsx";
import { formatMinute } from "../utils/time.js";

const schedulingFields = ["eventDate", "startTime", "endTime", "attendees", "preferredVenueId",
  "projectorsRequired", "audioRequired", "staffRequired"];
export function schedulingInput(value) {
  return Object.fromEntries(schedulingFields.map((key) => [key, value[key]]));
}

export default function Recommendations({ original, bookingId, onConfirmed }) {
  const [days, setDays] = useState("1"), [preferredOnly, setPreferredOnly] = useState(false);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const lock = useRef(false), keys = useRef(new Map()), completed = useRef(false);
  async function search() {
    if (lock.current || completed.current) return;
    lock.current = true;
    setBusy("search"); setError(""); setResult(null);
    try {
      const body = { ...schedulingInput(original), search: { searchDays: Number(days), preferredVenueOnly: preferredOnly } };
      const response = bookingId
        ? await api.rescheduleRecommendations(bookingId, { ...body, expectedUpdatedAt: original.updatedAt })
        : await api.recommendations(body);
      keys.current.clear();
      setResult(response);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(""); }
  }
  async function confirm(recommendation, index) {
    if (lock.current || completed.current) return;
    lock.current = true; setBusy(String(index)); setError("");
    try {
      const proposal = { ...schedulingInput(original), eventDate: recommendation.eventDate,
        startTime: recommendation.startTime, endTime: recommendation.endTime,
        preferredVenueId: recommendation.venueId, selectedVenueId: recommendation.venueId };
      let booking;
      if (bookingId) booking = await api.reschedule(bookingId, { ...proposal, expectedUpdatedAt: original.updatedAt });
      else {
        if (!keys.current.has(index)) keys.current.set(index, crypto.randomUUID());
        booking = await api.createBooking({ ...proposal, clientId: original.clientId, eventName: original.eventName,
          confirmationKey: keys.current.get(index) });
      }
      completed.current = true;
      await onConfirmed(booking);
    } catch (e) {
      setError([e.message, ...(e.details?.reasons || []).map((r) => r.message)].join(" "));
    } finally { lock.current = false; setBusy(""); }
  }
  return <section className="panel recommendations" aria-label="Alternative recommendations">
    <h2>Find alternatives</h2>
    <p>Keep attendance, duration and resources. Previewed slots are not reserved.</p>
    <div className="filter-bar">
      <Field label="Search dates"><select value={days} disabled={!!busy} onChange={(e) => setDays(e.target.value)}>
        <option value="1">Requested date only</option><option value="7">Requested date and next 6 days</option>
      </select></Field>
      <label className="recommendation-checkbox"><input type="checkbox" checked={preferredOnly} disabled={!!busy}
        onChange={(e) => setPreferredOnly(e.target.checked)} /> Preferred venue only</label>
      <button className="button secondary" disabled={!!busy || completed.current} onClick={search}>
        {busy === "search" ? "Searching…" : result ? "Refresh alternatives" : "Find alternatives"}
      </button>
    </div>
    {busy === "search" && <Feedback>Searching available alternatives…</Feedback>}
    {error && <Feedback error={error} />}
    {result && <>
      <p className="muted">Searched {result.search.fromDate} through {result.search.throughDate}, 08:30–21:30 event window, {result.search.intervalMinutes}-minute grid plus your exact requested time.</p>
      {!result.recommendations.length && <Feedback>No feasible alternatives found within this search range. Try more dates or review your requirements.</Feedback>}
      {result.recommendations.map((r, index) => <article className="request-card" key={`${r.eventDate}/${r.startTime}/${r.venueId}/${r.hallId}`}>
        <h3>{r.venueName} · {r.hallName}</h3>
        <p>{r.eventDate} · {r.startTime} – {r.endTime} · Capacity {r.hallCapacity}</p>
        <p>Reserved: {formatMinute(r.reservedStartMinute)} – {formatMinute(r.reservedEndMinute)}</p>
        <p>{r.preferredVenuePreserved ? "Preferred venue preserved" : "Alternative venue"} · {r.timeDifferenceMinutes === 0 ? "Same clock time" : `${Math.abs(r.timeDifferenceMinutes)} minutes ${r.timeDifferenceMinutes < 0 ? "earlier" : "later"}`}</p>
        <p>Projectors {r.projectorsRequired} · Audio {r.audioRequired} · Staff {r.staffRequired} · Attendees {r.attendees}</p>
        <p>{r.explanation}</p>
        {r.sameAsOriginalAllocation && <p className="muted">Already feasible through normal allocation; no change from the current allocation preview.</p>}
        <button className="button" disabled={!!busy || completed.current} onClick={() => confirm(r, index)}>
          {busy === String(index) ? "Confirming…" : bookingId ? "Reschedule to this alternative" : "Confirm this alternative"}
        </button>
      </article>)}
    </>}
  </section>;
}
