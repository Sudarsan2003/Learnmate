import { useState, useEffect, useRef } from "react";
import { Car } from "lucide-react";
import LevelShell, {
  ROUNDS, randInt, makeChoices, useTally, useLater,
  PlayHeader, RoundDots, VerdictSlot, correctLabel,
} from "./ArcadeShared";

/**
 * Maths Race — addition & subtraction.
 * Ten questions, three answers each. A right answer speeds your car a full
 * step forward; a wrong one only nudges it. "Turbo" drives at a steady pace
 * that gets quicker every level. The level itself is cleared on accuracy
 * (70%+) like every other game; beating Turbo is the bonus line on the summary.
 */

const BOT_NAME = "Turbo";
const WRONG_STEP = 0.3;

// ms per step for the bot — level 1 is gentle, faster up to a floor.
const botInterval = (level) => Math.max(2400, 6200 - level * 220);

function makeQuestion(level, seen) {
  const max = 10 + level * 6;
  let a, b, op, sig;
  let tries = 0;
  do {
    op = level >= 3 && Math.random() < 0.5 ? "sub" : "add";
    a = randInt(1, max);
    b = randInt(1, max);
    if (op === "sub" && b > a) [a, b] = [b, a];
    sig = `${op}:${a}:${b}`;
  } while (seen.has(sig) && tries++ < 30);
  seen.add(sig);
  const answer = op === "add" ? a + b : a - b;
  return {
    key: `${sig}-${Math.random()}`,
    text: `${a} ${op === "add" ? "+" : "\u2212"} ${b}`,
    answer,
    choices: makeChoices(answer, 3, Math.max(3, Math.round(max / 5))),
  };
}

function Lane({ name, pos, mine }) {
  return (
    <div className="rc-lane">
      <span className="rc-lane-name">{name}</span>
      <div className="rc-road">
        <span className={`rc-car ${mine ? "rc-car-me" : "rc-car-bot"}`} style={{ left: `calc((100% - 1.9rem) * ${pos / ROUNDS})` }}>
          <Car size={18} />
        </span>
      </div>
    </div>
  );
}

