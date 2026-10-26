import { useState, useRef, useMemo } from "react";
import { Brain, HelpCircle } from "lucide-react";
import LevelShell, {
  randInt, shuffle, useTally, useLater,
  PlayHeader, RoundDots, VerdictSlot, correctLabel,
} from "./ArcadeShared";

/**
 * Memory Match — multiplication.
 * Flip two cards at a time: a times-table question (6 × 7) matches its
 * answer (42). Every pair has a different product, so there is only ever
 * one right partner.
 *
 * Unlike the question-based games this one is scored on misses:
 *   3 stars  — at most a third as many misses as pairs
 *   2 stars  — at most one miss per pair (clears the level)
 *   1 star   — finished, but too many misses to unlock the next level
 */

function pairCountFor(level) {
  if (level <= 3) return 4;
  if (level <= 8) return 6;
  return 8;
}

function buildDeck(level) {
  const count = pairCountFor(level);
  const maxFactor = Math.min(12, 4 + Math.ceil(level / 2));
  const products = new Set();
  const pairs = [];
  let guard = 0;
  while (pairs.length < count && guard++ < 800) {
    const a = randInt(2, maxFactor);
    const b = randInt(2, maxFactor);
    if (products.has(a * b)) continue;
    products.add(a * b);
    pairs.push({ id: pairs.length, a, b, product: a * b });
  }
  const cards = pairs.flatMap((p) => [
    { uid: `${p.id}q`, pair: p.id, kind: "q", label: `${p.a} \u00D7 ${p.b}` },
    { uid: `${p.id}a`, pair: p.id, kind: "a", label: String(p.product) },
  ]);
  return { pairCount: pairs.length, cards: shuffle(cards) };
}

function MemoryPlay({ level, onFinish, onExit }) {
  const { pairCount, cards } = useMemo(() => buildDeck(level), [level]);
  const tally = useTally();
  const later = useLater();

  const lockRef = useRef(false);
  const openRef = useRef([]);
  const matchedRef = useRef(new Set());
  const missesRef = useRef(0);
  const dots = useRef([]);

  const [open, setOpen] = useState([]);
  const [matched, setMatched] = useState([]);
  const [misses, setMisses] = useState(0);
  const [verdict, setVerdict] = useState(null);

  function finish() {
    const snap = tally.snapshot();
    const m = missesRef.current;
    const stars = m <= Math.ceil(pairCount / 3) ? 3 : m <= pairCount ? 2 : 1;
    onFinish({
      correct: pairCount,
      total: pairCount + m,
      score: snap.score,
      bestStreak: snap.best,
      stars,
      won: stars >= 2,
      dots: [...dots.current],
      detail: `${pairCount} pairs in ${pairCount + m} tries \u00B7 ${m} ${m === 1 ? "miss" : "misses"} \u00B7 best streak ${snap.best}`,
    });
  }

  function flip(card) {
    if (lockRef.current) return;
    if (openRef.current.includes(card.uid) || matchedRef.current.has(card.pair)) return;

    openRef.current = [...openRef.current, card.uid];
    setOpen(openRef.current);
    setVerdict(null);
    if (openRef.current.length < 2) return;

    lockRef.current = true;
    const [first, second] = openRef.current.map((uid) => cards.find((c) => c.uid === uid));
    const ok = first.pair === second.pair;
    const gained = tally.record(ok);
    dots.current.push(ok);
    if (!ok) {
      missesRef.current += 1;
      setMisses(missesRef.current);
    }
    setVerdict(
      ok
        ? { ok, text: correctLabel(gained) }
        : { ok, text: `${first.label} and ${second.label} don't match` }
    );

    later(() => {
      if (ok) {
        matchedRef.current.add(first.pair);
        setMatched([...matchedRef.current]);
      }
      openRef.current = [];
      setOpen([]);
      lockRef.current = false;
      if (ok && matchedRef.current.size === pairCount) finish();
    }, ok ? 600 : 1000);
  }

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={matched.length + 1} total={pairCount} />
      <p className="mm-count">
        {matched.length} of {pairCount} pairs found &middot; {misses} {misses === 1 ? "miss" : "misses"}
      </p>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <div className="mm-grid">
        {cards.map((c) => {
          const isMatched = matched.includes(c.pair);
          const up = isMatched || open.includes(c.uid);
          return (
            <button
              key={c.uid}
              type="button"
              className={`mm-card ${up ? "mm-card-up" : ""} ${isMatched ? "mm-card-matched" : ""}`}
              onClick={() => flip(c)}
              disabled={isMatched}
              aria-label={up ? c.label : "Hidden card"}
            >
              <span className="mm-inner">
                <span className="mm-face mm-front">
                  <HelpCircle size={22} aria-hidden="true" />
                </span>
                <span className={`mm-face mm-back ${c.kind === "a" ? "mm-back-a" : ""}`}>{c.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MemoryMatch() {
  return (
    <LevelShell
      gameType="MEMORY"
      title="Memory Match"
      blurb="Match each times-table question to its answer. Clear the level with few misses."
      icon={Brain}
      color="#16A394"
      hint="Levels 1\u20133 have 4 pairs, 4\u20138 have 6, and 9+ have 8. Bigger tables appear as you climb. Three stars needs very few misses."
      Play={MemoryPlay}
    />
  );
}

const CSS = `
.mm-count { margin: 0; text-align: center; font-size: 12.5px; color: var(--dim); }
.mm-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .55rem; }

.mm-card { perspective: 700px; aspect-ratio: 3 / 4; padding: 0; border: none; background: none; cursor: pointer; }
.mm-card:disabled { cursor: default; }
.mm-inner { position: relative; display: block; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 380ms cubic-bezier(.22,1,.36,1); }
.mm-card-up .mm-inner { transform: rotateY(180deg); }
.mm-card:hover:not(.mm-card-up) .mm-inner { transform: translateY(-2px); }

.mm-face {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  font-family: 'Sora', system-ui, sans-serif; font-weight: 700; font-size: clamp(.9rem, 3.8vw, 1.2rem);
}
.mm-front {
  color: color-mix(in srgb, #FFFFFF 85%, transparent);
  background: linear-gradient(135deg, var(--ax), color-mix(in srgb, var(--ax) 60%, black));
  box-shadow: 0 8px 16px -10px color-mix(in srgb, var(--ax) 70%, transparent);
}
.mm-back { transform: rotateY(180deg); color: var(--text); background: var(--surface); border: 1.5px solid var(--divider); }
.mm-back-a { color: var(--ax); }
.mm-card-matched .mm-back { border-color: var(--ax); background: color-mix(in srgb, var(--ax) 14%, var(--surface)); }

@media (max-width: 380px) { .mm-grid { gap: .4rem; } }
`;