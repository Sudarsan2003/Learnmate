import { Puzzle } from "lucide-react";
import LevelShell, { randInt, PlayHeader, RoundDots, TimerBar, VerdictSlot } from "./ArcadeShared";
import { ChoiceGrid, useQuizRound, makeTrickyChoices, secondsFor } from "./ArcadeChoices";

/**
 * Maths Puzzle — logical thinking. No top level: numbers keep growing and
 * new puzzle types keep unlocking. Each round picks at random from every
 * type available at that level, so the mix gets harder as more join.
 *
 * Number patterns
 *   1 steps up/down    6 alternating steps    8 doubling, squares, growing gaps
 *   9 up-and-down steps    10 Fibonacci-style    13 cubes
 *   16 two interleaved patterns    20 double-and-add    22 triangular numbers
 * Missing numbers
 *   1 + and \u2212    3 \u00D7 and \u00F7    6 two-step    9 brackets    12 both sides balanced
 *   15 square roots    18 percentages
 * Shape logic
 *   3 two clues    6 three-symbol clue    12 three unknowns
 * The countdown starts at level 3 and shrinks (never below 12 seconds).
 */

const BOX = "\u25A1";
const MINUS = "\u2212";
const TIMES = "\u00D7";
const DIVIDE = "\u00F7";
const SYMBOLS = [
  ["\uD83C\uDF4E", "\uD83C\uDF4C", "\uD83C\uDF47"],
  ["\u2B50", "\uD83C\uDF19", "\u2600\uFE0F"],
  ["\uD83D\uDC36", "\uD83D\uDC31", "\uD83D\uDC2D"],
  ["\uD83D\uDE97", "\uD83D\uDEB2", "\uD83D\uDE8C"],
];
const PERCENTS = [10, 20, 25, 50];

const third = (level) => Math.floor(level / 3);
const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

const PATTERNS = [
  { min: 1, make: (L) => {
    const d = randInt(2, 4 + Math.floor(L / 2));
    const down = L >= 3 && Math.random() < 0.4;
    const a = down ? d * 6 + randInt(1, 10 + L) : randInt(1, 10 + L * 2);
    return seq(6, (i) => (down ? a - i * d : a + i * d));
  } },
  { min: 6, make: (L) => {
    const x = randInt(2, 6 + third(L));
    const y = randInt(1, 4 + third(L));
    const t = [randInt(1, 10 + L)];
    for (let i = 1; i < 6; i++) t.push(t[i - 1] + (i % 2 ? x : y));
    return t;
  } },
  { min: 8, make: (L) => {
    const r = randInt(2, L >= 14 ? 4 : 3);
    const s = randInt(1, 4);
    return seq(6, (i) => s * r ** i);
  } },
  { min: 8, make: (L) => {
    const k = randInt(1, 6 + Math.floor(L / 2));
    return seq(6, (i) => (k + i) ** 2);
  } },
  { min: 8, make: (L) => {
    const g = randInt(1, 1 + Math.floor(L / 10));
    const t = [randInt(1, 10 + L)];
    for (let i = 1; i < 6; i++) t.push(t[i - 1] + i * g);
    return t;
  } },
  { min: 9, make: (L) => {
    const x = randInt(4, 8 + third(L));
    const y = randInt(1, x - 2);
    const t = [randInt(1, 10 + L)];
    for (let i = 1; i < 6; i++) t.push(t[i - 1] + (i % 2 ? x : -y));
    return t;
  } },
  { min: 10, make: (L) => {
    const t = [randInt(1, 5 + third(L)), randInt(1, 5 + third(L))];
    for (let i = 2; i < 6; i++) t.push(t[i - 1] + t[i - 2]);
    return t;
  } },
  { min: 13, make: (L) => {
    const k = randInt(1, 4 + Math.floor(L / 8));
    return seq(6, (i) => (k + i) ** 3);
  } },
  { min: 16, make: (L) => {
    const a = randInt(1, 15);
    const b = randInt(1, 15);
    const d1 = randInt(2, 6 + Math.floor(L / 6));
    const d2 = randInt(2, 6 + Math.floor(L / 6));
    return seq(8, (i) => (i % 2 === 0 ? a + (i / 2) * d1 : b + ((i - 1) / 2) * d2));
  } },
  { min: 20, make: () => {
    const c = Math.random() < 0.5 ? 1 : -1;
    const t = [randInt(2, 5)];
    for (let i = 1; i < 6; i++) t.push(2 * t[i - 1] + c);
    return t;
  } },
  { min: 22, make: () => {
    const k = randInt(1, 8);
    return seq(6, (i) => ((k + i) * (k + i + 1)) / 2);
  } },
];

