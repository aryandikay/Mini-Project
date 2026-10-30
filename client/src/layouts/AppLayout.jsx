import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { Brand } from "./PublicLayout.jsx";
import { Feedback } from "../components/Common.jsx";
const links = [["/app", "Overview", "◫"], ["/new", "Create request", "+"], ["/bookings", "Event requests", "▤"],
  ["/schedule", "Schedule", "▦"], ["/clients", "Clients", "◎"], ["/venues", "Venues", "▥"],
  ["/resources", "Resources", "≋"], ["/simulation", "What-if", "◇"], ["/profile", "Profile", "○"], ["/settings", "Settings", "⚙"]];
export default function AppLayout({ children }) {
  const { user, logout } = useAuth(), location = useLocation();
  const [open, setOpen] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const menuButton = useRef(null);
  useEffect(() => { if (open) document.querySelector("#workspace-navigation a")?.focus(); }, [open]);
  const title = location.pathname.startsWith("/bookings/") ? "Booking details" : location.pathname === "/users" ? "Staff accounts" : links.find(([path]) => path === location.pathname)?.[1] || "Workspace";
  async function signOut() {
    if (busy) return;
    setBusy(true); setError("");
    try { await logout(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="workspace-layout" onKeyDown={(e) => { if (e.key === "Escape" && open) { setOpen(false); menuButton.current?.focus(); } }}>
    <a className="skip-link" href="#workspace-main">Skip to content</a>
    <aside className={`workspace-sidebar ${open ? "is-open" : ""}`}><Brand to="/app" />
      <p className="sidebar-caption">ORGANIZE YOUR WORKSPACE</p>
      <nav id="workspace-navigation" aria-label="Main navigation" onClick={() => setOpen(false)}>
        {links.map(([path, label, icon]) => <NavLink key={path} to={path} end={path === "/app"}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}
        {user.role === "ADMIN" && <NavLink to="/users"><span aria-hidden="true">♧</span>Staff accounts</NavLink>}
      </nav><Link className="sidebar-public" to="/">Visit public website ↗</Link>
    </aside>
    <div className="workspace-body"><header className="workspace-topbar">
      <button ref={menuButton} className="button secondary workspace-menu-button" aria-controls="workspace-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
      <div><span className="eyebrow">EVENTSYNC WORKSPACE</span><strong>{title}</strong></div>
      <details className="account-menu" onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}><summary>{user.name} <span aria-hidden="true">⌄</span></summary>
        <div><span>{user.role === "ADMIN" ? "Administrator" : "Staff organizer"}</span><Link to="/profile">My profile</Link><Link to="/settings">Account settings</Link>
          <button disabled={busy} onClick={signOut}>{busy ? "Logging out…" : "Log out"}</button></div>
      </details>
    </header>{error && <Feedback error={error} />}<div id="workspace-main">{children}</div></div>
  </div>;
}
