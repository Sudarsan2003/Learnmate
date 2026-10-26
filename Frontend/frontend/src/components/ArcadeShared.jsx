import { useState, useEffect, useRef, useCallback } from "react";
import { Trophy, RotateCcw, Flame, Lock, Star, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import Confetti from "./Confetti";
import StarBalloonCelebration from "./StarBalloonCelebration";
import { getGameProgress, completeGameLevel } from "../api/client";

/* ------------------------------------------------------------------ */
/* Rules shared by every arcade game (same as Math Adventure)          */
/* ------------------------------------------------------------------ */

export const ROUNDS = 10;
export const PASS_RATIO = 0.7; // 70%+ clears the level
const PATH_WINDOW = 10;

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function starsFor(correct, total) {
  const acc = total > 0 ? correct / total : 0;
  if (acc >= 0.9) return 3;
  if (acc >= PASS_RATIO) return 2;
  if (acc >= 0.5) return 1;
  return 0;
}

/** The right answer plus (count - 1) nearby wrong ones, shuffled. */
export function makeChoices(answer, count = 3, spread = 10) {
  const set = new Set([answer]);
  let guard = 0;
  while (set.size < count && guard++ < 60) {
    const delta = randInt(1, Math.max(2, spread)) * (Math.random() < 0.5 ? -1 : 1);
    if (answer + delta >= 0) set.add(answer + delta);
  }
  let bump = 1;
  while (set.size < count) set.add(answer + bump++);
  return shuffle([...set]);
}

/** Scoring: +10 per correct answer, +20 bonus on every 3rd correct in a row. */
export function useTally() {
  const ref = useRef({ correct: 0, score: 0, streak: 0, best: 0 });
  const [view, setView] = useState({ ...ref.current });

  const record = useCallback((ok) => {
    const t = ref.current;
    let gained = 0;
    if (ok) {
      t.correct += 1;
      t.streak += 1;
      t.best = Math.max(t.best, t.streak);
      gained = 10 + (t.streak % 3 === 0 ? 20 : 0);
      t.score += gained;
    } else {
      t.streak = 0;
    }
    setView({ ...t });
    return gained;
  }, []);

  const snapshot = useCallback(() => ({ ...ref.current }), []);
  return { ...view, record, snapshot };
}

/** setTimeout that is cancelled automatically when the game unmounts. */
export function useLater() {
  const ids = useRef(new Set());
  useEffect(() => {
    const live = ids.current;
    return () => {
      live.forEach((id) => window.clearTimeout(id));
      live.clear();
    };
  }, []);
  return useCallback((fn, ms) => {
    const id = window.setTimeout(() => {
      ids.current.delete(id);
      fn();
    }, ms);
    ids.current.add(id);
    return id;
  }, []);
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function correctLabel(gained) {
  return gained > 10 ? `Correct! +${gained} \u2014 3 in a row bonus` : `Correct! +${gained}`;
}

/* ------------------------------------------------------------------ */
/* Progress: loads levels/stars and saves results, degrading gracefully */
/* ------------------------------------------------------------------ */

function useLevelProgress(gameType) {
  const [status, setStatus] = useState("loading");
  const [unlocked, setUnlocked] = useState(1);
  const [starsByLevel, setStarsByLevel] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [leveledUp, setLeveledUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getGameProgress();
        if (cancelled) return;
        const mine = list.find((g) => g.gameType === gameType);
        setUnlocked(mine?.highestLevelUnlocked ?? 1);
        setStarsByLevel(mine?.starsByLevel ?? {});
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.response?.data?.message ?? "Could not load your saved progress.");
      } finally {
        if (!cancelled) setStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType]);

  const reset = useCallback(() => {
    setSaveError(null);
    setLeveledUp(false);
  }, []);

  const save = useCallback(
    async ({ level, won, score, stars, correct, total }) => {
      setSaving(true);
      setSaveError(null);
      setLeveledUp(false);
      try {
        const res = await completeGameLevel({
          gameType,
          level,
          won,
          score,
          stars,
          correctCount: correct,
          totalCount: total,
        });
        setUnlocked(res.highestLevelUnlocked);
        setStarsByLevel(res.starsByLevel ?? {});
        setLeveledUp(!!res.leveledUp);
      } catch (err) {
        setSaveError(
          err.response?.data?.message ?? "Couldn't save this result \u2014 it will only count for this session."
        );
        // Keep the game playable even when the save fails.
        setStarsByLevel((prev) => ((prev[level] ?? 0) < stars ? { ...prev, [level]: stars } : prev));
        if (won) setUnlocked((u) => (level >= u ? level + 1 : u));
      } finally {
        setSaving(false);
      }
    },
    [gameType]
  );

  return { status, unlocked, starsByLevel, loadError, saving, saveError, leveledUp, save, reset };
}

