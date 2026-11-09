import { useEffect, useState } from "react";

/**
 * How long until this login ends. The server puts the end time in the login
 * token (24 hours for students, 12 for teachers and admins); after it, every
 * request is refused and the user has to sign in again.
 * The clock and the warning that show it are in components/SessionTimer.jsx.
 */

export const WARN_BEFORE_MS = 5 * 60 * 1000;

/** When the saved login token stops working (ms since epoch), or null. */
export function tokenExpiresAt() {
  try {
    const token = localStorage.getItem("learnmate_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Milliseconds left in this login, kept up to date (every second near the end). */
export function useSessionTimeLeft() {
  const [left, setLeft] = useState(() => {
    const exp = tokenExpiresAt();
    return exp == null ? null : exp - Date.now();
  });
  useEffect(() => {
    let timer;
    const tick = () => {
      const exp = tokenExpiresAt();
      const ms = exp == null ? null : exp - Date.now();
      setLeft(ms);
      // Seconds matter only in the last hour.
      timer = setTimeout(tick, ms != null && ms < 60 * 60 * 1000 ? 1000 : 30 * 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return left;
}

/**
 * Signs the user out when the login ends, by sending the same event the API
 * client sends when the server refuses an expired login (App handles it).
 * Re-reads the token every few seconds, so a fresh one (after a password
 * change) moves the deadline, and a laptop waking from sleep notices at once.
 */
export function useSessionExpiry(active) {
  useEffect(() => {
    if (!active) return undefined;
    let fired = false;
    const check = () => {
      const exp = tokenExpiresAt();
      if (!fired && exp != null && exp <= Date.now()) {
        fired = true;
        document.dispatchEvent(new CustomEvent("learnmate:session-expired"));
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [active]);
}

export function formatTimeLeft(ms) {
  if (ms == null) return "";
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (ms < 10 * 60 * 1000) return `${m}:${String(s).padStart(2, "0")}`;
  return `${m}m`;
}
