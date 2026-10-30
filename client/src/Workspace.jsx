import Schedule from "./pages/Schedule.jsx";
import Resources from "./pages/Resources.jsx";
import Simulation from "./pages/Simulation.jsx";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { Profile, Settings } from "./pages/Account.jsx";
import Users from "./pages/Users.jsx";
import VenueDirectory from "./components/VenueDirectory.jsx";
import { api } from "./services/api.js";
import { Feedback } from "./components/Common.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Clients from "./pages/Clients.jsx";
import NewBooking from "./pages/NewBooking.jsx";
import Bookings from "./pages/Bookings.jsx";
import BookingDetail from "./pages/BookingDetail.jsx";
export default function Workspace() {
  const { user } = useAuth();
  const [data, setData] = useState({ venues: [], clients: [], bookings: [] });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async (quiet = false) => {
    if (quiet !== true) setLoading(true);
    setError("");
    try {
      const [venues, clients, bookings, dashboard] = await Promise.all([
        api.venues(),
        api.clients(),
        api.bookings(),
        api.dashboard(),
      ]);
      setData({ venues, clients, bookings, dashboard });
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
  const addBooking = () => refresh(true);
  return (
    <AppLayout>

      <div className="workspace-strip">
        <span>
          <i /> EventSync workspace
        </span>
        <span>
          PHASE 6 <b>·</b> ORGANIZER WORKSPACE
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
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/venues" element={<><h1>Venues & shared inventory</h1><p className="subtitle">Inventory is shared across the halls in each venue.</p><VenueDirectory venues={data.venues} /></>} />
            <Route path="/resources" element={<Resources venues={data.venues} today={data.dashboard.today} revision={data.bookings} />} />
            <Route path="/simulation" element={<Simulation venues={data.venues} clients={data.clients} bookings={data.bookings}
              today={data.dashboard.today} onApplied={() => refresh(true)} />} />
            <Route path="/app" element={<Dashboard {...data} user={user} />} />
            <Route path="/app/dashboard" element={<Navigate to="/app" replace />} />
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
                  <Link to="/app">Return to overview →</Link>
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
    </AppLayout>
  );
}
