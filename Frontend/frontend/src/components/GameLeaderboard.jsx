import { useState, useEffect, useCallback } from "react";
import { Trophy, Loader2, Star, Flame, Crown, Sparkles } from "lucide-react";
import { getGameLeaderboard, listUsers, getMe } from "../api/client";

const MEDAL = { 1: "#E4C87A", 2: "#B8C0CC", 3: "#CD8B5A" };
const PREVIEW_ROWS = 10;
const GAME_LABEL = {
  MATH: "Math Adventure",
  WORDS: "Word Wizard",
  RACE: "Maths Race",
  BALLOON: "Balloon Maths",
  MEMORY: "Memory Match",
  BIGGER: "Which Is Bigger?",
  SHOP: "Virtual Shop",
  PUZZLE: "Maths Puzzle",
  SHAPE: "Shape Builder",
  DETECTIVE: "Maths Detective",
};

// Podium entrance order: 3rd rises first, then 2nd, then 1st for the reveal.
const RISE_DELAY = { 3: 0, 2: 0.2, 1: 0.45 };

// Shared by the header and every row so the columns always line up.
const GRID =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_3.5rem_3.5rem] items-center gap-2 sm:grid-cols-[3rem_minmax(0,1fr)_4rem_6rem_5rem]";

const stdOf = (entry) => (entry?.standard ? String(entry.standard) : "");

/**
 * The game-leaderboard endpoint doesn't return each student's standard, so we
 * look it up from the APIs that do:
 *   - listUsers()  (/api/admin/users): every user's profile. Only works for
 *     roles the server allows (admin/teacher); students get a 403.
 *   - getMe()      (/api/auth/me): always works, so a student at least sees
 *     their own standard.
 * Results are cached for a minute (including a failed listUsers) so switching
 * game tabs doesn't refetch or repeat a 403.
 */
const DIRECTORY_TTL_MS = 60_000;
let directoryCache = null; // { at, byUsername, me }

async function loadStandardDirectory() {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) return directoryCache;

  const [usersResult, meResult] = await Promise.allSettled([listUsers(), getMe()]);

  const byUsername = {};
  if (usersResult.status === "fulfilled" && Array.isArray(usersResult.value)) {
    for (const u of usersResult.value) {
      if (u?.username && u.standard) byUsername[u.username] = String(u.standard);
    }
  }
  const me = meResult.status === "fulfilled" ? meResult.value : null;

  directoryCache = { at: Date.now(), byUsername, me };
  return directoryCache;
}

// Fills in `standard` on every entry (and on `me`) that the API left blank.
function withStandards(board, directory) {
  const lookup = (entry) => {
    if (!entry) return entry;
    if (entry.standard) return entry;
    const std =
      directory.byUsername[entry.username] ??
      (directory.me?.username === entry.username ? directory.me?.standard : undefined);
    return std ? { ...entry, standard: String(std) } : entry;
  };
  return {
    ...board,
    entries: (board.entries ?? []).map(lookup),
    me: lookup(board.me),
  };
}

/** Counts a number up from 0 once, respecting reduced-motion. */
function useCountUp(target, delaySeconds = 0, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVal(target);
      return undefined;
    }
    let raf;
    let start;
    const timer = setTimeout(() => {
      const step = (ts) => {
        if (start === undefined) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delaySeconds * 1000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, delaySeconds, duration]);
  return val;
}

/**
 * Institute-wide leaderboard for a single game (any key of GAME_LABEL), ranked by
 * total stars (ties broken by total points). Scoped server-side to students
 * who share the caller's institution. Top 3 get an animated trophy podium; the
 * rest are a plain ranked list, same shape as the quiz Leaderboard. Every
 * entry shows the student's standard (from the API if present, otherwise looked
 * up via listUsers()/getMe(), see loadStandardDirectory).
 */
