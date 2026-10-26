import { useEffect, useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  useReducedMotion,
} from "motion/react";

/* Page-wide scroll progress bar (top edge, brand gradient) */
export function ScrollProgress() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });
  if (reduce) return null;
  return (
    <motion.div
      style={{ scaleX, background: "linear-gradient(90deg,#5B8DEF,#3558DE,#6A4DE0)" }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left"
    />
  );
}

/* Headline whose letters start scattered and blurred, then drift together into place.
   Deterministic "random" offsets so re-renders don't re-shuffle. */
const rnd = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export function WordReveal({ text, accent, className = "", startDelay = 0.6, stagger = 0.045 }) {
  const reduce = useReducedMotion();
  let n = 0;
  return (
    <h1 className={className} aria-label={text}>
      {text.split(" ").map((w, wi) => {
        const isAccent = w.replace(/[^\w]/g, "") === accent;
        return (
          <span
            key={wi}
            aria-hidden
            className={`mr-[0.25em] inline-block whitespace-nowrap ${isAccent ? "text-[var(--accent-ink)]" : ""}`}
          >
            {w.split("").map((ch) => {
              const i = n++;
              return (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={
                    reduce
                      ? false
                      : {
                          opacity: 0,
                          x: (rnd(i + 1) - 0.5) * 140,
                          y: (rnd(i + 7) - 0.5) * 160,
                          rotate: (rnd(i + 13) - 0.5) * 100,
                          scale: 0.4,
                          filter: "blur(12px)",
                        }
                  }
                  animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1, filter: "blur(0px)" }}
                  transition={{
                    delay: startDelay + i * stagger,
                    type: "spring",
                    stiffness: 55,
                    damping: 15,
                    mass: 1.1,
                  }}
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </h1>
  );
}

/* Hero content drifts down, shrinks and fades as you scroll away */
export function HeroParallax({ className = "", children }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 110]);
  const scale = useTransform(scrollY, [0, 600], [1, 0.94]);
  const opacity = useTransform(scrollY, [0, 480], [1, 0]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div style={{ y, scale, opacity }} className={className}>
      {children}
    </motion.div>
  );
}

/* Soft blue glow that follows the cursor; fades out once you scroll past the hero */
export function HeroSpotlight() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const x = useSpring(mx, { stiffness: 90, damping: 20 });
  const y = useSpring(my, { stiffness: 90, damping: 20 });
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 500], [1, 0]);

  useEffect(() => {
    if (reduce) return;
    const move = (e) => {
      mx.set(e.clientX - 260);
      my.set(e.clientY - 260);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [mx, my, reduce]);

  if (reduce) return null;

  return (
    <motion.div
      aria-hidden
      style={{
        x,
        y,
        opacity,
        background: "radial-gradient(circle, rgba(79,128,248,0.22), transparent 65%)",
      }}
      className="pointer-events-none fixed left-0 top-0 z-[1] hidden h-[520px] w-[520px] rounded-full blur-2xl md:block"
    />
  );
}

/* Two oversized text rows that slide in opposite directions as you scroll */
export function ScrollMarquee({ items }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const left = useTransform(scrollYProgress, [0, 1], ["8%", "-45%"]);
  const right = useTransform(scrollYProgress, [0, 1], ["-45%", "8%"]);
  const row = [...items, ...items].map((t, i) => (
    <span key={i} className="mr-10 inline-flex items-center gap-10">
      {t}
      <span className="h-2 w-2 rounded-full bg-[#3558DE]" />
    </span>
  ));
  const base = "lp-serif whitespace-nowrap text-5xl sm:text-7xl";
  const outline = { WebkitTextStroke: "1px var(--dim)", color: "transparent" };

  if (reduce) {
    return (
      <div ref={ref} aria-hidden className="overflow-hidden py-10">
        <div style={{ ...outline, marginLeft: "8%" }} className={`${base} opacity-60`}>
          {row}
        </div>
        <div style={{ marginLeft: "-20%" }} className={`${base} mt-3 text-[var(--muted)] opacity-40`}>
          {row}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} aria-hidden className="overflow-hidden py-10">
      <motion.div style={{ x: left, ...outline }} className={`${base} opacity-60`}>
        {row}
      </motion.div>
      <motion.div style={{ x: right }} className={`${base} mt-3 text-[var(--muted)] opacity-40`}>
        {row}
      </motion.div>
    </div>
  );
}

/* Content grows from small/faded to full size as it scrolls into the centre */
export function ScaleOnScroll({ className = "", children }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [0.15, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [70, 0]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div ref={ref} style={{ scale, opacity, y }} className={className}>
      {children}
    </motion.div>
  );
}