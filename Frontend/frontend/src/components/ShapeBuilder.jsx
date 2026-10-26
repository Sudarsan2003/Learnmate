import { Hexagon } from "lucide-react";
import LevelShell, { randInt, shuffle, PlayHeader, RoundDots, TimerBar, VerdictSlot } from "./ArcadeShared";
import { ChoiceGrid, useQuizRound, makeTrickyChoices, secondsFor } from "./ArcadeChoices";

/**
 * Shape Builder — geometry. There is no top level: side lengths keep growing,
 * new shapes appear, and new question types keep unlocking.
 *
 *  1 name a shape / count sides or corners     2 "which picture has 5 sides?"
 *  4 perimeter of a rectangle                  5 area (count squares; from 8, use side lengths)
 *  6 faces, edges and corners of solids        8 perimeter of a regular shape
 *  9 missing angle in a triangle              10 perimeter of an L-shape
 * 11 area of a triangle                       12 find a missing side from the perimeter
 * 13 angle sum of a polygon                   14 area of an L-shape
 * 16 Euler's rule for solids                  18 each angle of a regular polygon
 *
 * Shapes: 4 at level 1, up to 8 by level 4, rhombus / parallelogram / trapezium
 * from level 8, kite / nonagon / decagon from level 12.
 * The countdown starts at level 3 and shrinks (never below 12 seconds).
 */

const NAMES = {
  circle: "Circle", triangle: "Triangle", square: "Square", rectangle: "Rectangle",
  pentagon: "Pentagon", hexagon: "Hexagon", heptagon: "Heptagon", octagon: "Octagon",
  nonagon: "Nonagon", decagon: "Decagon", rhombus: "Rhombus", parallelogram: "Parallelogram",
  trapezium: "Trapezium", kite: "Kite",
};
const SIDES = {
  triangle: 3, square: 4, rectangle: 4, rhombus: 4, parallelogram: 4, trapezium: 4, kite: 4,
  pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10,
};
const NGON = { triangle: 3, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10 };
const POLY = {
  rhombus: "50,10 90,50 50,90 10,50",
  parallelogram: "24,26 94,26 76,74 6,74",
  trapezium: "30,26 70,26 94,74 6,74",
  kite: "50,8 84,40 50,94 16,40",
};
const REGULAR_ANGLE = { triangle: 60, square: 90, pentagon: 108, hexagon: 120, octagon: 135, nonagon: 140, decagon: 144 };

const SOLIDS = [
  { name: "cube", faces: 6, edges: 12, vertices: 8 },
  { name: "cuboid", faces: 6, edges: 12, vertices: 8 },
  { name: "square pyramid", faces: 5, edges: 8, vertices: 5 },
  { name: "triangular prism", faces: 5, edges: 9, vertices: 6 },
  { name: "triangular pyramid", faces: 4, edges: 6, vertices: 4 },
  { name: "pentagonal prism", faces: 7, edges: 15, vertices: 10 },
  { name: "pentagonal pyramid", faces: 6, edges: 10, vertices: 6 },
  { name: "hexagonal prism", faces: 8, edges: 18, vertices: 12 },
  { name: "hexagonal pyramid", faces: 7, edges: 12, vertices: 7 },
];
const PART_LABEL = { faces: "faces", edges: "edges", vertices: "corners (vertices)" };
const PART_SHORT = { faces: "faces", edges: "edges", vertices: "corners" };

const pick = (list) => list[randInt(0, list.length - 1)];
const others = (list, not, n) => shuffle(list.filter((x) => x !== not)).slice(0, n);

function namesFor(level) {
  if (level <= 2) return ["circle", "triangle", "square", "rectangle"];
  if (level === 3) return ["circle", "triangle", "square", "rectangle", "pentagon", "hexagon"];
  const base = ["circle", "triangle", "square", "rectangle", "pentagon", "hexagon", "heptagon", "octagon"];
  if (level <= 7) return base;
  if (level <= 11) return [...base, "rhombus", "parallelogram", "trapezium"];
  return [...base, "rhombus", "parallelogram", "trapezium", "kite", "nonagon", "decagon"];
}

