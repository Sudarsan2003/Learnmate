import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MessagesSquare, ClipboardCheck, UploadCloud, Users2 } from "lucide-react";
import img1 from "../assets/1.png";
import img2 from "../assets/2.png";
import img3 from "../assets/3.png";
import img4 from "../assets/4.png";

const ITEMS = [
  {
    icon: MessagesSquare,
    label: "Ask a question",
    body: "Type it in plain language. Passages from your class library are retrieved first, then the answer is written.",
    image: img1,
    from: "#5EEAD4",
    to: "#0F766E",
  },
  {
    icon: ClipboardCheck,
    label: "Take a quiz",
    body: "Only quizzes that match your institution and standard show up. Nothing meant for another class.",
    image: img2,
    from: "#4F80F8",
    to: "#24389E",
  },
  {
    icon: UploadCloud,
    label: "Upload material",
    body: "Drop in a PDF or slide deck. It's indexed once and ready to be cited the moment a student asks.",
    image: img3,
    from: "#BDB0FF",
    to: "#35268F",
  },
  {
    icon: Users2,
    label: "Manage users",
    body: "Admins see every class. Teachers see their own. Students see only what they were assigned.",
    image: img4,
    from: "#A9C2FF",
    to: "#2E4E9C",
  },
];

// Share of the pinned scroll spent holding still at the start and end, so the
// first and last cards get a moment on screen before and after the row moves.
const HOLD = 0.08;

/**
 * "Four things you'll do every week".
 *
 * Wide screens: the section pins to the viewport (heading included) and the
 * row of cards slides sideways as you scroll, from the content's left edge to
 * its right edge, with a progress bar that names the step you're on.
 * Phones and reduced motion: a normal swipeable row that snaps card by card,
 * with dots underneath. `header` is the section's eyebrow and title.
 */
export default function HorizontalShowcase({ header }) {
  const reduce = useReducedMotion();
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="hs-root">
      <style>{CSS}</style>
      {wide && !reduce ? <PinnedShowcase header={header} /> : <SwipeShowcase header={header} />}
    </div>
  );
}

function Card({ item, index, active }) {
  const Icon = item.icon;
  return (
    <div
      className={`hs-item ${active ? "hs-active" : ""}`}
      style={{ background: `linear-gradient(160deg, ${item.from}, ${item.to})` }}
    >
      <div className="hs-media">
        <img src={item.image} alt="" loading="lazy" draggable="false" />
      </div>
      <div className="hs-content">
        <div className="hs-meta">
          <span className="hs-chip">
            <Icon size={15} color="#FFFFFF" strokeWidth={2.2} />
          </span>
          <span className="hs-num">0{index + 1}</span>
        </div>
        <h3>{item.label}</h3>
        <p>{item.body}</p>
      </div>
    </div>
  );
}

