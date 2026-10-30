import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { Field, Feedback } from "../components/Common.jsx";
export function safeDestination(value) {
  return typeof value === "string" && /^\/(app|new|bookings|clients|schedule|venues|resources|simulation|profile|settings|users)(\/|\?|$)/.test(value)
    && !/[\u0000-\u0020\\]/.test(value) ? value : "/app";
}
export default function Login() {
  const { user, status, login } = useAuth(), location = useLocation(), navigate = useNavigate();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), destination = safeDestination(location.state?.from);
  if (status === "ready" && user) return <Navigate to={destination} replace />;
  async function submit(event) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await login({ email, password }); setPassword(""); navigate(destination, { replace: true }); }
    catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="auth-section"><div className="auth-introduction"><p className="eyebrow">WELCOME TO YOUR PLANNING SPACE</p><h1>Good to<br /><em>have you here.</em></h1><p>Log in to coordinate venues, check shared resources and keep every event moving.</p><Link to="/">← Back to EventSync</Link></div>
    <form className="panel auth-card form-stack" onSubmit={submit}><h2>Log in to EventSync</h2><p>Use your organizer or staff account.</p>
      {location.state?.message && <Feedback>{location.state.message}</Feedback>}{error && <Feedback error={error} />}
      <Field label="Email address"><input type="email" autoComplete="username" required value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password"><input type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <label className="recommendation-checkbox"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
      <button className="button" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      {busy && <Feedback>Checking your account…</Feedback>}
      <Link to="/access">Need an account or help signing in?</Link><p className="muted">Accounts are provisioned by your workspace administrator.</p>
    </form></section>;
}
