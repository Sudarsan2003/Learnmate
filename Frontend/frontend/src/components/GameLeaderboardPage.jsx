import { useState } from "react";
import { Trophy, Calculator, SpellCheck2, Car, PartyPopper, Brain, Scale, ShoppingCart, Puzzle, Hexagon, Search, KeyRound, Shapes, Compass, Clock } from "lucide-react";
import GameLeaderboard from "./GameLeaderboard";

const SUB_TABS = [
  { id: "MATH", label: "Math", icon: Calculator, color: "#4F80F8" },
  { id: "WORDS", label: "Words", icon: SpellCheck2, color: "#8B73F5" },
  { id: "RACE", label: "Race", icon: Car, color: "#E2725B" },
  { id: "BALLOON", label: "Balloons", icon: PartyPopper, color: "#E0559A" },
  { id: "MEMORY", label: "Memory", icon: Brain, color: "#16A394" },
  { id: "BIGGER", label: "Bigger", icon: Scale, color: "#D98A1F" },
  { id: "SHOP", label: "Shop", icon: ShoppingCart, color: "#4C9A2A" },
  { id: "PUZZLE", label: "Puzzle", icon: Puzzle, color: "#6A4DE0" },
  { id: "SHAPE", label: "Shapes", icon: Hexagon, color: "#1E9BD1" },
  { id: "DETECTIVE", label: "Detective", icon: Search, color: "#8C6A3F" },
  { id: "CODE", label: "Codes", icon: KeyRound, color: "#2F7DD3" },
  { id: "ODDONE", label: "Odd One", icon: Shapes, color: "#C2558B" },
  { id: "DIRECTION", label: "Directions", icon: Compass, color: "#2E9A6B" },
  { id: "CLOCK", label: "Clock", icon: Clock, color: "#C47A1E" },
];

/**
 * Institute-wide leaderboard page — its own top-level tab in Games.jsx
 * (alongside Math / Words / Progress), with one sub-tab per game underneath.
 * Delegates all data-fetching/rendering to GameLeaderboard, just adds the
 * page chrome + sub-tab switcher.
 *
 * Can be used standalone (manages its own selected sub-tab) or controlled
 * from a parent — e.g. GamesDashboard links here with a specific game
 * already selected — by passing `game` + `onChangeGame`.
 */
export default function GamesLeaderboardPage({ game: controlledGame, onChangeGame } = {}) {
  const [internalGame, setInternalGame] = useState("MATH");
  const game = controlledGame ?? internalGame;
  const setGame = onChangeGame ?? setInternalGame;

  return (
    <div className="gl-page">
      <style>{CSS}</style>

      <div className="gl-header">
        <div className="gl-title-row">
          <span className="gl-title-icon">
            <Trophy size={18} />
          </span>
          <div>
            <h1 className="gl-title">Leaderboard</h1>
            <p className="gl-sub">Every student in your institute, ranked by stars.</p>
          </div>
        </div>

        <div className="gl-tabs" role="tablist" aria-label="Choose a game leaderboard">
          {SUB_TABS.map((t) => {
            const Icon = t.icon;
            const active = game === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGame(t.id)}
                className={`gl-tab ${active ? "gl-tab-active" : ""}`}
                style={{ "--tab": t.color }}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="gl-body">
        <GameLeaderboard key={game} gameType={game} showAllByDefault />
      </div>
    </div>
  );
}

const CSS = `
.gl-page {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height: 100%; padding: 1.5rem 1rem 2.5rem;
}
@media (min-width: 640px) { .gl-page { padding: 2rem 1.5rem 3rem; } }

.gl-header { max-width: 44rem; margin: 0 auto 1.6rem; }
.gl-title-row { display: flex; align-items: center; gap: .8rem; margin-bottom: 1.2rem; }
.gl-title-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 2.5rem; height: 2.5rem; border-radius: 999px; color: #0B0E14;
  background: linear-gradient(135deg, #F2D98A, #E4A93B);
  box-shadow: 0 8px 18px -8px rgba(228,169,59,.55);
}
.gl-title {
  margin: 0; font-family: 'Sora', system-ui, sans-serif; font-weight: 700;
  letter-spacing: -0.01em; font-size: 1.5rem; color: var(--text);
}
.gl-sub { margin: .15rem 0 0; font-size: 13px; color: var(--dim); }

.gl-tabs { display: flex; gap: .5rem; border-bottom: 1px solid var(--divider); overflow-x: auto; scrollbar-width: none; }
.gl-tabs::-webkit-scrollbar { display: none; }
.gl-tab {
  --tab: #4F80F8; flex: none; white-space: nowrap;
  display: inline-flex; align-items: center; gap: .45rem;
  padding: .6rem .95rem; margin-bottom: -1px; border-radius: 10px 10px 0 0;
  font-size: 13.5px; font-weight: 600; color: var(--muted);
  border: 1px solid transparent; border-bottom: none; background: transparent; cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.gl-tab:hover { color: var(--text); }
.gl-tab-active {
  color: var(--tab); background: color-mix(in srgb, var(--tab) 10%, var(--surface));
  border-color: var(--divider); box-shadow: inset 0 2px 0 var(--tab);
}

.gl-body { max-width: 44rem; margin: 0 auto; padding-top: 1.3rem; }

@media (prefers-reduced-motion: reduce) {
  .gl-page *, .gl-page *::before, .gl-page *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;