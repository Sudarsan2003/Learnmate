import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ClipboardList, Gamepad2, X, CheckCheck, Trophy, UserX } from "lucide-react";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../api/client";

/**
 * Notification bell for the navbar. Students get "New quiz: Fractions",
 * "7 new games to try" and medal/topper news; teachers and admins get the
 * weekly inactive-students alert. Shows an unread badge, a dropdown of cards,
 * and a pop-up card for anything that arrived since it was last seen.
 * Clicking a card marks it read and opens the page it's about.
 * It checks for new ones every minute while the tab is visible.
 */

const POLL_MS = 60_000;
// Fired once a read is saved, so a bell on the page being opened (which may
// have loaded before the save landed) shows the right count.
const CHANGED = "learnmate:notifications-changed";
const announceChange = () => document.dispatchEvent(new CustomEvent(CHANGED));
const TOASTED_KEY = "learnmate_toasted_notifications";

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString();
}

function readToasted() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(TOASTED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveToasted(ids) {
  try {
    sessionStorage.setItem(TOASTED_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {
    /* storage unavailable: worst case a card pops up again */
  }
}

/** "quizzes" or "games:CODE" -> tells App which page to open. */
function openLink(link) {
  if (!link) return;
  const [view, gameType] = link.split(":");
  document.dispatchEvent(new CustomEvent("learnmate:navigate", { detail: { view, gameType } }));
}

const ICONS = { GAME: Gamepad2, ACHIEVEMENT: Trophy, ALERT: UserX, QUIZ: ClipboardList };
const Icon = ({ type, size = 16 }) => {
  const C = ICONS[type] ?? ClipboardList;
  return <C size={size} />;
};
const ACTION = { GAME: "Play now", ACHIEVEMENT: "See my medals", ALERT: "Open reports", QUIZ: "Open quizzes" };

export default function NotificationBell() {
  const signedIn = (() => {
    try {
      return !!localStorage.getItem("learnmate_token");
    } catch {
      return false;
    }
  })();

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const rootRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getNotifications();
      setItems(data.items);
      setUnread(data.unreadCount);
      // Pop up the newest unread one the student hasn't been shown yet this session.
      const toasted = readToasted();
      const fresh = data.items.filter((n) => !n.read && !toasted.has(n.id));
      if (fresh.length) {
        setToast(fresh.length > 1 ? { ...fresh[0], more: fresh.length - 1 } : fresh[0]);
        fresh.forEach((n) => toasted.add(n.id));
        saveToasted(toasted);
      }
    } catch {
      /* offline or logged out: try again on the next tick */
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;
    const first = window.setTimeout(refresh, 0);
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener(CHANGED, onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener(CHANGED, onFocus);
    };
  }, [signedIn, refresh]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The pop-up card hides itself after a few seconds.
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!signedIn) return null;

  function activate(n) {
    setOpen(false);
    setToast(null);
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationRead(n.id).then(announceChange, () => {});
    }
    openLink(n.link);
  }

  function readAll() {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
    markAllNotificationsRead().then(announceChange, () => {});
  }

  return (
    <div ref={rootRef} className="nb-root">
      <style>{CSS}</style>
      <button
        type="button"
        className="nb-bell"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {unread > 0 && <span className="nb-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-head">
            <span className="nb-title">Notifications</span>
            {unread > 0 && (
              <button type="button" className="nb-readall" onClick={readAll}>
                <CheckCheck size={14} /> Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="nb-empty">You&apos;re all caught up. New quizzes and games will show up here.</p>
          ) : (
            <ul className="nb-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`nb-card ${n.read ? "" : "nb-unread"}`} data-type={n.type} onClick={() => activate(n)}>
                    <span className="nb-icon" aria-hidden="true"><Icon type={n.type} /></span>
                    <span className="nb-text">
                      <span className="nb-card-title">{n.title}</span>
                      {n.message && <span className="nb-msg">{n.message}</span>}
                      <span className="nb-time">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="nb-dot" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {toast &&
        createPortal(
          <div className="nb-toast" role="status" data-type={toast.type}>
            <style>{CSS}</style>
            <span className="nb-icon" aria-hidden="true"><Icon type={toast.type} size={18} /></span>
            <div className="nb-text">
              <span className="nb-card-title">{toast.title}</span>
              {toast.message && <span className="nb-msg">{toast.message}</span>}
              {toast.more > 0 && <span className="nb-time">+{toast.more} more in your notifications</span>}
              <button type="button" className="nb-view" onClick={() => activate(toast)}>
                {ACTION[toast.type] ?? "Open"}
              </button>
            </div>
            <button type="button" className="nb-close" onClick={() => setToast(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

const CSS = `
.nb-root { position: relative; flex-shrink: 0; }
.nb-bell {
  position: relative; display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem;
  border-radius: 999px; border: 1px solid color-mix(in srgb, #5B8DEF 30%, transparent); background: var(--surface);
  color: var(--text); cursor: pointer; transition: transform 140ms ease, border-color 140ms ease;
}
@media (min-width: 640px) { .nb-bell { width: 2.25rem; height: 2.25rem; } }
.nb-bell:hover { transform: translateY(-1px); border-color: #5B8DEF; }
.nb-badge {
  position: absolute; top: -4px; right: -4px; min-width: 1.15rem; height: 1.15rem; padding: 0 .3rem; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; line-height: 1;
  color: #fff; background: #E5484D; box-shadow: 0 0 0 2px var(--bg-canvas, var(--bg));
}
.nb-panel {
  position: absolute; right: 0; top: calc(100% + .5rem); z-index: 60; width: min(23rem, calc(100vw - 1.5rem));
  max-height: min(70vh, 32rem); display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
  border: 1px solid var(--divider); background: var(--surface); box-shadow: 0 24px 48px -20px rgba(0,0,0,.5);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif; animation: nb-in 160ms cubic-bezier(.22,1,.36,1) both;
}
@media (max-width: 639px) { .nb-panel { position: fixed; right: .75rem; top: 4.25rem; } }
.nb-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .8rem 1rem; border-bottom: 1px solid var(--divider); }
.nb-title { font-family: 'Sora', system-ui, sans-serif; font-size: 15px; font-weight: 700; color: var(--text); }
.nb-readall { display: inline-flex; align-items: center; gap: .3rem; border: none; background: none; padding: 0; font-size: 12.5px; font-weight: 600; color: #4F80F8; cursor: pointer; }
.nb-empty { margin: 0; padding: 1.5rem 1rem; text-align: center; font-size: 13.5px; color: var(--dim); }
.nb-list { margin: 0; padding: .4rem; list-style: none; overflow-y: auto; }
.nb-card {
  display: flex; align-items: flex-start; gap: .7rem; width: 100%; padding: .7rem; border: none; border-radius: 12px;
  background: transparent; text-align: left; cursor: pointer; color: var(--text);
}
.nb-card:hover { background: var(--surface-2); }
.nb-unread { background: color-mix(in srgb, #4F80F8 8%, transparent); }
.nb-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.1rem; height: 2.1rem; border-radius: 10px;
  color: #fff; background: linear-gradient(135deg, #4F80F8, #3558DE);
}
[data-type="GAME"] .nb-icon { background: linear-gradient(135deg, #8B73F5, #6A4DE0); }
[data-type="ACHIEVEMENT"] .nb-icon { background: linear-gradient(135deg, #F2B705, #C98A00); }
[data-type="ALERT"] .nb-icon { background: linear-gradient(135deg, #E5484D, #B4232A); }
.nb-text { display: flex; flex-direction: column; gap: .15rem; min-width: 0; flex: 1; }
.nb-card-title { font-size: 13.5px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.nb-msg { font-size: 12.5px; line-height: 1.45; color: var(--muted); overflow-wrap: anywhere; }
.nb-time { font-size: 11.5px; color: var(--dim); }
.nb-dot { flex-shrink: 0; width: .5rem; height: .5rem; margin-top: .4rem; border-radius: 999px; background: #4F80F8; }

.nb-toast {
  position: fixed; z-index: 70; right: 1.25rem; bottom: 1.25rem; width: min(22rem, calc(100vw - 2rem));
  display: flex; align-items: flex-start; gap: .75rem; padding: .9rem; border-radius: 16px;
  border: 1px solid var(--divider); background: var(--surface); color: var(--text);
  box-shadow: 0 24px 48px -16px rgba(0,0,0,.45); font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  animation: nb-up 260ms cubic-bezier(.22,1,.36,1) both;
}
@media (max-width: 639px) { .nb-toast { left: 1rem; right: 1rem; width: auto; bottom: calc(5rem + env(safe-area-inset-bottom)); } }
.nb-view {
  align-self: flex-start; margin-top: .45rem; padding: .35rem .8rem; border: none; border-radius: 999px; cursor: pointer;
  font-size: 12.5px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #4F80F8, #3558DE);
}
.nb-close { display: flex; padding: .2rem; border: none; border-radius: 8px; background: none; color: var(--dim); cursor: pointer; }
.nb-close:hover { color: var(--text); background: var(--surface-2); }
@keyframes nb-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@keyframes nb-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .nb-panel, .nb-toast { animation: none; } }
`;