export default function GameLeaderboard({ gameType, showAllByDefault = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(showAllByDefault);

  const load = useCallback(async () => {
    try {
      const next = await getGameLeaderboard(gameType);
      // Once the backend sends `standard` on each entry we're done. Only fall
      // back to the user-directory lookup when some entries are missing it.
      const missing = (next.entries ?? []).some((e) => !e.standard) || (next.me && !next.me.standard);
      setData(missing ? withStandards(next, await loadStandardDirectory()) : next);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load the leaderboard.");
    }
  }, [gameType]);

  useEffect(() => {
    setData(null);
    setError(null);
    setShowAll(showAllByDefault);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const entries = data?.entries ?? [];
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, showAll ? entries.length : PREVIEW_ROWS);
  const me = data?.me;
  const meInTop = !!me && top3.some((e) => e.username === me.username);
  const meInRest = !!me && rest.some((e) => e.username === me.username);

  return (
    <section aria-label={`${GAME_LABEL[gameType] ?? gameType} leaderboard`} className="w-full text-left">
      <style>{CSS}</style>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--text)]">
          <Trophy size={14} className="text-[var(--accent-ink)]" aria-hidden="true" />
          {GAME_LABEL[gameType] ?? gameType} &middot; Institute leaderboard
        </h3>
        {data && (
          <span className="text-[12px] text-[var(--dim)]">
            {data.totalParticipants} {data.totalParticipants === 1 ? "student" : "students"}
          </span>
        )}
      </div>

      {error && !data ? (
        <p
          className="rounded-md border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2 text-[13px] text-[var(--error-text)]"
          role="alert"
        >
          {error}
        </p>
      ) : !data ? (
        <div className="flex items-center gap-2 py-3 text-[13px] text-[var(--dim)]" aria-busy="true">
          <Loader2 size={13} className="animate-spin" /> Loading&hellip;
        </div>
      ) : entries.length === 0 ? (
        <p className="py-2 text-[13px] text-[var(--dim)]">No one in your institute has played yet &mdash; be the first!</p>
      ) : (
        <>
          {top3.length > 0 && (
            <div className="mb-3 grid grid-cols-3 items-end gap-2 pt-5">
              {top3.map((e) => (
                <PodiumCard key={e.username} entry={e} mine={e.username === me?.username} />
              ))}
            </div>
          )}

          {me && !meInTop && (
            <div className="mb-3 rounded-lg border border-[#3558DE]/40 bg-[#3558DE]/10 px-3.5 py-2.5 text-[13px]">
              <span className="font-semibold text-[var(--text)]">
                You're ranked #{me.rank} of {data.totalParticipants}
              </span>
              <span className="text-[var(--muted)]">
                {" "}
                &middot; {me.totalStars} stars &middot; level {me.highestLevelUnlocked}
                {stdOf(me) && <> &middot; Std {stdOf(me)}</>}
              </span>
            </div>
          )}

          {rest.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[var(--divider)]">
              <div
                className={`${GRID} bg-[var(--surface)]/70 px-3 py-2 text-[11.5px] font-medium uppercase tracking-wide text-[var(--dim)]`}
              >
                <span>Rank</span>
                <span>Name</span>
                <span className="text-center">Std</span>
                <span className="text-right">Stars</span>
                <span className="text-right">Level</span>
              </div>

              <ol className={`m-0 list-none p-0 ${showAll ? "max-h-[26rem] overflow-y-auto" : ""}`}>
                {rest.map((e, i) => (
                  <Row key={e.username} entry={e} mine={e.username === me?.username} index={i} />
                ))}
                {me && !meInTop && !meInRest && (
                  <>
                    <li aria-hidden="true" className="border-t border-[var(--divider)] py-0.5 text-center text-[var(--dim)]">
                      &#8942;
                    </li>
                    <Row entry={me} mine index={0} />
                  </>
                )}
              </ol>
            </div>
          )}

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

// Rank 1 sits taller and in the middle, 2 and 3 flank it. Classic podium.
function PodiumCard({ entry: e, mine }) {
  const medal = MEDAL[e.rank] ?? "#B8C0CC";
  const order = e.rank === 1 ? "order-2" : e.rank === 2 ? "order-1" : "order-3";
  // Static lift lives on the wrapper so it doesn't fight the rise animation.
  const lift = e.rank === 1 ? "-translate-y-2" : "";
  const delay = RISE_DELAY[e.rank] ?? 0;
  const stars = useCountUp(e.totalStars, delay + 0.25);
  const std = stdOf(e);

  return (
    <div className={`${order} ${lift} relative`}>
      <div
        className={`glb-pod glb-pod-${e.rank} ${mine ? "glb-mine" : ""} relative flex flex-col items-center gap-1 rounded-xl border px-2 pb-3 pt-3.5 text-center`}
        style={{ "--medal": medal, "--delay": `${delay}s` }}
      >
        <span className="glb-shine" aria-hidden="true" />

        {e.rank === 1 && (
          <>
            <span className="glb-crown-wrap" aria-hidden="true">
              <Crown className="glb-crown" size={22} fill={medal} style={{ color: medal }} />
            </span>
            <Sparkles className="glb-spark glb-spark-a" size={12} aria-hidden="true" />
            <Sparkles className="glb-spark glb-spark-b" size={10} aria-hidden="true" />
            <Sparkles className="glb-spark glb-spark-c" size={11} aria-hidden="true" />
          </>
        )}

        <Trophy
          className="glb-trophy"
          size={e.rank === 1 ? 24 : 19}
          style={{ color: medal }}
          fill={medal}
          aria-hidden="true"
        />
        <span className="relative max-w-full truncate text-[12.5px] font-semibold text-[var(--text)]" title={e.username}>
          {e.username}
        </span>
        <span className="relative inline-flex items-center gap-1 text-[11.5px] font-bold text-[#C89B2E]">
          <Star className="glb-star" size={11} fill="currentColor" /> {stars}
        </span>
        <span className="relative text-[10.5px] text-[var(--dim)]">
          Lvl {e.highestLevelUnlocked}
          {std && <> &middot; Std {std}</>}
        </span>
      </div>
    </div>
  );
}

function Row({ entry: e, mine, index }) {
  const medal = MEDAL[e.rank];
  const std = stdOf(e);
  return (
    <li
      className={`glb-row ${GRID} border-t border-[var(--divider)] px-3 py-2.5 text-[13px] ${mine ? "bg-[#3558DE]/10" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
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
          <span className="ml-1.5 rounded-full bg-[#3558DE]/20 px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent-ink)]">
            You
          </span>
        )}
        {e.currentStreak > 0 && (
          <Flame size={11} className="ml-1 inline text-[#E2725B]" style={{ verticalAlign: "-1px" }} aria-hidden="true" />
        )}
      </span>

      <span className="text-center tabular-nums text-[var(--muted)]">{std || "\u2014"}</span>
      <span className="text-right font-semibold tabular-nums text-[var(--text)]">{e.totalStars}</span>
      <span className="text-right tabular-nums text-[var(--muted)]">{e.highestLevelUnlocked}</span>
    </li>
  );
}

const CSS = `
/* ---- podium ---- */
.glb-pod {
  border-color: color-mix(in srgb, var(--medal) 45%, var(--divider));
  background: linear-gradient(165deg, color-mix(in srgb, var(--medal) 16%, var(--surface)), var(--surface) 70%);
  animation: glbRise 750ms cubic-bezier(0.22, 1, 0.36, 1) var(--delay) both;
}
.glb-pod-1 {
  box-shadow: 0 12px 30px -12px color-mix(in srgb, var(--medal) 75%, transparent);
  animation:
    glbRise 750ms cubic-bezier(0.22, 1, 0.36, 1) var(--delay) both,
    glbGlow 2.8s ease-in-out calc(var(--delay) + 0.9s) infinite;
}
.glb-mine { outline: 2px solid rgba(53, 88, 222, 0.55); outline-offset: 2px; }

/* diagonal light sweep, clipped to the card */
.glb-shine { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
.glb-shine::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 55%;
  background: linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.5) 50%, transparent 80%);
  transform: translateX(-130%) skewX(-12deg);
  animation: glbShine 4.5s ease-in-out calc(var(--delay) + 1.2s) infinite;
  opacity: 0.55;
}
.glb-pod-1 .glb-shine::after { opacity: 0.9; animation-duration: 3.6s; }

.glb-trophy { position: relative; animation: glbFloat 3s ease-in-out calc(var(--delay) + 0.8s) infinite; }
.glb-pod-1 .glb-trophy { animation-name: glbWiggle; animation-duration: 3.4s; }
.glb-star { animation: glbPop 2.6s ease-in-out calc(var(--delay) + 1.4s) infinite; }

/* crown + sparkles for 1st place */
.glb-crown-wrap { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); }
.glb-crown {
  filter: drop-shadow(0 3px 5px rgba(228,169,59,0.55));
  animation: glbCrownIn 700ms cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--delay) + 0.5s) both,
             glbBob 2.6s ease-in-out calc(var(--delay) + 1.3s) infinite;
}
.glb-spark { position: absolute; color: #E4C87A; opacity: 0; animation: glbTwinkle 2.4s ease-in-out infinite; }
.glb-spark-a { top: 10px; left: 10px; animation-delay: 1.2s; }
.glb-spark-b { top: 34px; right: 9px; animation-delay: 1.9s; }
.glb-spark-c { bottom: 16px; left: 14px; animation-delay: 2.5s; }

/* ---- list rows ---- */
.glb-row { animation: glbRowIn 320ms ease both; }

@keyframes glbRise {
  0%   { opacity: 0; transform: translateY(70px) scale(0.92); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes glbGlow {
  0%, 100% { box-shadow: 0 12px 30px -12px color-mix(in srgb, var(--medal) 60%, transparent); }
  50%      { box-shadow: 0 14px 38px -8px color-mix(in srgb, var(--medal) 95%, transparent), 0 0 18px 2px color-mix(in srgb, var(--medal) 35%, transparent); }
}
@keyframes glbShine {
  0%, 55% { transform: translateX(-130%) skewX(-12deg); }
  100%    { transform: translateX(300%) skewX(-12deg); }
}
@keyframes glbFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
@keyframes glbWiggle {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25%      { transform: translateY(-3px) rotate(-7deg); }
  75%      { transform: translateY(-3px) rotate(7deg); }
}
@keyframes glbPop {
  0%, 70%, 100% { transform: scale(1) rotate(0deg); }
  80%           { transform: scale(1.35) rotate(-12deg); }
  90%           { transform: scale(1.1) rotate(6deg); }
}
@keyframes glbCrownIn {
  0%   { opacity: 0; transform: translateY(-16px) scale(0.4) rotate(-20deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
}
@keyframes glbBob {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%      { transform: translateY(-3px) rotate(3deg); }
}
@keyframes glbTwinkle {
  0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
  50%      { opacity: 1; transform: scale(1.15) rotate(25deg); }
}
@keyframes glbRowIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .glb-pod, .glb-pod-1, .glb-shine::after, .glb-trophy, .glb-star, .glb-crown, .glb-spark, .glb-row {
    animation: none !important;
  }
  .glb-spark { opacity: 0.8; }
}
`;