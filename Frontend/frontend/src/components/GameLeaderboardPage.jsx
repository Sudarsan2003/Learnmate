import { useState } from "react";
import { Trophy, ChevronDown, Calculator, SpellCheck2, Car, PartyPopper, Brain, Scale, ShoppingCart, Puzzle, Hexagon, Search, KeyRound, Shapes, Compass, Clock, Network, Armchair, ArrowLeftRight } from "lucide-react";
import GameLeaderboard from "./GameLeaderboard";

// Grouped like the Games tabs, so the picker reads the same way.
const GROUPS = [
  {
    label: "Math & Words",
    games: [
      { id: "MATH", label: "Math Adventure", icon: Calculator, color: "#4F80F8" },
      { id: "WORDS", label: "Word Wizard", icon: SpellCheck2, color: "#8B73F5" },
    ],
  },
  {
    label: "Arcade",
    games: [
      { id: "RACE", label: "Maths Race", icon: Car, color: "#E2725B" },
      { id: "BALLOON", label: "Balloon Maths", icon: PartyPopper, color: "#E0559A" },
      { id: "MEMORY", label: "Memory Match", icon: Brain, color: "#16A394" },
      { id: "BIGGER", label: "Which Is Bigger?", icon: Scale, color: "#D98A1F" },
      { id: "SHOP", label: "Virtual Shop", icon: ShoppingCart, color: "#4C9A2A" },
      { id: "PUZZLE", label: "Maths Puzzle", icon: Puzzle, color: "#6A4DE0" },
      { id: "SHAPE", label: "Shape Builder", icon: Hexagon, color: "#1E9BD1" },
      { id: "DETECTIVE", label: "Maths Detective", icon: Search, color: "#8C6A3F" },
    ],
  },
  {
    label: "Aptitude",
    games: [
      { id: "CODE", label: "Code Cracker", icon: KeyRound, color: "#2F7DD3" },
      { id: "ODDONE", label: "Odd One Out", icon: Shapes, color: "#C2558B" },
      { id: "DIRECTION", label: "Direction Sense", icon: Compass, color: "#2E9A6B" },
      { id: "CLOCK", label: "Clock & Calendar", icon: Clock, color: "#C47A1E" },
      { id: "FAMILY", label: "Family Tree", icon: Network, color: "#7A5AC8" },
      { id: "SEATING", label: "Seating Arrangement", icon: Armchair, color: "#3B8C9E" },
      { id: "ANALOGY", label: "Analogies", icon: ArrowLeftRight, color: "#B5603A" },
    ],
  },
];
const ALL_GAMES = GROUPS.flatMap((g) => g.games);

/**
 * Institute-wide leaderboard page — its own top-level tab in Games.jsx
 * (alongside Math / Words / Progress), with a game picker underneath.
 * Seventeen games don't fit a row of tabs on any screen, so the picker is a
 * native <select> (grouped, and the phone's own picker on mobile) dressed with
 * the chosen game's icon and colour.
 * Delegates all data-fetching/rendering to GameLeaderboard, just adds the
 * page chrome + game picker.
 *
 * Can be used standalone (manages its own selected sub-tab) or controlled
 * from a parent — e.g. GamesDashboard links here with a specific game
 * already selected — by passing `game` + `onChangeGame`.
 */
export default function GamesLeaderboardPage({ game: controlledGame, onChangeGame } = {}) {
  const [internalGame, setInternalGame] = useState("MATH");
  const game = controlledGame ?? internalGame;
  const setGame = onChangeGame ?? setInternalGame;
  const current = ALL_GAMES.find((g) => g.id === game) ?? ALL_GAMES[0];
  const CurrentIcon = current.icon;

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

        <label className="gl-picker" style={{ "--tab": current.color }}>
          <span className="gl-picker-icon" aria-hidden="true">
            <CurrentIcon size={17} />
          </span>
          <span className="gl-picker-text">
            <span className="gl-picker-label">Game</span>
            <span className="gl-picker-value">{current.label}</span>
          </span>
          <ChevronDown size={18} className="gl-picker-chev" aria-hidden="true" />
          <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Choose a game leaderboard">
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.games.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
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

.gl-picker {
  position: relative; display: flex; align-items: center; gap: .75rem; max-width: 22rem;
  padding: .6rem .9rem .6rem .65rem; border-radius: 14px; border: 1px solid var(--divider); background: var(--surface);
  cursor: pointer; transition: border-color 150ms ease, box-shadow 150ms ease;
}
.gl-picker:hover, .gl-picker:focus-within { border-color: var(--tab); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tab) 18%, transparent); }
.gl-picker select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
.gl-picker-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.3rem; height: 2.3rem; border-radius: 10px;
  color: #fff; background: linear-gradient(135deg, var(--tab), color-mix(in srgb, var(--tab) 60%, black));
}
.gl-picker-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.gl-picker-label { font-size: 11.5px; font-weight: 600; color: var(--dim); text-transform: uppercase; letter-spacing: .05em; }
.gl-picker-value { font-size: 15px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gl-picker-chev { flex-shrink: 0; color: var(--dim); }
@media (max-width: 640px) { .gl-picker { max-width: none; } }

.gl-body { max-width: 44rem; margin: 0 auto; padding-top: 1.3rem; }

@media (prefers-reduced-motion: reduce) {
  .gl-page *, .gl-page *::before, .gl-page *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;