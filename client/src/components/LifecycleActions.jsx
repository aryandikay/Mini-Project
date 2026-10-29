import { useState } from "react";
import Recommendations, { schedulingInput } from "./Recommendations.jsx";
import { api } from "../services/api.js";
import { Field, Feedback } from "./Common.jsx";
const numeric = [
  "attendees",
  "preferredVenueId",
  "projectorsRequired",
  "audioRequired",
  "staffRequired",
];
const fields = [
  ["eventDate", "Event date", "date"],
  ["startTime", "Start time", "time"],
  ["endTime", "End time", "time"],
  ["attendees", "Attendees", "number"],
  ["projectorsRequired", "Projectors", "number"],
  ["audioRequired", "Audio systems", "number"],
  ["staffRequired", "Support staff", "number"],
];
export default function LifecycleActions({ booking, venues, onChanged }) {
  const [mode, setMode] = useState(""),
    [form, setForm] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [failedProposal, setFailedProposal] = useState(null);
  function edit() {
    setForm(
      Object.fromEntries(
        [...fields.map((f) => f[0]), "preferredVenueId"].map((key) => [
          key,
          String(booking[key]),
        ]),
      ),
    );
    setMode("edit");
    setFailedProposal(null);
    setError("");
    setSuccess("");
  }
  async function perform(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    setFailedProposal(null);
    try {
      let result;
      if (mode === "cancel")
        result = await api.cancel(booking.id, booking.updatedAt);
      else {
        if (
          numeric.some(
            (key) =>
              !/^\d+$/.test(form[key]) ||
              !Number.isSafeInteger(Number(form[key])),
          )
        )
          throw new Error("Enter whole numbers for attendees and resources.");
        result = await api.reschedule(booking.id, {
          ...form,
          ...Object.fromEntries(numeric.map((key) => [key, Number(form[key])])),
          expectedUpdatedAt: booking.updatedAt,
        });
      }
      await onChanged(result);
      setMode("");
      setSuccess(
        result.status === "CANCELLED"
          ? "Booking cancelled. Its hall and resources are released."
          : "Booking rescheduled. The updated allocation is shown above.",
      );
    } catch (e) {
      if (e.code === "RESCHEDULE_INFEASIBLE") {
        setFailedProposal({
          ...schedulingInput(booking), ...form,
          ...Object.fromEntries(numeric.map((key) => [key, Number(form[key])])),
          updatedAt: booking.updatedAt,
        });
      }
      setError(
        [e.message, ...(e.details?.reasons || []).map((r) => r.message)].join(
          " ",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  if (booking.status !== "CONFIRMED" && !error && !success) return null;
  return (
    <section
      className="panel"
      style={{ marginTop: 20 }}
      aria-label="Booking actions"
    >
      {error && <Feedback error={error} />}{" "}
      {success && <Feedback>{success}</Feedback>}
      {booking.status === "CONFIRMED" && (
        <>
          {!mode && (
            <div className="form-actions">
              <button className="button" onClick={edit}>
                Reschedule booking
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setMode("cancel");
                  setError("");
                  setSuccess("");
                }}
              >
                Cancel booking
              </button>
            </div>
          )}
          {mode === "cancel" && (
            <form onSubmit={perform}>
              <h2>Cancel this booking?</h2>
              <p>
                The booking will remain in your history. Its hall and resources
                will be released.
              </p>
              <div className="form-actions">
                <button disabled={busy} className="button">
                  {busy ? "Cancelling…" : "Confirm cancellation"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setMode("")}
                >
                  Keep booking
                </button>
              </div>
            </form>
          )}
          {mode === "edit" && (
            <form onSubmit={perform} className="form-stack">
              <h2>Reschedule booking</h2>
              <p>
                The original reservation remains active unless the proposed
                allocation succeeds.
              </p>
              <div className="form-grid">
                {fields.map(([key, label, type]) => (
                  <Field key={key} label={label}>
                    <input
                      type={type}
                      required
                      min={
                        type === "number"
                          ? key === "attendees"
                            ? 1
                            : 0
                          : type === "time"
                            ? "08:30"
                            : undefined
                      }
                      max={type === "time" ? "21:30" : undefined}
                      step={type === "number" ? 1 : undefined}
                      value={form[key]}
                      onChange={(e) => {
                        setForm({ ...form, [key]: e.target.value });
                        setFailedProposal(null);
                      }}
                    />
                  </Field>
                ))}
                <Field label="Preferred venue">
                  <select
                    required
                    value={form.preferredVenueId}
                    onChange={(e) => {
                      setForm({ ...form, preferredVenueId: e.target.value });
                      setFailedProposal(null);
                    }}
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="form-actions">
                <button disabled={busy} className="button">
                  {busy ? "Checking allocation…" : "Save reschedule"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="button secondary"
                  onClick={() => setMode("")}
                >
                  Discard changes
                </button>
              </div>
            </form>
          )}
          {mode === "edit" && failedProposal && <Recommendations
            key={JSON.stringify(failedProposal)} original={failedProposal} bookingId={booking.id}
            onConfirmed={async (result) => {
              await onChanged(result); setMode(""); setError(""); setFailedProposal(null);
              setSuccess("Booking rescheduled. The updated allocation is shown above.");
            }} />}
        </>
      )}
    </section>
  );
}