function pattern(level) {
  const def = PATTERNS.filter((p) => p.min <= level);
  const terms = def[randInt(0, def.length - 1)].make(level);
  return {
    title: "Number pattern",
    lines: [`${terms.slice(0, -1).join(",  ")},  ?`],
    ask: "What comes next?",
    answer: terms[terms.length - 1],
  };
}

function missing(level) {
  const hi = 5 + level * 2;
  const x = randInt(2, hi);
  const b = randInt(2, hi);
  const m = randInt(2, 3 + level);
  const kinds = ["add", "sub"];
  if (level >= 3) kinds.push("mul", "div");
  if (level >= 6) kinds.push("two");
  if (level >= 9) kinds.push("brackets");
  if (level >= 12) kinds.push("balance");
  if (level >= 15) kinds.push("square");
  if (level >= 18) kinds.push("percent");
  const kind = kinds[randInt(0, kinds.length - 1)];
  let text;
  let answer = x;

  if (kind === "add") {
    text = Math.random() < 0.5 ? `${BOX} + ${b} = ${x + b}` : `${b} + ${BOX} = ${x + b}`;
  } else if (kind === "sub") {
    if (Math.random() < 0.5) {
      text = `${BOX} ${MINUS} ${b} = ${x}`;
      answer = x + b;
    } else {
      text = `${x + b} ${MINUS} ${BOX} = ${x}`;
      answer = b;
    }
  } else if (kind === "mul") {
    text = `${m} ${TIMES} ${BOX} = ${m * x}`;
  } else if (kind === "div") {
    text = `${BOX} ${DIVIDE} ${m} = ${x}`;
    answer = m * x;
  } else if (kind === "two") {
    const k = randInt(2, 4 + Math.floor(level / 6));
    if (Math.random() < 0.5) {
      const c = randInt(1, 9 + level);
      text = `${BOX} ${TIMES} ${k} + ${c} = ${x * k + c}`;
    } else {
      const c = randInt(1, Math.min(9 + level, x * k - 1));
      text = `${BOX} ${TIMES} ${k} ${MINUS} ${c} = ${x * k - c}`;
    }
  } else if (kind === "brackets") {
    const k = randInt(2, 3 + third(level));
    const a = randInt(1, hi);
    text = `(${BOX} + ${a}) ${TIMES} ${k} = ${(x + a) * k}`;
  } else if (kind === "balance") {
    const q = randInt(1, 3);
    const p = q + randInt(1, 4);
    const a = randInt(1, 20 + level);
    text = `${p} ${TIMES} ${BOX} + ${a} = ${q} ${TIMES} ${BOX} + ${a + (p - q) * x}`;
  } else if (kind === "square") {
    const r = randInt(3, 6 + Math.floor(level / 2));
    text = `${BOX} ${TIMES} ${BOX} = ${r * r}`;
    answer = r;
  } else {
    const pct = PERCENTS[randInt(0, PERCENTS.length - 1)];
    const whole = 20 * randInt(1, 3 + Math.floor(level / 5));
    text = `${pct}% of ${BOX} = ${(whole * pct) / 100}`;
    answer = whole;
  }
  return { title: "Missing number", lines: [text], ask: `What number goes in the ${BOX}?`, answer };
}

