import { useEffect, useRef } from "react";

/**
 * Celebrate 90% and up (9/10, 10/10, 18/20 …).
 */
export function isCelebrationScore(score, total) {
  return total > 0 && score / total >= 0.9;
}

const COLORS = ["#4F80F8", "#7FA2FF", "#6A4DE0", "#B39DFF", "#22C3F0", "#34D3B0", "#F2B84B"];

/**
 * One-shot confetti: two cannons from the bottom corners plus a shower from
 * the top. Plain canvas, no dependencies. Sits over the whole screen without
 * blocking clicks, cleans itself up, and calls onDone when the last piece has
 * fallen. Skipped entirely for people who prefer reduced motion.
 */
export default function Confetti({ duration = 4200, onDone }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      doneRef.current?.();
      return undefined;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf;
    const pieces = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const rand = (a, b) => a + Math.random() * (b - a);

    function spawn(x, y, angleDeg, spread, speedMin, speedMax) {
      const a = ((angleDeg + rand(-spread, spread)) * Math.PI) / 180;
      const speed = rand(speedMin, speedMax);
      pieces.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        size: rand(6, 11),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.3, 0.3),
        wobble: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.08, 0.2),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        round: Math.random() < 0.25,
      });
    }

    const small = w < 640;
    const cannon = small ? 55 : 90;
    for (let i = 0; i < cannon; i++) {
      spawn(0, h, 60, 22, small ? 13 : 17, small ? 21 : 27); // bottom-left, aimed up-right
      spawn(w, h, 120, 22, small ? 13 : 17, small ? 21 : 27); // bottom-right, aimed up-left
    }
    const shower = window.setTimeout(() => {
      for (let i = 0; i < (small ? 50 : 90); i++) {
        spawn(rand(0, w), -20, -90, 40, 1, 5);
      }
    }, 450);

    const start = performance.now();
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, Math.min(1, (duration - t) / (duration * 0.3)));

      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += 0.42; // gravity
        p.vx *= 0.985; // air drag
        p.vy *= 0.985;
        p.x += p.vx + Math.sin(p.wobble) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        p.wobble += p.wobbleSpeed;

        if (p.y > h + 30 || t > duration) {
          pieces.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = t > duration * 0.7 ? fade : 1;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // fake 3D flip by squashing the height with the wobble
          ctx.scale(1, Math.cos(p.wobble));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      if (pieces.length === 0 && t > 600) {
        doneRef.current?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(shower);
      window.removeEventListener("resize", resize);
    };
  }, [duration]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]" />;
}