/* ------------------------------------------------------------------ */
/* Small pieces the individual games reuse                              */
/* ------------------------------------------------------------------ */

export function PlayHeader({ level, streak, score, onExit }) {
  return (
    <div className="ax-stat-row">
      <button type="button" className="ax-back-btn" onClick={onExit} aria-label="Back to levels">
        <ArrowLeft size={14} />
      </button>
      <span className="ax-level-chip">Level {level}</span>
      <span className="ax-stat" title="Correct in a row">
        <Flame size={14} className="ax-streak" /> {streak}
      </span>
      <span className="ax-stat ax-score" title="Score">
        <Trophy size={14} /> {score}
      </span>
    </div>
  );
}

export function RoundDots({ round, total }) {
  return (
    <div className="ax-progress-row" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`ax-round-dot ${i < round - 1 ? "ax-round-dot-done" : ""} ${i === round - 1 ? "ax-round-dot-active" : ""}`}
        />
      ))}
    </div>
  );
}

export function TimerBar({ timeLeft, totalTime }) {
  return (
    <div className="ax-timer-track" aria-hidden="true">
      <div
        className="ax-timer-fill"
        style={{ width: `${Math.max(0, (timeLeft / totalTime) * 100)}%`, background: timeLeft <= 3 ? "#E2725B" : "var(--ax)" }}
      />
    </div>
  );
}

