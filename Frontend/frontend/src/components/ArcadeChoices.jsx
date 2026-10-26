import { useState, useEffect, useRef } from "react";
import { ROUNDS, randInt, shuffle, makeChoices, useTally, useLater, correctLabel } from "./ArcadeShared";

/**
 * Shared plumbing for "pick one answer" games (Virtual Shop, Maths Puzzle,
 * Shape Builder, Maths Detective).
 */

export const TIMEOUT = "__timeout__";

/**
 * Seconds allowed per question, shrinking as the level climbs but never below
 * `floor`. Levels before `from` have no timer at all.
 *   secondsFor(level, 24, 12)  -> 24s at level 3, 23s at 5, ... 12s from level 27
 */
export function secondsFor(level, start, floor, every = 2, from = 3) {
  if (level < from) return 0;
  return Math.max(floor, start - Math.floor((level - from) / every));
}

/**
 * Four answers (or `count`). The wrong ones sit closer to the right answer
 * as the level rises, and from level 5 one of them is a classic slip
 * (off by one, or off by ten). Level 12+ gets two of those.
 */
export function makeTrickyChoices(answer, level, count = 4) {
  const base = Math.max(3, Math.round(Math.abs(answer) / 6));
  const spread = Math.max(2, Math.round(base * Math.max(0.3, 1 - level * 0.04)));
  if (level < 5) return makeChoices(answer, count, spread);

  const set = new Set([answer]);
  const slips = shuffle([answer + 1, answer - 1, answer + 10, answer - 10]).filter((v) => v >= 0);
  slips.slice(0, level >= 12 ? 2 : 1).forEach((v) => set.add(v));
  let guard = 0;
  while (set.size < count && guard++ < 80) {
    const d = randInt(1, Math.max(2, spread)) * (Math.random() < 0.5 ? -1 : 1);
    if (answer + d >= 0) set.add(answer + d);
  }
  let bump = 1;
  while (set.size < count) set.add(answer + bump++);
  return shuffle([...set]);
}

/**
 * The standard 10-round loop.
 *   makeQuestion(level, seenSet) -> { key, answer, choices, reveal?, ... }
 *   timeFor(level, question)     -> seconds (0 = no timer). Optional.
 * Finishes with the same onFinish payload the other arcade games send, so
 * LevelShell handles stars, unlocking and saving as usual.
 */
export function useQuizRound({ level, makeQuestion, onFinish, timeFor, holdOk = 700, holdBad = 1500 }) {
  const tally = useTally();
  const later = useLater();
  const seen = useRef(new Set());
  const roundRef = useRef(1);
  const dots = useRef([]);
  const lockRef = useRef(false);

  const first = useRef(null);
  if (first.current === null) {
    const fq = makeQuestion(level, seen.current);
    first.current = { q: fq, t: timeFor ? timeFor(level, fq) : 0 };
  }

  const [round, setRound] = useState(1);
  const [q, setQ] = useState(first.current.q);
  const [totalTime, setTotalTime] = useState(first.current.t);
  const [timeLeft, setTimeLeft] = useState(first.current.t);
  const [picked, setPicked] = useState(null);
  const [verdict, setVerdict] = useState(null); // { ok, text }

  function advance() {
    if (roundRef.current >= ROUNDS) {
      const snap = tally.snapshot();
      onFinish({ correct: snap.correct, total: ROUNDS, score: snap.score, bestStreak: snap.best, dots: [...dots.current] });
      return;
    }
    roundRef.current += 1;
    const next = makeQuestion(level, seen.current);
    const t = timeFor ? timeFor(level, next) : 0;
    setRound(roundRef.current);
    setQ(next);
    setTotalTime(t);
    setTimeLeft(t);
    setPicked(null);
    setVerdict(null);
    lockRef.current = false;
  }

  function pick(choice) {
    if (lockRef.current) return;
    lockRef.current = true;
    const ok = choice === q.answer;
    const gained = tally.record(ok);
    dots.current.push(ok);
    setPicked(choice);
    const shown = q.reveal ?? q.answer;
    setVerdict(
      ok
        ? { ok, text: correctLabel(gained) }
        : { ok, text: choice === TIMEOUT ? `Time's up \u2014 it's ${shown}` : `Not quite \u2014 it's ${shown}` }
    );
    later(advance, ok ? holdOk : holdBad);
  }

  // Countdown: one tick a second; at zero the question counts as missed.
  useEffect(() => {
    if (!totalTime || picked !== null) return undefined;
    if (timeLeft <= 0) {
      pick(TIMEOUT);
      return undefined;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, picked, q, totalTime]);

  return { tally, round, q, picked, verdict, locked: picked !== null, pick, timeLeft, totalTime };
}

/**
 * Answer buttons. Keys 1-4 pick the matching answer. `render(choice)` draws
 * the button face (defaults to the raw value); `label(choice)` is the
 * accessible name for faces that are pictures. `tall` gives picture answers
 * more room.
 */
export function ChoiceGrid({ choices, answer, picked, locked, onPick, render, label, columns = 2, tall = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (locked || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < choices.length) onPick(choices[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choices, locked, onPick]);

  return (
    <div className="cg-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      <style>{CSS}</style>
      {choices.map((c, i) => {
        const state = !locked ? "" : c === answer ? "cg-ok" : c === picked ? "cg-bad" : "cg-dim";
        return (
          <button
            key={String(c)}
            type="button"
            className={`cg-choice ${tall ? "cg-tall" : ""} ${state}`}
            disabled={locked}
            onClick={() => onPick(c)}
            aria-label={label ? label(c) : undefined}
          >
            <span className="cg-key" aria-hidden="true">{i + 1}</span>
            {render ? render(c) : c}
          </button>
        );
      })}
    </div>
  );
}

const CSS = `
.cg-grid { display: grid; gap: .6rem; }
.cg-choice {
  position: relative; display: flex; align-items: center; justify-content: center; min-height: 3.8rem; padding: .6rem .5rem;
  border-radius: 14px; border: 1.5px solid var(--divider); background: var(--surface);
  font-family: 'Sora', system-ui, sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--text); cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}
.cg-tall { min-height: 6.6rem; }
.cg-choice:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--ax); }
.cg-choice:disabled { cursor: default; }
.cg-key { position: absolute; top: .35rem; left: .5rem; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 10.5px; font-weight: 600; color: var(--dim); }
.cg-ok { border-color: #16A394; background: color-mix(in srgb, #16A394 16%, var(--bg)); color: #0F8A7C; }
.cg-bad { border-color: #E2725B; background: color-mix(in srgb, #E2725B 14%, var(--bg)); color: #C2432B; animation: ax-shake 380ms ease; }
.cg-dim { opacity: .45; }
`;