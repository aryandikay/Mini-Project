import { Link, Outlet } from "react-router-dom";
import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
export function Brand({ to = "/" }) {
  return <Link to={to} className="brand" aria-label="EventSync home"><span className="brand-mark" aria-hidden="true">e<span>→</span></span>
    event<span>sync</span><small>THE PLANNING SPACE</small></Link>;
}
export default function PublicLayout({ children }) {
  const { user } = useAuth(), [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  return <div className="public-site">
    <a className="skip-link" href="#public-main">Skip to content</a>
    <header className="public-header"><Brand /><button ref={menuButton} className="button secondary public-menu-button" aria-expanded={open}
      aria-controls="public-navigation" onClick={() => setOpen(!open)}>Menu</button>
      <nav id="public-navigation" aria-label="Public navigation" className={open ? "is-open" : ""} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); menuButton.current?.focus(); } }} onClick={() => setOpen(false)}>
        <Link to="/">Home</Link><a href="/#features">Features</a><a href="/#how-it-works">How it works</a>
        <Link to="/access">Account access</Link><Link className="button" to={user ? "/app" : "/login"}>{user ? "Open dashboard" : "Log in"}</Link>
      </nav>
    </header>
    <main id="public-main">{children || <Outlet />}</main>
    <footer className="public-footer"><div><Brand /><p>A shared workspace for venues, resources and better event decisions.</p></div>
      <nav aria-label="Footer navigation"><a href="/#features">Features</a><a href="/#how-it-works">How it works</a><Link to="/access">Account access</Link><Link to="/app">Open application</Link></nav>
      <small>EventSync · Campus event scheduling project</small>
    </footer>
  </div>;
}
