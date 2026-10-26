import { useState, useEffect, useRef } from "react";
import { PartyPopper, Timer } from "lucide-react";
import LevelShell, {
  ROUNDS, randInt, makeChoices, useTally, useLater, prefersReducedMotion,
  PlayHeader, RoundDots, VerdictSlot, correctLabel,
} from "./ArcadeShared";

/**
 * Balloon Maths — addition.
 * Four balloons float up, each carrying a number. Pop the one that answers
 * the sum before they escape off the top. One pop per question.
 * People who prefer reduced motion get a static row of balloons with no
 * escape timer instead of floating ones.
 */

const COLORS = ["#4F80F8", "#8B73F5", "#E2725B", "#16A394", "#D98A1F", "#E0559A"];
const SLOTS = [4, 27, 50, 73]; // % from the left, one per balloon

const riseSeconds = (level) => Math.max(5, 10 - Math.floor(level / 3));

function makeQuestion(level, seen) {
  const max = 8 + level * 4;
  let a, b, sig;
  let tries = 0;
  do {
    a = randInt(1, max);
    b = randInt(1, max);
    sig = `${a}+${b}`;
  } while (seen.has(sig) && tries++ < 30);
  seen.add(sig);
  const answer = a + b;
  const offset = randInt(0, COLORS.length - 1);
  const dur = riseSeconds(level);
  const balloons = makeChoices(answer, 4, Math.max(3, Math.round(max / 4))).map((value, i) => ({
    value,
    left: SLOTS[i] + randInt(-2, 3),
    delay: Math.random() * 0.9,
    dur: dur * (0.92 + Math.random() * 0.16),
    sway: randInt(8, 22) * (Math.random() < 0.5 ? -1 : 1),
    color: COLORS[(i + offset) % COLORS.length],
  }));
  const escapeMs = Math.max(...balloons.map((x) => (x.delay + x.dur) * 1000)) + 200;
  return { key: `${sig}-${Math.random()}`, text: `${a} + ${b}`, answer, balloons, escapeMs };
}

