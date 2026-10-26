import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shuffle, Lightbulb, Trophy, RotateCcw, Sparkles, Check, X as XIcon,
  Lock, Star, Loader2, ArrowLeft,
} from "lucide-react";
import Confetti, { isCelebrationScore } from "./Confetti";
import StarBalloonCelebration from "./StarBalloonCelebration";
import { getGameProgress, completeGameLevel } from "../api/client";

const WORD_BANK = {
  animals: {
    label: "Animals",
    color: "#4F80F8",
    words: [
      { word: "CAT", emoji: "\u{1F431}" },
      { word: "DOG", emoji: "\u{1F436}" },
      { word: "FISH", emoji: "\u{1F41F}" },
      { word: "LION", emoji: "\u{1F981}" },
      { word: "BIRD", emoji: "\u{1F426}" },
      { word: "FROG", emoji: "\u{1F438}" },
      { word: "TIGER", emoji: "\u{1F42F}" },
      { word: "ZEBRA", emoji: "\u{1F993}" },
      { word: "PANDA", emoji: "\u{1F43C}" },
      { word: "MONKEY", emoji: "\u{1F412}" },
      { word: "RABBIT", emoji: "\u{1F430}" },
      { word: "ELEPHANT", emoji: "\u{1F418}" },
    ],
  },
  fruits: {
    label: "Fruits",
    color: "#2DD4BF",
    words: [
      { word: "FIG", emoji: "\u{1FAD2}" },
      { word: "PEAR", emoji: "\u{1F350}" },
      { word: "PLUM", emoji: "\u{1F351}" },
      { word: "GRAPE", emoji: "\u{1F347}" },
      { word: "LEMON", emoji: "\u{1F34B}" },
      { word: "MANGO", emoji: "\u{1F96D}" },
      { word: "PEACH", emoji: "\u{1F351}" },
      { word: "APPLE", emoji: "\u{1F34E}" },
      { word: "BANANA", emoji: "\u{1F34C}" },
      { word: "ORANGE", emoji: "\u{1F34A}" },
      { word: "CHERRY", emoji: "\u{1F352}" },
      { word: "COCONUT", emoji: "\u{1F965}" },
    ],
  },
  school: {
    label: "School",
    color: "#8B73F5",
    words: [
      { word: "PEN", emoji: "\u{1F58A}\uFE0F" },
      { word: "BOOK", emoji: "\u{1F4D6}" },
      { word: "DESK", emoji: "\u{1FA91}" },
      { word: "RULER", emoji: "\u{1F4CF}" },
      { word: "CHALK", emoji: "\u{1F9F1}" },
      { word: "PENCIL", emoji: "\u270F\uFE0F" },
      { word: "ERASER", emoji: "\u{1FA84}" },
      { word: "CRAYON", emoji: "\u{1F58D}\uFE0F" },
      { word: "TEACHER", emoji: "\u{1F9D1}\u200D\u{1F3EB}" },
      { word: "STUDENT", emoji: "\u{1F393}" },
      { word: "NOTEBOOK", emoji: "\u{1F4D3}" },
      { word: "BACKPACK", emoji: "\u{1F392}" },
    ],
  },
  nature: {
    label: "Nature",
    color: "#E2A93B",
    words: [
      { word: "SUN", emoji: "\u2600\uFE0F" },
      { word: "SKY", emoji: "\u{1F324}\uFE0F" },
      { word: "TREE", emoji: "\u{1F333}" },
      { word: "RAIN", emoji: "\u{1F327}\uFE0F" },
      { word: "STAR", emoji: "\u2B50" },
      { word: "MOON", emoji: "\u{1F319}" },
      { word: "CLOUD", emoji: "\u2601\uFE0F" },
      { word: "RIVER", emoji: "\u{1F3DE}\uFE0F" },
      { word: "OCEAN", emoji: "\u{1F30A}" },
      { word: "FOREST", emoji: "\u{1F332}" },
      { word: "MOUNTAIN", emoji: "\u26F0\uFE0F" },
      { word: "RAINBOW", emoji: "\u{1F308}" },
    ],
  },
};

