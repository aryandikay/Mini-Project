import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import { Feedback } from "./components/Common.jsx";
import PublicLayout from "./layouts/PublicLayout.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Access from "./pages/Access.jsx";
import Workspace from "./Workspace.jsx";

function ProtectedWorkspace() {
  const { user, status, error, notice, restore } = useAuth(), location = useLocation();
  const known = ["/app", "/new", "/clients", "/schedule", "/venues", "/resources", "/simulation", "/profile", "/settings", "/users", "/bookings"].includes(location.pathname)
    || location.pathname.startsWith("/bookings/") || location.pathname.startsWith("/app/");
  if (!known) return <PublicLayout><section className="access-section"><h1>Page not found</h1><p>That page is not available.</p><Link className="button" to="/">Return home</Link></section></PublicLayout>;
  if (status === "signing-out") return <div className="session-loading"><Feedback>Logging out…</Feedback></div>;
  if (status === "loading") return <div className="session-loading"><Feedback>Restoring your session…</Feedback></div>;
  if (status === "error") return <div className="session-loading"><Feedback error={error} /><button className="button" onClick={restore}>Retry session check</button></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: notice ? "/app" : location.pathname + location.search, message: notice }} />;
  return <Workspace />;
}
export default function App() {
  return <AuthProvider><Routes><Route element={<PublicLayout />}>
    <Route path="/" element={<Home />} /><Route path="/login" element={<Login />} /><Route path="/access" element={<Access />} />
  </Route><Route path="/*" element={<ProtectedWorkspace />} /></Routes></AuthProvider>;
}
