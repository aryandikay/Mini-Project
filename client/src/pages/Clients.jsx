import { useState } from "react";
import { api } from "../services/api.js";
import { Empty, Feedback, Field, PageTitle } from "../components/Common.jsx";
export default function Clients({ clients, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const client = await api.createClient(form);
      onCreated(client);
      setForm({ name: "", email: "", phone: "" });
      setSuccess(
        `${client.name} has been added. You can now submit an event request for this client.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE & ORGANIZATIONS"
        title="Good events start with people."
      >
        Create a client profile to keep their event requests connected.
      </PageTitle>
      <div className="two-columns">
        <section className="panel">
          <h2>Add a client</h2>
          <p className="muted">
            Only a name is required. Contact details are optional.
          </p>
          <form onSubmit={submit} className="form-stack">
            <Field label="Client name">
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Campus Cultural Society"
              />
            </Field>
            <Field label="Email (optional)">
              <input
                type="email"
                maxLength={254}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                type="tel"
                maxLength={40}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Contact number"
              />
            </Field>
            {error && <Feedback error={error} />}
            <button className="button" disabled={busy}>
              {busy ? "Adding client…" : "Add client"}
            </button>
            {success && <Feedback>{success}</Feedback>}
          </form>
        </section>
        <section>
          <div className="section-heading">
            <h2>Client directory</h2>
            <span className="count">{clients.length}</span>
          </div>
          {clients.length ? (
            <div className="client-list">
              {clients.map((c) => (
                <article className="client-card" key={c.id}>
                  <div className="avatar" aria-hidden="true">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3>{c.name}</h3>
                    <p>{c.email || "No email provided"}</p>
                    {c.phone && <p>{c.phone}</p>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="A place for your clients">
              Client profiles will appear here after you add them.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
