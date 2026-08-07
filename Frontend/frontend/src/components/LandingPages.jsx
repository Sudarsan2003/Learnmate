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
} from "lucide-react";
import AmbientBackground from "./AmbientBackground";
import ThemeToggle from "./ThemeToggle";

/* ------------------------------------------------------------------ */
/*  Brand accents — fixed across both themes, same values used         */
/*  everywhere else in the app (ChatWindow, LoginScreen, ProfileMenu). */
/*  Only structural bg/text/surface colors come from the CSS vars      */
/*  ThemeContext sets on :root, so this page inherits light/dark for   */
/*  free instead of carrying its own palette.                          */
/* ------------------------------------------------------------------ */
const GOLD = { 1: "#E4C87A", 2: "#C89B3C", 3: "#8A6A22" };
const TEAL = "#2DD4BF";
const EMBER = { text: "#FF6B4A", soft: "#FF8F6B" };
const ELECTRIC = { text: "#5B8DEF", soft: "#6E9BFF" };

/* ------------------------------------------------------------------ */
/*  useReveal — fade/rise an element in once it crosses the viewport   */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  TiltIcon — a "3D" icon badge: gradient sphere + lucide icon that   */
/*  tilts toward the cursor. Same brand gradients used app-wide, so    */
/*  it reads fine on either theme without any theme prop.              */
/* ------------------------------------------------------------------ */
function TiltIcon({ icon: Icon, tone = "gold", size = 44 }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const tones = {
    gold: {
      bg: "radial-gradient(circle at 30% 30%, #E4C87A, #C89B3C 55%, #8A6A22 100%)",
      ring: "rgba(45,212,191,0.35)",
    },
    teal: {
      bg: "radial-gradient(circle at 30% 30%, #5EEAD4, #2DD4BF 55%, #0F766E 100%)",
      ring: "rgba(45,212,191,0.35)",
    },
    ember: {
      bg: "radial-gradient(circle at 30% 30%, #FFB199, #FF6B4A 55%, #A6402A 100%)",
      ring: "rgba(255,107,74,0.35)",
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
        <Icon size={size * 0.42} color="#0B0E14" strokeWidth={2.2} />
        <span className="absolute inset-0 rounded-2xl" style={{ boxShadow: `0 0 0 1px ${t.ring} inset` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
function Eyebrow({ children, center }) {
  return (
    <div
      className={`flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#C89B3C] ${
        center ? "justify-center" : ""
      }`}
    >
      <span className="h-px w-4 bg-[#C89B3C]" />
      {children}
      {center && <span className="h-px w-4 bg-[#C89B3C]" />}
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

/* ------------------------------------------------------------------ */
/*  LoopSection — the signature scroll-linked citation trail           */
/* ------------------------------------------------------------------ */
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
          <Eyebrow>the loop</Eyebrow>
          <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
            Three steps, one thread running through them.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
            The same graph that connects a source to an answer connects these steps to each
            other — nothing a student sees is more than one hop from where it was written.
          </p>
        </Reveal>

        <div className="relative grid grid-cols-[56px_1fr] gap-x-8 sm:grid-cols-[64px_1fr]">
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
                  <span className="mb-2 block font-mono text-[11px] tracking-[0.1em] text-[var(--dim)]">
                    NODE {String(i + 1).padStart(2, "0")}
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FeatureCard / RoleCard                                             */
/* ------------------------------------------------------------------ */
function FeatureCard({ feature }) {
  return (
    <div className="feature-card group h-full rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#2DD4BF]/35 hover:bg-[var(--surface-2)]">
      <TiltIcon icon={feature.icon} tone={feature.tone} />
      <h3 className="mt-6 text-base font-semibold text-[var(--text)]">{feature.title}</h3>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">{feature.body}</p>
    </div>
  );
}

function RoleCard({ tone, tag, icon: Icon, title, items, chip }) {
  const tones = {
    electric: { glow: ELECTRIC.text, text: ELECTRIC.text, bg: "rgba(91,141,239,0.1)", border: "rgba(91,141,239,0.25)" },
    ember: { glow: EMBER.text, text: EMBER.text, bg: "rgba(255,107,74,0.1)", border: "rgba(255,107,74,0.25)" },
  };
  const t = tones[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--divider)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-[70px]"
        style={{ background: t.glow }}
      />
      <div className="relative flex items-center gap-3">
        <TiltIcon icon={Icon} tone={tone} size={40} />
        <span
          className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: t.text, background: t.bg, borderColor: t.border }}
        >
          {tag}
        </span>
      </div>
      <h3 className="lp-serif relative mt-5 text-xl text-[var(--text)]">{title}</h3>
      <ul className="relative mt-4 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
            <span className="text-[#C89B3C]">›</span>
            {item}
          </li>
        ))}
      </ul>
      <div className="relative mt-6 rounded-lg border border-[var(--divider)] bg-[var(--bg)]/50 px-3.5 py-3 font-mono text-[11.5px] text-[var(--dim)]">
        $ {chip}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
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
    <div className="relative min-h-screen w-full overflow-y-auto bg-[var(--bg)] text-[var(--text)] transition-colors duration-500">
      <AmbientBackground />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        .lp-serif {
          font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .lp-cta { box-shadow: 0 4px 16px -4px rgba(200,155,60,0.5); }
        .lp-cta:hover { box-shadow: 0 10px 22px -6px rgba(200,155,60,0.65); }
        .feature-card { box-shadow: 0 8px 20px -10px rgba(0,0,0,0.4); }
        html { scroll-behavior: smooth; }
        @keyframes lp-cue-bob {
          0%, 100% { transform: translate(-50%,0); }
          50% { transform: translate(-50%,6px); }
        }
        .lp-cue { animation: lp-cue-bob 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lp-cue { animation: none; }
          html { scroll-behavior: auto; }
        }
      `}</style>

      <div className="relative z-10">
        {/* ---------- nav ---------- */}
        <nav
          className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
            scrolled
              ? "border-[var(--divider)] bg-[var(--bg)]/80 py-3.5 backdrop-blur-xl"
              : "border-transparent bg-transparent py-[18px]"
          }`}
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 sm:px-8">
            <a href="#top" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22] shadow-[0_3px_12px_rgba(0,0,0,0.4)]">
                <Feather size={13} className="text-[#0B0E14]" />
              </div>
              <span className="lp-serif text-lg text-[var(--text)]">
                LearnMate<span className="text-[#C89B3C]">.</span>
              </span>
            </a>

            <div className="hidden items-center gap-7 text-[13px] text-[var(--muted)] md:flex">
              <a href="#loop" className="transition-colors hover:text-[var(--text)]">How it works</a>
              <a href="#features" className="transition-colors hover:text-[var(--text)]">Product</a>
              <a href="#roles" className="transition-colors hover:text-[var(--text)]">For classrooms</a>
              <button
                onClick={() => onEnter("login")}
                className="rounded-lg border border-[#2DD4BF]/20 px-4 py-2 text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/50"
              >
                Log in
              </button>
              <button
                onClick={() => onEnter("register")}
                className="lp-cta flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-4 py-2 font-medium text-[#0B0E14] transition-transform hover:-translate-y-0.5"
              >
                Start learning
              </button>
              <ThemeToggle />
            </div>

            <div className="flex items-center gap-3 md:hidden">
              <ThemeToggle />
            </div>
          </div>
        </nav>

        {/* ---------- hero ---------- */}
        <header id="top" className="relative flex min-h-screen flex-col items-center justify-center px-6 pb-24 pt-36 text-center sm:pt-40">
          <div className="relative z-[2] max-w-2xl">
            <Eyebrow center>sourced, not guessed</Eyebrow>
            <h1 className="lp-serif mt-5 text-[34px] leading-[1.06] text-[var(--text)] sm:text-[52px] lg:text-[62px]">
              Every answer, <span className="text-[#C89B3C]">traced</span>
              <br />
              back to the page it came from.
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-[16.5px] leading-relaxed text-[var(--muted)]">
              LearnMate reads the material your teacher actually assigned — textbooks, slides,
              problem sets — and answers questions from that alone, with a citation attached to
              every claim.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3.5">
              <button
                onClick={() => onEnter("register")}
                className="lp-cta flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-6 py-3 text-sm font-medium text-[#0B0E14] transition-transform hover:-translate-y-0.5"
              >
                Start learning <ArrowRight size={15} />
              </button>
              <a
                href="#loop"
                className="rounded-lg border border-[#2DD4BF]/20 px-6 py-3 text-sm text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--dim)]">
              your tutor, grounded in sources
            </p>
          </div>

          <div className="lp-cue absolute bottom-7 left-1/2 z-[2] flex -translate-x-1/2 flex-col items-center gap-2 text-[var(--dim)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">scroll</span>
            <ChevronDown size={14} />
          </div>
        </header>

        {/* ---------- loop (signature) ---------- */}
        <LoopSection />

        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-[#2DD4BF]/25 to-transparent" />
        </div>

        {/* ---------- features ---------- */}
        <section id="features" className="py-28 sm:py-32">
          <div className="mx-auto max-w-5xl px-6 sm:px-8">
            <Reveal className="mb-14 max-w-xl">
              <Eyebrow>the product</Eyebrow>
              <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
                Built for a real classroom, not a demo.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
                Every piece is scoped by role, institution, and class — so what a student sees
                is exactly what their teacher put in front of them.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 90}>
                  <FeatureCard feature={f} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- roles ---------- */}
        <section id="roles" className="py-28 sm:py-32">
          <div className="mx-auto max-w-5xl px-6 sm:px-8">
            <Reveal className="mb-14 max-w-xl">
              <Eyebrow>for classrooms</Eyebrow>
              <h2 className="lp-serif mt-4 text-3xl leading-[1.15] text-[var(--text)] sm:text-4xl">
                One app, two very different jobs to do.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
                A student needs a fast, trustworthy answer. A teacher needs control over what
                that answer is allowed to draw from. LearnMate keeps both honest.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Reveal>
                <RoleCard
                  tone="electric"
                  tag="student"
                  icon={GraduationCap}
                  title="Ask, learn, check the source"
                  items={[
                    "Chat grounded in the current class's material only",
                    "Quizzes that match their institution and standard",
                    "A citation on every answer, one tap from the original page",
                  ]}
                  chip={
                    <>
                      <span className="text-[#C89B3C]">ask</span> "explain the water cycle"{" "}
                      <span>— 3 sources found</span>
                    </>
                  }
                />
              </Reveal>
              <Reveal delay={90}>
                <RoleCard
                  tone="ember"
                  tag="teacher / admin"
                  icon={Users2}
                  title="Upload, scope, and manage"
                  items={[
                    "Drag-and-drop document ingestion into the shared library",
                    "Institution and standard controls so quizzes reach the right students",
                    "User management for admins across every class",
                  ]}
                  chip={
                    <>
                      <span className="text-[#C89B3C]">upload</span> chapter-4-notes.pdf{" "}
                      <span>— indexed</span>
                    </>
                  }
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------- principles ---------- */}
        <section className="py-24 text-center sm:py-28">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-1 px-6">
            {["No answer without a source.", "No quiz outside your class.", "No document your institution didn't upload."].map((line, i) => (
              <Reveal
                key={line}
                delay={i * 90}
                as="p"
                className="lp-serif py-3 text-xl font-medium text-[var(--muted)] sm:text-3xl"
              >
                <span className="italic text-[#C89B3C]">No</span> {line.replace(/^No /, "")}
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section id="cta" className="py-32 text-center sm:py-40">
          <Reveal className="mx-auto max-w-lg px-6">
            <Eyebrow center>get started</Eyebrow>
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
                className="lp-cta flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-6 py-3 text-sm font-medium text-[#0B0E14] transition-transform hover:-translate-y-0.5"
              >
                Create an account <ArrowRight size={15} />
              </button>
              <button
                onClick={() => onEnter("login")}
                className="rounded-lg border border-[#2DD4BF]/20 px-6 py-3 text-sm text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/50"
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
              LearnMate<span className="text-[#C89B3C]">.</span>
            </span>
            <div className="flex gap-5 font-mono">
              <a href="#loop" className="transition-colors hover:text-[var(--text)]">How it works</a>
              <a href="#features" className="transition-colors hover:text-[var(--text)]">Product</a>
              <a href="#roles" className="transition-colors hover:text-[var(--text)]">Classrooms</a>
            </div>
            <span className="font-mono">grounded in sources</span>
          </div>
        </footer>
      </div>
    </div>
  );
}