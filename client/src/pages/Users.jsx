import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../services/api.js";
import { Field, Feedback, PageTitle } from "../components/Common.jsx";
export default function Users() {
  const { user } = useAuth(), [users, setUsers] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmation: "" }), [busy, setBusy] = useState(false), [show, setShow] = useState(false), lock = useRef(false);
  useEffect(() => {
    let active = true;
    if (user.role !== "ADMIN") { setLoading(false); return; }
    api.users().then((result) => { if (active) setUsers(result); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.role]);
  if (user.role !== "ADMIN") return <Feedback error="Administrator access is required to manage staff accounts." />;
  async function create(event) {
    event.preventDefault(); if (lock.current) return; setError(""); setMessage("");
    if (form.password !== form.confirmation) { setError("Passwords do not match."); return; }
    lock.current = true; setBusy(true);
    try {
      const created = await api.createStaff({ name: form.name, email: form.email, password: form.password });
      setUsers((current) => [...current, created]); setForm({ name: "", email: "", password: "", confirmation: "" });
      setMessage("Staff account created. Arrange a secure handover of the initial credentials.");
    } catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  async function toggle(account) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setMessage("");
    try { const updated = await api.userStatus(account.id, !account.active); setUsers((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); setMessage(updated.active ? "Staff account enabled." : "Staff account disabled and sessions revoked."); }
    catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  return <><PageTitle title="Staff accounts" eyebrow="ADMINISTRATION">Create authorized staff accounts for this shared workspace. No emails are sent automatically.</PageTitle>
    {error && <Feedback error={error} />}{message && <Feedback>{message}</Feedback>}
    <div className="comparison-grid"><form className="panel form-stack" onSubmit={create}><h2>Create staff account</h2>
      {[["name", "Staff name", "text"], ["email", "Staff email", "email"], ["password", "Initial password", show ? "text" : "password"], ["confirmation", "Confirm initial password", show ? "text" : "password"]].map(([key, label, type]) => <Field key={key} label={label}>
        <input type={type} autoComplete={key.includes("password") || key === "confirmation" ? "new-password" : "off"} required minLength={key === "password" || key === "confirmation" ? 12 : undefined} maxLength={key === "name" ? 120 : key === "email" ? 254 : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </Field>)}<label className="recommendation-checkbox"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
      <button className="button" disabled={busy}>{busy ? "Saving…" : "Create staff account"}</button>
    </form><section className="panel"><h2>Workspace accounts</h2>{loading ? <Feedback>Loading accounts…</Feedback> : users.map((account) => <article className="staff-row" key={account.id}><h3>{account.name}</h3><p>{account.email}</p><p>{account.role} · {account.active ? "Active" : "Disabled"}</p>
      {account.role !== "ADMIN" && <button className="button secondary" disabled={busy} onClick={() => toggle(account)}>{account.active ? "Disable" : "Enable"} {account.name}</button>}</article>)}</section></div></>;
}
