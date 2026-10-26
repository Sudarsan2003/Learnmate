import { useState } from "react";
import { Calculator, SpellCheck2, Gamepad2, Sparkles, Trophy, Zap } from "lucide-react";
import MathGame from "./MathGame";
import WordGame from "./WordGame";
import Arcade, { ARCADE_ID_BY_TYPE } from "./Arcade";
import GamesDashboard from "./GamesDashboard";
import GamesLeaderboardPage from "./GameLeaderboardPage";

const TABS = [
  { id: "math", label: "Math", icon: Calculator, color: "#4F80F8" },
  { id: "words", label: "Words", icon: SpellCheck2, color: "#8B73F5" },
  { id: "arcade", label: "Arcade", icon: Zap, color: "#E2725B" },
  { id: "progress", label: "Progress", icon: Sparkles, color: "#E2A93B" },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy, color: "#E4A93B" },
];

/**
 * Games — a small arcade of learning games:
 *  - Math: level-based addition / subtraction / multiplication / division
 *  - Words: level-based unscramble-the-word with picture hints
 *  - Arcade: short maths games (Maths Race, Balloon Maths, Memory Match,
 *    Which Is Bigger?), each with its own levels and stars
 *  - Progress: GamesDashboard — stars, streaks, level path for both games
 *  - Leaderboard: GamesLeaderboardPage — institute-wide ranking, with one
 *    sub-tab per game
 *
 * MathGame/WordGame own their own level state and call the games API
 * directly on completion, so switching tabs here just swaps which component
 * is mounted; each resets to its level-select screen when remounted.
 */
export default function Games() {
  const [tab, setTab] = useState("math");
  const [leaderboardGame, setLeaderboardGame] = useState("MATH");
  const [arcadeGame, setArcadeGame] = useState(null); // deep-link from Progress

  return (
    <div className="gm-page">
      <style>{CSS}</style>

      <div className="gm-header">
        <div className="gm-title-row">
          <span className="gm-title-icon">
            <Gamepad2 size={18} />
          </span>
          <div>
            <h1 className="gm-title">Games</h1>
            <p className="gm-sub">A quick brain-break &mdash; sharpen your numbers and words.</p>
          </div>
        </div>

        <div className="gm-tabs" role="tablist" aria-label="Choose a game">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (t.id === "arcade") setArcadeGame(null);
                  setTab(t.id);
                }}
                className={`gm-tab ${active ? "gm-tab-active" : ""}`}
                style={{ "--tab": t.color }}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="gm-body">
        {tab === "math" ? (
          <MathGame key="math" />
        ) : tab === "words" ? (
          <WordGame key="words" />
        ) : tab === "arcade" ? (
          <Arcade key={`arcade-${arcadeGame ?? "list"}`} initialId={arcadeGame} />
        ) : tab === "progress" ? (
          <GamesDashboard
            key="progress"
            onPlayGame={(gameType) => {
              if (gameType === "MATH") setTab("math");
              else if (gameType === "WORDS") setTab("words");
              else {
                setArcadeGame(ARCADE_ID_BY_TYPE[gameType] ?? null);
                setTab("arcade");
              }
            }}
            onViewLeaderboard={(gameType) => {
              setLeaderboardGame(gameType);
              setTab("leaderboard");
            }}
          />
        ) : (
          <GamesLeaderboardPage key="leaderboard" game={leaderboardGame} onChangeGame={setLeaderboardGame} />
        )}
      </div>
    </div>
  );
}

const CSS = `
.gm-page {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height: 100%; padding: 1.5rem 1rem 2.5rem;
}
@media (min-width: 640px) { .gm-page { padding: 2rem 1.5rem 3rem; } }

.gm-header { max-width: 44rem; margin: 0 auto 1.6rem; }
.gm-title-row { display: flex; align-items: center; gap: .8rem; margin-bottom: 1.2rem; }
.gm-title-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 2.5rem; height: 2.5rem; border-radius: 999px; color: #FFFFFF;
  background: linear-gradient(135deg, #4F80F8, #3558DE);
  box-shadow: 0 8px 18px -8px rgba(53,88,222,.55);
}
.gm-title {
  margin: 0; font-family: 'Sora', system-ui, sans-serif; font-weight: 700;
  letter-spacing: -0.01em; font-size: 1.5rem; color: var(--text);
}
.gm-sub { margin: .15rem 0 0; font-size: 13px; color: var(--dim); }

.gm-tabs { display: flex; gap: .5rem; border-bottom: 1px solid var(--divider); }
@media (max-width: 520px) {
  .gm-tabs { overflow-x: auto; scrollbar-width: none; }
  .gm-tabs::-webkit-scrollbar { display: none; }
}
.gm-tab {
  --tab: #4F80F8; flex: none; white-space: nowrap;
  display: inline-flex; align-items: center; gap: .45rem;
  padding: .6rem .95rem; margin-bottom: -1px; border-radius: 10px 10px 0 0;
  font-size: 13.5px; font-weight: 600; color: var(--muted);
  border: 1px solid transparent; border-bottom: none; background: transparent; cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.gm-tab:hover { color: var(--text); }
.gm-tab-active {
  color: var(--tab); background: color-mix(in srgb, var(--tab) 10%, var(--surface));
  border-color: var(--divider); box-shadow: inset 0 2px 0 var(--tab);
}

.gm-body { max-width: 44rem; margin: 0 auto; }

@media (prefers-reduced-motion: reduce) {
  .gm-page *, .gm-page *::before, .gm-page *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;