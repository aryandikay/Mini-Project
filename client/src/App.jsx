import Utilization from "./pages/Utilization.jsx";
import Schedule from "./pages/Schedule.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { api } from "./services/api.js";
import { Feedback } from "./components/Common.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Clients from "./pages/Clients.jsx";
import NewBooking from "./pages/NewBooking.jsx";
import Bookings from "./pages/Bookings.jsx";
import BookingDetail from "./pages/BookingDetail.jsx";
export default function App() {
  const [data, setData] = useState({ venues: [], clients: [], bookings: [] });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const refreshSequence = useRef(0);
  const refresh = useCallback(async (quiet = false) => {
    const sequence = ++refreshSequence.current;
    setRefreshError("");
    if (quiet !== true) setLoading(true);
    setError("");
    try {
      const [venues, clients, bookings, dashboard] = await Promise.all([
        api.venues(),
        api.clients(),
        api.bookings(),
        api.dashboard(),
      ]);
      if (sequence === refreshSequence.current)
        setData({ venues, clients, bookings, dashboard });
    } catch (e) {
      if (sequence === refreshSequence.current) {
        if (quiet === true) setRefreshError(e.message);
        else setError(e.message);
      }
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    return () => {
      refreshSequence.current++;
    };
  }, [refresh]);
  const addClient = (client) =>
    setData((current) => ({
      ...current,
      clients: [client, ...current.clients],
    }));
  const addBooking = () => refresh(true);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="EventSync home">
          <span className="brand-mark" aria-hidden="true">
            e<span>→</span>
          </span>
          event<span>sync</span>
          <small>THE PLANNING SPACE</small>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/bookings">Event requests</NavLink>
          <NavLink to="/schedule">Schedule</NavLink>
          <NavLink to="/utilization">Utilization</NavLink>
          <NavLink to="/clients">Clients</NavLink>
        </nav>
        <Link to="/new" className="header-action">
          Create request <span aria-hidden="true">→</span>
        </Link>
      </header>
      <div className="workspace-strip">
        <span>
          <i /> EventSync workspace
        </span>
        <span>
          VENUES <b>·</b> EVENTS <b>·</b> RESOURCES
        </span>
      </div>
      <main id="main">
        {refreshError && (
          <div className="panel">
            <Feedback
              error={`Workspace totals may be out of date. Your completed booking operation is saved. ${refreshError}`}
            />
            <button className="button secondary" onClick={() => refresh(true)}>
              Retry workspace refresh
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading" role="status">
            <span className="spinner" />
            Loading your workspace…
          </div>
        ) : error ? (
          <div className="panel">
            <Feedback error={error} />
            <button className="button" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : (
          <Routes>
            <Route
              path="/utilization"
              element={
                <Utilization
                  venues={data.venues}
                  today={data.dashboard.today}
                  revision={data.bookings}
                />
              }
            />
            <Route path="/" element={<Dashboard {...data} />} />
            <Route
              path="/clients"
              element={<Clients clients={data.clients} onCreated={addClient} />}
            />
            <Route
              path="/new"
              element={
                <NewBooking
                  clients={data.clients}
                  venues={data.venues}
                  onCreated={addBooking}
                />
              }
            />
            <Route
              path="/bookings"
              element={
                <Bookings bookings={data.bookings} venues={data.venues} />
              }
            />
            <Route
              path="/bookings/:id"
              element={
                <BookingDetail
                  venues={data.venues}
                  clients={data.clients}
                  onChanged={() => refresh(true)}
                />
              }
            />
            <Route
              path="/schedule"
              element={
                <Schedule
                  venues={data.venues}
                  revision={data.bookings}
                  today={data.dashboard.today}
                />
              }
            />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Page not found</h1>
                  <Link to="/">Return to overview →</Link>
                </div>
              }
            />
          </Routes>
        )}
      </main>
      <footer>
        <span className="footer-brand">
          eventsync<span> / </span>Room for every idea.
        </span>
        <span>Venue-local time · Allocation includes setup and cleanup</span>
        <button className="refresh-button" onClick={refresh} disabled={loading}>
          Refresh data ↻
        </button>
      </footer>
    </div>
  );
}
