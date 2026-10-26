import { Search } from "lucide-react";
import LevelShell, { randInt, shuffle, PlayHeader, RoundDots, TimerBar, VerdictSlot } from "./ArcadeShared";
import { ChoiceGrid, useQuizRound, makeTrickyChoices, secondsFor } from "./ArcadeChoices";

/**
 * Maths Detective — word problems. No top level: the numbers in each case keep
 * growing and new kinds of case keep unlocking. Each round picks at random
 * from every case type available at that level.
 *
 *  1 gain and lose     2 equal groups     3 sharing       4 two-step trails
 *  5 secret number     6 money            7 ages          8 speed and distance
 *  9 fractions        10 time            11 garden fencing / grass
 * 12 percentages      14 averages        16 consecutive numbers
 * 18 ratios           20 three-step secret numbers
 *
 * The countdown starts at level 3 (32s) and shrinks by a second per level down
 * to 18s, plus a little extra reading time for long cases.
 */

const NAMES = ["Ravi", "Priya", "Asha", "Kabir", "Meera", "Arjun", "Diya", "Rohan", "Ishaan", "Anaya"];
const THINGS = ["marbles", "stickers", "pencils", "coins", "cards", "books", "stamps", "shells"];
const PERCENTS = [10, 20, 25, 50];
const FRACTION_PARTS = [2, 3, 4, 5, 8, 10];

