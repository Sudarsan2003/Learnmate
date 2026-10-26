import { useEffect, useRef, useState } from "react";
import {
  Feather,
  UploadCloud,
  MessagesSquare,
  Link2,
  ClipboardCheck,
  FolderKanban,
  ShieldCheck,
  GraduationCap,
  Users2,
  ArrowRight,
  ChevronDown,
  FileText,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import AmbientBackground from "./AmbientBackground";
import ThemeToggle from "./ThemeToggle";
import FeatureScrollCards from "./FeatureScrollCards";
import HorizontalShowcase from "./HorizontalShowcase";
import ScrollAnimation from "./ScrollAnimation";
import {
  ScrollProgress,
  WordReveal,
  HeroParallax,
  HeroSpotlight,
  ScrollMarquee,
  ScaleOnScroll,
} from "./ScrollEffects";

/* Brand accents — fixed across both themes. Structural colors come from
   the CSS vars ThemeContext sets on :root. */
const GOLD = { 1: "#4F80F8", 2: "#3558DE", 3: "#24389E" };
const TEAL = "#2DD4BF";
const EMBER = { text: "#6A4DE0", soft: "#8B73F5" };
const ELECTRIC = { text: "#5B8DEF", soft: "#6E9BFF" };

/* useReveal — fade/rise an element in once it crosses the viewport */
function useReveal(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -60px 0px", ...options }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [ref, visible];
}

/* TiltIcon — gradient sphere + lucide icon that tilts toward the cursor */
function TiltIcon({ icon: Icon, tone = "gold", size = 44 }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const tones = {
    gold: {
      bg: "radial-gradient(circle at 30% 30%, #4F80F8, #3558DE 55%, #24389E 100%)",
      ring: "rgba(45,212,191,0.35)",
    },
    teal: {
      bg: "radial-gradient(circle at 30% 30%, #5EEAD4, #2DD4BF 55%, #0F766E 100%)",
      ring: "rgba(45,212,191,0.35)",
    },
    ember: {
      bg: "radial-gradient(circle at 30% 30%, #BDB0FF, #6A4DE0 55%, #35268F 100%)",
      ring: "rgba(106,77,224,0.35)",
    },
    electric: {
      bg: "radial-gradient(circle at 30% 30%, #A9C2FF, #5B8DEF 55%, #2E4E9C 100%)",
      ring: "rgba(91,141,239,0.35)",
    },
  };
  const t = tones[tone] ?? tones.gold;

  function handleMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -24, y: px * 24 });
  }
  function handleLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div style={{ perspective: "400px" }}>
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{
          width: size,
          height: size,
          background: t.bg,
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 160ms ease-out",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.4)",
        }}
        className="relative flex flex-shrink-0 items-center justify-center rounded-2xl"
      >
        <Icon size={size * 0.42} color="#FFFFFF" strokeWidth={2.2} />
        <span className="absolute inset-0 rounded-2xl" style={{ boxShadow: `0 0 0 1px ${t.ring} inset` }} />
      </div>
    </div>
  );
}

/* Small building blocks */
function Eyebrow({ children, center }) {
  return (
    <div
      className={`flex items-center gap-2.5 font-ui text-[13px] font-semibold tracking-[0.02em] text-[var(--gold-ink)] ${
        center ? "justify-center" : ""
      }`}
    >
      <span className="h-px w-4 bg-[#3558DE]" />
      {children}
      {center && <span className="h-px w-4 bg-[#3558DE]" />}
    </div>
  );
}

function Reveal({ as: Tag = "div", delay = 0, className = "", style = {}, children }) {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(26px)",
        transition: "opacity 800ms cubic-bezier(0.16,1,0.3,1), transform 800ms cubic-bezier(0.16,1,0.3,1)",
        ...style,
      }}
      className={className}
    >
      {children}
    </Tag>
  );
}