function RacePlay({ level, onFinish, onExit }) {
  const tally = useTally();
  const later = useLater();
  const seen = useRef(new Set());
  const roundRef = useRef(1);
  const meRef = useRef(0);
  const botRef = useRef(0);
  const dots = useRef([]);

  const [round, setRound] = useState(1);
  const [q, setQ] = useState(() => makeQuestion(level, seen.current));
  const [picked, setPicked] = useState(null);
  const [verdict, setVerdict] = useState(null); // { ok, text }
  const [me, setMe] = useState(0);
  const [bot, setBot] = useState(0);

  const locked = picked !== null;

  // The bot drives on its own clock, slightly irregular so it feels alive.
  useEffect(() => {
    const base = botInterval(level);
    let id;
    const tick = () => {
      botRef.current = Math.min(ROUNDS, botRef.current + 1);
      setBot(botRef.current);
      if (botRef.current < ROUNDS) id = window.setTimeout(tick, base * (0.75 + Math.random() * 0.5));
    };
    id = window.setTimeout(tick, base);
    return () => window.clearTimeout(id);
  }, [level]);

  function advance() {
    if (roundRef.current >= ROUNDS) {
      const snap = tally.snapshot();
      const beat = meRef.current >= botRef.current;
      onFinish({
        correct: snap.correct,
        total: ROUNDS,
        score: snap.score,
        bestStreak: snap.best,
        dots: [...dots.current],
        note: beat ? `You beat ${BOT_NAME} to the flag!` : `${BOT_NAME} crossed the line first \u2014 answer faster next time.`,
      });
      return;
    }
    roundRef.current += 1;
    setRound(roundRef.current);
    setQ(makeQuestion(level, seen.current));
    setPicked(null);
    setVerdict(null);
  }

  function pick(choice) {
    if (locked) return;
    const ok = choice === q.answer;
    const gained = tally.record(ok);
    dots.current.push(ok);
    meRef.current = Math.min(ROUNDS, meRef.current + (ok ? 1 : WRONG_STEP));
    setMe(meRef.current);
    setPicked(choice);
    setVerdict(ok ? { ok, text: correctLabel(gained) } : { ok, text: `Not quite \u2014 it's ${q.answer}` });
    later(advance, ok ? 550 : 1000);
  }

  // 1 / 2 / 3 pick the matching answer.
  useEffect(() => {
    const onKey = (e) => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0 && q.choices[i] !== undefined) pick(q.choices[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, picked]);

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={ROUNDS} />

      <div className="rc-track" aria-hidden="true">
        <Lane name="You" pos={me} mine />
        <Lane name={BOT_NAME} pos={bot} />
      </div>
      <p className="ax-sr" aria-live="polite">
        {me >= bot ? "You are in the lead." : `${BOT_NAME} is in the lead.`}
      </p>

      <div key={q.key} className="rc-question">
        <span className="rc-expr">{q.text}</span>
        <span className="rc-eq">= ?</span>
      </div>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <div className="rc-choices">
        {q.choices.map((c, i) => {
          const state = !locked ? "" : c === q.answer ? "rc-choice-ok" : c === picked ? "rc-choice-bad" : "rc-choice-dim";
          return (
            <button key={c} type="button" className={`rc-choice ${state}`} disabled={locked} onClick={() => pick(c)}>
              <span className="rc-choice-key" aria-hidden="true">{i + 1}</span>
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MathsRace() {
  return (
    <LevelShell
      gameType="RACE"
      title="Maths Race"
      blurb={`Answer fast to outrun ${BOT_NAME}. Clear 70%+ to unlock the next level.`}
      icon={Car}
      color="#E2725B"
      hint="Levels 1\u20132 are addition. From level 3, subtraction joins in. The numbers grow and Turbo speeds up every level."
      Play={RacePlay}
    />
  );
}

const CSS = `
.rc-track { display: flex; flex-direction: column; gap: .5rem; padding: .8rem .9rem; border-radius: 16px; border: 1.5px solid var(--divider); background: var(--surface); }
.rc-lane { display: flex; align-items: center; gap: .7rem; }
.rc-lane-name { width: 3.2rem; font-size: 12px; font-weight: 700; color: var(--muted); }
.rc-road {
  position: relative; flex: 1; height: 2.1rem; border-radius: 999px;
  background: repeating-linear-gradient(90deg, var(--divider) 0 14px, transparent 14px 26px) center / 100% 2px no-repeat;
}
.rc-car { position: absolute; top: 50%; display: flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: 999px; transform: translateY(-50%); transition: left 520ms cubic-bezier(.22,1,.36,1); }
.rc-car-me { color: #FFFFFF; background: var(--ax); box-shadow: 0 6px 12px -6px color-mix(in srgb, var(--ax) 70%, transparent); }
.rc-car-bot { color: var(--muted); background: var(--divider); }
.rc-road::after { content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 6px; border-radius: 3px; background: repeating-conic-gradient(var(--text) 0 25%, transparent 0 50%) 0 0 / 6px 6px; opacity: .55; }

.rc-question {
  display: flex; align-items: baseline; justify-content: center; gap: .8rem; flex-wrap: wrap;
  padding: 1.8rem 1rem; border-radius: 20px; border: 1.5px solid var(--divider); background: var(--surface);
  animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both;
}
.rc-expr { font-family: 'Sora', system-ui, sans-serif; font-size: 2.4rem; font-weight: 700; color: var(--text); }
.rc-eq { font-family: 'Sora', system-ui, sans-serif; font-size: 2rem; font-weight: 700; color: var(--dim); }

.rc-choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: .6rem; }
.rc-choice {
  position: relative; height: 4rem; border-radius: 14px; border: 1.5px solid var(--divider); background: var(--surface);
  font-family: 'Sora', system-ui, sans-serif; font-size: 1.4rem; font-weight: 700; color: var(--text); cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}
.rc-choice:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--ax); }
.rc-choice:disabled { cursor: default; }
.rc-choice-key { position: absolute; top: .35rem; left: .5rem; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 10.5px; font-weight: 600; color: var(--dim); }
.rc-choice-ok { border-color: #16A394; background: color-mix(in srgb, #16A394 16%, var(--bg)); color: #0F8A7C; }
.rc-choice-bad { border-color: #E2725B; background: color-mix(in srgb, #E2725B 14%, var(--bg)); color: #C2432B; animation: ax-shake 380ms ease; }
.rc-choice-dim { opacity: .45; }

@media (max-width: 380px) { .rc-expr { font-size: 2rem; } }
`;