import { useState, useRef } from "react";
import {
  Feather, ScrollText, ShieldCheck, ArrowLeft, Eye, EyeOff, FileText,
  BookOpen, Lightbulb, Calculator, GraduationCap, FlaskConical, Globe, Atom,
} from "lucide-react";
import { login, register } from "../api/client";
import AmbientBackground from "./AmbientBackground";
import ThemeToggle from "./ThemeToggle";
import logoImg from "../assets/icon-512 (1).png"; // tip: rename to icon-512.png and update this path

const REMEMBER_KEY = "learnmate_remember";

// "Remember me" keeps only the username. Passwords are never stored: school
// computers are shared, and anything in localStorage is readable by the next
// person at the keyboard. Older versions saved an encoded password here, so
// drop it from any existing entry.
function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.password) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: data.username ?? "" }));
    }
    return { username: data.username ?? "" };
  } catch {
    return null;
  }
}

const INNER_ORBIT = [
  { Icon: BookOpen, color: "#6C8CFF" },
  { Icon: Lightbulb, color: "#F5B942" },
  { Icon: Calculator, color: "#4FC3F7" },
];
const OUTER_ORBIT = [
  { Icon: GraduationCap, color: "#4F80F8" },
  { Icon: FlaskConical, color: "#34D399" },
  { Icon: Globe, color: "#60A5FA" },
  { Icon: Atom, color: "#A78BFA" },
  { Icon: FileText, color: "#F472B6" },
];

