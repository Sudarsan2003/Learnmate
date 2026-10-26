import { motion, useReducedMotion } from "motion/react";

/* ------------------------------------------------------------------ */
/*  FeatureScrollCards                                                 */
/*  Scroll-triggered stacked cards: each card springs up from below    */
/*  and tilts (-10deg) when ~80% of it is in view, over a coloured     */
/*  "splash" shape. Adapted from the motion.dev example to use your    */
/*  FEATURES data, TiltIcon and the theme CSS variables.               */
/*                                                                     */
/*  Usage in LandingPage.jsx:                                          */
/*    import FeatureScrollCards from "./FeatureScrollCards";           */
/*    <FeatureScrollCards features={FEATURES} TiltIcon={TiltIcon} />   */
/* ------------------------------------------------------------------ */

// Hue pairs matched to your brand palette (blue / teal / violet / electric)
const SPLASH_HUES = {
  teal: [172, 195],
  gold: [225, 245],
  ember: [255, 285],
  electric: [205, 225],
};

const hsl = (h) => `hsl(${h}, 85%, 58%)`;

const cardVariants = {
  offscreen: { y: 300 },
  onscreen: {
    y: 50,
    rotate: -10,
    transition: { type: "spring", bounce: 0.4, duration: 0.8 },
  },
};

// Reduced-motion users get the final state with no travel or tilt
const staticVariants = {
  offscreen: { y: 50, rotate: -10 },
  onscreen: { y: 50, rotate: -10 },
};

function ScrollCard({ feature, TiltIcon, reduce }) {
  const [hueA, hueB] = SPLASH_HUES[feature.tone] ?? SPLASH_HUES.gold;
  const background = `linear-gradient(306deg, ${hsl(hueA)}, ${hsl(hueB)})`;

  return (
    <motion.div
      style={cardContainer}
      initial="offscreen"
      whileInView="onscreen"
      viewport={{ amount: 0.8, once: true }}
    >
      <div style={{ ...splash, background }} />
      <motion.div
        variants={reduce ? staticVariants : cardVariants}
        style={card}
        className="border border-[var(--divider)] bg-[var(--surface)] text-left"
      >
        <TiltIcon icon={feature.icon} tone={feature.tone} size={64} />
        <h3 className="mt-8 text-xl font-semibold text-[var(--text)]">{feature.title}</h3>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--muted)]">{feature.body}</p>
      </motion.div>
    </motion.div>
  );
}

export default function FeatureScrollCards({ features, TiltIcon }) {
  const reduce = useReducedMotion();
  return (
    <div style={container}>
      {features.map((f) => (
        <ScrollCard key={f.title} feature={f} TiltIcon={TiltIcon} reduce={reduce} />
      ))}
    </div>
  );
}

/* ==============   Styles   ================ */

const container = {
  margin: "40px auto 0",
  maxWidth: 500,
  paddingBottom: 100,
  width: "100%",
};

const cardContainer = {
  overflow: "hidden",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  position: "relative",
  paddingTop: 20,
  marginBottom: -120,
};

const splash = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  clipPath: `path("M 0 303.5 C 0 292.454 8.995 285.101 20 283.5 L 460 219.5 C 470.085 218.033 480 228.454 480 239.5 L 500 430 C 500 441.046 491.046 450 480 450 L 20 450 C 8.954 450 0 441.046 0 430 Z")`,
};

const card = {
  width: 300,
  height: 430,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: 32,
  borderRadius: 20,
  boxShadow:
    "0 0 1px hsl(0deg 0% 0% / 0.075), 0 0 2px hsl(0deg 0% 0% / 0.075), 0 0 4px hsl(0deg 0% 0% / 0.075), 0 0 8px hsl(0deg 0% 0% / 0.075), 0 0 16px hsl(0deg 0% 0% / 0.075)",
  transformOrigin: "10% 60%",
}