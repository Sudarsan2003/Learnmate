import { useState, useEffect, useRef, useCallback } from "react";
import {
  Trophy, RotateCcw, Flame, Delete, CornerDownLeft, Check, X as XIcon, Timer,
  Lock, Star, Loader2, ArrowLeft, Sparkles,
} from "lucide-react";
import Confetti, { isCelebrationScore } from "./Confetti";
import StarBalloonCelebration from "./StarBalloonCelebration";
import { getGameProgress, completeGameLevel } from "../api/client";

const ROUNDS = 10;
const PASS_RATIO = 0.7; // 70%+ correct clears the level

// Which operations are in play at a given level — introduces them
// gradually so early levels stay approachable, then everything's live.
// BODMAS (order-of-operations) expressions unlock at level 13.
function opsForLevel(level) {
  if (level <= 3) return ["add"];
  if (level <= 6) return ["add", "sub"];
  if (level <= 9) return ["add", "sub", "mul"];
  if (level <= 12) return ["add", "sub", "mul", "div"];
  return ["add", "sub", "mul", "div", "bodmas"];
}

// Number ranges grow every level with no ceiling, so there's always a
// harder version of the game waiting — this is what makes "unlimited
// levels" actually mean something instead of just a bigger level counter.
function rangesForLevel(level) {
  return {
    addMax: 10 + level * 7,
    mulMax: 4 + Math.floor(level / 2),
    divMax: 4 + Math.floor(level / 2),
  };
}

function timeForLevel(level) {
  return Math.max(6, 15 - Math.floor((level - 1) / 3));
}

const OP_META = {
  add: { symbol: "+", color: "#4F80F8" },
  sub: { symbol: "\u2212", color: "#2DD4BF" },
  mul: { symbol: "\u00D7", color: "#8B73F5" },
  div: { symbol: "\u00F7", color: "#E2A93B" },
};
const OP_COLOR = { "+": "#4F80F8", "\u2212": "#2DD4BF", "\u00D7": "#8B73F5", "\u00F7": "#E2A93B" };

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const num = (value) => ({ type: "num", value });
const opTok = (value) => ({ type: "op", value });
const parenTok = (value) => ({ type: "paren", value });

// Two-step expressions that test order of operations (multiply/divide
// before add/subtract), plus a couple of bracketed forms that override it.
// All results are kept non-negative so the numeric keypad still works.
function buildBodmasQuestion(ranges) {
  const small = Math.max(2, Math.min(ranges.mulMax, 12));
  const big = Math.max(5, Math.min(ranges.addMax, 40));
  const templates = ["addMul", "subMul", "mulAdd", "mulSub", "parenAddMul", "parenSubMul"];
  const t = templates[randInt(0, templates.length - 1)];
  let a, b, c, tokens, answer;

  switch (t) {
    case "addMul": {
      a = randInt(1, big); b = randInt(2, small); c = randInt(2, small);
      answer = a + b * c;
      tokens = [num(a), opTok("+"), num(b), opTok("\u00D7"), num(c)];
      break;
    }
    case "subMul": {
      b = randInt(2, small); c = randInt(2, small);
      const bc = b * c;
      a = bc + randInt(1, big);
      answer = a - bc;
      tokens = [num(a), opTok("\u2212"), num(b), opTok("\u00D7"), num(c)];
      break;
    }
    case "mulAdd": {
      a = randInt(2, small); b = randInt(2, small); c = randInt(1, big);
      answer = a * b + c;
      tokens = [num(a), opTok("\u00D7"), num(b), opTok("+"), num(c)];
      break;
    }
    case "mulSub": {
      a = randInt(2, small); b = randInt(2, small);
      const ab = a * b;
      c = randInt(1, Math.max(1, ab - 1));
      answer = ab - c;
      tokens = [num(a), opTok("\u00D7"), num(b), opTok("\u2212"), num(c)];
      break;
    }
    case "parenAddMul": {
      a = randInt(1, big); b = randInt(1, big); c = randInt(2, small);
      answer = (a + b) * c;
      tokens = [parenTok("("), num(a), opTok("+"), num(b), parenTok(")"), opTok("\u00D7"), num(c)];
      break;
    }
    case "parenSubMul":
    default: {
      b = randInt(1, big); a = b + randInt(1, big); c = randInt(2, small);
      answer = (a - b) * c;
      tokens = [parenTok("("), num(a), opTok("\u2212"), num(b), parenTok(")"), opTok("\u00D7"), num(c)];
      break;
    }
  }
  return { tokens, answer, op: "bodmas" };
}

