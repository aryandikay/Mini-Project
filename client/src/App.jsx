import { useCallback, useEffect, useState } from "react";
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
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [venues, clients, bookings] = await Promise.all([
        api.venues(),
        api.clients(),
        api.bookings(),
      ]);
      setData({ venues, clients, bookings });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const addClient = (client) =>
    setData((current) => ({
      ...current,
      clients: [client, ...current.clients],
    }));
  const addBooking = (booking) =>
    setData((current) => ({
      ...current,
      bookings: [booking, ...current.bookings],
    }));
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
          PHASE 1 <b>·</b> REQUEST MANAGEMENT
        </span>
      </div>
      <main id="main">
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
              element={<Bookings bookings={data.bookings} />}
            />
            <Route path="/bookings/:id" element={<BookingDetail />} />
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
        <span>Venue-local time · Requests remain pending until allocation</span>
        <button className="refresh-button" onClick={refresh} disabled={loading}>
          Refresh data ↻
        </button>
      </footer>
    </div>
  );
}
