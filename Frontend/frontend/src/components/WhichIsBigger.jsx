import { useState, useEffect, useRef } from "react";
import { Scale } from "lucide-react";
import LevelShell, {
  ROUNDS, randInt, useTally, useLater,
  PlayHeader, RoundDots, TimerBar, VerdictSlot, correctLabel,
} from "./ArcadeShared";

/**
 * Which Is Bigger? — comparison.
 *  Levels 1-3   two plain numbers
 *  Levels 4+    sums and differences, and sometimes both sides are equal
 *  Levels 5+    some questions flip to "Which is smaller?"
 *  Levels 7+    products join the mix
 * The question type is spelled out in large type on every round so it can't
 * be missed. After answering, both sides show their value.
 */

const MINUS = "\u2212";
const TIMES = "\u00D7";

function factorPairs(v) {
  const out = [];
  for (let f = 2; f * f <= v; f++) if (v % f === 0) out.push([f, v / f]);
  return out;
}

/** An expression whose value is exactly v. */
function makeExpr(v, plain, level) {
  if (plain) return { text: String(v), value: v };
  const kinds = ["sub"];
  if (v >= 2) kinds.push("add");
  if (level >= 7 && factorPairs(v).length) kinds.push("mul");
  const kind = kinds[randInt(0, kinds.length - 1)];
  if (kind === "add") {
    const a = randInt(1, v - 1);
    return { text: `${a} + ${v - a}`, value: v };
  }
  if (kind === "mul") {
    const pairs = factorPairs(v);
    const [f, g] = pairs[randInt(0, pairs.length - 1)];
    return { text: `${f} ${TIMES} ${g}`, value: v };
  }
  const k = randInt(1, Math.max(3, Math.floor(v / 2)));
  return { text: `${v + k} ${MINUS} ${k}`, value: v };
}

function makeQuestion(level) {
  const plain = level <= 3;
  const hi = 12 + level * 8;
  const mode = level >= 5 && Math.random() < 0.4 ? "smaller" : "bigger";
  let A, B;
  let tries = 0;
  do {
    const v = randInt(4, hi);
    const same = !plain && Math.random() < 0.2;
    let w = v;
    if (!same) {
      const span = plain ? Math.max(3, Math.round(hi / 3)) : Math.max(1, 6 - Math.floor(level / 3));
      w = v + (Math.random() < 0.5 ? -1 : 1) * randInt(1, span);
      if (w < 1) w = v + randInt(1, span);
    }
    A = makeExpr(v, plain, level);
    B = makeExpr(w, plain, level);
  } while (A.text === B.text && tries++ < 20);

  const diff = A.value - B.value;
  let answer = "same";
  if (diff !== 0) answer = (mode === "bigger" ? diff > 0 : diff < 0) ? "left" : "right";
  return { key: `${A.text}|${B.text}|${Math.random()}`, A, B, mode, answer, plain };
}

const timeFor = (level) => (level <= 3 ? 8 : Math.max(5, 11 - Math.floor(level / 3)));