const FEATURES = [
  {
    icon: MessagesSquare,
    tone: "teal",
    title: "Grounded chat",
    body: "Answers pulled from what was actually assigned, with a citation attached — not a guess from the open web.",
  },
  {
    icon: ClipboardCheck,
    tone: "gold",
    title: "Class-scoped quizzes",
    body: "Quizzes only surface for students whose institution and standard match — nobody sees material meant for another class.",
  },
  {
    icon: FolderKanban,
    tone: "ember",
    title: "Document library",
    body: "Teachers and admins upload and organize source material once, ready to be retrieved the moment a student asks.",
  },
  {
    icon: ShieldCheck,
    tone: "electric",
    title: "Role-based access",
    body: "Students, teachers, and admins each get the tools their role needs — and only those.",
  },
];

const LOOP = [
  { icon: UploadCloud, title: "Upload", body: "Teachers and admins add source material — textbooks, slide decks, handouts — into a library scoped to their institution and class." },
  { icon: MessagesSquare, title: "Ask", body: "A student asks a question in plain language. LearnMate retrieves the exact passages that are relevant before it writes a single word of the answer." },
  { icon: Link2, title: "Cite", body: "The response links back to its source, so a student can open the original page instead of taking the answer on faith." },
];

const LOOP_TITLES = ["Library · Class 8 Science", "Chat · Grounded retrieval", "Answer · With citations"];

/* MobileLoopCard — shown under each step on small screens (the sticky
   side panel is desktop-only). The demo mounts when scrolled into view
   so its animations play when the reader actually sees it. */
function MobileLoopCard({ step }) {
  const [ref, visible] = useReveal({ threshold: 0.2 });
  return (
    <div
      ref={ref}
      className="relative mt-5 min-h-[300px] overflow-hidden rounded-2xl border border-[var(--divider)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] p-3.5 shadow-[0_18px_50px_-24px_rgba(53,88,222,0.55)] lg:hidden"
    >
      <div className="mb-3 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FF5F57]/80" />
          <span className="h-2 w-2 rounded-full bg-[#FEBC2E]/80" />
          <span className="h-2 w-2 rounded-full bg-[#28C840]/80" />
        </div>
        <span className="font-ui text-[11px] text-[var(--dim)]">{LOOP_TITLES[step]}</span>
        <span className="w-8" />
      </div>
      {visible && (step === 0 ? <UploadDemo /> : step === 1 ? <AskDemo /> : <CiteDemo />)}
    </div>
  );
}

