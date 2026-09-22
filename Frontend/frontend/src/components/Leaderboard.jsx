import { useState, useEffect, useCallback, useRef } from "react";
import { Trophy, Loader2, Clock } from "lucide-react";
import { getQuizLeaderboard } from "../api/client";

const MEDAL = { 1: "#E4C87A", 2: "#B8C0CC", 3: "#CD8B5A" };
const POLL_MS = 10000;
const PREVIEW_ROWS = 10;

const pct = (score, total) => (total > 0 ? Math.round((100 * score) / total) : 0);

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * HackerRank-style live leaderboard for one quiz: every student who has
 * submitted, ranked by marks and then by time taken. Refreshes every 10
 * seconds while the tab is visible. The server only lets a student see it
 * after they have submitted the quiz themselves.
 */
export default function Leaderboard({ quizId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const stoppedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await getQuizLeaderboard(quizId);
      if (stoppedRef.current) return;
      setData(next);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      if (stoppedRef.current) return;
      setError(err.response?.data?.message ?? "Could not load the leaderboard.");
    }
  }, [quizId]);

  useEffect(() => {
    stoppedRef.current = false;
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stoppedRef.current = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const entries = data?.entries ?? [];
  const me = data?.me;
  const visible = showAll ? entries : entries.slice(0, PREVIEW_ROWS);
  const meVisible = me && visible.some((e) => e.username === me.username);

  // A short, motivating line about where you stand.
  let nudge = null;
  if (me) {
    if (me.rank === 1) {
      nudge = "You're leading the board! 🏆";
    } else {
      const ahead = entries.filter((e) => e.rank < me.rank);
      const next = ahead[ahead.length - 1];
      if (next) {
        const diff = next.score - me.score;
        nudge =
          diff > 0
            ? `${diff} ${diff === 1 ? "mark" : "marks"} behind #${next.rank} ${next.username}`
            : `Level on marks with #${next.rank} ${next.username}, but ${fmtTime(me.timeTakenSeconds - next.timeTakenSeconds)} slower`;
      }
    }
  }

  return (
    <section aria-label="Leaderboard" className="w-full text-left">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--text)]">
          <Trophy size={14} className="text-[var(--accent-ink)]" aria-hidden="true" />
          Leaderboard
          {data && (
            <span className="text-[12px] font-normal text-[var(--dim)]">
              · {data.totalParticipants} {data.totalParticipants === 1 ? "student" : "students"}
            </span>
          )}
        </h3>
        <span
          className="flex items-center gap-1.5 text-[11.5px] text-[var(--dim)]"
          title={updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ""}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2DD4BF] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2DD4BF]" />
          </span>
          Live
        </span>
      </div>

      {error && !data ? (
        <p className="rounded-md border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2 text-[13px] text-[var(--error-text)]" role="alert">
          {error}
        </p>
      ) : !data ? (
        <div className="flex items-center gap-2 py-3 text-[13px] text-[var(--dim)]" aria-busy="true">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="py-2 text-[13px] text-[var(--dim)]">No submissions yet.</p>
      ) : (
        <>
          {me && (
            <div className="mb-3 rounded-lg border border-[#3558DE]/40 bg-[#3558DE]/10 px-3.5 py-2.5 text-[13px]">
              <span className="font-semibold text-[var(--text)]">
                You're ranked #{me.rank} of {data.totalParticipants}
              </span>
              {nudge && <span className="text-[var(--muted)]"> · {nudge}</span>}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--divider)]">
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-2 bg-[var(--surface)]/70 px-3 py-2 text-[11.5px] font-medium uppercase tracking-wide text-[var(--dim)] sm:grid-cols-[3rem_minmax(0,1fr)_7rem_5rem]">
              <span>Rank</span>
              <span>Name</span>
              <span className="text-right">Marks</span>
              <span className="flex items-center justify-end gap-1">
                <Clock size={11} aria-hidden="true" /> Time
              </span>
            </div>

            <ol className={`m-0 list-none p-0 ${showAll ? "max-h-[26rem] overflow-y-auto" : ""}`}>
              {visible.map((e) => (
                <Row key={`${e.rank}-${e.username}`} entry={e} mine={e.username === me?.username} />
              ))}
              {me && !meVisible && (
                <>
                  <li aria-hidden="true" className="border-t border-[var(--divider)] py-0.5 text-center text-[var(--dim)]">⋮</li>
                  <Row entry={me} mine />
                </>
              )}
            </ol>
          </div>

          {entries.length > PREVIEW_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 w-full rounded-md border border-[var(--divider)] py-1.5 text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {showAll ? "Show top 10" : `Show all ${entries.length} students`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Row({ entry: e, mine }) {
  const p = pct(e.score, e.totalQuestions);
  const medal = MEDAL[e.rank];
  return (
    <li
      className={`grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-2 border-t border-[var(--divider)] px-3 py-2.5 text-[13px] sm:grid-cols-[3rem_minmax(0,1fr)_7rem_5rem] ${
        mine ? "bg-[#3558DE]/10" : ""
      }`}
      style={medal && !mine ? { background: `color-mix(in srgb, ${medal} 9%, transparent)` } : undefined}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold tabular-nums"
        style={medal ? { background: medal, color: "#0B0E14" } : { color: "var(--muted)" }}
        aria-label={`Rank ${e.rank}`}
      >
        {e.rank}
      </span>

      <span className="min-w-0 truncate font-medium text-[var(--text)]">
        {e.username}
        {mine && (
          <span className="ml-1.5 rounded-full bg-[#3558DE]/20 px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent-ink)]">You</span>
        )}
      </span>

      <span className="text-right tabular-nums">
        <span className="font-semibold text-[var(--text)]">
          {e.score} / {e.totalQuestions}
        </span>
        <span className="block h-1 overflow-hidden rounded-full bg-[var(--divider)]" aria-hidden="true">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${p}%`,
              background: p >= 75 ? "#2DD4BF" : p >= 40 ? "#3558DE" : "#E2725B",
            }}
          />
        </span>
      </span>

      <span className="text-right tabular-nums text-[var(--muted)]">{fmtTime(e.timeTakenSeconds)}</span>
    </li>
  );
}