function shapes(level) {
  const [a, b, c] = SYMBOLS[randInt(0, SYMBOLS.length - 1)];
  const A = randInt(2, 4 + level);
  const B = randInt(1, 3 + level);
  const C = randInt(1, 3 + level);
  if (level >= 12) {
    return {
      title: "Shape logic",
      lines: [`${a} + ${a} + ${a} = ${3 * A}`, `${a} + ${b} + ${b} = ${A + 2 * B}`, `${b} + ${c} = ${B + C}`],
      ask: `${c} = ?`,
      answer: C,
    };
  }
  if (level >= 6) {
    return {
      title: "Shape logic",
      lines: [`${a} + ${a} + ${a} = ${3 * A}`, `${a} + ${b} + ${b} = ${A + 2 * B}`],
      ask: `${b} = ?`,
      answer: B,
    };
  }
  return { title: "Shape logic", lines: [`${a} + ${a} = ${2 * A}`, `${a} + ${b} = ${A + B}`], ask: `${b} = ?`, answer: B };
}

function makeQuestion(level, seen) {
  const kinds = [pattern, missing];
  if (level >= 3) kinds.push(shapes);
  let q;
  let sig;
  let tries = 0;
  do {
    q = kinds[randInt(0, kinds.length - 1)](level);
    sig = q.lines.join("|") + q.ask;
  } while (seen.has(sig) && tries++ < 30);
  seen.add(sig);
  return { ...q, key: `${sig}-${Math.random()}`, choices: makeTrickyChoices(q.answer, level) };
}

// 26s at level 3 shrinking to a 12s floor; patterns and shape clues need a bit longer.
const timeFor = (level, q) => {
  const base = secondsFor(level, 26, 12, 2);
  return base ? base + (q.title === "Missing number" ? 0 : 4) : 0;
};

function PuzzlePlay({ level, onFinish, onExit }) {
  const { tally, round, q, picked, verdict, locked, pick, timeLeft, totalTime } = useQuizRound({
    level, makeQuestion, onFinish, timeFor,
  });

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={10} />
      {totalTime > 0 && <TimerBar timeLeft={timeLeft} totalTime={totalTime} />}

      <div key={q.key} className="mp-card">
        <span className="mp-tag">
          <Puzzle size={13} aria-hidden="true" /> {q.title}
        </span>
        {q.lines.map((line, i) => (
          <span key={i} className="mp-line">{line}</span>
        ))}
        <span className="mp-ask">{q.ask}</span>
      </div>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <ChoiceGrid choices={q.choices} answer={q.answer} picked={picked} locked={locked} onPick={pick} />
    </div>
  );
}

export default function MathsPuzzle() {
  return (
    <LevelShell
      gameType="PUZZLE"
      title="Maths Puzzle"
      blurb="Crack patterns and missing numbers. Clear 70%+ to unlock the next level."
      icon={Puzzle}
      color="#6A4DE0"
      hint="The levels never stop. Numbers grow, the countdown (from level 3) gets shorter, and new puzzle types keep joining the mix: alternating steps, Fibonacci, cubes, brackets, balanced equations, percentages and bigger shape clues."
      Play={PuzzlePlay}
    />
  );
}

const CSS = `
.mp-card {
  display: flex; flex-direction: column; align-items: center; gap: .55rem; padding: 1.4rem 1rem; border-radius: 20px;
  border: 1.5px solid var(--divider); background: var(--surface);
  animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both;
}
.mp-tag { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .65rem; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--ax); background: color-mix(in srgb, var(--ax) 12%, transparent); }
.mp-line { font-family: 'Sora', system-ui, sans-serif; font-size: clamp(1.2rem, 5.6vw, 1.9rem); font-weight: 700; text-align: center; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
.mp-ask { font-size: 13.5px; font-weight: 600; color: var(--dim); }
`;