/* LoopSection — the signature scroll-linked citation trail */
function LoopSection() {
  const sectionRef = useRef(null);
  const itemRefs = useRef([]);
  const pathRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const PATH_LEN = 1000;

  useEffect(() => {
    function update() {
      const section = sectionRef.current;
      const path = pathRef.current;
      if (!section || !path) return;

      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh;
      let progress = (vh - rect.top) / total;
      progress = Math.max(0, Math.min(1, progress));
      path.style.strokeDashoffset = String(PATH_LEN - PATH_LEN * progress);

      let active = -1;
      itemRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (mid < vh * 0.7 && mid > -r.height) active = i;
      });
      setActiveIndex(active);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }

    update();
    document.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <section ref={sectionRef} id="loop" className="py-28 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <Reveal className="mb-14 max-w-xl">
          <Eyebrow>The loop</Eyebrow>
          <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
            Three steps, one thread running through them.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
            The same graph that connects a source to an answer connects these steps to each
            other — nothing a student sees is more than one hop from where it was written.
          </p>
        </Reveal>

        <div className="relative grid grid-cols-[56px_1fr] gap-x-8 sm:grid-cols-[64px_1fr] lg:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-10">
          <div className="relative">
            <svg viewBox="0 0 56 560" preserveAspectRatio="none" className="absolute left-0 top-0 h-full w-14 overflow-visible">
              <defs>
                <linearGradient id="railGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ELECTRIC.text} />
                  <stop offset="50%" stopColor={GOLD[2]} />
                  <stop offset="100%" stopColor={EMBER.text} />
                </linearGradient>
              </defs>
              <path
                ref={pathRef}
                d="M 11 10 V 550"
                fill="none"
                stroke="url(#railGradient)"
                strokeWidth="1.6"
                pathLength={PATH_LEN}
                strokeDasharray={PATH_LEN}
                strokeDashoffset={PATH_LEN}
              />
            </svg>
          </div>

          <div className="flex flex-col gap-16">
            {LOOP.map((item, i) => {
              const isActive = activeIndex === i;
              return (
                <div key={item.title} ref={(el) => (itemRefs.current[i] = el)} className="relative">
                  <div
                    className="absolute -left-[60px] top-0.5 flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-300 sm:-left-[68px]"
                    style={{
                      borderColor: isActive ? GOLD[2] : "var(--divider)",
                      background: isActive ? `${GOLD[2]}1A` : "var(--bg)",
                      boxShadow: isActive ? `0 0 0 6px ${GOLD[2]}14, 0 0 16px ${GOLD[1]}59` : "none",
                    }}
                  >
                    <item.icon
                      size={18}
                      color={isActive ? GOLD[2] : "var(--dim)"}
                      strokeWidth={2}
                      style={{ transition: "color 300ms ease" }}
                    />
                  </div>
                  <span className="mb-2 block text-[13px] font-medium text-[var(--dim)]">
                    Step {i + 1}
                  </span>
                  <h3
                    className="lp-serif text-xl transition-colors duration-300"
                    style={{ color: isActive ? GOLD[2] : "var(--text)" }}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-2.5 max-w-md text-[14.5px] leading-relaxed text-[var(--muted)]">
                    {item.body}
                  </p>
                  <MobileLoopCard step={i} />
                </div>
              );
            })}
          </div>

          <LoopVisual active={activeIndex} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Small UI mocks — reused by the loop visual and the role cards      */
/* ------------------------------------------------------------------ */
function Pill({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--divider)] bg-[var(--bg)]/60 px-2.5 py-1 font-ui text-[11.5px] text-[var(--muted)] ${className}`}
    >
      {children}
    </span>
  );
}

function FileRow({ name, meta, state = "done", delay = 0 }) {
  return (
    <div
      className="lp-pop rounded-xl border border-[var(--divider)] bg-[var(--bg)]/60 p-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#3558DE]/15 text-[#5B8DEF]">
          <FileText size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[var(--text)]">{name}</div>
          <div className="text-[11.5px] text-[var(--dim)]">{meta}</div>
        </div>
        {state === "done" ? (
          <span
            className="lp-pop flex items-center gap-1 text-[11.5px] font-medium text-[#2DD4BF]"
            style={{ animationDelay: `${delay + 1700}ms` }}
          >
            <CheckCircle2 size={14} /> Indexed
          </span>
        ) : (
          <span className="text-[11.5px] text-[var(--dim)]">Indexing…</span>
        )}
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--divider)]">
        <div
          className={state === "done" ? "lp-bar" : "lp-bar-loop"}
          style={{
            height: "100%",
            width: "100%",
            background: "linear-gradient(90deg,#5B8DEF,#6A4DE0)",
            animationDelay: `${delay + 200}ms`,
          }}
        />
      </div>
    </div>
  );
}

function ChatBubble({ me, delay = 0, children }) {
  return (
    <div className={`lp-pop flex ${me ? "justify-end" : "justify-start"}`} style={{ animationDelay: `${delay}ms` }}>
      <div
        className={
          me
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-3.5 py-2 text-[13px] text-white"
            : "max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--divider)] bg-[var(--bg)]/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--muted)]"
        }
      >
        {children}
      </div>
    </div>
  );
}

function CiteChip({ n }) {
  return (
    <sup className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-[#3558DE]/20 px-1 text-[10px] font-semibold text-[#5B8DEF]">
      {n}
    </sup>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#5B8DEF]"
          style={{ animation: "lp-dot 1.2s ease-in-out infinite", animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

/* ---------- loop visual: right-hand panel that follows the active step ---------- */
function UploadDemo() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="mb-1 flex flex-wrap gap-2">
        <Pill>Class 8</Pill>
        <Pill>Science</Pill>
        <Pill>Your institution</Pill>
      </div>
      <FileRow name="biology-ch4.pdf" meta="PDF · 2.4 MB" delay={100} />
      <FileRow name="water-cycle-slides.pptx" meta="Slides · 18 slides" delay={450} />
      <FileRow name="practice-set-2.docx" meta="Handout · 3 pages" delay={800} />
      <div className="lp-pop mt-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--divider)] py-3 font-ui text-[12px] text-[var(--dim)]" style={{ animationDelay: "1100ms" }}>
        <UploadCloud size={14} /> Drop more files to add them to the library
      </div>
    </div>
  );
}

function AskDemo() {
  const passages = [
    ["biology-ch4.pdf", "p. 42", "Evaporation lifts water from oceans and lakes into the air."],
    ["water-cycle-slides.pptx", "slide 6", "Vapour cools, condenses and forms clouds."],
    ["biology-ch4.pdf", "p. 44", "Precipitation returns water to the surface."],
  ];
  return (
    <div className="flex flex-col gap-3">
      <ChatBubble me delay={80}>Explain the water cycle</ChatBubble>
      <div className="lp-pop flex items-center gap-2 font-ui text-[12px] text-[var(--dim)]" style={{ animationDelay: "500ms" }}>
        <ThinkingDots /> Retrieving passages from your class library
      </div>
      <div className="flex flex-col gap-2">
        {passages.map(([file, loc, text], i) => (
          <div
            key={text}
            className="lp-pop rounded-xl border border-[var(--divider)] bg-[var(--bg)]/60 px-3 py-2.5"
            style={{ animationDelay: `${900 + i * 300}ms` }}
          >
            <div className="mb-1 flex items-center gap-1.5 font-ui text-[11px] font-medium text-[#5B8DEF]">
              <BookOpen size={12} /> {file} · {loc}
            </div>
            <div className="text-[12.5px] leading-snug text-[var(--muted)]">{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CiteDemo() {
  const widths = [92, 100, 86, 96, 72, 100, 64];
  return (
    <div className="flex flex-col gap-3">
      <ChatBubble delay={80}>
        Water evaporates from oceans and lakes<CiteChip n={1} />, condenses into clouds
        <CiteChip n={2} />, then returns to the surface as rain<CiteChip n={1} />.
      </ChatBubble>
      <div className="lp-pop rounded-xl border border-[var(--divider)] bg-[var(--bg)]/60 p-3.5" style={{ animationDelay: "600ms" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-ui text-[12px] font-medium text-[var(--text)]">
            <FileText size={13} className="text-[#5B8DEF]" /> biology-ch4.pdf · Page 42
          </div>
          <span className="flex items-center gap-1 font-ui text-[11.5px] text-[#5B8DEF]">
            Open original <ExternalLink size={11} />
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {widths.map((w, i) => {
            const hl = i === 3 || i === 4;
            return (
              <div key={i} className="relative h-2 rounded-full bg-[var(--divider)]" style={{ width: `${w}%` }}>
                {hl && (
                  <div
                    className="lp-bar absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: "100%",
                      background: "linear-gradient(90deg,#5B8DEF,#6A4DE0)",
                      animationDelay: `${1000 + (i - 3) * 350}ms`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="lp-pop flex items-center gap-2 font-ui text-[12px] text-[var(--dim)]" style={{ animationDelay: "1500ms" }}>
        <Sparkles size={13} className="text-[#6A4DE0]" /> Every claim links to the exact passage
      </div>
    </div>
  );
}

function LoopVisual({ active }) {
  const step = Math.max(active, 0);
  return (
    <div className="hidden lg:block">
      <div className="sticky top-32">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--divider)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] p-5 shadow-[0_24px_70px_-28px_rgba(53,88,222,0.55)]">
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-[80px]"
            style={{ background: "linear-gradient(135deg,#5B8DEF,#6A4DE0)", animation: "lp-float 7s ease-in-out infinite" }}
          />
          <div className="relative flex items-center justify-between border-b border-[var(--divider)] pb-3.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]/80" />
            </div>
            <span className="font-ui text-[12px] text-[var(--dim)]">{LOOP_TITLES[step]}</span>
            <span className="w-10" />
          </div>

          <div key={step} className="relative mt-4 min-h-[340px]">
            {step === 0 && <UploadDemo />}
            {step === 1 && <AskDemo />}
            {step === 2 && <CiteDemo />}
          </div>

          <div className="relative mt-3 flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: i === step ? 22 : 6,
                  background: i === step ? "linear-gradient(90deg,#5B8DEF,#6A4DE0)" : "var(--divider)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- role card previews ---------- */
function StudentPreview() {
  return (
    <div className="flex flex-col gap-2.5">
      <ChatBubble me>Explain the water cycle</ChatBubble>
      <ChatBubble>
        Water evaporates, condenses into clouds, then falls as rain.
        <CiteChip n={1} />
        <CiteChip n={2} />
        <CiteChip n={3} />
      </ChatBubble>
      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          <Link2 size={11} className="text-[#5B8DEF]" /> biology-ch4.pdf · p. 42
        </Pill>
        <span className="ml-auto flex items-center gap-2 font-ui text-[11.5px] text-[var(--dim)]">
          <ThinkingDots /> 3 sources found
        </span>
      </div>
    </div>
  );
}

function TeacherPreview() {
  return (
    <div className="flex flex-col gap-2.5">
      <FileRow name="chapter-4-notes.pdf" meta="PDF · Class 8 · Science" delay={0} />
      <FileRow name="water-cycle-slides.pptx" meta="Slides · Class 8 · Science" state="loading" delay={200} />
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--divider)] py-2.5 font-ui text-[12px] text-[var(--dim)]">
        <UploadCloud size={14} /> Drop files to index them
      </div>
    </div>
  );
}

/* RoleCard — spotlight follows the cursor, live preview at the bottom */
function RoleCard({ tone, tag, icon: Icon, title, items, preview, pills = [] }) {
  const tones = {
    electric: {
      glow: ELECTRIC.text,
      text: ELECTRIC.text,
      bg: "rgba(91,141,239,0.1)",
      border: "rgba(91,141,239,0.25)",
      spot: "rgba(91,141,239,0.16)",
      ring: "rgba(91,141,239,0.55)",
    },
    ember: {
      glow: EMBER.text,
      text: EMBER.text,
      bg: "rgba(106,77,224,0.1)",
      border: "rgba(106,77,224,0.25)",
      spot: "rgba(106,77,224,0.18)",
      ring: "rgba(106,77,224,0.55)",
    },
  };
  const t = tones[tone];

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <div
      onMouseMove={onMove}
      style={{ "--mx": "70%", "--my": "0%" }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--divider)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] p-8 transition-transform duration-500 hover:-translate-y-1.5"
    >
      {/* drifting colour orb */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-[70px]"
        style={{ background: t.glow, animation: "lp-float 8s ease-in-out infinite" }}
      />
      {/* cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(420px circle at var(--mx) var(--my), ${t.spot}, transparent 60%)` }}
      />
      {/* border highlight on hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${t.ring}` }}
      />
      {/* top hairline */}
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${t.ring}, transparent)` }}
      />

      <div className="relative flex items-center gap-3">
        <TiltIcon icon={Icon} tone={tone} size={40} />
        <span
          className="rounded-md border px-2.5 py-1 font-ui text-[12px] font-semibold"
          style={{ color: t.text, background: t.bg, borderColor: t.border }}
        >
          {tag}
        </span>
      </div>
      <h3 className="lp-serif relative mt-5 text-xl text-[var(--text)]">{title}</h3>
      <ul className="relative mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: t.text }} />
            {item}
          </li>
        ))}
      </ul>

      <div className="relative mt-auto pt-7">
        <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/40 p-3.5 backdrop-blur-sm">
          {preview}
        </div>
        {pills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {pills.map((p) => (
              <Pill key={p}>{p}</Pill>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Main page */
export default function LandingPage({ onEnter = () => {} }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => document.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-[var(--bg)] text-[var(--text)] transition-colors duration-500">
      <AmbientBackground />

      <style>{`
        .lp-serif {
          font-family: 'Sora', system-ui, sans-serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .lp-cta { box-shadow: 0 4px 16px -4px rgba(53,88,222,0.5); }
        .lp-cta:hover { box-shadow: 0 10px 22px -6px rgba(53,88,222,0.65); }
        html { scroll-behavior: smooth; }
        /* The nav is fixed, so anchor targets need room or their headings land under it. */
        section[id], header[id] { scroll-margin-top: 4.5rem; }
        @keyframes lp-cue-bob {
          0%, 100% { transform: translate(-50%,0); }
          50% { transform: translate(-50%,6px); }
        }
        .lp-cue { animation: lp-cue-bob 2.4s ease-in-out infinite; }
        @keyframes lp-pop { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }
        .lp-pop { animation: lp-pop 600ms cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes lp-bar { from { width: 0; } to { width: 100%; } }
        .lp-bar { animation: lp-bar 1.5s cubic-bezier(0.4,0,0.2,1) both; }
        @keyframes lp-bar-loop { 0% { width: 0; } 70%, 100% { width: 100%; } }
        .lp-bar-loop { animation: lp-bar-loop 3s ease-in-out infinite; }
        @keyframes lp-dot { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
        @keyframes lp-float { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-14px,14px); } }
        @keyframes lp-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        .lp-fade-up { animation: lp-fade-up 900ms cubic-bezier(0.16,1,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .lp-cue, .lp-pop, .lp-bar, .lp-bar-loop, .lp-fade-up { animation: none; }
          html { scroll-behavior: auto; }
        }
      `}</style>

      <div className="relative z-10">
        <ScrollProgress />
        <HeroSpotlight />

        {/* ---------- nav ---------- */}
        <nav
          className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
            scrolled
              ? "border-[var(--divider)] bg-[var(--bg)]/80 py-3.5 backdrop-blur-xl"
              : "border-transparent bg-transparent py-[18px]"
          }`}
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 sm:px-8">
            <a href="#top" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F80F8] to-[#24389E] shadow-[0_3px_12px_rgba(0,0,0,0.4)]">
                <Feather size={13} className="text-[#FFFFFF]" />
              </div>
              <span className="lp-serif text-lg text-[var(--text)]">
                LearnMate<span className="text-[var(--accent-ink)]">.</span>
              </span>
            </a>

            <div className="flex items-center gap-3 text-[13px] text-[var(--muted)] sm:gap-5 lg:gap-7">
              <a href="#loop" className="hidden transition-colors hover:text-[var(--text)] lg:inline">How it works</a>
              <a href="#features" className="hidden transition-colors hover:text-[var(--text)] lg:inline">Product</a>
              <a href="#roles" className="hidden transition-colors hover:text-[var(--text)] lg:inline">For classrooms</a>
              <button
                onClick={() => onEnter("login")}
                className="rounded-lg border border-[#4F7CFF]/20 px-3 py-1.5 text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/50 sm:px-4 sm:py-2"
              >
                Log in
              </button>
              <button
                onClick={() => onEnter("register")}
                className="lp-cta hidden items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-4 py-2 font-medium text-[#FFFFFF] transition-transform hover:-translate-y-0.5 sm:flex"
              >
                Start learning
              </button>
              <ThemeToggle />
            </div>
          </div>
        </nav>

        {/* ---------- hero ---------- */}
        <header id="top" className="relative flex min-h-screen flex-col items-center justify-center px-6 pb-24 pt-36 text-center sm:pt-40">
          <HeroParallax className="relative z-[2] max-w-2xl">
            <Eyebrow center>Sourced, not guessed</Eyebrow>
            <WordReveal
              text="Every answer, traced back to the page it came from."
              accent="traced"
              className="lp-serif mt-5 text-[34px] leading-[1.06] text-[var(--text)] sm:text-[52px] lg:text-[62px]"
            />
            <div className="lp-fade-up" style={{ animationDelay: "2.4s" }}>
            <p className="mx-auto mt-6 max-w-lg text-[16.5px] leading-relaxed text-[var(--muted)]">
              LearnMate reads the material your teacher actually assigned — textbooks, slides,
              problem sets — and answers questions from that alone, with a citation attached to
              every claim.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3.5">
              <button
                onClick={() => onEnter("register")}
                className="lp-cta flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-6 py-3 text-sm font-medium text-[#FFFFFF] transition-transform hover:-translate-y-0.5"
              >
                Start learning <ArrowRight size={15} />
              </button>
              <a
                href="#loop"
                className="rounded-lg border border-[#4F7CFF]/20 px-6 py-3 text-sm text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-16 font-ui text-[13px] text-[var(--dim)]">
              Your tutor, grounded in sources
            </p>
            </div>
          </HeroParallax>

          <div className="lp-cue absolute bottom-7 left-1/2 z-[2] flex -translate-x-1/2 flex-col items-center gap-2 text-[var(--dim)]">
            <span className="font-ui text-[12px] font-medium">Scroll</span>
            <ChevronDown size={14} />
          </div>
        </header>

        {/* ---------- marquee ---------- */}
        <ScrollMarquee items={["Textbooks", "Slides", "Problem sets", "Handouts"]} />

        {/* ---------- loop (signature) ---------- */}
        <LoopSection />

        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-[#4F7CFF]/25 to-transparent" />
        </div>

        {/* ---------- features (scroll-triggered cards) ---------- */}
        <section id="features" className="py-28 sm:py-32">
          <div className="mx-auto max-w-5xl px-6 sm:px-8">
            <Reveal className="mb-6 max-w-xl">
              <Eyebrow>The product</Eyebrow>
              <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
                Built for a real classroom, not a demo.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
                Every piece is scoped by role, institution, and class — so what a student sees
                is exactly what their teacher put in front of them.
              </p>
            </Reveal>

            <FeatureScrollCards features={FEATURES} TiltIcon={TiltIcon} />
          </div>
        </section>

        {/* ---------- tour (horizontal scroll) ---------- */}
        <section id="tour" className="pt-12 sm:pt-16">
          <div className="mx-auto max-w-5xl px-6 sm:px-8">
            <Reveal className="max-w-xl">
              <Eyebrow>Inside LearnMate</Eyebrow>
              <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
                Four things you'll do every week.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
                Keep scrolling — the row moves sideways as you go.
              </p>
            </Reveal>
          </div>
          <HorizontalShowcase />
        </section>

        {/* ---------- roles ---------- */}
        <section id="roles" className="py-28 sm:py-32">
          <div className="mx-auto max-w-5xl px-6 sm:px-8">
            <Reveal className="mb-14 max-w-xl">
              <Eyebrow>For classrooms</Eyebrow>
              <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
                One app, two very different jobs to do.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
                A student needs a fast, trustworthy answer. A teacher needs control over what
                that answer is allowed to draw from. LearnMate keeps both honest.
              </p>
            </Reveal>

            <ScaleOnScroll>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <RoleCard
                  tone="electric"
                  tag="Student"
                  icon={GraduationCap}
                  title="Ask, learn, check the source"
                  items={[
                    "Chat grounded in the current class's material only",
                    "Quizzes that match their institution and standard",
                    "A citation on every answer, one tap from the original page",
                  ]}
                  preview={<StudentPreview />}
                  pills={["Cited answers", "Class quizzes", "Source links"]}
                />
                <RoleCard
                  tone="ember"
                  tag="Teacher / admin"
                  icon={Users2}
                  title="Upload, scope, and manage"
                  items={[
                    "Drag-and-drop document ingestion into the shared library",
                    "Institution and standard controls so quizzes reach the right students",
                    "User management for admins across every class",
                  ]}
                  preview={<TeacherPreview />}
                  pills={["Bulk upload", "Class scoping", "User roles"]}
                />
              </div>
            </ScaleOnScroll>
          </div>
        </section>

        {/* ---------- principles (slide in left / right / centre) ---------- */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-6 sm:px-8">
            <ScrollAnimation
              direction="left"
              viewport={{ amount: 0.5 }}
              className="lp-serif max-w-lg py-14 text-left text-3xl leading-tight text-[var(--muted)] sm:py-24 sm:text-5xl"
            >
              <p><span className="italic text-[var(--accent-ink)]">No</span> answer without a source.</p>
            </ScrollAnimation>

            <ScrollAnimation
              direction="right"
              viewport={{ amount: 0.5 }}
              className="lp-serif ml-auto max-w-lg py-14 text-right text-3xl leading-tight text-[var(--muted)] sm:py-24 sm:text-5xl"
            >
              <p><span className="italic text-[var(--accent-ink)]">No</span> quiz outside your class.</p>
            </ScrollAnimation>

            <ScrollAnimation
              viewport={{ amount: 0.5 }}
              className="lp-serif mx-auto max-w-lg py-14 text-center text-3xl leading-tight text-[var(--muted)] sm:py-24 sm:text-5xl"
            >
              <p><span className="italic text-[var(--accent-ink)]">No</span> document your institution didn't upload.</p>
            </ScrollAnimation>
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section id="cta" className="py-32 text-center sm:py-40">
          <Reveal className="mx-auto max-w-lg px-6">
            <Eyebrow center>Get started</Eyebrow>
            <h2 className="lp-serif mt-5 text-4xl text-[var(--text)] sm:text-5xl">
              Ready to ask something real?
            </h2>
            <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--muted)]">
              Create an account to start chatting with your class's material, or log in if your
              institution is already set up.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3.5">
              <button
                onClick={() => onEnter("register")}
                className="lp-cta flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-6 py-3 text-sm font-medium text-[#FFFFFF] transition-transform hover:-translate-y-0.5"
              >
                Create an account <ArrowRight size={15} />
              </button>
              <button
                onClick={() => onEnter("login")}
                className="rounded-lg border border-[#4F7CFF]/20 px-6 py-3 text-sm text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/50"
              >
                Log in
              </button>
            </div>
          </Reveal>
        </section>

        {/* ---------- footer ---------- */}
        <footer className="border-t border-[var(--divider)] py-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3.5 px-6 text-xs text-[var(--dim)] sm:px-8">
            <span className="lp-serif text-sm text-[var(--text)]">
              LearnMate<span className="text-[var(--accent-ink)]">.</span>
            </span>
            <div className="flex gap-5 font-ui">
              <a href="#loop" className="transition-colors hover:text-[var(--text)]">How it works</a>
              <a href="#features" className="transition-colors hover:text-[var(--text)]">Product</a>
              <a href="#roles" className="transition-colors hover:text-[var(--text)]">Classrooms</a>
            </div>
            <span className="font-ui">Grounded in sources</span>
          </div>
        </footer>
      </div>
    </div>
  );
}