function PinnedShowcase({ header }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const galleryRef = useRef(null);
  const [distance, setDistance] = useState(0);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [HOLD, 1 - HOLD], [0, -distance]);
  const fill = useTransform(scrollYProgress, [HOLD, 1 - HOLD], [0, 1]);
  const glowX = useTransform(scrollYProgress, [0, 1], ["-15%", "55%"]);

  // How far the row must travel so its last card ends at the content's right edge.
  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      if (galleryRef.current && track) {
        const cs = getComputedStyle(track);
        const inner = track.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        setDistance(Math.max(0, galleryRef.current.scrollWidth - inner));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(trackRef.current);
    ro.observe(galleryRef.current);
    return () => ro.disconnect();
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const t = Math.min(1, Math.max(0, (p - HOLD) / (1 - 2 * HOLD)));
    setActive(Math.round(t * (ITEMS.length - 1)));
  });

  function goTo(i) {
    const el = containerRef.current;
    if (!el) return;
    const travel = el.offsetHeight - window.innerHeight;
    const p = HOLD + (i / (ITEMS.length - 1)) * (1 - 2 * HOLD);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + p * travel, behavior: "smooth" });
  }

  return (
    <div ref={containerRef} className="hs-pin">
      <div className="hs-stage">
        <motion.div className="hs-glow" style={{ left: glowX }} aria-hidden="true" />
        <div className="hs-inner hs-head">
          {header}
          <p className="hs-hint">Keep scrolling. The row moves sideways as you go.</p>
        </div>
        <div ref={trackRef} className="hs-inner hs-track">
          <motion.div ref={galleryRef} className="hs-gallery" style={{ x }}>
            {ITEMS.map((item, i) => (
              <Card key={item.label} item={item} index={i} active={i === active} />
            ))}
          </motion.div>
        </div>
        <div className="hs-inner">
          <div className="hs-steps" role="tablist" aria-label="Steps">
            {ITEMS.map((item, i) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`hs-step ${i === active ? "hs-step-on" : ""}`}
                onClick={() => goTo(i)}
              >
                <span className="hs-step-n">0{i + 1}</span> {item.label}
              </button>
            ))}
          </div>
          <div className="hs-bar" aria-hidden="true">
            <motion.span style={{ scaleX: fill }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SwipeShowcase({ header }) {
  const rowRef = useRef(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const row = rowRef.current;
    if (!row || !row.firstElementChild) return;
    const step = row.firstElementChild.offsetWidth + 14;
    setActive(Math.min(ITEMS.length - 1, Math.round(row.scrollLeft / step)));
  }

  function goTo(i) {
    const row = rowRef.current;
    const card = row?.children[i];
    if (card) row.scrollTo({ left: card.offsetLeft - row.offsetLeft - 24, behavior: "smooth" });
  }

  return (
    <div className="hs-swipe">
      <div className="hs-inner">
        {header}
        <p className="hs-hint">Swipe to see all four.</p>
      </div>
      <div ref={rowRef} className="hs-row" onScroll={onScroll}>
        {ITEMS.map((item, i) => (
          <Card key={item.label} item={item} index={i} active />
        ))}
      </div>
      <div className="hs-dots" role="tablist" aria-label="Steps">
        {ITEMS.map((item, i) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={item.label}
            className={`hs-dot ${i === active ? "hs-dot-on" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

const CSS = `
.hs-inner { width: 100%; max-width: 64rem; margin: 0 auto; padding: 0 2rem; box-sizing: border-box; }
.hs-hint { margin: .75rem 0 0; font-size: 15px; line-height: 1.6; color: var(--muted); }

/* ---- wide screens: pinned, moves sideways ---- */
.hs-pin { position: relative; height: 240vh; }
.hs-stage {
  position: sticky; top: 0; height: 100vh; height: 100dvh; overflow: hidden;
  display: flex; flex-direction: column; justify-content: center; gap: clamp(1rem, 3.5vh, 2rem);
  padding-top: 4rem; box-sizing: border-box;
}
.hs-glow {
  position: absolute; top: 30%; width: 46vw; height: 46vw; max-width: 640px; max-height: 640px; border-radius: 999px;
  background: radial-gradient(circle, rgba(79,128,248,.22), rgba(139,115,245,.12) 45%, transparent 70%);
  filter: blur(20px); pointer-events: none;
}
.hs-head h2 { margin-top: .75rem; }
.hs-track { position: relative; }
.hs-gallery { display: flex; gap: 28px; width: max-content; will-change: transform; }
.hs-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; }
.hs-step {
  padding: 0; border: none; background: none; text-align: left; cursor: pointer;
  font: inherit; font-size: 13.5px; font-weight: 600; color: var(--dim); transition: color 200ms ease;
}
.hs-step:hover, .hs-step-on { color: var(--text); }
.hs-step-n { margin-right: .35rem; font-variant-numeric: tabular-nums; color: #4F80F8; opacity: .5; }
.hs-step-on .hs-step-n { opacity: 1; }
.hs-bar { position: relative; height: 3px; margin-top: .6rem; border-radius: 999px; background: var(--divider); overflow: hidden; }
.hs-bar span { position: absolute; inset: 0; transform-origin: left; border-radius: inherit; background: linear-gradient(90deg, #4F80F8, #8B73F5); }

/* ---- cards (both layouts) ---- */
.hs-item {
  flex-shrink: 0; width: clamp(270px, 30vw, 340px); height: clamp(320px, 50vh, 450px); border-radius: 22px;
  position: relative; overflow: hidden; padding: 22px 22px 26px; box-sizing: border-box;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 44px -22px rgba(20,30,70,.55), inset 0 1px 1px rgba(255,255,255,.3);
  opacity: .62; transform: scale(.96); transition: opacity 400ms ease, transform 500ms cubic-bezier(.16,1,.3,1);
}
.hs-item.hs-active { opacity: 1; transform: none; }
.hs-item::before { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 45%, rgba(0,0,0,.35)); }
.hs-media { position: relative; z-index: 1; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.hs-media img {
  width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 14px 24px rgba(0,0,0,.3));
  transition: transform 500ms cubic-bezier(.16,1,.3,1); user-select: none;
}
.hs-item:hover .hs-media img { transform: scale(1.05) translateY(-4px); }
.hs-content { position: relative; z-index: 1; color: #fff; margin-top: 12px; }
.hs-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.hs-chip { display: inline-flex; width: 28px; height: 28px; border-radius: 9px; align-items: center; justify-content: center; background: rgba(255,255,255,.2); backdrop-filter: blur(4px); }
.hs-num { font-size: 13px; opacity: .8; }
.hs-item h3 { font-size: 22px; font-weight: 600; margin: 0 0 6px; }
.hs-item p { font-size: 14px; line-height: 1.5; margin: 0; opacity: .92; }

/* ---- phones / reduced motion: swipeable row ---- */
.hs-swipe { padding-bottom: 1rem; }
.hs-row {
  display: flex; gap: 14px; overflow-x: auto; padding: 1.5rem 24px 1.25rem; scroll-padding: 0 24px;
  scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch;
}
.hs-row::-webkit-scrollbar { display: none; }
.hs-row .hs-item { width: min(80vw, 320px); height: 420px; scroll-snap-align: start; opacity: 1; transform: none; }
.hs-dots { display: flex; justify-content: center; gap: .5rem; }
.hs-dot { width: 8px; height: 8px; padding: 0; border: none; border-radius: 999px; background: var(--divider); cursor: pointer; transition: width 250ms ease, background 250ms ease; }
.hs-dot-on { width: 24px; background: #4F80F8; }

@media (max-width: 767px) { .hs-inner { padding: 0 1.5rem; } }
@media (max-height: 640px) { .hs-hint { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .hs-item, .hs-media img, .hs-dot { transition: none; }
}
`;
