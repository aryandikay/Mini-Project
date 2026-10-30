import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
const features = [
  ["01", "A hall that fits", "Allocate the smallest suitable hall, with your preferred venue considered first."],
  ["02", "Shared resources, accounted for", "Check projectors, audio systems and staff across every simultaneous reservation."],
  ["03", "A reason behind each decision", "See capacity, buffered time and resource constraints when a request cannot be accommodated."],
  ["04", "Another way forward", "Find ranked time, date and venue alternatives while preserving the event’s requirements."],
  ["05", "Change plans safely", "Cancel to release capacity or reschedule atomically, preserving the original if a proposal fails."],
  ["06", "See the whole reservation", "Inspect hall timelines with setup and cleanup visibly separated from event execution."],
  ["07", "Understand peak demand", "Explore actual concurrent resource use by venue and date, with inventory and peak intervals."],
  ["08", "Try a what-if", "Compare a hypothetical arrangement with existing bookings before choosing to apply it."],
];
export default function Home() {
  const { user } = useAuth();
  return <>
    <section className="landing-hero"><div><p className="eyebrow">ONE WORKSPACE. ROOM FOR EVERY IDEA.</p>
      <h1>Great events start with<br /><em>a clear plan.</em></h1>
      <p className="hero-description">Bring venues, people and shared resources together. Make informed scheduling decisions—and find another way when plans overlap.</p>
      <div className="hero-actions"><Link className="button" to={user ? "/app" : "/login"}>{user ? "Open dashboard" : "Enter your workspace"} <span aria-hidden="true">↗</span></Link><a className="text-link" href="#features">Explore features ↓</a></div>
      <p className="hero-note">For authorized organizers and staff · No public account signup</p>
    </div><div className="reservation-illustration" aria-label="Illustration of a buffered event reservation">
      <div className="illustration-heading"><span>THE SPACE AROUND AN EVENT</span><span aria-hidden="true">↗</span></div>
      <h2>More than a time slot.</h2><p>Protect room for preparation, the event itself, and a smooth handover.</p>
      <div className="illustration-plan"><div><span>09:30</span><span>10:00</span><span>12:00</span><span>12:30</span></div>
        <div className="illustration-reservation"><span>Setup</span><strong>Event execution</strong><span>Cleanup</span></div>
      </div><dl><div><dt>Hall capacity</dt><dd>Checked</dd></div><div><dt>Shared resources</dt><dd>Checked over the full interval</dd></div></dl>
      <small>Illustrative interval · Not a live booking or availability claim</small>
    </div></section>
    <section className="landing-principles"><p>VENUES + HALLS</p><span aria-hidden="true">→</span><p>TIME + BUFFERS</p><span aria-hidden="true">→</span><p>SHARED INVENTORY</p><span aria-hidden="true">→</span><p>ONE CHECKED DECISION</p></section>
    <section id="features" className="landing-section"><div className="landing-section-heading"><p className="eyebrow">BUILT AROUND REAL CONSTRAINTS</p><h2>Less guesswork.<br />More room to plan.</h2><p>From the first request to a change of plans, each tool works with the same scheduling rules and stored reservations.</p></div>
      <div className="feature-grid">{features.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>
    <section id="how-it-works" className="landing-workflow"><div><p className="eyebrow">FROM IDEA TO ALLOCATION</p><h2>A practical path<br />from request to event.</h2><p>The system checks the arrangement. Your team stays in control of the decision.</p><Link className="button secondary" to="/access">How to get access ↗</Link></div>
      <ol>{[["Start with a client", "Create or select the event customer. Client records are separate from staff login accounts."],
        ["Describe the requirements", "Choose the date, times, attendance, venue preference and resource quantities."],
        ["Review the scheduling decision", "Get a confirmed allocation or actual constraint explanations from the database-backed scheduler."],
        ["Explore and manage", "Search alternatives, simulate a change, inspect resources or manage confirmed bookings."]].map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ol>
    </section>
    <section className="landing-cta"><p className="eyebrow">A LITTLE PLANNING. A GREAT EVENT.</p><h2>Your next event starts here.</h2><p>Log in to your organization’s shared scheduling workspace.</p><Link className="button" to={user ? "/app" : "/login"}>{user ? "Open dashboard" : "Log in to EventSync"} →</Link></section>
  </>;
}
