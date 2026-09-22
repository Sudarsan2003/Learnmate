import { useState, useRef } from "react";
import { Feather, ScrollText, ShieldCheck, ArrowLeft } from "lucide-react";
import { login, register } from "../api/client";
import AmbientBackground from "./AmbientBackground";
import ThemeToggle from "./ThemeToggle";

export default function LoginScreen({ onAuthenticated, initialMode = "login", onBack }) {
  const [mode, setMode] = useState(initialMode); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [institution, setInstitution] = useState("");
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
        : await register(username, password, { email, mobile, gender, address, institution, standard });
      localStorage.setItem("learnmate_token", result.token);
      localStorage.setItem("learnmate_username", result.username);
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
    <div className="relative flex h-full w-full overflow-y-auto bg-[var(--bg)] px-4 pb-8 pt-16 text-[var(--text)]" style={{ perspective: "1400px" }}>
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
        className="login-card relative z-10 m-auto w-full max-w-sm space-y-5 rounded-2xl border border-[#4F7CFF]/15 bg-[var(--surface)]/80 p-5 backdrop-blur-xl sm:p-7"
      >
        <div className="flex items-center gap-2.5" style={{ transform: "translateZ(24px)" }}>
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F80F8] to-[#24389E] shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
            <Feather size={15} className="text-[#FFFFFF]" />
          </div>
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
            className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
          />

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
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />

              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Mobile number"
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />

              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              >
                <option value="">Gender (optional)</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>

              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Institution"
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />

              <input
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                placeholder="Class / standard (students only, e.g. 5)"
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />

              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Address"
                rows={2}
                className="w-full resize-none rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 rounded-md border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2 text-xs text-[var(--error-text)]">
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

      <style>{`
        .lg-serif {
          font-family: 'Sora', system-ui, sans-serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .login-card {
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
      `}</style>
    </div>
  );
}