function buildQuestion(op, ranges) {
  if (op === "bodmas") return buildBodmasQuestion(ranges);

  let a, b, answer, symbol;
  switch (op) {
    case "sub": {
      a = randInt(1, ranges.addMax);
      b = randInt(1, a);
      answer = a - b;
      symbol = OP_META.sub.symbol;
      break;
    }
    case "mul": {
      a = randInt(2, ranges.mulMax);
      b = randInt(2, ranges.mulMax);
      answer = a * b;
      symbol = OP_META.mul.symbol;
      break;
    }
    case "div": {
      b = randInt(2, ranges.divMax);
      answer = randInt(2, ranges.divMax);
      a = b * answer;
      symbol = OP_META.div.symbol;
      break;
    }
    case "add":
    default: {
      a = randInt(1, ranges.addMax);
      b = randInt(1, ranges.addMax);
      answer = a + b;
      symbol = OP_META.add.symbol;
      break;
    }
  }
  return { a, b, answer, symbol, op };
}

// Generates a question not seen yet this level attempt. Retries a bounded
// number of times before giving up and allowing a repeat — at higher levels
// the numeric range is huge so this basically never triggers past level ~2.
function generateUnseenQuestion(ops, ranges, seen) {
  const MAX_TRIES = 40;
  let q = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = ops[randInt(0, ops.length - 1)];
    const candidate = buildQuestion(op, ranges);
    const sig =
      candidate.op === "bodmas"
        ? `bodmas:${JSON.stringify(candidate.tokens)}`
        : `${candidate.op}:${candidate.a}:${candidate.b}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      q = candidate;
      break;
    }
    q = candidate; // fallback if we exhaust tries
  }
  return { ...q, key: `${Date.now()}-${Math.random()}` };
}

function starsFor(correct, total) {
  const acc = total > 0 ? correct / total : 0;
  if (acc >= 0.9) return 3;
  if (acc >= PASS_RATIO) return 2;
  if (acc >= 0.5) return 1;
  return 0;
}

const PATH_WINDOW = 10;

export default function MathGame() {
  const [phase, setPhase] = useState("loading"); // loading | select | playing | summary
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [starsByLevel, setStarsByLevel] = useState({});
  const [loadError, setLoadError] = useState(null);

  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(0);
  const [question, setQuestion] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null); // null | "correct" | "wrong" | "timeout"
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [history, setHistory] = useState([]);
  const [timeLeft, setTimeLeft] = useState(15);
  const [totalTime, setTotalTime] = useState(15);
  const [celebrate, setCelebrate] = useState(false);
  const [perfectClear, setPerfectClear] = useState(false);
  const [leveledUp, setLeveledUp] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  const timerRef = useRef(null);
  const lockRef = useRef(false);
  const seenRef = useRef(new Set());

  const loadProgress = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    try {
      const list = await getGameProgress();
      const mine = list.find((g) => g.gameType === "MATH");
      setUnlockedLevel(mine?.highestLevelUnlocked ?? 1);
      setStarsByLevel(mine?.starsByLevel ?? {});
      setPhase("select");
    } catch (err) {
      // Still let the student play level 1 offline-ish rather than being stuck.
      setLoadError(err.response?.data?.message ?? "Could not load your saved progress.");
      setUnlockedLevel(1);
      setPhase("select");
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const nextQuestion = useCallback((lvl) => {
    const ranges = rangesForLevel(lvl);
    const ops = opsForLevel(lvl);
    const q = generateUnseenQuestion(ops, ranges, seenRef.current);
    // BODMAS questions get extra time since they take a beat longer to read.
    const time = timeForLevel(lvl) + (q.op === "bodmas" ? 10 : 0);
    setQuestion(q);
    setInput("");
    setFeedback(null);
    setTimeLeft(time);
    setTotalTime(time);
    lockRef.current = false;
  }, []);

  function startLevel(lvl) {
    seenRef.current = new Set();
    setLevel(lvl);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setHistory([]);
    setRound(1);
    setLeveledUp(false);
    setSaveError(null);
    setPerfectClear(false);
    setPhase("playing");
    nextQuestion(lvl);
  }

  // Countdown per question
  useEffect(() => {
    if (phase !== "playing" || feedback) return undefined;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timerRef.current);
          commitAnswer(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question, feedback]);

  function commitAnswer(isTimeout) {
    if (lockRef.current || !question) return;
    lockRef.current = true;
    window.clearInterval(timerRef.current);

    const given = isTimeout ? null : parseInt(input, 10);
    const correct = !isTimeout && given === question.answer;

    setHistory((h) => [...h, { ...question, given, correct, timedOut: !!isTimeout }]);

    if (correct) {
      setScore((s) => s + 10);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
      setFeedback("correct");
    } else {
      setStreak(0);
      setFeedback(isTimeout ? "timeout" : "wrong");
    }

    window.setTimeout(() => {
      setRound((r) => {
        if (r >= ROUNDS) {
          finishLevel();
          return r;
        }
        nextQuestion(level);
        return r + 1;
      });
    }, 950);
  }

  async function finishLevel() {
    setPhase("summary");
    // history state may lag one tick behind the final commit — read fresh count
    setHistory((h) => {
      const correctCount = h.filter((x) => x.correct).length;
      const won = correctCount / ROUNDS >= PASS_RATIO;
      const stars = starsFor(correctCount, ROUNDS);
      setCelebrate(isCelebrationScore(correctCount, ROUNDS));
      setPerfectClear(stars === 3);

      setSaving(true);
      completeGameLevel({
        gameType: "MATH",
        level,
        won,
        score,
        stars,
        correctCount,
        totalCount: ROUNDS,
      })
        .then((res) => {
          setUnlockedLevel(res.highestLevelUnlocked);
          setStarsByLevel(res.starsByLevel ?? {});
          setLeveledUp(!!res.leveledUp);
        })
        .catch((err) => {
          setSaveError(err.response?.data?.message ?? "Couldn't save this result — it'll still show locally.");
        })
        .finally(() => setSaving(false));

      return h;
    });
  }

  function pressDigit(d) {
    if (feedback) return;
    setInput((v) => (v.length >= 7 ? v : v + d));
  }
  function pressBackspace() {
    if (feedback) return;
    setInput((v) => v.slice(0, -1));
  }
  function handleSubmit(e) {
    e?.preventDefault();
    if (!input || feedback) return;
    commitAnswer(false);
  }

  const accuracy = history.length
    ? Math.round((100 * history.filter((h) => h.correct).length) / history.length)
    : 0;
  const correctCount = history.filter((h) => h.correct).length;
  const won = correctCount / ROUNDS >= PASS_RATIO;

  /* ---------------------------------------------------------------- */

  if (phase === "loading") {
    return (
      <div className="mg-root mg-loading" aria-busy="true">
        <style>{CSS}</style>
        <Loader2 size={18} className="animate-spin" /> Loading your levels&hellip;
      </div>
    );
  }

  if (phase === "select") {
    const pathStart = Math.max(1, unlockedLevel - PATH_WINDOW + 4);
    const pips = Array.from({ length: PATH_WINDOW }, (_, i) => pathStart + i);
    return (
      <div className="mg-root">
        <style>{CSS}</style>
        <div className="mg-select">
          <div className="mg-select-head">
            <span className="mg-select-badge">
              <Trophy size={18} />
            </span>
            <div>
              <h2 className="mg-select-title">Math Adventure</h2>
              <p className="mg-select-sub">Pick a level &mdash; clear 70%+ to unlock the next one.</p>
            </div>
          </div>

          {loadError && <p className="mg-inline-warn">{loadError} Starting fresh from level 1.</p>}

          <div className="mg-level-path" role="list">
            {pips.map((l) => {
              const unlocked = l <= unlockedLevel;
              const stars = starsByLevel[l] ?? starsByLevel[String(l)] ?? null;
              return (
                <button
                  key={l}
                  type="button"
                  role="listitem"
                  disabled={!unlocked}
                  onClick={() => unlocked && startLevel(l)}
                  className={`mg-level-pip ${l === unlockedLevel ? "mg-level-pip-next" : ""} ${!unlocked ? "mg-level-pip-locked" : ""}`}
                >
                  {unlocked ? <span className="mg-level-pip-num">{l}</span> : <Lock size={13} />}
                  {unlocked && stars !== null && (
                    <span className="mg-level-pip-stars">
                      {[1, 2, 3].map((n) => (
                        <Star key={n} size={8} fill={n <= stars ? "currentColor" : "none"} strokeWidth={2} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button type="button" onClick={() => startLevel(unlockedLevel)} className="mg-start-btn">
            <Sparkles size={15} /> Play level {unlockedLevel}
          </button>
          <p className="mg-hint">
            1&ndash;3 addition &middot; 4&ndash;6 +subtraction &middot; 7&ndash;9 +multiplication &middot; 10&ndash;12 +division
            &middot; 13+ BODMAS!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mg-root">
      <style>{CSS}</style>
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      {perfectClear && <StarBalloonCelebration onDone={() => setPerfectClear(false)} />}

      {phase === "playing" && question && (
        <div className="mg-play">
          <div className="mg-stat-row">
            <button type="button" className="mg-back-btn" onClick={() => setPhase("select")} aria-label="Back to levels">
              <ArrowLeft size={14} />
            </button>
            <span className="mg-level-chip">Level {level}</span>
            <span className="mg-stat">
              <Flame size={14} className="mg-streak" /> {streak}
            </span>
            <span className="mg-stat mg-score">
              <Trophy size={14} /> {score}
            </span>
          </div>

          <div className="mg-progress-row">
            {Array.from({ length: ROUNDS }, (_, i) => (
              <span
                key={i}
                className={`mg-round-dot ${i < round - 1 ? "mg-round-dot-done" : ""} ${i === round - 1 ? "mg-round-dot-active" : ""}`}
              />
            ))}
          </div>

          <div className="mg-timer-track">
            <div
              className="mg-timer-fill"
              style={{
                width: `${(timeLeft / totalTime) * 100}%`,
                background: timeLeft <= 3 ? "#E2725B" : "#4F80F8",
              }}
            />
          </div>

          <div key={question.key} className="mg-question-card" style={{ animation: "mg-fade-up 260ms cubic-bezier(.22,1,.36,1) both" }}>
            {question.tokens
              ? question.tokens.map((tok, i) =>
                  tok.type === "num" ? (
                    <span key={i} className="mg-num">
                      {tok.value}
                    </span>
                  ) : tok.type === "paren" ? (
                    <span key={i} className="mg-paren">
                      {tok.value}
                    </span>
                  ) : (
                    <span key={i} className="mg-op" style={{ color: OP_COLOR[tok.value] }}>
                      {tok.value}
                    </span>
                  )
                )
              : (
                  <>
                    <span className="mg-num">{question.a}</span>
                    <span className="mg-op" style={{ color: OP_META[question.op].color }}>
                      {question.symbol}
                    </span>
                    <span className="mg-num">{question.b}</span>
                  </>
                )}
            <span className="mg-eq">=</span>
            <span className={`mg-answer-box ${feedback ? `mg-answer-${feedback}` : ""}`}>
              {input || <span className="mg-caret">|</span>}
            </span>
          </div>

          {feedback && (
            <p className={`mg-feedback mg-feedback-${feedback}`} style={{ animation: "mg-fade-up 200ms both" }}>
              {feedback === "correct" && (
                <>
                  <Check size={15} /> Correct!
                </>
              )}
              {feedback === "wrong" && (
                <>
                  <XIcon size={15} /> Not quite &mdash; it's {question.answer}
                </>
              )}
              {feedback === "timeout" && (
                <>
                  <Timer size={15} /> Time's up &mdash; it's {question.answer}
                </>
              )}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mg-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => pressDigit(d)} className="mg-key" disabled={!!feedback}>
                {d}
              </button>
            ))}
            <button type="button" onClick={pressBackspace} className="mg-key mg-key-icon" disabled={!!feedback} aria-label="Backspace">
              <Delete size={16} />
            </button>
            <button key="0" type="button" onClick={() => pressDigit("0")} className="mg-key" disabled={!!feedback}>
              0
            </button>
            <button type="submit" className="mg-key mg-key-submit" disabled={!input || !!feedback} aria-label="Submit">
              <CornerDownLeft size={16} />
            </button>
          </form>
        </div>
      )}

      {phase === "summary" && (
        <div className="mg-summary" style={{ animation: "mg-fade-up 320ms cubic-bezier(.22,1,.36,1) both" }}>
          <div className={`mg-trophy ${won ? "mg-trophy-win" : ""}`}>
            <Trophy size={26} />
          </div>

          {leveledUp && (
            <p className="mg-levelup" style={{ animation: "mg-pop 400ms cubic-bezier(.22,1,.36,1)" }}>
              <Sparkles size={14} /> Level {level + 1} unlocked!
            </p>
          )}

          <h3 className="mg-summary-score">{score} points</h3>
          <p className="mg-summary-sub">
            {correctCount}/{ROUNDS} correct &middot; {accuracy}% accuracy &middot; best streak {bestStreak}
          </p>
          {!won && <p className="mg-summary-retry-hint">Get 70%+ to unlock the next level &mdash; give it another go!</p>}
          {saving && (
            <p className="mg-saving">
              <Loader2 size={12} className="animate-spin" /> Saving your progress&hellip;
            </p>
          )}
          {saveError && <p className="mg-inline-warn">{saveError}</p>}

          <div className="mg-review">
            {history.map((h, i) => (
              <span
                key={i}
                className={`mg-review-dot ${h.correct ? "mg-review-dot-ok" : "mg-review-dot-bad"}`}
                title={
                  h.tokens
                    ? `${h.tokens.map((t) => t.value).join(" ")} = ${h.answer}${h.correct ? "" : ` (you: ${h.given ?? "—"})`}`
                    : `${h.a} ${h.symbol} ${h.b} = ${h.answer}${h.correct ? "" : ` (you: ${h.given ?? "—"})`}`
                }
              />
            ))}
          </div>

          <div className="mg-summary-actions">
            <button type="button" onClick={() => startLevel(level)} className="mg-start-btn">
              <RotateCcw size={14} /> Play again
            </button>
            {won && level < unlockedLevel && (
              <button type="button" onClick={() => startLevel(level + 1)} className="mg-start-btn mg-start-btn-alt">
                <Sparkles size={14} /> Next level
              </button>
            )}
            <button type="button" onClick={() => setPhase("select")} className="mg-secondary-btn">
              All levels
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.mg-root { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.mg-loading { display: flex; align-items: center; justify-content: center; gap: .5rem; padding: 3rem 0; color: var(--dim); font-size: 13.5px; }

.mg-select { display: flex; flex-direction: column; gap: 1.2rem; max-width: 30rem; margin: 0 auto; padding: .5rem 0 1rem; }
.mg-select-head { display: flex; align-items: center; gap: .7rem; }
.mg-select-badge {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.6rem; height: 2.6rem;
  border-radius: 14px; color: #FFFFFF; background: linear-gradient(135deg, #4F80F8, #3558DE);
  box-shadow: 0 8px 18px -8px rgba(53,88,222,.55);
}
.mg-select-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.15rem; font-weight: 700; color: var(--text); }
.mg-select-sub { margin: .1rem 0 0; font-size: 12.5px; color: var(--dim); }
.mg-inline-warn { margin: 0; padding: .6rem .8rem; border-radius: 10px; font-size: 12.5px; color: var(--error-text); background: var(--error-bg); }

.mg-level-path { display: flex; flex-wrap: wrap; gap: .5rem; }
.mg-level-pip {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .15rem;
  width: 3rem; height: 3rem; border-radius: 12px; border: 1.5px solid var(--divider); background: var(--surface);
  color: var(--muted); cursor: pointer; transition: all 160ms ease;
}
.mg-level-pip:hover:not(:disabled) { transform: translateY(-2px); border-color: #5B8DEF; }
.mg-level-pip-num { font-size: 13px; font-weight: 700; }
.mg-level-pip-stars { display: flex; gap: 1px; color: #E4C87A; }
.mg-level-pip-next { border-color: #4F80F8; box-shadow: 0 0 0 3px rgba(79,128,248,.22); color: #4F80F8; animation: mg-pulse-glow 2.2s ease-in-out infinite; }
.mg-level-pip-locked { color: var(--dim); cursor: default; opacity: .55; }

.mg-label { margin: 0 0 .6rem; font-size: 12.5px; font-weight: 600; color: var(--dim); text-transform: uppercase; letter-spacing: .04em; }

.mg-hint { margin: .9rem 0 0; font-size: 12.5px; line-height: 1.6; color: var(--dim); text-align: center; }
.mg-start-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  padding: .8rem 1.4rem; border-radius: 12px; font-size: 14.5px; font-weight: 600; color: #FFFFFF;
  background: linear-gradient(135deg, #4F80F8, #3558DE);
  box-shadow: 0 8px 20px -8px rgba(53,88,222,0.55);
  cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease;
}
.mg-start-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -8px rgba(53,88,222,0.65); }
.mg-start-btn:active { transform: translateY(0); }
.mg-start-btn-alt { background: linear-gradient(135deg, #E4A93B, #C2432B); box-shadow: 0 8px 20px -8px rgba(194,67,43,0.45); }
.mg-secondary-btn {
  padding: .8rem 1.2rem; border-radius: 12px; font-size: 14px; font-weight: 600;
  color: var(--muted); border: 1.5px solid var(--divider); background: transparent; cursor: pointer;
  transition: all 160ms ease;
}
.mg-secondary-btn:hover { color: var(--text); border-color: color-mix(in srgb, var(--text) 25%, var(--divider)); }

.mg-play { display: flex; flex-direction: column; gap: .85rem; max-width: 28rem; margin: 0 auto; padding: .5rem 0 1rem; }
.mg-stat-row { display: flex; align-items: center; gap: .6rem; font-size: 13px; color: var(--muted); }
.mg-back-btn { display: inline-flex; padding: .35rem; border-radius: 8px; color: var(--dim); border: none; background: transparent; cursor: pointer; }
.mg-back-btn:hover { color: var(--text); background: var(--divider); }
.mg-level-chip { font-weight: 700; color: var(--text); }
.mg-stat { display: inline-flex; align-items: center; gap: .3rem; font-weight: 600; }
.mg-score { margin-left: auto; color: #E4C87A; }
.mg-streak { color: #E2725B; }

.mg-progress-row { display: flex; gap: .3rem; }
.mg-round-dot { flex: 1; height: 4px; border-radius: 999px; background: var(--divider); }
.mg-round-dot-done { background: #2DD4BF; }
.mg-round-dot-active { background: #4F80F8; }

.mg-timer-track { height: 6px; border-radius: 999px; background: var(--divider); overflow: hidden; }
.mg-timer-fill { height: 100%; border-radius: 999px; transition: width 1s linear, background 300ms ease; }

.mg-question-card {
  display: flex; align-items: center; justify-content: center; gap: .6rem; flex-wrap: wrap;
  padding: 2rem 1rem; border-radius: 20px; border: 1.5px solid var(--divider);
  background: var(--surface); box-shadow: 0 20px 40px -28px rgba(20,40,110,.35);
}
.mg-num { font-family: 'Sora', system-ui, sans-serif; font-size: 2.4rem; font-weight: 700; color: var(--text); }
.mg-op { font-size: 2rem; font-weight: 700; }
.mg-paren { font-size: 2rem; font-weight: 700; color: var(--dim); }
.mg-eq { font-size: 2rem; font-weight: 700; color: var(--dim); }
.mg-answer-box {
  min-width: 4rem; min-height: 3.4rem; display: inline-flex; align-items: center; justify-content: center;
  padding: 0 .8rem; border-radius: 12px; border: 2px solid #5B8DEF; background: color-mix(in srgb, #5B8DEF 8%, var(--bg));
  font-family: 'Sora', system-ui, sans-serif; font-size: 2rem; font-weight: 700; color: var(--text);
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}
.mg-caret { color: var(--dim); animation: mg-blink 1s step-end infinite; }
.mg-answer-correct { border-color: #2DD4BF; background: color-mix(in srgb, #2DD4BF 16%, var(--bg)); color: #0F8A7C; animation: mg-pop 320ms cubic-bezier(.22,1,.36,1); }
.mg-answer-wrong, .mg-answer-timeout { border-color: #E2725B; background: color-mix(in srgb, #E2725B 14%, var(--bg)); color: #C2432B; animation: mg-shake 380ms ease; }

.mg-feedback { display: flex; align-items: center; justify-content: center; gap: .4rem; margin: -.3rem 0 0; font-size: 13.5px; font-weight: 600; text-align: center; }
.mg-feedback-correct { color: #0F8A7C; }
.mg-feedback-wrong, .mg-feedback-timeout { color: #C2432B; }

.mg-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: .55rem; }
.mg-key {
  height: 3rem; border-radius: 12px; border: 1.5px solid var(--divider); background: var(--surface);
  font-size: 17px; font-weight: 600; color: var(--text); cursor: pointer; transition: all 120ms ease;
}
.mg-key:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 6%, var(--surface)); transform: translateY(-1px); }
.mg-key:active:not(:disabled) { transform: translateY(0); }
.mg-key:disabled { opacity: .5; cursor: default; }
.mg-key-icon { display: flex; align-items: center; justify-content: center; color: var(--muted); }
.mg-key-submit {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #4F80F8, #3558DE); color: #FFFFFF; border: none;
}
.mg-key-submit:disabled { opacity: .35; }

.mg-summary { display: flex; flex-direction: column; align-items: center; gap: .6rem; max-width: 26rem; margin: 0 auto; padding: 1.5rem 0; text-align: center; }
.mg-trophy {
  display: flex; align-items: center; justify-content: center; width: 3.4rem; height: 3.4rem; border-radius: 999px;
  color: #0B0E14; background: linear-gradient(135deg, #E7E9EE, #C7CCD6); box-shadow: 0 10px 24px -10px rgba(60,70,90,.4);
  margin-bottom: .3rem;
}
.mg-trophy-win { background: linear-gradient(135deg, #F2D98A, #E4A93B); box-shadow: 0 10px 24px -10px rgba(228,169,59,.6); }
.mg-levelup {
  display: inline-flex; align-items: center; gap: .4rem; margin: 0; padding: .4rem .9rem; border-radius: 999px;
  font-size: 12.5px; font-weight: 700; color: #9A6B12; background: color-mix(in srgb, #E4A93B 18%, transparent);
}
.mg-summary-score { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.9rem; font-weight: 700; color: var(--text); }
.mg-summary-sub { margin: 0; font-size: 13.5px; color: var(--muted); }
.mg-summary-retry-hint { margin: 0; font-size: 12.5px; color: var(--dim); }
.mg-saving { display: flex; align-items: center; gap: .35rem; margin: 0; font-size: 12px; color: var(--dim); }
.mg-review { display: flex; flex-wrap: wrap; justify-content: center; gap: .35rem; margin: .5rem 0; max-width: 22rem; }
.mg-review-dot { width: .6rem; height: .6rem; border-radius: 999px; cursor: default; }
.mg-review-dot-ok { background: #2DD4BF; }
.mg-review-dot-bad { background: #E2725B; }
.mg-summary-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; margin-top: .6rem; }

@keyframes mg-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mg-pop { 0% { transform: scale(.85); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes mg-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes mg-blink { 50% { opacity: 0; } }
@keyframes mg-pulse-glow { 0%, 100% { box-shadow: 0 0 0 3px rgba(79,128,248,.22); } 50% { box-shadow: 0 0 0 6px rgba(79,128,248,.12); } }
@media (prefers-reduced-motion: reduce) {
  .mg-root *, .mg-root *::before, .mg-root *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;