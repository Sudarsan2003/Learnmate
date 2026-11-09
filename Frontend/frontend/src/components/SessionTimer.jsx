import { useState } from "react";
import { Clock, X } from "lucide-react";
import { WARN_BEFORE_MS, formatTimeLeft, tokenExpiresAt, useSessionTimeLeft } from "../api/sessionClock";

/**
 * How long until this login ends. The server puts the end time in the login
 * token (24 hours for students, 12 for teachers and admins); after it, every
 * request is refused and the user has to sign in again.
 *
 *  - <SessionTimer />  a small clock in the page headers.
 *  - <SessionWarning /> a notice in the last few minutes.
 *  - useSessionExpiry() (api/sessionClock.js) signs the user out when the time is up.
 */

function endsAtLabel(ms) {
  const at = new Date(Date.now() + ms);
  const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return at.toDateString() === new Date().toDateString() ? time : `${time} tomorrow`;
}

/** Small clock for the page headers, next to the notification bell. */
export default function SessionTimer() {
  const left = useSessionTimeLeft();
  if (left == null) return null;
  const ending = left < 10 * 60 * 1000;
  return (
    <div
      role="timer"
      aria-label={`Session ends in ${formatTimeLeft(left)}`}
      title={`You're signed in until ${endsAtLabel(left)}. After that you'll need to sign in again.`}
      className={`flex h-10 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[12px] font-medium tabular-nums sm:h-8 sm:px-2.5 ${
        ending
          ? "border-[#F5A524]/50 bg-[#F5A524]/10 text-[#F5A524]"
          : "border-[var(--divider)] text-[var(--muted)]"
      }`}
    >
      {/* The icon is dropped on phones so the header still fits in one row. */}
      <Clock size={13} aria-hidden="true" className="hidden sm:block" />
      <span>{formatTimeLeft(left)}</span>
    </div>
  );
}

/** Notice in the last few minutes of a login, until dismissed. */
export function SessionWarning() {
  const left = useSessionTimeLeft();
  const [dismissedFor, setDismissedFor] = useState(null);
  const exp = tokenExpiresAt();
  if (left == null || left > WARN_BEFORE_MS || left <= 0 || dismissedFor === exp) return null;
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-3 z-[60] flex w-[min(92vw,440px)] -translate-x-1/2 items-start gap-3 rounded-xl border border-[#F5A524]/40 bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--text)] shadow-lg"
    >
      <Clock size={16} className="mt-0.5 flex-shrink-0 text-[#F5A524]" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">
          Your session ends in <span className="tabular-nums">{formatTimeLeft(left)}</span>
        </p>
        <p className="mt-0.5 text-[var(--muted)]">
          Finish and submit what you're doing. After that you'll need to sign in again.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissedFor(exp)}
        aria-label="Dismiss"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)]"
      >
        <X size={14} />
      </button>
    </div>
  );
}
