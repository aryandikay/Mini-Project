import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";
const Context = createContext(null);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [status, setStatus] = useState("loading"), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const signingOut = useRef(false);
  const restore = useCallback(async () => {
    const attempt = ++generation.current;
    setStatus("loading"); setError("");
    try { const value = await api.me(); if (attempt === generation.current) { setUser(value); setStatus("ready"); } }
    catch (e) {
      if (attempt !== generation.current) return;
      setUser(null);
      if (e.code === "AUTH_REQUIRED") setStatus("ready");
      else { setError(e.message); setStatus("error"); }
    }
  }, []);
  useEffect(() => {
    restore();
    const expired = () => { if (signingOut.current) return; generation.current++; setUser(null); setStatus("ready"); };
    window.addEventListener("eventsync:unauthorized", expired);
    const restoredDocument = (event) => { if (event.persisted) restore(); };
    window.addEventListener("pageshow", restoredDocument);
    return () => { window.removeEventListener("eventsync:unauthorized", expired); window.removeEventListener("pageshow", restoredDocument); };
  }, [restore]);
  async function login(body) { generation.current++; try { const value = await api.login(body); setNotice(""); setUser(value); setStatus("ready"); return value; } catch (e) { setStatus("ready"); throw e; } }
  async function logout() {
    signingOut.current = true; generation.current++;
    try {
      await api.logout();
      setStatus("signing-out"); setUser(null);
      // A fresh public document also discards in-flight workspace requests and cached React state.
      window.location.replace("/");
    } catch (e) { signingOut.current = false; throw e; }
  }
  const clear = (message = "") => { generation.current++; setNotice(message); setUser(null); setStatus("ready"); };
  return <Context.Provider value={{ user, status, error, notice, restore, login, logout, clear, setUser }}>{children}</Context.Provider>;
}
