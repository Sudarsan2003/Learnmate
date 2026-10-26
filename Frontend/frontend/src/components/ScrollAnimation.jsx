import { motion, useReducedMotion } from "motion/react";

/* ------------------------------------------------------------------ */
/*  ScrollAnimation — slides + fades its children in from the left,    */
/*  right, or below as they enter the viewport.                        */
/*  Same API as the snippet you shared:                                */
/*    <ScrollAnimation direction="left" viewport={{ amount: 0.5 }}>    */
/*  (Local replacement for '@/components/ui/scroll-animation'.)        */
/* ------------------------------------------------------------------ */
export default function ScrollAnimation({
  direction, // "left" | "right" | undefined (rises from below)
  viewport = { amount: 0.5 },
  distance = 120,
  className = "",
  children,
}) {
  const reduce = useReducedMotion();

  const hidden = reduce
    ? { opacity: 1 }
    : {
        opacity: 0,
        x: direction === "left" ? -distance : direction === "right" ? distance : 0,
        y: direction ? 0 : 60,
      };

  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, ...viewport }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.9 }}
    >
      {children}
    </motion.div>
  );
}