function Orbit({ items, radius, duration, reverse = false }) {
  return (
    <div
      className="orbit"
      style={{
        width: radius * 2,
        height: radius * 2,
        marginLeft: -radius,
        marginTop: -radius,
        animationDuration: `${duration}s`,
        animationDirection: reverse ? "reverse" : "normal",
      }}
    >
      {items.map(({ Icon, color }, i) => {
        const a = (360 / items.length) * i;
        return (
          <div key={i} className="orbit-item" style={{ transform: `rotate(${a}deg) translateX(${radius}px)` }}>
            <div style={{ transform: `rotate(${-a}deg)` }}>
              <div
                className="orbit-counter"
                style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "normal" : "reverse" }}
              >
                <div className="icon-bubble" style={{ boxShadow: `0 6px 18px -6px ${color}99` }}>
                  <Icon size={18} color={color} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none";

export default function LoginScreen({ onAuthenticated, initialMode = "login", onBack, notice }) {
  const remembered = useState(loadRemembered)[0];

  const [mode, setMode] = useState(initialMode); // "login" | "register"
  const [username, setUsername] = useState(remembered?.username ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(!!remembered);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [standard, setStandard] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const result = mode === "login"
        ? await login(username, password)
        : await register(username, password, { email, mobile, gender, address, schoolCode, standard });
      localStorage.setItem("learnmate_token", result.token);
      localStorage.setItem("learnmate_username", result.username);

      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        /* storage unavailable (private mode, quota) - sign-in still succeeds */
      }

      onAuthenticated(result);
    } catch (err) {
      setError(err.response?.data?.message ?? "Something went wrong. Check your username and password.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleMouseMove(e) {
    // Tilt is a desktop-hover flourish only; skip on touch/coarse pointers
    // where there's no real hover and the transform would just feel laggy.
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 6 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div className="relative flex h-full w-full overflow-y-auto bg-[var(--bg)] px-4 pb-8 pt-16 text-[var(--text)]">
      <AmbientBackground />

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      {onBack && (
        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-lg border border-[#4F7CFF]/15 px-3 py-1.5 text-xs text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/40 hover:text-[var(--text)] sm:left-6 sm:top-6"
        >
          <ArrowLeft size={13} />
          Back
        </button>
      )}

      <div
        className="relative z-10 m-auto flex w-full max-w-sm items-stretch justify-center gap-6 lg:max-w-4xl"
        style={{ perspective: "1400px" }}
      >
        {/* ───────── Side card (desktop only): animated scene ───────── */}
        <aside className="side-card relative hidden min-h-[580px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#4F7CFF]/15 bg-[var(--surface)]/60 backdrop-blur-xl lg:flex">
          <div className="side-dots absolute inset-0" />
          <div className="side-glow absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full" />

          <div className="relative h-[340px] w-[340px]">
            {/* pulsing rings */}
            <span className="pulse-ring" style={{ animationDelay: "0s" }} />
            <span className="pulse-ring" style={{ animationDelay: "1.5s" }} />

            <Orbit items={OUTER_ORBIT} radius={155} duration={40} />
            <Orbit items={INNER_ORBIT} radius={102} duration={26} reverse />

            {/* centre logo */}
            <div className="logo-core absolute left-1/2 top-1/2 flex h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#4F7CFF]/30 bg-[var(--surface)]">
              <img src={logoImg} alt="LearnMate" className="h-[92px] w-[92px] object-contain" draggable="false" />
            </div>
          </div>

          {/* floating chips */}
          <div className="float-a absolute left-6 top-8 flex items-center gap-1.5 rounded-lg border border-[#4F7CFF]/25 bg-[var(--bg)]/70 px-2.5 py-1.5 font-ui text-[11px] text-[var(--muted)] backdrop-blur">
            <FileText size={12} className="text-[#4F80F8]" />
            Chapter 7 · page 42
          </div>
          <div className="float-b absolute bottom-8 right-6 flex items-center gap-1.5 rounded-lg border border-[#34D399]/30 bg-[var(--bg)]/70 px-2.5 py-1.5 font-ui text-[11px] text-[var(--muted)] backdrop-blur">
            <ShieldCheck size={12} className="text-[#34D399]" />
            From your sources
          </div>
        </aside>

        {/* ───────── Auth form ───────── */}
        <form
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onSubmit={handleSubmit}
          style={{
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition: "transform 180ms ease-out",
            transformStyle: "preserve-3d",
          }}
          className="login-card relative flex min-h-[580px] w-full max-w-sm flex-shrink-0 flex-col justify-center gap-5 rounded-2xl border border-[#4F7CFF]/15 bg-[var(--surface)]/80 p-5 backdrop-blur-xl sm:p-7"
        >
          <div className="flex items-center gap-2.5" style={{ transform: "translateZ(24px)" }}>
            <img src={logoImg} alt="" className="h-10 w-10 flex-shrink-0 object-contain" draggable="false" />
            <h1 className="lg-serif text-2xl">
              LearnMate<span className="text-[var(--accent-ink)]">.</span>
            </h1>
          </div>
          <p className="-mt-3 pl-[46px] font-ui text-[13px] text-[var(--dim)]" style={{ transform: "translateZ(16px)" }}>
            Your tutor, grounded in sources
          </p>

          <div className="relative flex overflow-hidden rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 font-ui text-sm font-semibold" style={{ transform: "translateZ(16px)" }}>
            <span
              className="absolute inset-y-0 w-1/2 rounded-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] transition-transform duration-300 ease-out"
              style={{ transform: mode === "login" ? "translateX(0%)" : "translateX(100%)" }}
            />
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`relative z-10 flex-1 py-2.5 transition-colors ${mode === "login" ? "text-[#FFFFFF]" : "text-[var(--muted)]"}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`relative z-10 flex-1 py-2.5 transition-colors ${mode === "register" ? "text-[#FFFFFF]" : "text-[var(--muted)]"}`}
            >
              Register
            </button>
          </div>

          <div className="space-y-3" style={{ transform: "translateZ(10px)" }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className={inputCls}
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={`${inputCls} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="eye-toggle absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <span
                  key={showPassword ? "on" : "off"}
                  className="eye-icon-pop flex items-center justify-center"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              </button>
            </div>

            {mode === "login" && (
              <label className="flex w-fit cursor-pointer select-none items-center gap-2 font-ui text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded accent-[#4F80F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F80F8]"
                />
                Remember me
              </label>
            )}

            {mode === "register" && (
              <div
                className="space-y-3"
                style={{ animation: "unfurl 220ms cubic-bezier(0.22,1,0.36,1) both" }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className={inputCls}
                />

                <input
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Mobile number"
                  className={inputCls}
                />

                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">Gender (optional)</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>

                <input
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                  placeholder="School code (ask your teacher)"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  className={`${inputCls} font-mono tracking-widest`}
                />

                <input
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                  placeholder="Class / standard (students only, e.g. 5)"
                  className={inputCls}
                />

                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Address"
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>
            )}
          </div>

          {notice && !error && (
            <p role="status" className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300">
              {notice}
            </p>
          )}

          {error && (
            <p className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-800/60 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !username || !password}
            style={{ transform: "translateZ(18px)" }}
            className="submit-btn flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] py-2.5 text-sm font-medium text-[#FFFFFF] transition-all disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isLoading ? (
              <ScrollText size={14} className="animate-spin" />
            ) : (
              <Feather size={14} />
            )}
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>

      <style>{`
        .lg-serif {
          font-family: 'Sora', system-ui, sans-serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .login-card,
        .side-card {
          box-shadow: 0 24px 60px -20px rgba(20,40,110,0.5), 0 1px 0 rgba(255,255,255,0.05) inset;
        }
        @keyframes unfurl {
          from { opacity: 0; transform: scaleY(0.8) translateY(-6px); transform-origin: top; }
          to { opacity: 1; transform: scaleY(1) translateY(0); transform-origin: top; }
        }
        .submit-btn {
          box-shadow: 0 4px 14px -4px rgba(53,88,222,0.55);
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateZ(18px) translateY(-2px);
          box-shadow: 0 10px 22px -6px rgba(53,88,222,0.65);
        }
        .submit-btn:active:not(:disabled) {
          transform: translateZ(18px) translateY(0);
          box-shadow: 0 2px 8px -2px rgba(53,88,222,0.45);
        }
        .eye-toggle {
          -webkit-tap-highlight-color: transparent;
        }
        .eye-icon-pop {
          animation: eyePop 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes eyePop {
          from { opacity: 0; transform: scale(0.5) rotate(-15deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }

        .side-dots {
          background-image: radial-gradient(rgba(79,124,255,0.22) 1px, transparent 1px);
          background-size: 22px 22px;
          -webkit-mask-image: radial-gradient(circle at center, #000 25%, transparent 75%);
          mask-image: radial-gradient(circle at center, #000 25%, transparent 75%);
        }
        .side-glow {
          background: radial-gradient(circle, rgba(79,128,248,0.35), transparent 70%);
          filter: blur(20px);
          animation: glowBreath 6s ease-in-out infinite;
        }
        .logo-core {
          box-shadow: 0 10px 30px -6px rgba(53,88,222,0.8), 0 0 0 6px rgba(79,128,248,0.12);
          animation: logoBob 5s ease-in-out infinite;
        }
        .pulse-ring {
          position: absolute; left: 50%; top: 50%;
          width: 120px; height: 120px; margin: -60px 0 0 -60px;
          border-radius: 9999px;
          border: 1.5px solid rgba(79,128,248,0.55);
          animation: pulseRing 3s ease-out infinite;
        }
        .orbit {
          position: absolute; left: 50%; top: 50%;
          border-radius: 9999px;
          border: 1px dashed rgba(79,124,255,0.28);
          animation: spin linear infinite;
        }
        .orbit-item { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; }
        .orbit-counter { animation: spin linear infinite; }
        .icon-bubble {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 12px;
          background: var(--surface);
          border: 1px solid rgba(79,124,255,0.25);
        }
        .float-a { animation: floatY 5s ease-in-out infinite; }
        .float-b { animation: floatY 6s ease-in-out infinite reverse; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes logoBob {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.06); }
        }
        @keyframes glowBreath {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes floatY {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .eye-icon-pop, .orbit, .orbit-counter, .pulse-ring, .logo-core, .side-glow, .float-a, .float-b { animation: none; }
        }
      `}</style>
    </div>
  );
}