function BalloonPlay({ level, onFinish, onExit }) {
  const tally = useTally();
  const later = useLater();
  const seen = useRef(new Set());
  const reduced = useRef(prefersReducedMotion());
  const roundRef = useRef(1);
  const qRef = useRef(null);
  const lockRef = useRef(false);
  const escapeRef = useRef(null);
  const dots = useRef([]);

  const [round, setRound] = useState(1);
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null); // number | "escaped" | null
  const [verdict, setVerdict] = useState(null);

  function beginRound() {
    window.clearTimeout(escapeRef.current);
    const next = makeQuestion(level, seen.current);
    qRef.current = next;
    lockRef.current = false;
    setQ(next);
    setPicked(null);
    setVerdict(null);
    // Reduced-motion players get all the time they need.
    if (!reduced.current) {
      escapeRef.current = window.setTimeout(() => commit(null), next.escapeMs);
    }
  }

  useEffect(() => {
    beginRound();
    return () => window.clearTimeout(escapeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance() {
    if (roundRef.current >= ROUNDS) {
      const snap = tally.snapshot();
      onFinish({ correct: snap.correct, total: ROUNDS, score: snap.score, bestStreak: snap.best, dots: [...dots.current] });
      return;
    }
    roundRef.current += 1;
    setRound(roundRef.current);
    beginRound();
  }

  function commit(value) {
    if (lockRef.current || !qRef.current) return;
    lockRef.current = true;
    window.clearTimeout(escapeRef.current);
    const answer = qRef.current.answer;
    const ok = value !== null && value === answer;
    const gained = tally.record(ok);
    dots.current.push(ok);
    setPicked(value === null ? "escaped" : value);
    if (ok) setVerdict({ ok, text: correctLabel(gained) });
    else if (value === null) setVerdict({ ok, text: `They floated away \u2014 it was ${answer}` });
    else setVerdict({ ok, text: `Not quite \u2014 it's ${answer}` });
    later(advance, 1000);
  }

  if (!q) return null;
  const locked = picked !== null;

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={ROUNDS} />

      <div key={`q-${q.key}`} className="bm-question">
        <span className="bm-expr">{q.text}</span>
        <span className="bm-eq">= ?</span>
      </div>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <div key={q.key} className={`bm-sky ${locked ? "bm-frozen" : ""}`}>
        {q.balloons.map((b) => {
          const isAnswer = b.value === q.answer;
          const state = !locked ? "" : isAnswer ? "bm-ok" : b.value === picked ? "bm-bad" : "bm-dim";
          return (
            <div
              key={b.value}
              className="bm-float"
              style={{ left: `${b.left}%`, "--dur": `${b.dur}s`, "--delay": `${b.delay}s`, "--sway": `${b.sway}px` }}
            >
              <button
                type="button"
                className={`bm-balloon ${state}`}
                disabled={locked}
                onClick={() => commit(b.value)}
                aria-label={`Balloon ${b.value}`}
                style={{ background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${b.color} 55%, white), ${b.color})` }}
              >
                {b.value}
              </button>
            </div>
          );
        })}
      </div>

      <p className="bm-tip">
        {reduced.current ? (
          "Tap the balloon with the answer."
        ) : (
          <>
            <Timer size={12} aria-hidden="true" /> Pop it before the balloons float away.
          </>
        )}
      </p>
    </div>
  );
}

export default function BalloonMaths() {
  return (
    <LevelShell
      gameType="BALLOON"
      title="Balloon Maths"
      blurb="Pop the balloon that holds the answer. Clear 70%+ to unlock the next level."
      icon={PartyPopper}
      color="#E0559A"
      hint="Addition with bigger numbers every level. The balloons rise a little faster as you climb."
      Play={BalloonPlay}
    />
  );
}

const CSS = `
.bm-question {
  display: flex; align-items: baseline; justify-content: center; gap: .8rem; flex-wrap: wrap;
  padding: 1.2rem 1rem; border-radius: 20px; border: 1.5px solid var(--divider); background: var(--surface);
}
.bm-expr { font-family: 'Sora', system-ui, sans-serif; font-size: 2.2rem; font-weight: 700; color: var(--text); }
.bm-eq { font-family: 'Sora', system-ui, sans-serif; font-size: 1.8rem; font-weight: 700; color: var(--dim); }

.bm-sky {
  --rise: -29rem;
  position: relative; height: 22rem; overflow: hidden; border-radius: 20px; border: 1.5px solid var(--divider);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ax) 12%, var(--surface)), var(--surface));
}
.bm-float { position: absolute; bottom: -6rem; animation: bm-rise var(--dur) linear var(--delay) both; }
.bm-balloon {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 3.7rem; height: 4.4rem; border: none; cursor: pointer; padding: 0;
  border-radius: 50% 50% 50% 50% / 58% 58% 42% 42%;
  font-family: 'Sora', system-ui, sans-serif; font-size: 1.2rem; font-weight: 800; color: #FFFFFF;
  text-shadow: 0 1px 3px rgba(0,0,0,.5);
  box-shadow: inset -5px -7px 12px rgba(0,0,0,.18), 0 10px 18px -10px rgba(0,0,0,.4);
  transition: opacity 200ms ease, transform 200ms ease;
}
.bm-balloon::after {
  content: ""; position: absolute; top: 100%; left: 50%; width: 1.5px; height: 2.4rem;
  background: color-mix(in srgb, var(--dim) 70%, transparent);
}
.bm-balloon:hover:not(:disabled) { transform: scale(1.06); }
.bm-balloon:disabled { cursor: default; }
.bm-frozen .bm-float { animation-play-state: paused; }
.bm-ok { animation: bm-pop 420ms cubic-bezier(.22,1,.36,1) both; box-shadow: 0 0 0 4px #16A394, 0 0 22px 4px color-mix(in srgb, #16A394 55%, transparent); }
.bm-bad { animation: ax-shake 380ms ease; opacity: .55; }
.bm-dim { opacity: .35; }
.bm-tip { display: flex; align-items: center; justify-content: center; gap: .35rem; margin: 0; font-size: 12px; color: var(--dim); }

@keyframes bm-rise {
  0% { transform: translate(0, 0); opacity: 0; }
  6% { opacity: 1; }
  50% { transform: translate(var(--sway), calc(var(--rise) * .5)); }
  100% { transform: translate(0, var(--rise)); opacity: 1; }
}
@keyframes bm-pop { 0% { transform: scale(1); } 45% { transform: scale(1.22); } 100% { transform: scale(1.1); } }

@media (prefers-reduced-motion: reduce) {
  .ax-root .bm-sky { height: auto; display: flex; flex-wrap: wrap; justify-content: center; gap: 1.2rem 1rem; padding: 1.5rem 1rem 3.5rem; }
  .ax-root .bm-float { position: static; animation: none !important; opacity: 1; }
}

@media (max-width: 380px) { .bm-balloon { width: 3.2rem; height: 3.9rem; font-size: 1.05rem; } }
`;