/** Reserved-height line under the question so the layout doesn't jump. */
export function VerdictSlot({ ok, children }) {
  return (
    <div className="ax-verdict-slot" role="status" aria-live="polite">
      {children ? <p className={`ax-verdict ${ok ? "ax-verdict-ok" : "ax-verdict-bad"}`}>{children}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LevelShell: level select -> Play -> summary, for any game            */
/* ------------------------------------------------------------------ */

/**
 * Props
 *  gameType  string sent to the games API ("RACE", "BALLOON", ...)
 *  title / blurb / icon / color / hint   presentation
 *  Play      component receiving { level, onFinish, onExit }
 *
 * Play calls onFinish({ correct, total, score, bestStreak, dots?, note?,
 *   detail?, stars?, won? }). stars/won are optional overrides for games
 * (like Memory Match) whose result isn't a plain correct/total ratio.
 */
export default function LevelShell({ gameType, title, blurb, icon: Icon, color, hint, Play }) {
  const { status, unlocked, starsByLevel, loadError, saving, saveError, leveledUp, save, reset } =
    useLevelProgress(gameType);

  const [phase, setPhase] = useState("select"); // select | playing | summary
  const [level, setLevel] = useState(1);
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const [perfect, setPerfect] = useState(false);

  function start(lvl) {
    reset();
    setResult(null);
    setCelebrate(false);
    setPerfect(false);
    setLevel(lvl);
    setRunKey((k) => k + 1);
    setPhase("playing");
  }

  function finish(res) {
    const stars = res.stars ?? starsFor(res.correct, res.total);
    const won = res.won ?? (res.total > 0 && res.correct / res.total >= PASS_RATIO);
    setResult({ ...res, stars, won });
    setCelebrate(stars === 3);
    setPerfect(stars === 3);
    setPhase("summary");
    save({ level, won, score: res.score, stars, correct: res.correct, total: res.total });
  }

  if (status === "loading") {
    return (
      <div className="ax-root ax-loading" aria-busy="true" style={{ "--ax": color }}>
        <style>{SHARED_CSS}</style>
        <Loader2 size={18} className="animate-spin" /> Loading your levels&hellip;
      </div>
    );
  }

  const pathStart = Math.max(1, unlocked - PATH_WINDOW + 4);
  const pips = Array.from({ length: PATH_WINDOW }, (_, i) => pathStart + i);
  const acc = result && result.total ? Math.round((100 * result.correct) / result.total) : 0;

  return (
    <div className="ax-root" style={{ "--ax": color }}>
      <style>{SHARED_CSS}</style>
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      {perfect && <StarBalloonCelebration onDone={() => setPerfect(false)} />}

      {phase === "select" && (
        <div className="ax-select">
          <div className="ax-select-head">
            <span className="ax-select-badge">
              <Icon size={20} />
            </span>
            <div>
              <h2 className="ax-select-title">{title}</h2>
              <p className="ax-select-sub">{blurb}</p>
            </div>
          </div>

          {loadError && <p className="ax-warn">{loadError} Starting fresh from level 1.</p>}

          <div className="ax-level-path" role="list">
            {pips.map((l) => {
              const open = l <= unlocked;
              const stars = starsByLevel[l] ?? null;
              return (
                <button
                  key={l}
                  type="button"
                  role="listitem"
                  disabled={!open}
                  onClick={() => start(l)}
                  aria-label={open ? `Level ${l}` : `Level ${l}, locked`}
                  className={`ax-pip ${l === unlocked ? "ax-pip-next" : ""} ${!open ? "ax-pip-locked" : ""}`}
                >
                  {open ? <span className="ax-pip-num">{l}</span> : <Lock size={13} />}
                  {open && stars !== null && (
                    <span className="ax-pip-stars">
                      {[1, 2, 3].map((n) => (
                        <Star key={n} size={8} fill={n <= stars ? "currentColor" : "none"} strokeWidth={2} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button type="button" onClick={() => start(unlocked)} className="ax-btn">
            <Sparkles size={15} /> Play level {unlocked}
          </button>
          {hint && <p className="ax-hint">{hint}</p>}
        </div>
      )}

      {phase === "playing" && (
        <Play key={runKey} level={level} onFinish={finish} onExit={() => setPhase("select")} />
      )}

      {phase === "summary" && result && (
        <div className="ax-summary">
          <div className="ax-big-stars" aria-label={`${result.stars} of 3 stars`}>
            {[1, 2, 3].map((n) => (
              <Star
                key={n}
                size={n === 2 ? 40 : 32}
                fill={n <= result.stars ? "currentColor" : "none"}
                strokeWidth={1.75}
                className={n <= result.stars ? "ax-big-star-on" : "ax-big-star-off"}
                style={{ animationDelay: `${n * 140}ms` }}
              />
            ))}
          </div>

          {leveledUp && (
            <p className="ax-levelup">
              <Sparkles size={14} /> Level {level + 1} unlocked!
            </p>
          )}

          <h3 className="ax-summary-score">{result.score} points</h3>
          <p className="ax-summary-sub">
            {result.detail ??
              `${result.correct}/${result.total} correct \u00B7 ${acc}% accuracy \u00B7 best streak ${result.bestStreak}`}
          </p>
          {result.note && <p className="ax-summary-note">{result.note}</p>}
          {!result.won && <p className="ax-summary-sub">Clear 70% to unlock the next level &mdash; give it another go!</p>}
          {saving && (
            <p className="ax-saving">
              <Loader2 size={12} className="animate-spin" /> Saving your progress&hellip;
            </p>
          )}
          {saveError && <p className="ax-warn">{saveError}</p>}

          {result.dots?.length > 0 && (
            <div className="ax-review" aria-hidden="true">
              {result.dots.map((ok, i) => (
                <span key={i} className={`ax-review-dot ${ok ? "ax-review-ok" : "ax-review-bad"}`} />
              ))}
            </div>
          )}

          <div className="ax-summary-actions">
            <button type="button" onClick={() => start(level)} className="ax-btn">
              <RotateCcw size={14} /> Play again
            </button>
            {result.won && level < unlocked && (
              <button type="button" onClick={() => start(level + 1)} className="ax-btn ax-btn-alt">
                <Sparkles size={14} /> Next level
              </button>
            )}
            <button type="button" onClick={() => setPhase("select")} className="ax-secondary-btn">
              All levels
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SHARED_CSS = `
.ax-root { --ax: #4F80F8; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.ax-root button:focus-visible { outline: 2px solid var(--ax); outline-offset: 2px; }
.ax-loading { display: flex; align-items: center; justify-content: center; gap: .5rem; padding: 3rem 0; color: var(--dim); font-size: 13.5px; }
.ax-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.ax-select { display: flex; flex-direction: column; gap: 1.2rem; max-width: 30rem; margin: 0 auto; padding: .5rem 0 1rem; }
.ax-select-head { display: flex; align-items: center; gap: .7rem; }
.ax-select-badge {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.6rem; height: 2.6rem;
  border-radius: 14px; color: #FFFFFF;
  background: linear-gradient(135deg, var(--ax), color-mix(in srgb, var(--ax) 62%, black));
  box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--ax) 60%, transparent);
}
.ax-select-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.15rem; font-weight: 700; color: var(--text); }
.ax-select-sub { margin: .1rem 0 0; font-size: 12.5px; color: var(--dim); }
.ax-warn { margin: 0; padding: .6rem .8rem; border-radius: 10px; font-size: 12.5px; color: var(--error-text); background: var(--error-bg); }
.ax-hint { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--dim); }

.ax-level-path { display: flex; flex-wrap: wrap; gap: .5rem; }
.ax-pip {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .15rem;
  width: 3rem; height: 3rem; border-radius: 12px; border: 1.5px solid var(--divider); background: var(--surface);
  color: var(--muted); cursor: pointer; transition: transform 160ms ease, border-color 160ms ease;
}
.ax-pip:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--ax); }
.ax-pip-num { font-size: 13px; font-weight: 700; }
.ax-pip-stars { display: flex; gap: 1px; color: #E4C87A; }
.ax-pip-next { border-color: var(--ax); color: var(--ax); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ax) 22%, transparent); }
.ax-pip-locked { color: var(--dim); cursor: default; opacity: .55; }

.ax-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  padding: .8rem 1.4rem; border-radius: 12px; border: none; font-size: 14.5px; font-weight: 600; color: #FFFFFF;
  background: linear-gradient(135deg, var(--ax), color-mix(in srgb, var(--ax) 62%, black));
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--ax) 60%, transparent);
  cursor: pointer; transition: transform 160ms ease;
}
.ax-btn:hover { transform: translateY(-2px); }
.ax-btn:active { transform: translateY(0); }
.ax-btn-alt { background: linear-gradient(135deg, #E4A93B, #C2432B); box-shadow: 0 8px 20px -8px rgba(194,67,43,.45); }
.ax-secondary-btn {
  padding: .8rem 1.2rem; border-radius: 12px; font-size: 14px; font-weight: 600;
  color: var(--muted); border: 1.5px solid var(--divider); background: transparent; cursor: pointer; transition: color 160ms ease;
}
.ax-secondary-btn:hover { color: var(--text); }

/* play chrome */
.ax-play { display: flex; flex-direction: column; gap: .85rem; max-width: 28rem; margin: 0 auto; padding: .5rem 0 1rem; }
.ax-stat-row { display: flex; align-items: center; gap: .6rem; font-size: 13px; color: var(--muted); }
.ax-back-btn { display: inline-flex; padding: .35rem; border-radius: 8px; color: var(--dim); border: none; background: transparent; cursor: pointer; }
.ax-back-btn:hover { color: var(--text); background: var(--divider); }
.ax-level-chip { font-weight: 700; color: var(--text); }
.ax-stat { display: inline-flex; align-items: center; gap: .3rem; font-weight: 600; }
.ax-score { margin-left: auto; color: #C89B2E; }
.ax-streak { color: #E2725B; }
.ax-progress-row { display: flex; gap: .3rem; }
.ax-round-dot { flex: 1; height: 4px; border-radius: 999px; background: var(--divider); }
.ax-round-dot-done { background: #16A394; }
.ax-round-dot-active { background: var(--ax); }
.ax-timer-track { height: 6px; border-radius: 999px; background: var(--divider); overflow: hidden; }
.ax-timer-fill { height: 100%; border-radius: 999px; transition: width 1s linear, background 300ms ease; }
.ax-verdict-slot { min-height: 1.5rem; }
.ax-verdict { display: flex; align-items: center; justify-content: center; margin: 0; font-size: 13.5px; font-weight: 600; text-align: center; }
.ax-verdict-ok { color: #0F8A7C; }
.ax-verdict-bad { color: #C2432B; }

/* summary */
.ax-summary { display: flex; flex-direction: column; align-items: center; gap: .6rem; max-width: 26rem; margin: 0 auto; padding: 1.5rem 0; text-align: center; animation: ax-fade-up 320ms cubic-bezier(.22,1,.36,1) both; }
.ax-big-stars { display: flex; align-items: flex-end; gap: .4rem; margin-bottom: .2rem; }
.ax-big-star-on { color: #E4B640; animation: ax-pop 420ms cubic-bezier(.22,1,.36,1) both; }
.ax-big-star-off { color: var(--divider); }
.ax-levelup { display: inline-flex; align-items: center; gap: .4rem; margin: 0; padding: .4rem .9rem; border-radius: 999px; font-size: 12.5px; font-weight: 700; color: #9A6B12; background: color-mix(in srgb, #E4A93B 18%, transparent); }
.ax-summary-score { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.9rem; font-weight: 700; color: var(--text); }
.ax-summary-sub { margin: 0; font-size: 13.5px; color: var(--muted); }
.ax-summary-note { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--text); }
.ax-saving { display: flex; align-items: center; gap: .35rem; margin: 0; font-size: 12px; color: var(--dim); }
.ax-review { display: flex; flex-wrap: wrap; justify-content: center; gap: .35rem; margin: .5rem 0; max-width: 22rem; }
.ax-review-dot { width: .6rem; height: .6rem; border-radius: 999px; }
.ax-review-ok { background: #16A394; }
.ax-review-bad { background: #E2725B; }
.ax-summary-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; margin-top: .6rem; }

@keyframes ax-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ax-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
@keyframes ax-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }

@media (prefers-reduced-motion: reduce) {
  .ax-root *, .ax-root *::before, .ax-root *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;