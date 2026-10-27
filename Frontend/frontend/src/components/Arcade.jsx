import { useState } from "react";
import { Car, PartyPopper, Brain, Scale, ShoppingCart, Puzzle, Hexagon, Search, ArrowLeft, ChevronRight } from "lucide-react";
import MathsRace from "./MathsRace";
import BalloonMaths from "./BalloonMaths";
import MemoryMatch from "./MemoryMatch";
import WhichIsBigger from "./WhichIsBigger";
import VirtualShop from "./VirtualShop";
import MathsPuzzle from "./MathsPuzzle";
import ShapeBuilder from "./ShapeBuilder";
import MathsDetective from "./MathsDetective";

const GAMES = [
  { id: "race", gameType: "RACE", title: "Maths Race", skill: "Addition & subtraction", blurb: "Answer fast to outrun Turbo.", icon: Car, color: "#E2725B", Component: MathsRace },
  { id: "balloon", gameType: "BALLOON", title: "Balloon Maths", skill: "Addition", blurb: "Pop the balloon that holds the answer.", icon: PartyPopper, color: "#E0559A", Component: BalloonMaths },
  { id: "memory", gameType: "MEMORY", title: "Memory Match", skill: "Multiplication", blurb: "Match each times-table question to its answer.", icon: Brain, color: "#16A394", Component: MemoryMatch },
  { id: "bigger", gameType: "BIGGER", title: "Which Is Bigger?", skill: "Comparison", blurb: "Spot the bigger (or smaller) side, quickly.", icon: Scale, color: "#D98A1F", Component: WhichIsBigger },
  { id: "shop", gameType: "SHOP", title: "Virtual Shop", skill: "Money", blurb: "Add up the bill and count your change.", icon: ShoppingCart, color: "#4C9A2A", Component: VirtualShop },
  { id: "puzzle", gameType: "PUZZLE", title: "Maths Puzzle", skill: "Logical thinking", blurb: "Crack patterns, missing numbers and shape clues.", icon: Puzzle, color: "#6A4DE0", Component: MathsPuzzle },
  { id: "shape", gameType: "SHAPE", title: "Shape Builder", skill: "Geometry", blurb: "Name, count and measure shapes.", icon: Hexagon, color: "#1E9BD1", Component: ShapeBuilder },
  { id: "detective", gameType: "DETECTIVE", title: "Maths Detective", skill: "Word problems", blurb: "Read the case file and crack the answer.", icon: Search, color: "#8C6A3F", Component: MathsDetective },
];

/** gameType ("RACE", ...) -> arcade game id, so other screens can deep-link. */
export const ARCADE_ID_BY_TYPE = Object.fromEntries(GAMES.map((g) => [g.gameType, g.id]));

/**
 * Arcade — a list of short maths games. Picking one mounts it; each game
 * has its own levels, stars and unlocking (see ArcadeShared's LevelShell).
 * Going back to the list unmounts the game, so it reopens on its level screen.
 */
const RULES =
  "Every right answer scores 10 points, and every third right answer in a row adds a 20-point bonus. Clear a level " +
  "with 70% or more to unlock the next one, and earn up to three stars for accuracy.";

/**
 * `games` and `rules` let another tab (Aptitude) reuse this list-and-play
 * screen with its own set of games.
 */
export default function Arcade({ initialId = null, games = GAMES, rules = RULES, backLabel = "All arcade games" }) {
  const [activeId, setActiveId] = useState(initialId);
  const active = games.find((g) => g.id === activeId);

  if (active) {
    const Game = active.Component;
    return (
      <div className="ar-root">
        <style>{CSS}</style>
        <button type="button" className="ar-back" onClick={() => setActiveId(null)}>
          <ArrowLeft size={14} /> {backLabel}
        </button>
        <Game />
      </div>
    );
  }

  return (
    <div className="ar-root">
      <style>{CSS}</style>
      <ul className="ar-list">
        {games.map((g) => {
          const Icon = g.icon;
          return (
            <li key={g.id}>
              <button type="button" className="ar-row" style={{ "--c": g.color }} onClick={() => setActiveId(g.id)}>
                <span className="ar-icon">
                  <Icon size={20} />
                </span>
                <span className="ar-text">
                  <span className="ar-title">{g.title}</span>
                  <span className="ar-blurb">{g.blurb}</span>
                </span>
                <span className="ar-skill">{g.skill}</span>
                <ChevronRight size={16} className="ar-chevron" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="ar-rules">{rules}</p>
    </div>
  );
}

const CSS = `
.ar-root { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 30rem; margin: 0 auto; padding: .5rem 0 1rem; }
.ar-list { display: flex; flex-direction: column; gap: .6rem; margin: 0; padding: 0; list-style: none; }
.ar-row {
  --c: #4F80F8;
  display: flex; align-items: center; gap: .85rem; width: 100%; padding: .85rem 1rem; text-align: left;
  border-radius: 16px; border: 1.5px solid var(--divider); background: var(--surface); cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease;
}
.ar-row:hover { border-color: var(--c); transform: translateY(-2px); }
.ar-row:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
.ar-icon {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.7rem; height: 2.7rem;
  border-radius: 14px; color: #FFFFFF; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 62%, black));
}
.ar-text { display: flex; flex-direction: column; gap: .1rem; flex: 1; min-width: 0; }
.ar-title { font-family: 'Sora', system-ui, sans-serif; font-size: 1rem; font-weight: 700; color: var(--text); }
.ar-blurb { font-size: 12.5px; color: var(--dim); }
.ar-skill { flex-shrink: 0; padding: .25rem .6rem; border-radius: 999px; font-size: 11.5px; font-weight: 600; color: var(--muted); background: color-mix(in srgb, var(--c) 12%, transparent); }
.ar-chevron { flex-shrink: 0; color: var(--dim); }
.ar-rules { margin: 1.1rem 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dim); }
.ar-back {
  display: inline-flex; align-items: center; gap: .4rem; margin-bottom: .6rem; padding: .4rem .6rem; border: none; border-radius: 8px;
  background: transparent; font-size: 12.5px; font-weight: 600; color: var(--dim); cursor: pointer;
}
.ar-back:hover { color: var(--text); background: var(--divider); }

@media (max-width: 480px) { .ar-skill { display: none; } }
@media (prefers-reduced-motion: reduce) { .ar-row { transition-duration: 1ms; } }
`;