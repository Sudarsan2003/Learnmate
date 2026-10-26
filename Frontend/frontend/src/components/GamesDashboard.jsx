import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Flame, Star, Calculator, SpellCheck2, Sparkles, Play, RefreshCw, Trophy,
  Car, PartyPopper, Brain, Scale, ShoppingCart, Puzzle, Hexagon, Search,
} from "lucide-react";
import { getGameProgress } from "../api/client";

const GAME_META = {
  MATH: { label: "Math Adventure", icon: Calculator, color: "#4F80F8", glow: "#8FB4FF" },
  WORDS: { label: "Word Wizard", icon: SpellCheck2, color: "#8B73F5", glow: "#C3B2FF" },
  RACE: { label: "Maths Race", icon: Car, color: "#E2725B", glow: "#F4A08F" },
  BALLOON: { label: "Balloon Maths", icon: PartyPopper, color: "#E0559A", glow: "#F3A0C9" },
  MEMORY: { label: "Memory Match", icon: Brain, color: "#16A394", glow: "#6FD9CB" },
  BIGGER: { label: "Which Is Bigger?", icon: Scale, color: "#D98A1F", glow: "#F0C079" },
  SHOP: { label: "Virtual Shop", icon: ShoppingCart, color: "#4C9A2A", glow: "#9AD37A" },
  PUZZLE: { label: "Maths Puzzle", icon: Puzzle, color: "#6A4DE0", glow: "#B39DFF" },
  SHAPE: { label: "Shape Builder", icon: Hexagon, color: "#1E9BD1", glow: "#7FCBEA" },
  DETECTIVE: { label: "Maths Detective", icon: Search, color: "#8C6A3F", glow: "#CDAA7E" },
};
const GAME_ORDER = ["MATH", "WORDS", "RACE", "BALLOON", "MEMORY", "BIGGER", "SHOP", "PUZZLE", "SHAPE", "DETECTIVE"];

// How many level-path pips to show before/around the current level.
const PATH_WINDOW = 12;

/**
 * Kid-facing progress page — separate from the quiz Dashboard. Shows one big
 * animated card per game with: current level, a scrollable path of level
 * pips (colored by stars earned), total stars, and a streak flame.
 *
 * Props: onPlayGame(gameType) — jump straight into that game (any key of GAME_META)
 *        onViewLeaderboard(gameType) — jump to the Leaderboard tab, pre-selecting
 *          that game's sub-tab (any key of GAME_META)
 */