const CATEGORY_IDS = Object.keys(WORD_BANK);
const ALL_WORDS = CATEGORY_IDS.flatMap((c) => WORD_BANK[c].words.map((w) => ({ ...w, category: c })));
const ROUND_COUNT = 8;
const PASS_RATIO = 0.7;
const PATH_WINDOW = 10;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scrambleWord(word) {
  const letters = word.split("");
  let attempt = shuffleArray(letters);
  let tries = 0;
  while (letters.length > 1 && attempt.join("") === word && tries < 8) {
    attempt = shuffleArray(letters);
    tries += 1;
  }
  return attempt.map((ch, i) => ({ ch, id: `${word}-${i}-${Math.random().toString(36).slice(2, 6)}` }));
}

// Target word length grows with level (3 -> 8 letters), so later levels are
// genuinely harder, not just re-skinned early ones.
function targetLengthForLevel(level) {
  return Math.min(3 + Math.floor((level - 1) / 2), 8);
}

function attemptsForLevel(level) {
  return Math.max(2, 3 - Math.floor((level - 1) / 6));
}

function hintsForLevel(level) {
  return Math.max(0, 2 - Math.floor((level - 1) / 8));
}

// From level 3 on, some rounds are "fill the missing letter(s)" (d_g) instead
// of a full unscramble — this is the chance any given round uses that mode.
function missingChanceForLevel(level) {
  if (level < 3) return 0;
  if (level < 6) return 0.35;
  if (level < 10) return 0.55;
  return 0.7;
}

function blankCountForLevel(level) {
  return level >= 10 ? 2 : 1;
}

// A fully-scrambled round: every letter is a movable tile (existing mode).
function buildUnscrambleRound(entry) {
  const blankIndices = entry.word.split("").map((_, i) => i);
  return { ...entry, type: "unscramble", blankIndices, tiles: scrambleWord(entry.word) };
}

