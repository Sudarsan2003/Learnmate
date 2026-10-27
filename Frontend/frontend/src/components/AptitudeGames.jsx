import { KeyRound, Shapes, Compass, Clock, Network, Armchair, ArrowLeftRight } from "lucide-react";
import LevelShell, { PlayHeader, RoundDots, TimerBar, VerdictSlot } from "./ArcadeShared";
import { ChoiceGrid, useQuizRound, secondsFor } from "./ArcadeChoices";
import {
  codeQuestion, oddQuestion, directionQuestion, clockQuestion, familyQuestion, seatingQuestion, analogyQuestion,
} from "./aptitudeQuestions";

/**
 * Aptitude games — the reasoning skills school aptitude tests check, beyond
 * arithmetic (number series already live in Maths Puzzle):
 *
 *   Code Cracker      coding–decoding (letter shifts, reversals, number codes, mirror alphabet)
 *   Odd One Out       classification (words, then numbers, then close categories)
 *   Direction Sense   facing, final direction and straight-line distance after a walk
 *   Clock & Calendar  elapsed time, days of the week and clock-hand angles
 *   Family Tree       blood relations from a chain of statements
 *   Seating           who sits where in a row, from clues with one solution
 *   Analogies         A : B :: C : ? with words, numbers and letters
 *
 * Each uses the shared arcade plumbing (LevelShell + useQuizRound), so levels,
 * stars, unlocking, timers, saving and leaderboards behave like the Arcade.
 * The questions themselves come from aptitudeQuestions.js; the list shown on
 * the Aptitude tab is in aptitudeList.js.
 */

/* ------------------------------------------------------------------ */
/* Shared play screen + the four games                                 */
/* ------------------------------------------------------------------ */

function makePlay(makeQuestion, timeFor) {
  return function AptitudePlay({ level, onFinish, onExit }) {
    const { tally, round, q, picked, verdict, locked, pick, timeLeft, totalTime } = useQuizRound({
      level, makeQuestion, onFinish, timeFor,
    });
    const columns = q.choices.some((c) => String(c).length > 12) ? 1 : 2;
    return (
      <div className="ax-play">
        <style>{CSS}</style>
        <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
        <RoundDots round={round} total={10} />
        {totalTime > 0 && <TimerBar timeLeft={timeLeft} totalTime={totalTime} />}

        <div key={q.key} className="apt-card">
          <span className="apt-tag">{q.title}</span>
          {q.lines.map((line, i) => (
            <span key={i} className={`apt-line ${q.compact || line.length > 40 ? "apt-line-long" : ""}`}>{line}</span>
          ))}
          <span className="apt-ask">{q.ask}</span>
        </div>

        <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

        <ChoiceGrid
          choices={q.choices}
          answer={q.answer}
          picked={picked}
          locked={locked}
          onPick={pick}
          columns={columns}
          render={(c) => <span className="apt-choice">{c}</span>}
        />
      </div>
    );
  };
}

// Reading a sentence takes longer than reading a sum, so these start generous.
const CodePlay = makePlay(codeQuestion, (level) => secondsFor(level, 30, 14));
const OddPlay = makePlay(oddQuestion, (level) => secondsFor(level, 22, 10));
const DirectionPlay = makePlay(directionQuestion, (level) => secondsFor(level, 34, 16));
const ClockPlay = makePlay(clockQuestion, (level) => secondsFor(level, 28, 14));
const FamilyPlay = makePlay(familyQuestion, (level) => secondsFor(level, 40, 20));
const SeatingPlay = makePlay(seatingQuestion, (level) => secondsFor(level, 75, 40));
const AnalogyPlay = makePlay(analogyQuestion, (level) => secondsFor(level, 22, 10));

export function CodeCracker() {
  return (
    <LevelShell
      gameType="CODE"
      title="Code Cracker"
      blurb="Work out the secret code, then use it on a new word. Clear 70%+ to unlock the next level."
      icon={KeyRound}
      color="#2F7DD3"
      hint="New codes join as you climb: bigger letter shifts (level 3), letter numbers (6), reversed words (8), alternating shifts (11) and the mirror alphabet, where A swaps with Z (14)."
      Play={CodePlay}
    />
  );
}

export function OddOneOut() {
  return (
    <LevelShell
      gameType="ODDONE"
      title="Odd One Out"
      blurb="Three of them share something. Find the one that doesn't."
      icon={Shapes}
      color="#C2558B"
      hint="Number groups join at level 4 (even numbers, multiples, then primes, squares and digit sums). From level 9 the groups get closer, like fruits versus vegetables."
      Play={OddPlay}
    />
  );
}

export function DirectionSense() {
  return (
    <LevelShell
      gameType="DIRECTION"
      title="Direction Sense"
      blurb="Follow the walk in your head and say where it ends."
      icon={Compass}
      color="#2E9A6B"
      hint="Start with which way someone is facing. From level 3, say where they ended up compared with the start; from level 6, how far away that is in a straight line. Walks get longer as you climb."
      Play={DirectionPlay}
    />
  );
}

export function ClockCalendar() {
  return (
    <LevelShell
      gameType="CLOCK"
      title="Clock & Calendar"
      blurb="Times, days of the week and clock-hand angles."
      icon={Clock}
      color="#C47A1E"
      hint="Hours first, then minutes (level 3), days of the week (5), clock angles on the hour (7) and at other times (10), and dates in a month (12)."
      Play={ClockPlay}
    />
  );
}

export function FamilyTree() {
  return (
    <LevelShell
      gameType="FAMILY"
      title="Family Tree"
      blurb="Follow the family links and name the relation."
      icon={Network}
      color="#7A5AC8"
      hint="Two-step relations first (sister, uncle, grandson). In-laws join at level 5, and from level 8 some questions chain three relations together."
      Play={FamilyPlay}
    />
  );
}

export function SeatingArrangement() {
  return (
    <LevelShell
      gameType="SEATING"
      title="Seating Arrangement"
      blurb="Use the clues to work out who sits where."
      icon={Armchair}
      color="#3B8C9E"
      hint="Three friends to start, four from level 4 and five from level 9. Every puzzle has exactly one seating that fits all the clues, so sketch the row as you read."
      Play={SeatingPlay}
    />
  );
}

export function Analogies() {
  return (
    <LevelShell
      gameType="ANALOGY"
      title="Analogies"
      blurb="Spot how the first pair is linked, then complete the second."
      icon={ArrowLeftRight}
      color="#B5603A"
      hint="Opposites and baby animals first, then homes, tools, capitals and units. Number pairs join at level 5 and letter pairs at level 10."
      Play={AnalogyPlay}
    />
  );
}

const CSS = `
.apt-card {
  display: flex; flex-direction: column; align-items: center; gap: .55rem; padding: 1.4rem 1rem; border-radius: 20px;
  border: 1.5px solid var(--divider); background: var(--surface);
  animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both;
}
.apt-tag { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .65rem; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--ax); background: color-mix(in srgb, var(--ax) 12%, transparent); }
.apt-line { font-family: 'Sora', system-ui, sans-serif; font-size: clamp(1.15rem, 5.2vw, 1.7rem); font-weight: 700; text-align: center; color: var(--text); overflow-wrap: anywhere; letter-spacing: .02em; }
.apt-line-long { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: clamp(1rem, 4vw, 1.15rem); font-weight: 600; line-height: 1.5; letter-spacing: 0; }
.apt-ask { font-size: 13.5px; font-weight: 600; color: var(--dim); text-align: center; }
.apt-choice { font-size: clamp(.95rem, 4vw, 1.15rem); overflow-wrap: anywhere; }
`;
