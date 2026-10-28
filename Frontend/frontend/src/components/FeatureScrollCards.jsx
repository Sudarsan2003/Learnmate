import { motion, useReducedMotion } from "motion/react";

/* ------------------------------------------------------------------ */
/*  FeatureScrollCards                                                 */
/*  The four product features as a responsive grid: one column on      */
/*  phones, two from tablets up. Each card springs up with a slight    */
/*  tilt that settles flat as it scrolls into view (one after another),*/
/*  over a soft glow in its brand colour, and lifts on hover.          */
/*                                                                     */
/*  Usage in LandingPage.jsx:                                          */
/*    <FeatureScrollCards features={FEATURES} TiltIcon={TiltIcon} />   */
/* ------------------------------------------------------------------ */

// Glow colours matched to the brand palette (teal / blue / violet / electric)
const GLOW = {
  teal: ["#2DD4BF", "#0EA5E9"],
  gold: ["#4F80F8", "#3558DE"],
  ember: ["#8B73F5", "#6A4DE0"],
  electric: ["#5B8DEF", "#22D3EE"],
};

function FeatureCard({ feature, TiltIcon, index, reduce }) {
  const [a, b] = GLOW[feature.tone] ?? GLOW.gold;
  return (
    <motion.article
      className="fsc-card"
      style={{ "--a": a, "--b": b }}
      initial={reduce ? false : { opacity: 0, y: 60, rotate: index % 2 ? 3 : -3 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ type: "spring", bounce: 0.3, duration: 0.9, delay: (index % 2) * 0.12 }}
    >
      <span className="fsc-glow" aria-hidden="true" />
      <TiltIcon icon={feature.icon} tone={feature.tone} size={56} />
      <h3 className="fsc-title">{feature.title}</h3>
      <p className="fsc-body">{feature.body}</p>
    </motion.article>
  );
}

export default function FeatureScrollCards({ features, TiltIcon }) {
  const reduce = useReducedMotion();
  return (
    <div className="fsc-grid">
      <style>{CSS}</style>
      {features.map((f, i) => (
        <FeatureCard key={f.title} feature={f} TiltIcon={TiltIcon} index={i} reduce={reduce} />
      ))}
    </div>
  );
}

const CSS = `
.fsc-grid { display: grid; grid-template-columns: 1fr; gap: 1.1rem; margin-top: 2.5rem; }
@media (min-width: 700px) { .fsc-grid { grid-template-columns: 1fr 1fr; gap: 1.4rem; } }
.fsc-card {
  position: relative; overflow: hidden; isolation: isolate;
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 1.75rem 1.6rem 1.9rem; border-radius: 22px;
  border: 1px solid var(--divider); background: var(--surface);
  box-shadow: 0 1px 2px rgba(20,30,70,.06), 0 22px 44px -30px rgba(20,30,70,.45);
  transition: transform 350ms cubic-bezier(.16,1,.3,1), box-shadow 350ms ease, border-color 350ms ease;
}
.fsc-card:hover {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--a) 45%, var(--divider));
  box-shadow: 0 1px 2px rgba(20,30,70,.06), 0 30px 54px -28px color-mix(in srgb, var(--a) 60%, transparent);
}
.fsc-glow {
  position: absolute; z-index: -1; top: -40%; right: -30%; width: 75%; aspect-ratio: 1; border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--a) 38%, transparent), color-mix(in srgb, var(--b) 12%, transparent) 55%, transparent 70%);
  filter: blur(8px); transition: transform 600ms cubic-bezier(.16,1,.3,1);
}
.fsc-card:hover .fsc-glow { transform: scale(1.15) translate(-6%, 6%); }
.fsc-title { margin: 1.4rem 0 0; font-size: 1.25rem; font-weight: 600; color: var(--text); }
.fsc-body { margin: .6rem 0 0; font-size: 14.5px; line-height: 1.65; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .fsc-card, .fsc-glow { transition: none; } }
`;
