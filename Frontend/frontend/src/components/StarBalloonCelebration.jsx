import { useMemo } from "react";
import { Star } from "lucide-react";

const STAR_COUNT = 14;
const BALLOON_COUNT = 7;
const BALLOON_COLORS = ["#4F80F8", "#8B73F5", "#E2725B", "#2DD4BF", "#E4A93B", "#F26FA8", "#5FC17B"];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Perfect-score celebration overlay: stars drifting down + balloons rising
 * up, meant to layer on top of <Confetti/> (not replace it) when a level is
 * cleared with all 3 stars. Fully self-contained — no dependency on
 * Confetti's internals, same "fire and forget with onDone" contract.
 *
 *   {perfectClear && <StarBalloonCelebration onDone={() => setPerfectClear(false)} />}
 */
export default function StarBalloonCelebration({ onDone, durationMs = 2600 }) {
  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        id: i,
        left: rand(2, 96),
        size: rand(12, 24),
        delay: rand(0, 0.9),
        duration: rand(1.8, 2.8),
        drift: rand(-40, 40),
        spin: rand(-140, 140),
      })),
    []
  );

  const balloons = useMemo(
    () =>
      Array.from({ length: BALLOON_COUNT }, (_, i) => ({
        id: i,
        left: rand(4, 92),
        size: rand(30, 46),
        delay: rand(0, 0.5),
        duration: rand(2.2, 3.1),
        sway: rand(14, 34),
        color: BALLOON_COLORS[i % BALLOON_COLORS.length],
      })),
    []
  );

  useMemo(() => {
    if (!onDone) return undefined;
    const t = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sbc-root" aria-hidden="true">
      <style>{CSS}</style>

      {balloons.map((b) => (
        <span
          key={`b-${b.id}`}
          className="sbc-balloon"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size * 1.2,
            background: `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${b.color} 55%, white), ${b.color})`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
            "--sway": `${b.sway}px`,
          }}
        >
          <span className="sbc-balloon-knot" style={{ background: b.color }} />
          <span className="sbc-balloon-string" />
        </span>
      ))}

      {stars.map((s) => (
        <span
          key={`s-${s.id}`}
          className="sbc-star"
          style={{
            left: `${s.left}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            "--drift": `${s.drift}px`,
            "--spin": `${s.spin}deg`,
          }}
        >
          <Star size={s.size} fill="#E4C87A" color="#C89B2E" strokeWidth={1.5} />
        </span>
      ))}
    </div>
  );
}

const CSS = `
.sbc-root {
  position: fixed; inset: 0; z-index: 60; overflow: hidden;
  pointer-events: none;
}

.sbc-star {
  position: absolute; top: -8%;
  animation-name: sbc-fall; animation-timing-function: ease-in;
  animation-fill-mode: forwards; opacity: 0;
  filter: drop-shadow(0 2px 4px rgba(180,140,20,.35));
}

.sbc-balloon {
  position: absolute; bottom: -14%;
  display: flex; flex-direction: column; align-items: center;
  border-radius: 50% 50% 50% 50% / 58% 58% 42% 42%;
  box-shadow: inset -4px -6px 10px rgba(0,0,0,.15), 0 10px 18px -10px rgba(0,0,0,.35);
  animation-name: sbc-rise; animation-timing-function: ease-out;
  animation-fill-mode: forwards; opacity: 0;
}
.sbc-balloon-knot {
  position: absolute; bottom: -5px; width: 6px; height: 6px; border-radius: 50%;
}
.sbc-balloon-string {
  position: absolute; top: 100%; width: 1.5px; height: 2.6rem;
  background: color-mix(in srgb, var(--dim, #8b93a7) 70%, transparent);
}

@keyframes sbc-fall {
  0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
  8% { opacity: 1; }
  100% { transform: translateY(112vh) translateX(var(--drift)) rotate(var(--spin)); opacity: .95; }
}

@keyframes sbc-rise {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translateY(-58vh) translateX(calc(var(--sway) * -1)); }
  100% { transform: translateY(-118vh) translateX(var(--sway)); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sbc-root * { animation-duration: 1ms !important; }
}
`;