function BiggerPlay({ level, onFinish, onExit }) {
  const tally = useTally();
  const later = useLater();
  const roundRef = useRef(1);
  const dots = useRef([]);

  const [round, setRound] = useState(1);
  const [q, setQ] = useState(() => makeQuestion(level));
  const [picked, setPicked] = useState(null); // "left" | "right" | "same" | "timeout" | null
  const [verdict, setVerdict] = useState(null);
  const [timeLeft, setTimeLeft] = useState(() => timeFor(level));
  const totalTime = timeFor(level);
  const locked = picked !== null;

  function advance() {
    if (roundRef.current >= ROUNDS) {
      const snap = tally.snapshot();
      onFinish({ correct: snap.correct, total: ROUNDS, score: snap.score, bestStreak: snap.best, dots: [...dots.current] });
      return;
    }
    roundRef.current += 1;
    setRound(roundRef.current);
    setQ(makeQuestion(level));
    setPicked(null);
    setVerdict(null);
    setTimeLeft(timeFor(level));
  }

  function answer(choice) {
    if (locked) return;
    const ok = choice === q.answer;
    const gained = tally.record(ok);
    dots.current.push(ok);
    setPicked(choice);
    const word = q.mode === "bigger" ? "bigger" : "smaller";
    const truth =
      q.answer === "same"
        ? "They're the same"
        : `${q.answer === "left" ? q.A.text : q.B.text} is ${word}`;
    if (ok) setVerdict({ ok, text: correctLabel(gained) });
    else if (choice === "timeout") setVerdict({ ok, text: `Time's up \u2014 ${truth}` });
    else setVerdict({ ok, text: `Not quite \u2014 ${truth}` });
    later(advance, 1300);
  }

  // Countdown: one tick a second; at zero the question counts as missed.
  useEffect(() => {
    if (locked) return undefined;
    if (timeLeft <= 0) {
      answer("timeout");
      return undefined;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, locked, q]);

  // Left / Right arrows, and S (or Down) for "same".
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") answer("left");
      else if (e.key === "ArrowRight") answer("right");
      else if (!q.plain && (e.key === "ArrowDown" || e.key.toLowerCase() === "s")) answer("same");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, picked]);

  const stateFor = (side) => {
    if (!locked) return "";
    if (q.answer === side) return "wb-ok";
    if (picked === side) return "wb-bad";
    return "wb-dim";
  };

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={ROUNDS} />
      <TimerBar timeLeft={timeLeft} totalTime={totalTime} />

      <h3 key={`p-${q.key}`} className={`wb-prompt ${q.mode === "smaller" ? "wb-prompt-smaller" : ""}`}>
        Which is {q.mode}?
      </h3>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <div key={q.key} className="wb-pair">
        {["left", "right"].map((side) => {
          const item = side === "left" ? q.A : q.B;
          return (
            <button key={side} type="button" className={`wb-card ${stateFor(side)}`} disabled={locked} onClick={() => answer(side)}>
              <span className="wb-text">{item.text}</span>
              {locked && !q.plain && <span className="wb-value">= {item.value}</span>}
            </button>
          );
        })}
      </div>

      {!q.plain && (
        <button type="button" className={`wb-same ${stateFor("same")}`} disabled={locked} onClick={() => answer("same")}>
          They&rsquo;re the same
        </button>
      )}
    </div>
  );
}

export default function WhichIsBigger() {
  return (
    <LevelShell
      gameType="BIGGER"
      title="Which Is Bigger?"
      blurb="Compare two numbers or sums, fast. Clear 70%+ to unlock the next level."
      icon={Scale}
      color="#D98A1F"
      hint="Levels 1\u20133 compare plain numbers. From level 4, sums and differences (sometimes equal). From level 5, watch for 'smaller'. From level 7, products too."
      Play={BiggerPlay}
    />
  );
}

const CSS = `
.wb-prompt { margin: .4rem 0 0; text-align: center; font-family: 'Sora', system-ui, sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--text); animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both; }
.wb-prompt-smaller { color: #8B73F5; }

.wb-pair { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; animation: ax-fade-up 260ms cubic-bezier(.22,1,.36,1) both; }
.wb-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3rem; min-height: 8.5rem; padding: 1rem .5rem;
  border-radius: 18px; border: 2px solid var(--divider); background: var(--surface); cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
}
.wb-card:hover:not(:disabled) { transform: translateY(-3px); border-color: var(--ax); }
.wb-card:disabled { cursor: default; }
.wb-text { font-family: 'Sora', system-ui, sans-serif; font-size: clamp(1.4rem, 6vw, 2rem); font-weight: 700; color: var(--text); white-space: nowrap; }
.wb-value { font-size: 13px; font-weight: 700; color: var(--muted); }

.wb-same {
  padding: .85rem 1rem; border-radius: 14px; border: 2px dashed var(--divider); background: transparent;
  font-size: 14.5px; font-weight: 700; color: var(--muted); cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}
.wb-same:hover:not(:disabled) { color: var(--ax); border-color: var(--ax); }
.wb-same:disabled { cursor: default; }

.wb-ok { border-color: #16A394; background: color-mix(in srgb, #16A394 16%, var(--bg)); }
.wb-ok .wb-text { color: #0F8A7C; }
.wb-bad { border-color: #E2725B; background: color-mix(in srgb, #E2725B 14%, var(--bg)); animation: ax-shake 380ms ease; }
.wb-bad .wb-text { color: #C2432B; }
.wb-dim { opacity: .5; }
`;