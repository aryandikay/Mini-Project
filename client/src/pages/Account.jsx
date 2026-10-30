import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../services/api.js";
import { Field, Feedback, PageTitle } from "../components/Common.jsx";
export function Profile() {
  const { user, setUser } = useAuth(), [name, setName] = useState(user.name), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const lock = useRef(false);
  async function save(event) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); setMessage("");
    try { setUser(await api.updateProfile(name)); setMessage("Your profile has been updated."); } catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  return <><PageTitle title="My profile" eyebrow="YOUR WORKSPACE ACCOUNT">Your login account is separate from event client records.</PageTitle>
    <div className="comparison-grid"><form className="panel form-stack" onSubmit={save}><h2>Profile details</h2>
      {error && <Feedback error={error} />}{message && <Feedback>{message}</Feedback>}
      <Field label="Display name"><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Account email"><input value={user.email} readOnly type="email" /></Field>
      <p>Role: {user.role === "ADMIN" ? "Administrator" : "Staff organizer"}</p><p>Account created: {user.createdAt}</p>
      <button className="button" disabled={busy}>{busy ? "Saving profile…" : "Save profile"}</button></form>
      <article className="panel"><h2>Account security</h2><p>Passwords and sessions are managed separately from your display name.</p><Link className="button secondary" to="/settings">Open account settings</Link></article></div></>;
}
export function Settings() {
  const { clear } = useAuth(), [currentPassword, setCurrent] = useState(""), [newPassword, setNext] = useState(""), [confirmation, setConfirm] = useState("");
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), lock = useRef(false);
  async function change(event) {
    event.preventDefault(); if (lock.current) return; setError("");
    if (newPassword !== confirmation) { setError("New passwords do not match."); return; }
    lock.current = true; setBusy(true);
    try { const result = await api.changePassword({ currentPassword, newPassword }); clear(result.message); }
    catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  return <><PageTitle title="Account settings" eyebrow="SECURITY AND ACCESS">Change your password and manage account security.</PageTitle>
    <form className="panel form-stack account-form" onSubmit={change}><h2>Change password</h2><p>Changing your password signs out all sessions, including this one.</p>
      {error && <Feedback error={error} />}
      {[["Current password", currentPassword, setCurrent, "current-password"], ["New password", newPassword, setNext, "new-password"], ["Confirm new password", confirmation, setConfirm, "new-password"]].map(([label, value, setter, complete]) => <Field key={label} label={label}>
        <input type={show ? "text" : "password"} required value={value} autoComplete={complete} minLength={complete === "new-password" ? 12 : undefined} onChange={(e) => setter(e.target.value)} />
      </Field>)}
      <label className="recommendation-checkbox"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
      <p className="muted">Use at least 12 characters and at most 72 UTF-8 bytes.</p><button className="button" disabled={busy}>{busy ? "Changing password…" : "Change password"}</button>
    </form><p><Link to="/access">Administrator-assisted recovery information</Link></p></>;
}