// A "d_g"-style round: 1-2 letters replaced with blanks; the player fills
// them from a small pool of candidate letters (the real letter(s) plus a
// few decoys), while the rest of the word stays visible.
function buildMissingRound(entry, level) {
  const word = entry.word;
  const blankCount = Math.min(blankCountForLevel(level), Math.max(1, word.length - 2));
  const indices = shuffleArray(word.split("").map((_, i) => i))
    .slice(0, blankCount)
    .sort((a, b) => a - b);
  const correctLetters = indices.map((i) => word[i]);

  const decoyCount = Math.max(3, blankCount + 2);
  const usedLetters = new Set(word.split(""));
  const decoys = [];
  while (decoys.length < decoyCount) {
    const letter = ALPHABET[randInt(0, 25)];
    if (!usedLetters.has(letter) && !decoys.includes(letter)) decoys.push(letter);
  }

  const optionLetters = shuffleArray([...correctLetters, ...decoys]);
  const optionTiles = optionLetters.map((ch, i) => ({
    ch,
    id: `${word}-opt-${i}-${Math.random().toString(36).slice(2, 6)}`,
  }));

  return { ...entry, type: "missing", blankIndices: indices, tiles: optionTiles };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildRoundForEntry(entry, level) {
  const useMissing = Math.random() < missingChanceForLevel(level);
  return useMissing ? buildMissingRound(entry, level) : buildUnscrambleRound(entry);
}

// Builds this level's word list, preferring words the player hasn't seen yet
// (tracked for the whole session in `seenRef`) and closest to the level's
// target length. Once the bank is exhausted, it resets the seen-set but
// reshuffles so the next cycle doesn't replay in the same order.
function buildLevelRounds(level, seenRef) {
  const targetLen = targetLengthForLevel(level);
  let unseen = ALL_WORDS.filter((w) => !seenRef.current.has(w.word));

  if (unseen.length < ROUND_COUNT) {
    // Ran out of fresh words this session — start a new cycle rather than
    // forcing a repeat mid-level.
    seenRef.current = new Set();
    unseen = [...ALL_WORDS];
  }

  const ranked = shuffleArray(unseen).sort(
    (a, b) => Math.abs(a.word.length - targetLen) - Math.abs(b.word.length - targetLen)
  );

  const picked = ranked.slice(0, ROUND_COUNT);
  picked.forEach((w) => seenRef.current.add(w.word));

  return shuffleArray(picked).map((entry) => buildRoundForEntry(entry, level));
}

function starsFor(solved, total) {
  const ratio = total > 0 ? solved / total : 0;
  if (ratio >= 0.9) return 3;
  if (ratio >= PASS_RATIO) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
}

export default function WordGame() {
  const [phase, setPhase] = useState("loading"); // loading | select | playing | summary
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [starsByLevel, setStarsByLevel] = useState({});
  const [loadError, setLoadError] = useState(null);

  const [level, setLevel] = useState(1);
  const [rounds, setRounds] = useState([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [pool, setPool] = useState([]);
  const [slots, setSlots] = useState([]);
  const [attempts, setAttempts] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [status, setStatus] = useState(null); // null | "correct" | "wrong" | "revealed"
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [celebrate, setCelebrate] = useState(false);
  const [perfectClear, setPerfectClear] = useState(false);
  const [burst, setBurst] = useState(false);
  const [leveledUp, setLeveledUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const lockRef = useRef(false);
  const seenRef = useRef(new Set());

  const loadProgress = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    try {
      const list = await getGameProgress();
      const mine = list.find((g) => g.gameType === "WORDS");
      setUnlockedLevel(mine?.highestLevelUnlocked ?? 1);
      setStarsByLevel(mine?.starsByLevel ?? {});
      setPhase("select");
    } catch (err) {
      setLoadError(err.response?.data?.message ?? "Could not load your saved progress.");
      setUnlockedLevel(1);
      setPhase("select");
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const maxAttempts = attemptsForLevel(level);
  const maxHints = hintsForLevel(level);

  const loadRound = useCallback((list, index) => {
    const r = list[index];
    if (!r) return;
    setPool(r.tiles);
    setSlots([]);
    setAttempts(0);
    setHintsUsed(0);
    setStatus(null);
    lockRef.current = false;
  }, []);

  function startLevel(lvl) {
    const list = buildLevelRounds(lvl, seenRef);
    setLevel(lvl);
    setRounds(list);
    setRoundIndex(0);
    setScore(0);
    setResults([]);
    setLeveledUp(false);
    setSaveError(null);
    setPerfectClear(false);
    setPhase("playing");
    loadRound(list, 0);
  }

  const current = rounds[roundIndex];

  function placeTile(tile) {
    if (status || lockRef.current) return;
    setPool((p) => p.filter((t) => t.id !== tile.id));
    setSlots((s) => [...s, tile]);
  }

  function removeTile(tile) {
    if (status || lockRef.current) return;
    setSlots((s) => s.filter((t) => t.id !== tile.id));
    setPool((p) => [...p, tile]);
  }

  function reshuffle() {
    if (status || lockRef.current) return;
    setPool((p) => shuffleArray(p));
  }

  // Auto-check once every blank (all letters for "unscramble", just the
  // missing ones for "missing") is filled.
  useEffect(() => {
    if (!current || status || lockRef.current) return;
    if (slots.length !== current.blankIndices.length || slots.length === 0) return;

    const formed = slots.map((t) => t.ch).join("");
    const target = current.blankIndices.map((i) => current.word[i]).join("");
    lockRef.current = true;

    if (formed === target) {
      const base = Math.max(4, 14 - attempts * 4 - hintsUsed * 3);
      const gained = Math.round(base * (1 + level * 0.04));
      setScore((s) => s + gained);
      setStatus("correct");
      setBurst(true);
      setResults((r) => [...r, { word: current.word, solved: true, attempts: attempts + 1, hints: hintsUsed }]);
      window.setTimeout(() => setBurst(false), 900);
      window.setTimeout(() => advance(), 1100);
    } else {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= maxAttempts) {
        setStatus("revealed");
        setResults((r) => [...r, { word: current.word, solved: false, attempts: nextAttempts, hints: hintsUsed }]);
        window.setTimeout(() => advance(), 1500);
      } else {
        setStatus("wrong");
        window.setTimeout(() => {
          setSlots([]);
          setPool(shuffleArray(current.tiles));
          setStatus(null);
          lockRef.current = false;
        }, 700);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  function advance() {
    const next = roundIndex + 1;
    if (next >= rounds.length) {
      finishLevel();
    } else {
      setRoundIndex(next);
      loadRound(rounds, next);
    }
  }

  async function finishLevel() {
    setPhase("summary");
    setResults((r) => {
      const solvedCount = r.filter((x) => x.solved).length;
      const won = solvedCount / rounds.length >= PASS_RATIO;
      const stars = starsFor(solvedCount, rounds.length);
      setCelebrate(isCelebrationScore(solvedCount, rounds.length));
      setPerfectClear(stars === 3);

      setSaving(true);
      completeGameLevel({
        gameType: "WORDS",
        level,
        won,
        score,
        stars,
        correctCount: solvedCount,
        totalCount: rounds.length,
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

      return r;
    });
  }

  function useHint() {
    if (status || hintsUsed >= maxHints || !current || lockRef.current) return;
    const targetIndex = current.blankIndices[slots.length];
    if (targetIndex === undefined) return;
    const correctChar = current.word[targetIndex];
    const tileIdx = pool.findIndex((t) => t.ch === correctChar);
    if (tileIdx === -1) return;
    const tile = pool[tileIdx];
    setHintsUsed((h) => h + 1);
    setPool((p) => p.filter((t) => t.id !== tile.id));
    setSlots((s) => [...s, tile]);
  }

  const solvedCount = results.filter((r) => r.solved).length;
  const won = rounds.length > 0 && solvedCount / rounds.length >= PASS_RATIO;

  /* ---------------------------------------------------------------- */

  if (phase === "loading") {
    return (
      <div className="wg-root wg-loading" aria-busy="true">
        <style>{CSS}</style>
        <Loader2 size={18} className="animate-spin" /> Loading your levels&hellip;
      </div>
    );
  }

  if (phase === "select") {
    const pathStart = Math.max(1, unlockedLevel - PATH_WINDOW + 4);
    const pips = Array.from({ length: PATH_WINDOW }, (_, i) => pathStart + i);
    return (
      <div className="wg-root">
        <style>{CSS}</style>
        <div className="wg-select">
          <div className="wg-select-head">
            <span className="wg-select-badge">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 className="wg-select-title">Word Wizard</h2>
              <p className="wg-select-sub">Pick a level &mdash; clear 70%+ to unlock the next one.</p>
            </div>
          </div>

          {loadError && <p className="wg-inline-warn">{loadError} Starting fresh from level 1.</p>}

          <div className="wg-level-path" role="list">
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
                  className={`wg-level-pip ${l === unlockedLevel ? "wg-level-pip-next" : ""} ${!unlocked ? "wg-level-pip-locked" : ""}`}
                >
                  {unlocked ? <span className="wg-level-pip-num">{l}</span> : <Lock size={13} />}
                  {unlocked && stars !== null && (
                    <span className="wg-level-pip-stars">
                      {[1, 2, 3].map((n) => (
                        <Star key={n} size={8} fill={n <= stars ? "currentColor" : "none"} strokeWidth={2} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button type="button" onClick={() => startLevel(unlockedLevel)} className="wg-start-btn">
            <Sparkles size={15} /> Play level {unlockedLevel}
          </button>
          <p className="wg-hint">
            {targetLengthForLevel(unlockedLevel)}-letter words &middot; {attemptsForLevel(unlockedLevel)} tries &middot;{" "}
            {hintsForLevel(unlockedLevel)} hints
            {unlockedLevel >= 3 && <> &middot; some rounds are fill-the-blank (d_g)</>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wg-root">
      <style>{CSS}</style>
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      {perfectClear && <StarBalloonCelebration onDone={() => setPerfectClear(false)} />}

      {phase === "playing" && current && (
        <div className="wg-play">
          <div className="wg-stat-row">
            <button type="button" className="wg-back-btn" onClick={() => setPhase("select")} aria-label="Back to levels">
              <ArrowLeft size={14} />
            </button>
            <span className="wg-stat">
              Word <b>{roundIndex + 1}</b>/{rounds.length}
            </span>
            <span className="wg-stat wg-score">
              <Trophy size={13} /> {score}
            </span>
            <span className="wg-stat wg-attempts">
              {Array.from({ length: maxAttempts }).map((_, i) => (
                <span key={i} className={`wg-life ${i < maxAttempts - attempts ? "wg-life-on" : "wg-life-off"}`} />
              ))}
            </span>
          </div>

          <div className="wg-emoji-card" style={{ animation: burst ? "wg-pop 360ms cubic-bezier(.22,1,.36,1)" : undefined }}>
            <span className="wg-emoji">{current.emoji}</span>
          </div>

          <p className="wg-mode-label">
            {current.type === "missing" ? "Fill in the missing letter" + (current.blankIndices.length > 1 ? "s!" : "!") : "Unscramble the word!"}
          </p>

          <div className="wg-slots">
            {Array.from({ length: current.word.length }).map((_, i) => {
              const blankPos = current.blankIndices.indexOf(i);
              if (blankPos === -1) {
                return (
                  <span key={i} className="wg-slot wg-slot-fixed">
                    {current.word[i]}
                  </span>
                );
              }
              const tile = slots[blankPos];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => tile && removeTile(tile)}
                  className={`wg-slot ${tile ? "wg-slot-filled" : ""} ${status === "correct" ? "wg-slot-correct" : ""} ${status === "wrong" ? "wg-slot-wrong" : ""} ${status === "revealed" ? "wg-slot-revealed" : ""}`}
                  style={tile ? { animation: "wg-pop-in 220ms cubic-bezier(.22,1,.36,1) both" } : undefined}
                  disabled={!tile}
                >
                  {status === "revealed" ? current.word[i] : tile?.ch ?? ""}
                </button>
              );
            })}
          </div>

          {status && (
            <p className={`wg-feedback wg-feedback-${status}`}>
              {status === "correct" && (
                <>
                  <Check size={15} /> Great job!
                </>
              )}
              {status === "wrong" && (
                <>
                  <XIcon size={15} /> Try again ({maxAttempts - attempts} left)
                </>
              )}
              {status === "revealed" && <>The word was {current.word}</>}
            </p>
          )}

          <div className="wg-pool">
            {pool.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => placeTile(tile)}
                className="wg-tile"
                disabled={!!status}
                style={{ animation: "wg-tile-in 260ms cubic-bezier(.22,1,.36,1) both" }}
              >
                {tile.ch}
              </button>
            ))}
          </div>

          <div className="wg-actions">
            <button type="button" onClick={reshuffle} className="wg-icon-btn" disabled={!!status}>
              <Shuffle size={14} /> Shuffle
            </button>
            <button type="button" onClick={useHint} className="wg-icon-btn" disabled={!!status || hintsUsed >= maxHints || maxHints === 0}>
              <Lightbulb size={14} /> Hint ({Math.max(0, maxHints - hintsUsed)})
            </button>
          </div>
        </div>
      )}

      {phase === "summary" && (
        <div className="wg-summary" style={{ animation: "wg-fade-up 320ms cubic-bezier(.22,1,.36,1) both" }}>
          <div className={`wg-trophy ${won ? "wg-trophy-win" : ""}`}>
            <Sparkles size={26} />
          </div>

          {leveledUp && (
            <p className="wg-levelup" style={{ animation: "wg-pop 400ms cubic-bezier(.22,1,.36,1)" }}>
              <Sparkles size={14} /> Level {level + 1} unlocked!
            </p>
          )}

          <h3 className="wg-summary-score">{score} points</h3>
          <p className="wg-summary-sub">
            {solvedCount}/{rounds.length} words solved
          </p>
          {!won && <p className="wg-summary-retry-hint">Get 70%+ to unlock the next level &mdash; give it another go!</p>}
          {saving && (
            <p className="wg-saving">
              <Loader2 size={12} className="animate-spin" /> Saving your progress&hellip;
            </p>
          )}
          {saveError && <p className="wg-inline-warn">{saveError}</p>}

          <div className="wg-review">
            {results.map((r, i) => (
              <span key={i} className={`wg-review-pill ${r.solved ? "wg-review-pill-ok" : "wg-review-pill-bad"}`}>
                {r.word}
              </span>
            ))}
          </div>

          <div className="wg-summary-actions">
            <button type="button" onClick={() => startLevel(level)} className="wg-start-btn">
              <RotateCcw size={14} /> Play again
            </button>
            {won && level < unlockedLevel && (
              <button type="button" onClick={() => startLevel(level + 1)} className="wg-start-btn wg-start-btn-alt">
                <Sparkles size={14} /> Next level
              </button>
            )}
            <button type="button" onClick={() => setPhase("select")} className="wg-secondary-btn">
              All levels
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.wg-root { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.wg-loading { display: flex; align-items: center; justify-content: center; gap: .5rem; padding: 3rem 0; color: var(--dim); font-size: 13.5px; }

.wg-select { display: flex; flex-direction: column; gap: 1.2rem; max-width: 30rem; margin: 0 auto; padding: .5rem 0 1rem; }
.wg-select-head { display: flex; align-items: center; gap: .7rem; }
.wg-select-badge {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.6rem; height: 2.6rem;
  border-radius: 14px; color: #FFFFFF; background: linear-gradient(135deg, #8B73F5, #4A33B5);
  box-shadow: 0 8px 18px -8px rgba(106,77,224,.55);
}
.wg-select-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.15rem; font-weight: 700; color: var(--text); }
.wg-select-sub { margin: .1rem 0 0; font-size: 12.5px; color: var(--dim); }
.wg-inline-warn { margin: 0; padding: .6rem .8rem; border-radius: 10px; font-size: 12.5px; color: var(--error-text); background: var(--error-bg); }

.wg-level-path { display: flex; flex-wrap: wrap; gap: .5rem; }
.wg-level-pip {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .15rem;
  width: 3rem; height: 3rem; border-radius: 12px; border: 1.5px solid var(--divider); background: var(--surface);
  color: var(--muted); cursor: pointer; transition: all 160ms ease;
}
.wg-level-pip:hover:not(:disabled) { transform: translateY(-2px); border-color: #8B73F5; }
.wg-level-pip-num { font-size: 13px; font-weight: 700; }
.wg-level-pip-stars { display: flex; gap: 1px; color: #E4C87A; }
.wg-level-pip-next { border-color: #8B73F5; box-shadow: 0 0 0 3px rgba(139,115,245,.22); color: #8B73F5; animation: wg-pulse-glow 2.2s ease-in-out infinite; }
.wg-level-pip-locked { color: var(--dim); cursor: default; opacity: .55; }

.wg-label { margin: 0 0 .6rem; font-size: 12.5px; font-weight: 600; color: var(--dim); text-transform: uppercase; letter-spacing: .04em; }

.wg-start-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  padding: .8rem 1.4rem; border-radius: 12px; font-size: 14.5px; font-weight: 600; color: #FFFFFF;
  background: linear-gradient(135deg, #8B73F5, #4A33B5);
  box-shadow: 0 8px 20px -8px rgba(106,77,224,0.5);
  cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease;
}
.wg-start-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -8px rgba(106,77,224,0.6); }
.wg-start-btn-alt { background: linear-gradient(135deg, #E4A93B, #C2432B); box-shadow: 0 8px 20px -8px rgba(194,67,43,0.45); }
.wg-secondary-btn {
  padding: .8rem 1.2rem; border-radius: 12px; font-size: 14px; font-weight: 600;
  color: var(--muted); border: 1.5px solid var(--divider); background: transparent; cursor: pointer;
  transition: all 160ms ease;
}
.wg-secondary-btn:hover { color: var(--text); border-color: color-mix(in srgb, var(--text) 25%, var(--divider)); }
.wg-hint { margin: -.4rem 0 0; font-size: 12.5px; color: var(--dim); text-align: center; }

.wg-play { display: flex; flex-direction: column; gap: 1rem; max-width: 28rem; margin: 0 auto; padding: .5rem 0 1rem; }
.wg-stat-row { display: flex; align-items: center; gap: .6rem; font-size: 13px; color: var(--muted); }
.wg-back-btn { display: inline-flex; padding: .35rem; border-radius: 8px; color: var(--dim); border: none; background: transparent; cursor: pointer; }
.wg-back-btn:hover { color: var(--text); background: var(--divider); }
.wg-stat { display: inline-flex; align-items: center; gap: .3rem; font-weight: 600; }
.wg-score { margin-left: auto; color: #E4C87A; }
.wg-attempts { display: inline-flex; gap: .25rem; }
.wg-life { width: .5rem; height: .5rem; border-radius: 999px; }
.wg-life-on { background: #E2725B; }
.wg-life-off { background: var(--divider); }

.wg-emoji-card {
  display: flex; align-items: center; justify-content: center; padding: 1.2rem;
  border-radius: 20px; border: 1.5px solid var(--divider); background: var(--surface);
}
.wg-emoji { font-size: 3.4rem; line-height: 1; filter: drop-shadow(0 8px 14px rgba(0,0,0,.18)); }

.wg-mode-label { margin: -.4rem 0 0; font-size: 11.5px; font-weight: 700; text-align: center; color: var(--dim); text-transform: uppercase; letter-spacing: .04em; }

.wg-slots { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; }
.wg-slot {
  width: 2.6rem; height: 2.6rem; border-radius: 10px; border: 2px dashed var(--divider); background: var(--bg);
  font-family: 'Sora', system-ui, sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--text);
  display: flex; align-items: center; justify-content: center; cursor: default; transition: all 150ms ease;
}
.wg-slot-fixed { border-style: solid; border-color: var(--divider); background: color-mix(in srgb, var(--text) 4%, var(--bg)); color: var(--muted); cursor: default; }
.wg-slot-filled { border-style: solid; border-color: #5B8DEF; background: color-mix(in srgb, #5B8DEF 10%, var(--bg)); cursor: pointer; }
.wg-slot-correct { border-color: #2DD4BF; background: color-mix(in srgb, #2DD4BF 18%, var(--bg)); color: #0F8A7C; animation: wg-pop 320ms cubic-bezier(.22,1,.36,1); }
.wg-slot-wrong { border-color: #E2725B; background: color-mix(in srgb, #E2725B 14%, var(--bg)); animation: wg-shake 380ms ease; }
.wg-slot-revealed { border-color: #E2A93B; background: color-mix(in srgb, #E2A93B 16%, var(--bg)); color: #9A6B12; }

.wg-feedback { display: flex; align-items: center; justify-content: center; gap: .4rem; margin: 0; font-size: 13.5px; font-weight: 600; text-align: center; }
.wg-feedback-correct { color: #0F8A7C; }
.wg-feedback-wrong { color: #C2432B; }
.wg-feedback-revealed { color: #9A6B12; }

.wg-pool { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; min-height: 2.9rem; }
.wg-tile {
  width: 2.6rem; height: 2.6rem; border-radius: 10px; border: 1.5px solid var(--divider); background: var(--surface);
  font-family: 'Sora', system-ui, sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--text);
  cursor: pointer; transition: all 140ms ease;
}
.wg-tile:hover:not(:disabled) { transform: translateY(-3px); border-color: #5B8DEF; box-shadow: 0 8px 16px -10px rgba(91,141,239,.6); }
.wg-tile:active:not(:disabled) { transform: translateY(0); }
.wg-tile:disabled { opacity: .5; }

.wg-actions { display: flex; justify-content: center; gap: .6rem; }
.wg-icon-btn {
  display: inline-flex; align-items: center; gap: .35rem; padding: .5rem .9rem; border-radius: 10px;
  border: 1.5px solid var(--divider); background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 600;
  cursor: pointer; transition: all 150ms ease;
}
.wg-icon-btn:hover:not(:disabled) { color: var(--text); border-color: color-mix(in srgb, var(--text) 25%, var(--divider)); }
.wg-icon-btn:disabled { opacity: .4; cursor: default; }

.wg-summary { display: flex; flex-direction: column; align-items: center; gap: .6rem; max-width: 26rem; margin: 0 auto; padding: 1.5rem 0; text-align: center; }
.wg-trophy {
  display: flex; align-items: center; justify-content: center; width: 3.4rem; height: 3.4rem; border-radius: 999px;
  color: #FFFFFF; background: linear-gradient(135deg, #C7CCD6, #9AA3B2); box-shadow: 0 10px 24px -10px rgba(60,70,90,.4);
  margin-bottom: .3rem;
}
.wg-trophy-win { background: linear-gradient(135deg, #8B73F5, #4A33B5); box-shadow: 0 10px 24px -10px rgba(106,77,224,.55); }
.wg-levelup {
  display: inline-flex; align-items: center; gap: .4rem; margin: 0; padding: .4rem .9rem; border-radius: 999px;
  font-size: 12.5px; font-weight: 700; color: #9A6B12; background: color-mix(in srgb, #E4A93B 18%, transparent);
}
.wg-summary-score { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.9rem; font-weight: 700; color: var(--text); }
.wg-summary-sub { margin: 0; font-size: 13.5px; color: var(--muted); }
.wg-summary-retry-hint { margin: 0; font-size: 12.5px; color: var(--dim); }
.wg-saving { display: flex; align-items: center; gap: .35rem; margin: 0; font-size: 12px; color: var(--dim); }
.wg-review { display: flex; flex-wrap: wrap; justify-content: center; gap: .4rem; margin: .5rem 0; }
.wg-review-pill { padding: .3rem .7rem; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .02em; }
.wg-review-pill-ok { color: #0F8A7C; background: color-mix(in srgb, #2DD4BF 18%, transparent); }
.wg-review-pill-bad { color: #C2432B; background: color-mix(in srgb, #E2725B 16%, transparent); text-decoration: line-through; }
.wg-summary-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; margin-top: .6rem; }

@keyframes wg-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes wg-pop { 0% { transform: scale(.85); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes wg-pop-in { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
@keyframes wg-tile-in { from { opacity: 0; transform: translateY(8px) scale(.8); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes wg-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
@keyframes wg-pulse-glow { 0%, 100% { box-shadow: 0 0 0 3px rgba(139,115,245,.22); } 50% { box-shadow: 0 0 0 6px rgba(139,115,245,.12); } }
@media (prefers-reduced-motion: reduce) {
  .wg-root *, .wg-root *::before, .wg-root *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;