export default function GamesDashboard({ onPlayGame, onViewLeaderboard }) {
  const [progress, setProgress] = useState(null); // { MATH: {...}, WORDS: {...} }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getGameProgress();
      const byType = {};
      for (const g of list) byType[g.gameType] = g;
      setProgress(byType);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load your game progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overallStreak = progress
    ? Math.max(...GAME_ORDER.map((t) => progress[t]?.currentStreak ?? 0))
    : 0;
  const overallStars = progress
    ? GAME_ORDER.reduce((sum, t) => sum + (progress[t]?.totalStars ?? 0), 0)
    : 0;

  return (
    <div className="gd-page">
      <style>{CSS}</style>

      <div className="gd-header">
        <div className="gd-title-row">
          <span className="gd-title-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h1 className="gd-title">Your Progress</h1>
            <p className="gd-sub">Every level you clear makes you stronger &mdash; keep going!</p>
          </div>
        </div>

        {progress && !error && (
          <div className="gd-overall">
            <div className="gd-overall-chip gd-overall-streak">
              <Flame size={16} className={overallStreak > 0 ? "gd-flame-lit" : ""} />
              <span>
                <strong>{overallStreak}</strong> day{overallStreak === 1 ? "" : "s"} streak
              </span>
            </div>
            <div className="gd-overall-chip gd-overall-stars">
              <Star size={16} fill="currentColor" />
              <span>
                <strong>{overallStars}</strong> stars total
              </span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="gd-loading" aria-busy="true">
          <Loader2 size={18} className="animate-spin" /> Loading your progress&hellip;
        </div>
      ) : error ? (
        <div className="gd-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={load} className="gd-retry">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      ) : (
        <div className="gd-grid">
          {GAME_ORDER.map((type) => (
            <GameCard
              key={type}
              type={type}
              data={progress[type]}
              onPlay={() => onPlayGame?.(type)}
              onViewLeaderboard={() => onViewLeaderboard?.(type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({ type, data, onPlay, onViewLeaderboard }) {
  const meta = GAME_META[type];
  const Icon = meta.icon;
  const level = data?.highestLevelUnlocked ?? 1;
  const starsByLevel = data?.starsByLevel ?? {};
  const totalStars = data?.totalStars ?? 0;
  const gamesPlayed = data?.gamesPlayed ?? 0;
  const streak = data?.currentStreak ?? 0;

  // Show a window of levels around where the student currently is, always
  // starting at 1 so early progress is visible too.
  const pathStart = Math.max(1, level - PATH_WINDOW + 4);
  const pathEnd = pathStart + PATH_WINDOW - 1;
  const pips = [];
  for (let l = pathStart; l <= pathEnd; l++) pips.push(l);

  return (
    <div className="gd-card" style={{ "--game": meta.color, "--glow": meta.glow }}>
      <div className="gd-card-top">
        <span className="gd-card-icon">
          <Icon size={20} />
        </span>
        <div className="gd-card-heading">
          <h2 className="gd-card-title">{meta.label}</h2>
          <p className="gd-card-sub">
            {gamesPlayed} round{gamesPlayed === 1 ? "" : "s"} played
            {streak > 0 && (
              <>
                {" "}
                &middot; <Flame size={11} className="gd-flame-lit" style={{ display: "inline", verticalAlign: "-2px" }} /> {streak}
              </>
            )}
          </p>
        </div>
        <div className="gd-level-badge" title={`Level ${level}`}>
          <span className="gd-level-num">{level}</span>
          <span className="gd-level-tag">LVL</span>
        </div>
      </div>

      <div className="gd-path" role="list" aria-label="Level progress">
        {pips.map((l) => {
          const stars = starsByLevel[l] ?? null;
          const isCurrent = l === level;
          const isCleared = l < level;
          return (
            <div
              key={l}
              role="listitem"
              className={`gd-pip ${isCleared ? "gd-pip-cleared" : ""} ${isCurrent ? "gd-pip-current" : ""}`}
              title={isCleared ? `Level ${l} \u2014 ${stars ?? 0} star${stars === 1 ? "" : "s"}` : `Level ${l} \u2014 locked`}
            >
              <span className="gd-pip-num">{l}</span>
              {isCleared && (
                <span className="gd-pip-stars">
                  {[1, 2, 3].map((n) => (
                    <Star key={n} size={9} fill={n <= (stars ?? 0) ? "currentColor" : "none"} strokeWidth={2} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="gd-card-foot">
        <span className="gd-total-stars">
          <Star size={14} fill="currentColor" /> {totalStars} stars
        </span>
        <div className="gd-foot-actions">
          <button type="button" onClick={onViewLeaderboard} className="gd-board-btn">
            <Trophy size={13} /> Leaderboard
          </button>
          <button type="button" onClick={onPlay} className="gd-play-btn">
            <Play size={13} fill="currentColor" /> {gamesPlayed > 0 ? "Keep playing" : "Start playing"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.gd-page {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height: 100%; padding: 1.5rem 1rem 2.5rem;
}
@media (min-width: 640px) { .gd-page { padding: 2rem 1.5rem 3rem; } }

.gd-header { max-width: 44rem; margin: 0 auto 1.6rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
.gd-title-row { display: flex; align-items: center; gap: .8rem; }
.gd-title-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 2.5rem; height: 2.5rem; border-radius: 999px; color: #FFFFFF;
  background: linear-gradient(135deg, #F2B84B, #E2725B);
  box-shadow: 0 8px 18px -8px rgba(226,114,91,.55);
}
.gd-title {
  margin: 0; font-family: 'Sora', system-ui, sans-serif; font-weight: 700;
  letter-spacing: -0.01em; font-size: 1.5rem; color: var(--text);
}
.gd-sub { margin: .15rem 0 0; font-size: 13px; color: var(--dim); }

.gd-overall { display: flex; flex-wrap: wrap; gap: .5rem; }
.gd-overall-chip {
  display: inline-flex; align-items: center; gap: .4rem; padding: .5rem .85rem;
  border-radius: 999px; font-size: 13px; color: var(--muted); background: var(--surface);
  border: 1.5px solid var(--divider);
}
.gd-overall-chip strong { color: var(--text); font-weight: 700; }
.gd-overall-streak svg { color: #E2A93B; }
.gd-overall-stars svg { color: #E4C87A; }

.gd-flame-lit { color: #E2725B; animation: gd-flicker 1.4s ease-in-out infinite; }

.gd-loading, .gd-error {
  max-width: 44rem; margin: 0 auto; display: flex; align-items: center; gap: .5rem;
  padding: 1.5rem 0; font-size: 13.5px; color: var(--dim);
}
.gd-error { flex-direction: column; align-items: flex-start; color: var(--error-text); }
.gd-retry {
  display: inline-flex; align-items: center; gap: .4rem; padding: .5rem .9rem; border-radius: 10px;
  border: 1.5px solid var(--divider); background: transparent; color: var(--muted); font-size: 12.5px;
  font-weight: 600; cursor: pointer;
}
.gd-retry:hover { color: var(--text); }

.gd-grid { max-width: 30rem; margin: 0 auto; display: grid; gap: 1.1rem; grid-template-columns: 1fr; }
.gd-card {
  --game: #4F80F8; --glow: #8FB4FF;
  display: flex; flex-direction: column; gap: 1rem; padding: 1.2rem 1.25rem 1.1rem;
  border-radius: 20px; border: 1.5px solid var(--divider); background: var(--surface);
  box-shadow: 0 20px 40px -30px color-mix(in srgb, var(--game) 60%, transparent);
  animation: gd-fade-up 320ms cubic-bezier(.22,1,.36,1) both;
}
.gd-card-top { display: flex; align-items: flex-start; gap: .7rem; }
.gd-card-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 2.6rem; height: 2.6rem; border-radius: 14px; color: #FFFFFF;
  background: linear-gradient(135deg, var(--game), color-mix(in srgb, var(--game) 70%, black));
  box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--game) 60%, transparent);
}
.gd-card-heading { flex: 1; min-width: 0; }
.gd-card-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.05rem; font-weight: 700; color: var(--text); }
.gd-card-sub { margin: .1rem 0 0; font-size: 12px; color: var(--dim); }

.gd-level-badge {
  display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;
  width: 3.2rem; height: 3.2rem; border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--glow) 70%, white), var(--game));
  color: #FFFFFF; box-shadow: 0 0 0 4px color-mix(in srgb, var(--game) 16%, transparent), 0 10px 20px -8px color-mix(in srgb, var(--game) 70%, transparent);
  animation: gd-pulse-glow 2.4s ease-in-out infinite;
}
.gd-level-num { font-family: 'Sora', system-ui, sans-serif; font-size: 1.1rem; font-weight: 800; line-height: 1; }
.gd-level-tag { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; opacity: .85; }

.gd-path {
  display: flex; gap: .45rem; overflow-x: auto; padding: .3rem .1rem .5rem;
  scrollbar-width: thin;
}
.gd-pip {
  flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .2rem;
  width: 2.6rem; height: 2.6rem; border-radius: 12px; border: 1.5px solid var(--divider);
  background: var(--bg); color: var(--dim); transition: all 160ms ease;
}
.gd-pip-num { font-size: 12px; font-weight: 700; }
.gd-pip-stars { display: flex; gap: 1px; color: #E4C87A; }
.gd-pip-cleared { border-color: color-mix(in srgb, var(--game) 45%, var(--divider)); background: color-mix(in srgb, var(--game) 10%, var(--surface)); color: var(--game); }
.gd-pip-current { border-color: var(--game); box-shadow: 0 0 0 3px color-mix(in srgb, var(--game) 25%, transparent); transform: scale(1.08); color: var(--game); }

.gd-card-foot { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding-top: .2rem; border-top: 1px dashed var(--divider); }
.gd-total-stars { display: inline-flex; align-items: center; gap: .35rem; font-size: 13px; font-weight: 700; color: #C89B2E; }
.gd-foot-actions { display: flex; align-items: center; gap: .5rem; }
.gd-board-btn {
  display: inline-flex; align-items: center; gap: .35rem; padding: .55rem .8rem; border-radius: 10px;
  font-size: 12.5px; font-weight: 600; color: var(--muted); cursor: pointer;
  border: 1.5px solid var(--divider); background: transparent; transition: all 150ms ease;
}
.gd-board-btn:hover { color: var(--game); border-color: color-mix(in srgb, var(--game) 40%, var(--divider)); }
.gd-play-btn {
  display: inline-flex; align-items: center; gap: .4rem; padding: .55rem 1rem; border-radius: 10px;
  font-size: 13px; font-weight: 700; color: #FFFFFF; border: none; cursor: pointer;
  background: linear-gradient(135deg, var(--game), color-mix(in srgb, var(--game) 65%, black));
  box-shadow: 0 8px 16px -8px color-mix(in srgb, var(--game) 65%, transparent);
  transition: transform 150ms ease;
}
.gd-play-btn:hover { transform: translateY(-2px); }
.gd-play-btn:active { transform: translateY(0); }

@keyframes gd-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes gd-pulse-glow { 0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--game) 16%, transparent), 0 10px 20px -8px color-mix(in srgb, var(--game) 70%, transparent); } 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--game) 10%, transparent), 0 10px 24px -6px color-mix(in srgb, var(--game) 80%, transparent); } }
@keyframes gd-flicker { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: .85; } }

@media (prefers-reduced-motion: reduce) {
  .gd-page *, .gd-page *::before, .gd-page *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;