const pick = (list) => list[randInt(0, list.length - 1)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rupee = (n) => `\u20B9${Number(n).toLocaleString("en-IN")}`;

const TEMPLATES = [
  { min: 1, make(L) {
    const half = Math.max(3, Math.round((10 + L * 8) / 2));
    const n = pick(NAMES);
    const t = pick(THINGS);
    const a = randInt(10, 10 + L * 8);
    const b = randInt(2, half);
    const c = randInt(1, Math.min(a + b - 1, half));
    return { title: `The ${cap(t)} Case`,
      text: `${n} had ${a} ${t}. ${n} found ${b} more, then gave ${c} to a friend. How many ${t} does ${n} have now?`,
      answer: a + b - c };
  } },
  { min: 2, make(L) {
    const g = randInt(2, 3 + L);
    const e = randInt(2, 3 + L);
    const t = pick(THINGS);
    return { title: `The Missing ${cap(t)}`,
      text: `There are ${g} boxes with ${e} ${t} in each box. How many ${t} are there altogether?`, answer: g * e };
  } },
  { min: 3, make(L) {
    const p = randInt(2, 4 + Math.floor(L / 3));
    const e = randInt(2, 3 + L);
    const t = pick(THINGS);
    return { title: "The Sharing Case",
      text: `${e * p} ${t} are shared equally between ${p} friends. How many does each friend get?`, answer: e };
  } },
  { min: 4, make(L) {
    const g = randInt(2, 3 + L);
    const e = randInt(2, 3 + L);
    const n = pick(NAMES);
    const t = pick(THINGS);
    if (Math.random() < 0.5) {
      const x = randInt(2, 10 + L * 2);
      return { title: "The Two-Step Trail",
        text: `${n} packs ${g} bags with ${e} ${t} in each bag. Then ${n} finds ${x} loose ${t} on the floor. How many ${t} does ${n} have now?`,
        answer: g * e + x };
    }
    const x = randInt(1, Math.min(10 + L * 2, g * e - 1));
    return { title: "The Two-Step Trail",
      text: `${n} packs ${g} bags with ${e} ${t} in each bag. Then ${n} gives away ${x} ${t}. How many ${t} are left?`,
      answer: g * e - x };
  } },
  { min: 5, make(L) {
    const x = randInt(2, 6 + L);
    const m = randInt(2, 4 + Math.floor(L / 6));
    if (Math.random() < 0.5) {
      const k = randInt(1, 9 + L);
      return { title: "The Secret Number",
        text: `I am a secret number. Multiply me by ${m}, then add ${k}, and you get ${x * m + k}. What number am I?`, answer: x };
    }
    const k = randInt(1, Math.min(9 + L, x * m - 1));
    return { title: "The Secret Number",
      text: `I am a secret number. Multiply me by ${m}, then take away ${k}, and you get ${x * m - k}. What number am I?`, answer: x };
  } },
  { min: 6, make(L) {
    const n = pick(NAMES);
    const q = randInt(2, 4 + Math.floor(L / 3));
    const p = randInt(2, 10 + L);
    const total = q * p;
    const pay = (Math.floor(total / 10) + 1 + randInt(0, 3)) * 10;
    return { title: "The Shopping Trip",
      text: `${n} buys ${q} notebooks at ${rupee(p)} each and pays with ${rupee(pay)}. How much change does ${n} get back?`,
      answer: pay - total };
  } },
  { min: 7, make() {
    const [older, younger] = shuffle(NAMES);
    const y = randInt(3, 12);
    const m = randInt(2, 4);
    const askOlder = Math.random() < 0.4;
    return { title: "The Age Puzzle",
      text: `${older} is ${m} times as old as ${younger}. Together they are ${(m + 1) * y} years old. How old is ${askOlder ? older : younger}?`,
      answer: askOlder ? m * y : y };
  } },
  { min: 8, make(L) {
    const s = 5 * randInt(4, 8 + L);
    const t = randInt(2, 4 + Math.floor(L / 3));
    if (Math.random() < 0.5) {
      return { title: "The Runaway Train",
        text: `A train travels ${s} km every hour. How far does it go in ${t} hours?`, answer: s * t };
    }
    return { title: "The Runaway Train",
      text: `A bus covers ${s * t} km at ${s} km per hour. How many hours does the journey take?`, answer: t };
  } },
  { min: 9, make(L) {
    const d = pick(FRACTION_PARTS);
    const a = randInt(1, d - 1);
    const k = randInt(2, 4 + Math.floor(L / 2));
    const n = pick(NAMES);
    const t = pick(THINGS);
    const total = d * k;
    return { title: "The Fair Share",
      text: `${n} has ${total} ${t} and gives away ${a}/${d} of them. How many ${t} are left?`, answer: total - a * k };
  } },
  { min: 10, make(L) {
    const h = randInt(1, 3 + Math.floor(L / 8));
    const m = 5 * randInt(1, 11);
    const n = pick(NAMES);
    return { title: "The Clock Mystery",
      text: `${n} practises for ${h} ${h === 1 ? "hour" : "hours"} and ${m} minutes. How many minutes is that in total?`,
      answer: h * 60 + m };
  } },
  { min: 11, make(L) {
    const l = randInt(3, 6 + L);
    const w = randInt(2, 5 + L);
    if (Math.random() < 0.5) {
      return { title: "The Garden Fence",
        text: `A rectangular garden is ${l} m long and ${w} m wide. How many metres of fence go all the way around it?`,
        answer: 2 * (l + w) };
    }
    return { title: "The Garden Grass",
      text: `A rectangular garden is ${l} m long and ${w} m wide. How many square metres of grass cover it?`, answer: l * w };
  } },
  { min: 12, make(L) {
    const pct = pick(PERCENTS);
    const price = 20 * randInt(2, 4 + Math.floor(L / 2));
    return { title: "The Sale Sign",
      text: `A jacket costs ${rupee(price)}. The shop takes ${pct}% off. What does the jacket cost now?`,
      answer: price - (price * pct) / 100 };
  } },
  { min: 14, make(L) {
    const k = randInt(3, 5);
    const m = randInt(22, 30 + L * 2);
    const offsets = Array.from({ length: k - 1 }, () => randInt(-5, 5));
    offsets.push(-offsets.reduce((s, o) => s + o, 0));
    const scores = shuffle(offsets.map((o) => m + o));
    const n = pick(NAMES);
    return { title: "The Average Case",
      text: `${n} scored ${scores.join(", ")} in ${k} games. What was ${n}'s average score?`, answer: m };
  } },
  { min: 16, make(L) {
    const c = randInt(3, 4);
    const x = randInt(2, 8 + L * 2);
    const sum = c * x + (c * (c - 1)) / 2;
    return { title: "The Number Line-up",
      text: `The sum of ${c} consecutive whole numbers is ${sum}. What is the smallest of them?`, answer: x };
  } },
  { min: 18, make(L) {
    const a = randInt(2, 5);
    const b = a + randInt(1, 4);
    const k = randInt(2, 4 + Math.floor(L / 3));
    const t = pick(THINGS);
    return { title: "The Ratio Riddle",
      text: `The ratio of red to blue ${t} is ${a}:${b}. There are ${a * k} red ${t}. How many blue ${t} are there?`,
      answer: b * k };
  } },
  { min: 20, make(L) {
    const r = randInt(2, 6 + Math.floor(L / 5));
    const m = randInt(2, 4 + Math.floor(L / 8));
    const x = randInt(Math.ceil((r * m) / 2) + 1, Math.ceil((r * m) / 2) + 8 + L);
    const k = 2 * x - r * m;
    return { title: "The Secret Number II",
      text: `I think of a number, double it, take away ${k}, then divide by ${m}. The answer is ${r}. What was my number?`,
      answer: x };
  } },
];

function makeQuestion(level, seen) {
  const pool = TEMPLATES.filter((t) => t.min <= level);
  let q;
  let tries = 0;
  do {
    q = pick(pool).make(level);
  } while (seen.has(q.text) && tries++ < 30);
  seen.add(q.text);
  return { ...q, key: `${q.text}-${Math.random()}`, choices: makeTrickyChoices(q.answer, level) };
}

// 32s at level 3, one second less each level down to 18s, plus reading time for long cases.
const timeFor = (level, q) => {
  const base = secondsFor(level, 32, 18, 1);
  return base ? base + Math.round(q.text.length / 15) : 0;
};

function DetectivePlay({ level, onFinish, onExit }) {
  const { tally, round, q, picked, verdict, locked, pick: choose, timeLeft, totalTime } = useQuizRound({
    level, makeQuestion, onFinish, timeFor, holdBad: 1800,
  });

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={10} />
      {totalTime > 0 && <TimerBar timeLeft={timeLeft} totalTime={totalTime} />}

      <div key={q.key} className="md-case">
        <span className="md-tag">
          <Search size={13} aria-hidden="true" /> {q.title}
        </span>
        <p className="md-text">{q.text}</p>
      </div>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <ChoiceGrid choices={q.choices} answer={q.answer} picked={picked} locked={locked} onPick={choose} />
    </div>
  );
}

export default function MathsDetective() {
  return (
    <LevelShell
      gameType="DETECTIVE"
      title="Maths Detective"
      blurb="Read the case file and crack the answer. Clear 70%+ to unlock the next level."
      icon={Search}
      color="#8C6A3F"
      hint="The levels never stop. The numbers in each case grow, the countdown (from level 3) gets shorter, and new kinds of case keep arriving: money, ages, speed, fractions, percentages, averages, ratios and multi-step secret numbers. Read every clue."
      Play={DetectivePlay}
    />
  );
}

const CSS = `
.md-case {
  display: flex; flex-direction: column; align-items: flex-start; gap: .7rem; padding: 1.2rem 1.1rem; border-radius: 20px;
  border: 1.5px solid var(--divider); border-left: 5px solid var(--ax); background: var(--surface);
  animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both;
}
.md-tag { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .65rem; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--ax); background: color-mix(in srgb, var(--ax) 12%, transparent); }
.md-text { margin: 0; font-size: 1.02rem; line-height: 1.6; font-weight: 500; color: var(--text); }
`;