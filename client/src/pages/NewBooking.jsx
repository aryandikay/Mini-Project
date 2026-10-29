import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api.js";
import { Feedback, Field, PageTitle } from "../components/Common.jsx";
const initial = {
  clientId: "",
  eventName: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  attendees: "",
  preferredVenueId: "",
  projectorsRequired: "0",
  audioRequired: "0",
  staffRequired: "0",
};
const numericFields = [
  "clientId",
  "attendees",
  "preferredVenueId",
  "projectorsRequired",
  "audioRequired",
  "staffRequired",
];
export default function NewBooking({ clients, venues, onCreated }) {
  const [form, setForm] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const props = (name) => ({
    value: form[name],
    onChange: (e) =>
      setForm((current) => ({ ...current, [name]: e.target.value })),
  });
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (form.endTime <= form.startTime) {
      setError("End time must be after start time.");
      return;
    }
    if (
      numericFields.some(
        (name) =>
          !/^\d+$/.test(form[name]) ||
          !Number.isSafeInteger(Number(form[name])),
      )
    ) {
      setError(
        "Enter whole numbers for attendees and resources, and select a client and venue.",
      );
      return;
    }
    setBusy(true);
    try {
      const input = {
        ...form,
        ...Object.fromEntries(
          numericFields.map((name) => [name, Number(form[name])]),
        ),
      };
      const booking = await api.createBooking(input);
      onCreated(booking);
      navigate("/bookings", {
        state: {
          message: `Request #${booking.id} submitted. It is pending allocation and is not a confirmed booking.`,
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="LET’S BRING IT TOGETHER"
        title="What are you planning?"
      >
        Tell us about your event. We’ll save your request for allocation.
      </PageTitle>
      <div className="booking-layout">
        <form className="panel booking-form" onSubmit={submit}>
          <div className="form-section">
            <h2>
              <span>01</span> The essentials
            </h2>
            <div className="form-grid">
              <Field label="Client">
                <select required {...props("clientId")}>
                  <option value="">Select a client</option>
                  {clients.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="inline-help">
                New here? <Link to="/clients">Add a client first →</Link>
              </div>
              <div className="full">
                <Field label="Event name">
                  <input
                    required
                    maxLength={160}
                    {...props("eventName")}
                    placeholder="Give your event a name"
                  />
                </Field>
              </div>
              <Field label="Event date">
                <input type="date" required {...props("eventDate")} />
              </Field>
              <Field label="Attendees">
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  {...props("attendees")}
                  placeholder="Number of guests"
                />
              </Field>
            </div>
          </div>
          <div className="form-section">
            <h2>
              <span>02</span> Time & place
            </h2>
            <div className="form-grid">
              <Field label="Start time">
                <input
                  type="time"
                  required
                  min="08:30"
                  max="21:30"
                  step="60"
                  {...props("startTime")}
                />
              </Field>
              <Field label="End time">
                <input
                  type="time"
                  required
                  min="08:30"
                  max="21:30"
                  step="60"
                  {...props("endTime")}
                />
              </Field>
              <div className="full">
                <Field
                  label="Preferred venue"
                  hint="A preference, not an allocation or guarantee of availability."
                >
                  <select required {...props("preferredVenueId")}>
                    <option value="">Select a preferred venue</option>
                    {venues.map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>
          <div className="form-section">
            <h2>
              <span>03</span> Resources you need
            </h2>
            <p className="muted">
              Enter requested quantities. Availability will be checked during
              allocation.
            </p>
            <div className="form-grid resources">
              {[
                ["projectorsRequired", "Projectors"],
                ["audioRequired", "Audio systems"],
                ["staffRequired", "Support staff"],
              ].map(([name, label]) => (
                <Field label={label} key={name}>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    {...props(name)}
                  />
                </Field>
              ))}
            </div>
          </div>
          {error && <Feedback error={error} />}
          <div className="form-actions">
            <span>All event details are required.</span>
            <button className="button" disabled={busy || !clients.length}>
              {busy ? "Submitting request…" : "Submit event request →"}
            </button>
          </div>
          {!clients.length && (
            <Feedback>Add a client before submitting a request.</Feedback>
          )}
        </form>
        <aside className="booking-aside">
          <div className="aside-icon" aria-hidden="true">
            ◷
          </div>
          <h2>
            A little room
            <br />
            on either side.
          </h2>
          <p>
            Every event includes 30 minutes for setup and 30 minutes for
            cleanup.
          </p>
          <div className="time-guide">
            <div>
              <span>Venue operating hours</span>
              <strong>08:00 – 22:00</strong>
            </div>
            <div>
              <span>Earliest event start</span>
              <strong>08:30</strong>
            </div>
            <div>
              <span>Latest event end</span>
              <strong>21:30</strong>
            </div>
          </div>
          <p className="aside-note">
            All dates and times use venue-local time, with no timezone
            conversion.
          </p>
          <div className="pending-note">
            <strong>A request, then a plan.</strong>
            <p>
              Submissions stay pending. Hall and resource allocation will be
              introduced in the next phase.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