// One shape per side count, so exactly one picture is right.
function pickableFor(level) {
  if (level <= 3) return ["triangle", "square", "pentagon", "hexagon"];
  if (level <= 11) return ["triangle", "square", "pentagon", "hexagon", "heptagon", "octagon"];
  return ["triangle", "square", "pentagon", "hexagon", "heptagon", "octagon", "nonagon", "decagon"];
}

function polyPoints(n) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(50 + 40 * Math.cos(a)).toFixed(1)},${(50 + 40 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/* ---------------------------- drawings ---------------------------- */

function ShapeSvg({ kind, size = 120 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {kind === "circle" && <circle cx="50" cy="50" r="38" className="sb-fill" />}
      {kind === "square" && <rect x="15" y="15" width="70" height="70" rx="3" className="sb-fill" />}
      {kind === "rectangle" && <rect x="8" y="26" width="84" height="48" rx="3" className="sb-fill" />}
      {NGON[kind] && <polygon points={polyPoints(NGON[kind])} strokeLinejoin="round" className="sb-fill" />}
      {POLY[kind] && <polygon points={POLY[kind]} strokeLinejoin="round" className="sb-fill" />}
    </svg>
  );
}

const Frame = ({ children }) => (
  <svg viewBox="0 0 160 120" width="100%" style={{ maxWidth: "15rem" }} aria-hidden="true">{children}</svg>
);
const scaleFor = (w, h) => Math.min(100 / w, 70 / h);

/** A w x h rectangle, optionally cut into unit squares, with side labels. */
function RectSvg({ w, h, grid, unit, labels }) {
  const u = scaleFor(w, h);
  const rw = w * u;
  const rh = h * u;
  const x0 = 80 - rw / 2;
  const y0 = 62 - rh / 2;
  const text = labels ?? (grid ? null : { w: `${w} ${unit}`, h: `${h} ${unit}` });
  return (
    <Frame>
      <rect x={x0} y={y0} width={rw} height={rh} rx="2" className="sb-fill" />
      {grid && Array.from({ length: w - 1 }, (_, i) => (
        <line key={`v${i}`} x1={x0 + (i + 1) * u} y1={y0} x2={x0 + (i + 1) * u} y2={y0 + rh} className="sb-grid" />
      ))}
      {grid && Array.from({ length: h - 1 }, (_, i) => (
        <line key={`h${i}`} x1={x0} y1={y0 + (i + 1) * u} x2={x0 + rw} y2={y0 + (i + 1) * u} className="sb-grid" />
      ))}
      {text && (
        <>
          <text x="80" y={y0 - 6} textAnchor="middle" className="sb-label">{text.w}</text>
          <text transform={`translate(${x0 - 8} ${y0 + rh / 2}) rotate(-90)`} textAnchor="middle" className="sb-label">{text.h}</text>
        </>
      )}
    </Frame>
  );
}

/** A right-angled triangle with its base and height labelled. */
function TriSvg({ b, h }) {
  const u = scaleFor(b, h);
  const rw = b * u;
  const rh = h * u;
  const x0 = 80 - rw / 2;
  const y0 = 56 - rh / 2;
  return (
    <Frame>
      <polygon points={`${x0},${y0} ${x0},${y0 + rh} ${x0 + rw},${y0 + rh}`} strokeLinejoin="round" className="sb-fill" />
      <rect x={x0} y={y0 + rh - 8} width="8" height="8" className="sb-grid" fill="none" />
      <text x="80" y={y0 + rh + 13} textAnchor="middle" className="sb-label">{b} cm</text>
      <text transform={`translate(${x0 - 8} ${y0 + rh / 2}) rotate(-90)`} textAnchor="middle" className="sb-label">{h} cm</text>
    </Frame>
  );
}

/** A W x H rectangle with a cw x ch corner cut out of the top right. */
function LShapeSvg({ W, H, cw, ch }) {
  const u = scaleFor(W, H);
  const x0 = 80 - (W * u) / 2;
  const y0 = 56 - (H * u) / 2;
  const P = [[0, 0], [W - cw, 0], [W - cw, ch], [W, ch], [W, H], [0, H]]
    .map(([x, y]) => `${x0 + x * u},${y0 + y * u}`)
    .join(" ");
  return (
    <Frame>
      <polygon points={P} strokeLinejoin="round" className="sb-fill" />
      <text x={x0 + (W * u) / 2} y={y0 + H * u + 13} textAnchor="middle" className="sb-label">{W} cm</text>
      <text transform={`translate(${x0 - 8} ${y0 + (H * u) / 2}) rotate(-90)`} textAnchor="middle" className="sb-label">{H} cm</text>
    </Frame>
  );
}

function Figure({ fig }) {
  if (!fig) return null;
  if (fig.type === "shape") return <div className="sb-fig"><ShapeSvg kind={fig.kind} size={130} /></div>;
  if (fig.type === "rect") return <div className="sb-fig"><RectSvg {...fig} /></div>;
  if (fig.type === "tri") return <div className="sb-fig"><TriSvg {...fig} /></div>;
  if (fig.type === "lshape") return <div className="sb-fig"><LShapeSvg {...fig} /></div>;
  return (
    <div className="sb-solid" style={{ textTransform: fig.name.includes("=") ? "none" : "capitalize" }}>{fig.name}</div>
  );
}

/* ---------------------------- questions ---------------------------- */

const numberQ = (sig, prompt, fig, answer, unit, level, choices) => ({
  sig, mode: "number", prompt, fig, answer, unit,
  reveal: `${answer}${unit}`,
  choices: choices ?? makeTrickyChoices(answer, level),
});

function build(kind, level) {
  const names = namesFor(level);
  const countable = names.filter((n) => n !== "circle");
  const pickable = pickableFor(level);
  const word = Math.random() < 0.5 ? "sides" : "corners";
  const hi = 3 + level;
  const regulars = pickable.filter((n) => REGULAR_ANGLE[n]);

  if (kind === "name") {
    const k = pick(names);
    return { sig: `name-${k}`, mode: "name", prompt: "What is this shape called?", fig: { type: "shape", kind: k },
      answer: k, reveal: NAMES[k], choices: shuffle([k, ...others(names, k, 3)]) };
  }

  if (kind === "sides") {
    const k = pick(countable);
    const answer = SIDES[k];
    const maxSides = Math.max(...countable.map((n) => SIDES[n]));
    const range = Array.from({ length: Math.max(5, maxSides - 1) }, (_, i) => 3 + i);
    return numberQ(`sides-${k}-${word}`, `How many ${word} does this shape have?`, { type: "shape", kind: k },
      answer, "", level, shuffle([answer, ...others(range, answer, 3)]));
  }

  if (kind === "pick") {
    const k = pick(pickable);
    return { sig: `pick-${k}-${word}`, mode: "shape", prompt: `Which shape has ${SIDES[k]} ${word}?`, fig: null,
      answer: k, reveal: NAMES[k], choices: shuffle([k, ...others(pickable, k, 3)]) };
  }

  if (kind === "perimeter") {
    const w = randInt(2, hi);
    const h = randInt(2, hi);
    return numberQ(`per-${w}x${h}`, "What is the perimeter? Add all four sides.",
      { type: "rect", w, h, grid: false, unit: "cm" }, 2 * (w + h), " cm", level);
  }

  if (kind === "area") {
    const grid = level < 8;
    const w = randInt(2, grid ? 7 : hi);
    const h = randInt(2, grid ? 5 : hi);
    return numberQ(`area-${w}x${h}`, grid ? "How many squares cover this rectangle?" : "What is the area?",
      { type: "rect", w, h, grid, unit: "cm" }, w * h, grid ? "" : " cm\u00B2", level);
  }

  if (kind === "solid") {
    const s = pick(level < 8 ? SOLIDS.slice(0, 3) : level < 12 ? SOLIDS.slice(0, 5) : SOLIDS);
    const part = pick(["faces", "edges", "vertices"]);
    return numberQ(`solid-${s.name}-${part}`, `How many ${PART_LABEL[part]} does a ${s.name} have?`,
      { type: "solid", name: s.name }, s[part], "", level, makeTrickyChoices(s[part], Math.min(level, 4)));
  }

  if (kind === "regperim") {
    const k = pick(pickable);
    const s = randInt(2, 4 + Math.floor(level / 2));
    return numberQ(`reg-${k}-${s}`, `A regular ${NAMES[k].toLowerCase()} has sides of ${s} cm. What is its perimeter?`,
      { type: "shape", kind: k }, SIDES[k] * s, " cm", level);
  }

  if (kind === "angtri") {
    const a = randInt(25, 80);
    const b = randInt(25, 80);
    return numberQ(`angtri-${a}-${b}`, `Two angles of a triangle are ${a}\u00B0 and ${b}\u00B0. What is the third angle?`,
      { type: "shape", kind: "triangle" }, 180 - a - b, "\u00B0", level);
  }

  if (kind === "lperim") {
    const W = randInt(4, 4 + Math.floor(level / 2));
    const H = randInt(4, 4 + Math.floor(level / 2));
    const cw = randInt(1, W - 2);
    const ch = randInt(1, H - 2);
    return numberQ(`lp-${W}-${H}-${cw}-${ch}`,
      `A ${W} cm by ${H} cm rectangle has a ${cw} cm by ${ch} cm corner cut out. What is the perimeter?`,
      { type: "lshape", W, H, cw, ch }, 2 * (W + H), " cm", level);
  }

  if (kind === "triarea") {
    const b = 2 * randInt(2, 4 + Math.floor(level / 3));
    const h = randInt(3, 4 + Math.floor(level / 2));
    return numberQ(`tri-${b}-${h}`, "What is the area of this triangle?", { type: "tri", b, h }, (b * h) / 2, " cm\u00B2", level);
  }

  if (kind === "findside") {
    const w = randInt(3, hi);
    const h = randInt(2, hi);
    return numberQ(`fs-${w}-${h}`, `The perimeter is ${2 * (w + h)} cm and the width is ${w} cm. What is the length?`,
      { type: "rect", w, h, grid: false, unit: "cm", labels: { w: `${w} cm`, h: "?" } }, h, " cm", level);
  }

  if (kind === "angsum") {
    const k = pick(regulars);
    const answer = (SIDES[k] - 2) * 180;
    const options = [answer - 180, answer + 180, answer + 360, answer - 360, answer + 90].filter((v) => v > 0);
    return numberQ(`as-${k}`, `What is the sum of the angles inside a ${NAMES[k].toLowerCase()}?`,
      { type: "shape", kind: k }, answer, "\u00B0", level, shuffle([answer, ...others(options, answer, 3)]));
  }

  if (kind === "lshape") {
    const W = randInt(5, 5 + Math.floor(level / 2));
    const H = randInt(5, 5 + Math.floor(level / 2));
    const cw = randInt(1, W - 2);
    const ch = randInt(1, H - 2);
    return numberQ(`la-${W}-${H}-${cw}-${ch}`,
      `A ${W} cm by ${H} cm rectangle has a ${cw} cm by ${ch} cm corner cut out. What is the area that is left?`,
      { type: "lshape", W, H, cw, ch }, W * H - cw * ch, " cm\u00B2", level);
  }

  if (kind === "euler") {
    const s = pick(SOLIDS);
    const [pa, pb, pc] = shuffle(["faces", "edges", "vertices"]);
    return numberQ(`eu-${s.name}-${pa}${pb}`,
      `A solid has ${s[pa]} ${PART_SHORT[pa]} and ${s[pb]} ${PART_SHORT[pb]}. How many ${PART_SHORT[pc]} does it have?`,
      { type: "solid", name: "Faces + corners \u2212 edges = 2" }, s[pc], "", level);
  }

  // angreg: each angle of a regular polygon
  const k = pick(regulars);
  const answer = REGULAR_ANGLE[k];
  const all = Object.values(REGULAR_ANGLE);
  return numberQ(`ar-${k}`, `What is each angle of a regular ${NAMES[k].toLowerCase()}?`,
    { type: "shape", kind: k }, answer, "\u00B0", level, shuffle([answer, ...others(all, answer, 3)]));
}

const UNLOCKS = [
  [1, "name"], [1, "sides"], [2, "pick"], [4, "perimeter"], [5, "area"], [6, "solid"], [8, "regperim"],
  [9, "angtri"], [10, "lperim"], [11, "triarea"], [12, "findside"], [13, "angsum"], [14, "lshape"],
  [16, "euler"], [18, "angreg"],
];

function makeQuestion(level, seen) {
  const kinds = UNLOCKS.filter(([min]) => level >= min).map(([, k]) => k);
  const kind = () => kinds[randInt(0, kinds.length - 1)];
  let q;
  let k;
  let tries = 0;
  do {
    k = kind();
    q = build(k, level);
  } while (seen.has(q.sig) && tries++ < 30);
  seen.add(q.sig);
  return { ...q, kind: k, key: `${q.sig}-${Math.random()}` };
}

// 22s at level 3 shrinking to a 12s floor; calculation questions get 6s extra.
const timeFor = (level, q) => {
  const base = secondsFor(level, 22, 12, 2);
  return base ? base + (["name", "sides", "pick"].includes(q.kind) ? 0 : 6) : 0;
};

function ShapePlay({ level, onFinish, onExit }) {
  const { tally, round, q, picked, verdict, locked, pick: choose, timeLeft, totalTime } = useQuizRound({
    level, makeQuestion, onFinish, timeFor,
  });
  const asPicture = q.mode === "shape";

  const face = (c) => {
    if (asPicture) return <ShapeSvg kind={c} size={76} />;
    if (q.mode === "name") return NAMES[c];
    return `${c}${q.unit ?? ""}`;
  };

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={10} />
      {totalTime > 0 && <TimerBar timeLeft={timeLeft} totalTime={totalTime} />}

      <div key={q.key} className="sb-stage">
        <p className="sb-prompt">{q.prompt}</p>
        <Figure fig={q.fig} />
      </div>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <ChoiceGrid
        choices={q.choices}
        answer={q.answer}
        picked={picked}
        locked={locked}
        onPick={choose}
        render={face}
        label={asPicture || q.mode === "name" ? (c) => NAMES[c] : undefined}
        tall={asPicture}
      />
    </div>
  );
}

export default function ShapeBuilder() {
  return (
    <LevelShell
      gameType="SHAPE"
      title="Shape Builder"
      blurb="Name, count and measure shapes. Clear 70%+ to unlock the next level."
      icon={Hexagon}
      color="#1E9BD1"
      hint="The levels never stop. Measurements grow, the countdown (from level 3) gets shorter, and new challenges keep arriving: perimeter, area, solids, angles, L-shapes, triangles and Euler's rule."
      Play={ShapePlay}
    />
  );
}

const CSS = `
.sb-stage {
  display: flex; flex-direction: column; align-items: center; gap: .8rem; padding: 1.2rem 1rem; border-radius: 20px;
  border: 1.5px solid var(--divider); background: var(--surface);
  animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both;
}
.sb-prompt { margin: 0; text-align: center; font-family: 'Sora', system-ui, sans-serif; font-size: 1.1rem; font-weight: 700; line-height: 1.4; color: var(--text); }
.sb-fig { display: flex; justify-content: center; width: 100%; }
.sb-fill { fill: color-mix(in srgb, var(--ax) 22%, transparent); stroke: var(--ax); stroke-width: 3; }
.sb-grid { stroke: var(--ax); stroke-width: 1.2; stroke-dasharray: 3 3; opacity: .7; }
.sb-label { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 10px; font-weight: 700; fill: var(--text); }
.sb-solid { padding: .9rem 1.4rem; border-radius: 14px; font-family: 'Sora', system-ui, sans-serif; font-size: 1.3rem; font-weight: 700; text-align: center; color: var(--ax); background: color-mix(in srgb, var(--ax) 12%, transparent); }
`;