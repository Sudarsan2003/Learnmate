import { useState, useEffect, useCallback, useRef } from "react";
import {
  ClipboardList,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  Feather,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Lock,
  BarChart3,
  Timer,
  MessageCircleQuestion,
  History,
  ListChecks,
  ChevronDown,
  ChevronUp,
  CalendarClock,
  Award,
  Users,
  LockOpen,
  ArrowUpRight,
  Camera,
  Search,
  Download,
  Copy,
} from "lucide-react";
import {
  createQuiz,
  getAvailableQuizzes,
  startQuiz,
  submitQuiz,
  getQuizResults,
  closeQuiz,
  listInstitutions,
  askAboutQuiz,
  getMyCreatedQuizzes,
  getMyResults,
  getMyAttemptDetail,
  scanQuizQuestions,
} from "../api/client";
import ThemeToggle from "./ThemeToggle";
import Leaderboard from "./Leaderboard";
import Confetti, { isCelebrationScore } from "./Confetti";
import PracticeQuizzes from "./PracticeQuizzes";

// Used to hand a quiz explanation off to the chat page. ChatWindow reads
// this once on mount, drops it into the conversation, and clears it, so
// this only ever "arrives" once per Ask LearnMate click.
const PENDING_QUIZ_CHAT_KEY = "learnmate_pending_quiz_chat";

const OPTION_KEYS = ["A", "B", "C", "D"];
// Admin-selectable quiz timer choices — 15 to 60 minutes in 5-minute steps.
const DURATION_OPTIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
// Standards a quiz can target — 1 to 10 only.
const STANDARD_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
// Score at or above this percentage counts as a pass in stats and badges.
const PASS_PERCENT = 50;

const EMPTY_MANUAL_QUESTION = () => ({
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  questionText: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "A",
});

export default function Quizzes({ currentUsername, role, onAskLearnMate }) {
  const canManage = role === "ADMIN" || role === "TEACHER";
  // "list" (default) | "create" | "take" | "results"
  const [view, setView] = useState("list");
  const [activeQuizId, setActiveQuizId] = useState(null);
  // Students switch between quizzes they can still take and quizzes
  // they've already submitted (with marks + date).
  const [studentTab, setStudentTab] = useState("available"); // "available" | "results"

  return (
    <div className="quiz-view min-h-full bg-[var(--bg)] px-4 py-6 text-[var(--text)] sm:px-8 sm:py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
        .quiz-view { font-family: 'Plus Jakarta Sans', 'Noto Sans Telugu', 'Noto Sans Devanagari', system-ui, sans-serif; font-size: 14px; }
        /* Question/option text needs to render Telugu and Hindi cleanly, so it
           gets its own stack (script fonts first) plus extra line-height —
           Telugu and Devanagari vowel signs/matras get clipped at the tight
           line-height that works fine for Latin monospace text. */
        .lm-script-input {
          font-family: 'Noto Sans Telugu', 'Noto Sans Devanagari', 'Plus Jakarta Sans', system-ui, sans-serif;
          line-height: 1.6;
        }
        .lm-row { transition: background 140ms ease; }
        .lm-row:hover { background: rgba(79,124,255,0.07); }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 4px; }
        @keyframes row-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .quiz-view * { animation: none !important; } }
      `}</style>

      <div className="mx-auto max-w-[820px]">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="page-title">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F80F8] to-[#24389E]">
                <ClipboardList size={16} className="text-[#FFFFFF]" />
              </span>
              Quizzes
              <span className="role-pill">{canManage ? (role === "TEACHER" ? "Teacher" : "Admin") : "Student"}</span>
            </h1>
            <p className="page-sub">
              {canManage
                ? "Create quizzes for your class, mixing manual and AI-generated questions."
                : "Quizzes open for your class right now."}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 self-start">
            <ThemeToggle />
            {view !== "list" && (
              <button
                onClick={() => {
                  setView("list");
                  setActiveQuizId(null);
                }}
                className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/15 bg-transparent px-3 py-2 text-[13px] text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/40 hover:text-[var(--text)]"
              >
                <ArrowLeft size={13} strokeWidth={2} />
                Back
              </button>
            )}
          </div>
        </div>

        {view === "list" && canManage && (
          <AdminDashboard
            currentUsername={currentUsername}
            onCreate={() => setView("create")}
            onViewResults={(id) => {
              setActiveQuizId(id);
              setView("results");
            }}
          />
        )}

        {view === "list" && !canManage && (
          <div>
            <div className="mb-5 flex gap-1.5 rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 p-1">
              <button
                onClick={() => setStudentTab("available")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-medium transition-colors ${
                  studentTab === "available"
                    ? "bg-gradient-to-br from-[#4F80F8] to-[#3558DE] text-[#FFFFFF]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <ListChecks size={13} />
                Available
              </button>
              <button
                onClick={() => setStudentTab("results")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-medium transition-colors ${
                  studentTab === "results"
                    ? "bg-gradient-to-br from-[#4F80F8] to-[#3558DE] text-[#FFFFFF]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <History size={13} />
                My results
              </button>
            </div>

            {studentTab === "available" ? (
              <StudentQuizList
                onTakeQuiz={(id) => {
                  setActiveQuizId(id);
                  setView("take");
                }}
              />
            ) : (
              <>
                <MyResultsList />
                <div className="mt-8">
                  <h2 className="section-title mb-3">
                    <span className="inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
                    Practice quizzes
                  </h2>
                  <p className="mb-3 text-[12.5px] text-[var(--dim)]">
                    Quizzes you generated in chat with "Quiz me on ...", with your saved answers and scores.
                  </p>
                  <PracticeQuizzes />
                </div>
              </>
            )}
          </div>
        )}

        {view === "create" && canManage && (
          <CreateQuizForm
            role={role}
            onCreated={() => setView("list")}
          />
        )}

        {view === "take" && activeQuizId && (
          <TakeQuiz
            quizId={activeQuizId}
            onDone={() => setView("list")}
            onAskLearnMate={onAskLearnMate}
          />
        )}

        {view === "results" && activeQuizId && canManage && (
          <QuizResultsPanel quizId={activeQuizId} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- shared helpers ---------------------------------- */

function pctOf(score, total) {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

function StatCard({ label, value, tone }) {
  const toneCls =
    tone === "bad" ? "text-[#E2725B]" : tone === "good" ? "text-[var(--ok)]" : "text-[var(--text)]";
  return (
    <div className="rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 px-3.5 py-3">
      <p className="text-[11.5px] font-medium text-[var(--dim)]">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}

/* ---------------------------------- admin dashboard ---------------------------------- */

function AdminDashboard({ currentUsername, onCreate, onViewResults }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | OPEN | CLOSED
  const [search, setSearch] = useState("");
  // Two-step close: first click arms the button, second click confirms.
  const [confirmingId, setConfirmingId] = useState(null);
  const confirmTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyCreatedQuizzes();
      setQuizzes(data);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load your quizzes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleClose = async (id) => {
    setClosingId(id);
    setError(null);
    try {
      await closeQuiz(id);
      setQuizzes((qs) => qs.map((q) => (q.id === id ? { ...q, status: "CLOSED" } : q)));
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not close quiz ${id}.`);
    } finally {
      setClosingId(null);
    }
  };

  const requestClose = (id) => {
    clearTimeout(confirmTimerRef.current);
    if (confirmingId === id) {
      setConfirmingId(null);
      handleClose(id);
      return;
    }
    setConfirmingId(id);
    confirmTimerRef.current = setTimeout(() => setConfirmingId(null), 4000);
  };

  const openCount = quizzes.filter((q) => q.status === "OPEN").length;
  const closedCount = quizzes.length - openCount;
  const needle = search.trim().toLowerCase();
  const visible = quizzes.filter((q) => {
    if (statusFilter !== "ALL" && q.status !== statusFilter) return false;
    if (!needle) return true;
    return `${q.title} ${q.subject ?? ""} ${q.institution ?? ""}`.toLowerCase().includes(needle);
  });

  const filters = [
    { key: "ALL", label: "All", count: quizzes.length },
    { key: "OPEN", label: "Open", count: openCount },
    { key: "CLOSED", label: "Closed", count: closedCount },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <button
          onClick={onCreate}
          className="group flex items-center gap-2 rounded-full bg-gradient-to-br from-[#4F80F8] to-[#3558DE] py-2.5 pl-3 pr-4 text-sm font-semibold text-[#FFFFFF] shadow-[0_4px_14px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-6px_rgba(53,88,222,0.65)]"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 transition-transform duration-200 group-hover:rotate-90">
            <Plus size={13} strokeWidth={2.5} />
          </span>
          New quiz
        </button>
        <button
          onClick={load}
          className="group flex items-center gap-1.5 rounded-full border border-[#4F7CFF]/20 bg-transparent px-3.5 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/45 hover:bg-[#4F7CFF]/[0.06] hover:text-[var(--text)]"
        >
          <RefreshCw size={13} strokeWidth={2} className="transition-transform duration-500 group-hover:rotate-180" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          {error}
        </div>
      )}

      <h2 className="section-title mb-3">
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
        Quizzes you've created
      </h2>

      {quizzes.length > 0 && (
        <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 p-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  statusFilter === f.key
                    ? "bg-gradient-to-br from-[#4F80F8] to-[#3558DE] text-[#FFFFFF]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {f.label} <span className="opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-56">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quizzes"
              className="lm-search w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 py-2 pl-8 pr-3 text-[13px] text-[var(--text)] placeholder:text-[var(--dim)] focus:border-[#4F7CFF]/50 focus:outline-none"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
          Nothing created yet. Quizzes you create will show up here with live submission counts, so you can jump to their results or close them.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
          No quizzes match your filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((q) => {
            const isOpen = q.status === "OPEN";
            const isClosing = closingId === q.id;
            const isConfirming = confirmingId === q.id;
            return (
              <div
                key={q.id}
                style={{ animation: "row-in 180ms ease both" }}
                className="lm-quiz-card group flex flex-col gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface)]/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4F7CFF]/35 hover:shadow-[0_10px_28px_-14px_rgba(53,88,222,0.45)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[14px] font-semibold text-[var(--text)]" title={q.title}>
                      {q.title}
                    </h3>
                    <p className="mt-1 truncate text-[12px] text-[var(--muted)]" title={q.institution}>
                      {q.subject || "General"} · {q.institution || "—"} · Std {q.standard || "—"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      isOpen
                        ? "bg-[#2DD4BF]/10 text-[var(--ok)] ring-1 ring-inset ring-[#2DD4BF]/25"
                        : "bg-[#E2725B]/10 text-[#E2725B] ring-1 ring-inset ring-[#E2725B]/25"
                    }`}
                  >
                    {isOpen ? <LockOpen size={11} /> : <Lock size={11} />}
                    {sentenceCase(q.status)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--dim)]">
                  <span className="inline-flex items-center gap-1.5">
                    <ListChecks size={12} className="text-[var(--accent-ink)]" />
                    {sentenceCase(q.mode)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={12} className="text-[var(--accent-ink)]" />
                    {q.submittedAttempts} {q.submittedAttempts === 1 ? "submission" : "submissions"}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 border-t border-[var(--divider)] pt-3">
                  <button
                    onClick={() => onViewResults(q.id)}
                    title="View results"
                    className="lm-pill-btn flex-1 justify-center border-[#4F7CFF]/25 bg-[#4F7CFF]/[0.06] text-[var(--ok)] hover:border-[#4F7CFF]/50 hover:bg-[#4F7CFF]/15 hover:shadow-[0_6px_16px_-8px_rgba(79,124,255,0.55)]"
                  >
                    <BarChart3 size={13} />
                    Results
                    <ArrowUpRight size={11} className="opacity-0 transition-opacity duration-150 group-hover:opacity-70" />
                  </button>
                  <button
                    onClick={() => requestClose(q.id)}
                    disabled={isClosing || !isOpen}
                    title={isOpen ? "Close quiz" : "Quiz already closed"}
                    className={`lm-pill-btn flex-1 justify-center border-[#E2725B]/25 text-[#E2725B] hover:border-[#E2725B]/50 hover:bg-[#E2725B]/15 hover:shadow-[0_6px_16px_-8px_rgba(226,114,91,0.5)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${
                      isConfirming ? "bg-[#E2725B]/20" : "bg-[#E2725B]/[0.06]"
                    }`}
                  >
                    {isClosing ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                    {!isOpen ? "Closed" : isConfirming ? "Click again to confirm" : "Close"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .lm-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 9999px;
          border-width: 1px;
          border-style: solid;
          padding: 0.5rem 0.75rem;
          font-size: 12.5px;
          font-weight: 600;
          transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease, border-color 150ms ease;
        }
        .lm-pill-btn:not(:disabled):hover { transform: translateY(-1px); }
        .lm-pill-btn:not(:disabled):active { transform: translateY(0); }
      `}</style>
    </div>
  );
}

/* ---------------------------------- create quiz ---------------------------------- */

function CreateQuizForm({ role, onCreated }) {
  const isAdmin = role === "ADMIN";
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [standard, setStandard] = useState("");
  // Only relevant for ADMIN — a TEACHER's quiz is scoped to their own
  // institution automatically on the backend (QuizService.createQuiz), but
  // an ADMIN isn't tied to one institution, so they must pick which one
  // this quiz belongs to. Without this, the quiz was previously created
  // with no institution at all and never matched any student.
  const [institution, setInstitution] = useState("");
  const [knownInstitutions, setKnownInstitutions] = useState([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(isAdmin);
  const [mode, setMode] = useState("OPEN"); // OPEN | SCHEDULED
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  // Optional per-attempt timer, in minutes. Backend enforces 1-180 and
  // treats blank/null as "no timer" (student can take as long as they like).
  const [durationMinutes, setDurationMinutes] = useState("");
  const [manualQuestions, setManualQuestions] = useState([]);
  const [aiGenerateCount, setAiGenerateCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // "Scan Questions" — photograph handwritten/printed questions, get back
  // structured MCQs, drop them straight into manualQuestions for review.
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanNotice, setScanNotice] = useState(null);
  const scanFileInputRef = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listInstitutions();
        if (!cancelled) setKnownInstitutions(data.map((i) => i.institution));
      } catch {
        if (!cancelled) setKnownInstitutions([]);
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const addManualQuestion = () => setManualQuestions((qs) => [...qs, EMPTY_MANUAL_QUESTION()]);
  const removeManualQuestion = (clientId) =>
    setManualQuestions((qs) => qs.filter((q) => q.clientId !== clientId));
  const updateManualQuestion = (clientId, field, value) =>
    setManualQuestions((qs) => qs.map((q) => (q.clientId === clientId ? { ...q, [field]: value } : q)));
  // Copies a question right below the original, handy for similar MCQs.
  const duplicateManualQuestion = (clientId) =>
    setManualQuestions((qs) => {
      const idx = qs.findIndex((q) => q.clientId === clientId);
      if (idx === -1) return qs;
      const copy = { ...qs[idx], clientId: EMPTY_MANUAL_QUESTION().clientId };
      return [...qs.slice(0, idx + 1), copy, ...qs.slice(idx + 1)];
    });

  const handleScanButtonClick = () => scanFileInputRef.current?.click();

  const handleScanFileSelected = async (e) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setScanError(null);
    setScanNotice(null);
    setScanning(true);
    try {
      const scanned = await scanQuizQuestions(file);
      const asManualQuestions = scanned.map((q) => ({
        ...EMPTY_MANUAL_QUESTION(),
        questionText: q.questionText ?? "",
        optionA: q.optionA ?? "",
        optionB: q.optionB ?? "",
        optionC: q.optionC ?? "",
        optionD: q.optionD ?? "",
        correctOption: q.correctOption ?? "A",
      }));
      setManualQuestions((qs) => [...qs, ...asManualQuestions]);
      setScanNotice(
        asManualQuestions.length === 0
          ? "No questions were found in that photo."
          : `Added ${asManualQuestions.length} ${asManualQuestions.length === 1 ? "question" : "questions"} from your photo. Review them before creating the quiz.`
      );
    } catch (err) {
      setScanError(err.response?.data?.message ?? "Could not read questions from that image.");
    } finally {
      setScanning(false);
    }
  };

  const toIsoOrNull = (localValue) => (localValue ? new Date(localValue).toISOString() : null);

  const aiCountNumber = aiGenerateCount ? parseInt(aiGenerateCount, 10) || 0 : 0;
  const totalQuestions = manualQuestions.length + Math.max(0, aiCountNumber);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Title is required.");
    if (!STANDARD_OPTIONS.includes(standard)) return setError("Pick a standard from 1 to 10.");
    if (isAdmin && !institution.trim()) {
      return setError("Institution is required — pick which school/institution this quiz is for.");
    }
    const aiCount = aiCountNumber;
    if (manualQuestions.length === 0 && aiCount <= 0) {
      return setError("Add at least one manual question, or set an AI question count.");
    }
    if (mode === "SCHEDULED") {
      if (!opensAt) return setError("Pick when the scheduled quiz opens.");
      if (closesAt && new Date(closesAt) <= new Date(opensAt)) {
        return setError("The closing time must be after the opening time.");
      }
    }
    let parsedDuration = null;
    if (durationMinutes !== "") {
      parsedDuration = parseInt(durationMinutes, 10);
      if (!DURATION_OPTIONS.includes(parsedDuration)) {
        return setError("Pick a valid timer option, or choose \"no timer\".");
      }
    }
    for (const q of manualQuestions) {
      if (!q.questionText.trim() || !q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim()) {
        return setError("Every manual question needs text and all 4 options filled in.");
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        subject: subject.trim() || null,
        standard,
        institution: isAdmin ? institution.trim() : undefined,
        mode,
        opensAt: mode === "SCHEDULED" ? toIsoOrNull(opensAt) : null,
        closesAt: mode === "SCHEDULED" ? toIsoOrNull(closesAt) : null,
        durationMinutes: parsedDuration,
        manualQuestions: manualQuestions.map((q) => ({
          questionText: q.questionText.trim(),
          optionA: q.optionA.trim(),
          optionB: q.optionB.trim(),
          optionC: q.optionC.trim(),
          optionD: q.optionD.trim(),
          correctOption: q.correctOption,
        })),
        aiGenerateCount: aiCount > 0 ? aiCount : null,
      };
      const quiz = await createQuiz(payload);
      onCreated(quiz);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not create the quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 checkpoint / Ch. 4 పరీక్ష / अध्याय 4 जाँच"
            lang="und"
            className="lm-input lm-script-input"
          />
        </Field>
        <Field label="Standard" hint="The class this quiz targets">
          <select
            value={standard}
            onChange={(e) => setStandard(e.target.value)}
            className="lm-input"
          >
            <option value="">Select standard</option>
            {STANDARD_OPTIONS.map((std) => (
              <option key={std} value={std}>
                {std}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject" hint="Optional. Filters AI question retrieval">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. data-structures"
            className="lm-input"
          />
        </Field>
        {isAdmin && (
          <Field label="Institution" hint="Which school this quiz is for">
            <input
              list="lm-known-institutions"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder={loadingInstitutions ? "Loading…" : "Type or pick an institution"}
              className="lm-input"
            />
            <datalist id="lm-known-institutions">
              {knownInstitutions.map((inst) => (
                <option key={inst} value={inst} />
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-[var(--dim)]">
              Must exactly match the institution on students' profiles (see Manage users), or they won't see this quiz.
            </p>
          </Field>
        )}
        <Field label="Mode">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="lm-input">
            <option value="OPEN">Open, available immediately</option>
            <option value="SCHEDULED">Scheduled</option>
          </select>
        </Field>
        <Field label="Timer" hint="Students must submit within this time">
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="lm-input"
          >
            <option value="">No timer, unlimited time</option>
            {DURATION_OPTIONS.map((mins) => (
              <option key={mins} value={mins}>
                {mins} minutes
              </option>
            ))}
          </select>
        </Field>
      </div>

      {mode === "SCHEDULED" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ animation: "row-in 200ms ease both" }}>
          <Field label="Opens at">
            <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="lm-input" />
          </Field>
          <Field label="Closes at" hint="Optional. Closed manually if blank">
            <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="lm-input" />
          </Field>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">
            <span className="inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
            Manual questions
          </h2>
          <div className="flex items-center gap-2">
            <input
              ref={scanFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              capture="environment"
              onChange={handleScanFileSelected}
              className="hidden"
            />
            <button type="button" onClick={handleScanButtonClick} disabled={scanning} className="lm-btn-secondary">
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              {scanning ? "Reading photo…" : "Scan questions"}
            </button>
            <button type="button" onClick={addManualQuestion} className="lm-btn-secondary">
              <Plus size={12} />
              Add question
            </button>
          </div>
        </div>

        {scanError && (
          <div className="mb-3 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
            {scanError}
          </div>
        )}
        {scanNotice && !scanError && (
          <div className="mb-3 rounded-lg border border-[#2DD4BF]/25 bg-[#2DD4BF]/5 px-3 py-2.5 text-[13px] text-[var(--ok)]">
            {scanNotice}
          </div>
        )}

        {manualQuestions.length === 0 ? (
          <p className="text-[13px] text-[var(--dim)]">None yet. Optional if you're using AI-generated questions.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {manualQuestions.map((q, idx) => (
              <div
                key={q.clientId}
                style={{ animation: "row-in 180ms ease both" }}
                className="lm-card"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold tracking-[-0.003em] text-[var(--dim)]">
                    Question {idx + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => duplicateManualQuestion(q.clientId)}
                      aria-label={`Duplicate question ${idx + 1}`}
                      title="Duplicate question"
                      className="lm-btn-icon lm-btn-icon-neutral"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeManualQuestion(q.clientId)}
                      aria-label={`Remove question ${idx + 1}`}
                      title="Remove question"
                      className="lm-btn-icon"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <input
                  value={q.questionText}
                  onChange={(e) => updateManualQuestion(q.clientId, "questionText", e.target.value)}
                  placeholder="Question text (type in Telugu, Hindi or English)"
                  lang="und"
                  className="lm-input lm-script-input mb-2"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OPTION_KEYS.map((key) => (
                    <input
                      key={key}
                      value={q[`option${key}`]}
                      onChange={(e) => updateManualQuestion(q.clientId, `option${key}`, e.target.value)}
                      placeholder={`Option ${key}`}
                      lang="und"
                      className="lm-input lm-script-input"
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--dim)]">Correct option</span>
                  <select
                    value={q.correctOption}
                    onChange={(e) => updateManualQuestion(q.clientId, "correctOption", e.target.value)}
                    className="lm-input lm-select-compact"
                  >
                    {OPTION_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="AI-generated questions" hint="Pulled from that standard's study material">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--accent-ink)]" />
          <input
            type="number"
            min="0"
            value={aiGenerateCount}
            onChange={(e) => setAiGenerateCount(e.target.value)}
            placeholder="0"
            className="lm-input"
          />
        </div>
      </Field>

      <div className="flex items-center justify-between rounded-lg border border-[var(--divider)] bg-[var(--surface)]/50 px-3.5 py-2.5 text-[12.5px] text-[var(--muted)]">
        <span>
          {manualQuestions.length} manual + {Math.max(0, aiCountNumber)} AI
        </span>
        <span className="font-semibold text-[var(--text)]">
          {totalQuestions} {totalQuestions === 1 ? "question" : "questions"} in total
        </span>
      </div>

      <button type="submit" disabled={submitting} className="lm-btn-primary">
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Create quiz
      </button>

      <style>{`
        .lm-input {
          width: 100%;
          border-radius: 0.7rem;
          border: 1.5px solid color-mix(in srgb, #4F7CFF 16%, transparent);
          background: color-mix(in srgb, var(--surface-2) 55%, transparent);
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
          padding: 0.65rem 0.85rem;
          font-size: 14px;
          font-weight: 450;
          color: var(--text);
          outline: none;
          transition: box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .lm-input::placeholder { color: var(--dim); font-weight: 400; }
        .lm-input:hover { border-color: color-mix(in srgb, #4F7CFF 30%, transparent); }
        .lm-input:focus {
          border-color: #3558DE;
          background: color-mix(in srgb, var(--surface-2) 82%, transparent);
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05), 0 0 0 3.5px rgba(53,88,222,0.16);
        }
        .lm-select-compact { width: auto; padding: 0.4rem 2rem 0.4rem 0.7rem; font-size: 12.5px; font-weight: 600; }

        .lm-label {
          display: block;
          margin-bottom: 0.4rem;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.006em;
          color: var(--text);
        }
        .lm-label-hint { margin-left: 0.45rem; font-size: 11.5px; font-weight: 450; color: var(--dim); }

        .lm-btn-primary {
          position: relative;
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 0.7rem;
          padding: 0.75rem 1rem;
          font-size: 14.5px;
          font-weight: 600;
          letter-spacing: -0.005em;
          color: #FFFFFF;
          background: linear-gradient(135deg, #5A8BFF 0%, #3558DE 100%);
          box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 8px 20px -8px rgba(53,88,222,0.65);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .lm-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 1px 0 rgba(255,255,255,0.22) inset, 0 12px 26px -8px rgba(53,88,222,0.75);
        }
        .lm-btn-primary:active:not(:disabled) { transform: translateY(0) scale(0.99); }
        .lm-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

        .lm-btn-secondary {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 0.6rem;
          border: 1.3px solid color-mix(in srgb, #4F7CFF 26%, transparent);
          background: color-mix(in srgb, var(--surface-2) 30%, transparent);
          padding: 0.45rem 0.8rem;
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: -0.003em;
          color: var(--ok);
          transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
        }
        .lm-btn-secondary:hover:not(:disabled) {
          background: rgba(79,124,255,0.12);
          border-color: rgba(79,124,255,0.45);
          transform: translateY(-1px);
        }
        .lm-btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }

        .lm-btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 1.65rem;
          width: 1.65rem;
          border-radius: 0.5rem;
          color: #E2725B;
          transition: background 140ms ease, color 140ms ease;
        }
        .lm-btn-icon:hover { background: rgba(226,114,91,0.14); color: var(--error-text); }
        .lm-btn-icon-neutral { color: var(--muted); }
        .lm-btn-icon-neutral:hover { background: rgba(79,124,255,0.12); color: var(--text); }

        .lm-card {
          border-radius: 0.85rem;
          border: 1px solid var(--divider);
          background: color-mix(in srgb, var(--surface) 65%, transparent);
          padding: 0.9rem;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .lm-card:hover {
          border-color: color-mix(in srgb, #4F7CFF 24%, transparent);
          box-shadow: 0 6px 18px -12px rgba(53,88,222,0.35);
        }
      `}</style>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="lm-label">
        {label}
        {hint && <span className="lm-label-hint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* ---------------------------------- student list + take ---------------------------------- */

function StudentQuizList({ onTakeQuiz }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAvailableQuizzes();
      setQuizzes(data);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load quizzes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/15 bg-transparent px-3 py-2 text-[13px] text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/40 hover:text-[var(--text)]"
        >
          <RefreshCw size={13} strokeWidth={2} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
          No quizzes are open for your class right now.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="lm-row flex items-center justify-between gap-3 rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--text)]">{q.title}</p>
                <p className="mt-0.5 text-xs text-[var(--dim)]">
                  {q.subject || "General"} · Standard {q.standard} · {sentenceCase(q.mode)}
                </p>
              </div>
              <button
                onClick={() => onTakeQuiz(q.id)}
                className="flex-shrink-0 rounded-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-3.5 py-1.5 text-[13px] font-semibold text-[#FFFFFF] shadow-[0_4px_12px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5"
              >
                Start
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- my results (student) ---------------------------------- */

function MyResultsList() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedQuizId, setExpandedQuizId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyResults();
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load your results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const percents = results.map((r) => pctOf(r.score, r.totalQuestions));
  const avgPct = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
  const bestPct = percents.length ? Math.max(...percents) : 0;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/15 bg-transparent px-3 py-2 text-[13px] text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/40 hover:text-[var(--text)]"
        >
          <RefreshCw size={13} strokeWidth={2} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          {error}
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2.5">
          <StatCard label="Quizzes taken" value={results.length} />
          <StatCard label="Average" value={`${avgPct}%`} tone={avgPct >= PASS_PERCENT ? "good" : "bad"} />
          <StatCard label="Best score" value={`${bestPct}%`} tone="good" />
        </div>
      )}

      {loading ? (
        <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
          No quizzes submitted yet. Your marks and submission date will show up here as soon as you submit one.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r) => {
            const isOpen = expandedQuizId === r.quizId;
            const pct = pctOf(r.score, r.totalQuestions);
            const passed = pct >= PASS_PERCENT;
            return (
              <div key={r.quizId} className="overflow-hidden rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60">
                <button
                  onClick={() => setExpandedQuizId(isOpen ? null : r.quizId)}
                  className="lm-row flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--text)]">{r.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--dim)]">
                      <CalendarClock size={11} />
                      Submitted {formatDate(r.submittedAt)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[13px]">
                      <Award size={13} className={passed ? "text-[var(--ok)]" : "text-[#E2725B]"} />
                      <span className={passed ? "text-[var(--text)]" : "text-[var(--error-text)]"}>
                        {r.score} / {r.totalQuestions}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          passed ? "bg-[#2DD4BF]/10 text-[var(--ok)]" : "bg-[#E2725B]/10 text-[#E2725B]"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronUp size={14} className="text-[var(--dim)]" />
                    ) : (
                      <ChevronDown size={14} className="text-[var(--dim)]" />
                    )}
                  </div>
                </button>
                {isOpen && <AttemptReview quizId={r.quizId} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttemptReview({ quizId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wrongOnly, setWrongOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMyAttemptDetail(quizId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message ?? "Could not load this review.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (loading) {
    return <div className="border-t border-[var(--divider)] px-4 py-4 text-[13px] text-[var(--dim)]">Loading review…</div>;
  }
  if (error) {
    return (
      <div className="border-t border-[var(--divider)] px-4 py-3 text-[13px] text-[var(--error-text)]">{error}</div>
    );
  }

  const wrongCount = detail.questions.filter((q) => !q.correct).length;
  // Keep original numbering even when filtering, so "Q7" stays Q7.
  const shown = detail.questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => !wrongOnly || !q.correct);

  return (
    <div className="space-y-2.5 border-t border-[var(--divider)] px-4 py-4">
      {wrongCount > 0 && (
        <label className="flex w-fit cursor-pointer select-none items-center gap-2 text-[12.5px] text-[var(--muted)]">
          <input
            type="checkbox"
            checked={wrongOnly}
            onChange={(e) => setWrongOnly(e.target.checked)}
            className="accent-[#3558DE]"
          />
          Show only questions I got wrong ({wrongCount})
        </label>
      )}
      {shown.map(({ q, idx }) => (
        <div
          key={q.questionId}
          className={`rounded-md border px-3 py-2.5 text-[13px] ${
            q.correct ? "border-[#2DD4BF]/20 bg-[#2DD4BF]/5" : "border-[#E2725B]/30 bg-[var(--error-bg)]/40"
          }`}
        >
          <p className="mb-1.5 text-[var(--text)]">
            <span className="text-[var(--accent-ink)]">{idx + 1}.</span> {q.questionText}
          </p>
          <p className="text-[var(--muted)]">
            Your answer:{" "}
            <span className={q.correct ? "text-[var(--ok)]" : "text-[#E2725B]"}>
              {q.selectedOption ? `${q.selectedOption}) ${q[`option${q.selectedOption}`]}` : "Not answered"}
            </span>
          </p>
          {!q.correct && (
            <p className="mt-0.5 text-[var(--muted)]">
              Correct answer:{" "}
              <span className="text-[var(--ok)]">
                {q.correctOption}) {q[`option${q.correctOption}`]}
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function sentenceCase(v) {
  if (!v) return "";
  const s = String(v);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function TakeQuiz({ quizId, onDone, onAskLearnMate }) {
  const [quizTitle, setQuizTitle] = useState("");
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId -> "A".."D"
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [confettiDone, setConfettiDone] = useState(false);
  const [deadline, setDeadline] = useState(null); // Date | null
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [askingLearnMate, setAskingLearnMate] = useState(false);
  const [askError, setAskError] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await startQuiz(quizId);
        if (cancelled) return;
        setQuizTitle(data.title);
        setQuestions(data.questions);
        setDeadline(data.deadline ? new Date(data.deadline) : null);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message ?? "Could not load this quiz.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const selectAnswer = (questionId, option) => {
    setConfirmSubmit(false);
    setAnswers((a) => ({ ...a, [questionId]: option }));
  };

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const answerList = Object.entries(answers).map(([questionId, selectedOption]) => ({
        questionId: Number(questionId),
        selectedOption,
      }));
      const res = await submitQuiz(quizId, answerList);
      setResult(res);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not submit this quiz.");
    } finally {
      setSubmitting(false);
    }
  }, [answers, quizId]);

  // Countdown ticker — recomputed from the fixed server deadline every
  // second (rather than counting down a local number) so it stays correct
  // even if the tab was backgrounded. Auto-submits exactly once when time
  // runs out, using whatever answers were selected so far.
  useEffect(() => {
    if (!deadline || result) return;

    const tick = () => {
      const remaining = Math.round((deadline.getTime() - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= 0 && !autoSubmittedRef.current && !submitting) {
        autoSubmittedRef.current = true;
        handleSubmit();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline, result, submitting, handleSubmit]);

  // Warn before the tab is closed/refreshed mid-quiz so answers aren't lost.
  const quizInProgress = !!questions && !result;
  useEffect(() => {
    if (!quizInProgress) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [quizInProgress]);

  const answeredCount = Object.keys(answers).length;
  const totalCount = questions?.length ?? 0;
  const unansweredCount = totalCount - answeredCount;

  // If any questions are blank, ask once before submitting. The timer's
  // auto-submit calls handleSubmit directly, so it is never blocked.
  const requestSubmit = () => {
    if (unansweredCount > 0 && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    handleSubmit();
  };

  const scrollToQuestion = (id) =>
    document.getElementById(`quiz-q-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const handleAskLearnMate = async () => {
    setAskingLearnMate(true);
    setAskError(null);
    try {
      const { answer } = await askAboutQuiz(quizId, {
        question:
          "Please walk me through this quiz — explain the reasoning behind the correct answer for " +
          "every question, and call out anywhere I went wrong.",
      });
      sessionStorage.setItem(
        PENDING_QUIZ_CHAT_KEY,
        JSON.stringify({
          quizTitle,
          question: `Explain my answers on "${quizTitle}"`,
          answer,
        })
      );
      // Let the app switch views to chat. If no navigation callback was
      // wired up by the parent, fall back to a global event so a listener
      // elsewhere in the app can pick it up.
      if (onAskLearnMate) {
        onAskLearnMate();
      } else {
        document.dispatchEvent(new CustomEvent("learnmate:open-chat"));
      }
    } catch (err) {
      setAskError(err.response?.data?.message ?? "Could not reach LearnMate about this quiz.");
    } finally {
      setAskingLearnMate(false);
    }
  };

  if (loading) return <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>;

  if (error && !questions) {
    return (
      <div className="rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
        {error}
      </div>
    );
  }

  if (result) {
    const celebrate = isCelebrationScore(result.score, result.totalQuestions);
    const perfect = result.totalQuestions > 0 && result.score === result.totalQuestions;
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-[#4F7CFF]/20 bg-[var(--surface)]/70 px-6 py-10 text-center">
        {celebrate && !confettiDone && <Confetti onDone={() => setConfettiDone(true)} />}
        <CheckCircle2 size={28} className="text-[var(--ok)]" />
        <p className="text-lg text-[var(--text)]">
          {result.score} / {result.totalQuestions}
        </p>
        <p className="text-[13px] font-medium text-[var(--muted)]">
          {pctOf(result.score, result.totalQuestions)}%
        </p>
        {celebrate && (
          <p className="text-[15px] font-semibold text-[var(--accent-ink)]">
            {perfect ? "Perfect score! 🎉" : "Outstanding! 🎉"}
          </p>
        )}
        <p className="text-[13px] text-[var(--muted)]">Submitted successfully</p>

        {askError && (
          <p className="rounded-md border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2 text-[13px] text-[var(--error-text)]">
            {askError}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={handleAskLearnMate}
            disabled={askingLearnMate}
            className="flex items-center gap-2 rounded-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-4 py-2 text-[13px] font-semibold text-[#FFFFFF] shadow-[0_4px_14px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40"
          >
            {askingLearnMate ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <MessageCircleQuestion size={13} />
            )}
            Ask LearnMate
          </button>
          <button
            onClick={onDone}
            className="rounded-md border border-[#4F7CFF]/20 px-4 py-2 text-[13px] text-[var(--ok)] transition-colors hover:bg-[#4F7CFF]/10"
          >
            Back to quizzes
          </button>
        </div>

        <div className="mt-4 w-full max-w-[520px] border-t border-[var(--divider)] pt-5">
          <Leaderboard quizId={quizId} />
        </div>
      </div>
    );
  }

  const timeIsShort = secondsLeft !== null && secondsLeft <= 60;
  const progressPct = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 space-y-2 bg-[var(--bg)]/85 pb-2 backdrop-blur-sm">
        {deadline && secondsLeft !== null && (
          <div
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
              timeIsShort
                ? "border-[#E2725B]/40 bg-[var(--error-bg)]/80 text-[var(--error-text)]"
                : "border-[#4F7CFF]/20 bg-[var(--surface)]/80 text-[var(--text)]"
            }`}
          >
            <Timer size={14} className={timeIsShort ? "text-[#E2725B]" : "text-[var(--accent-ink)]"} />
            Time left: {formatCountdown(secondsLeft)}
          </div>
        )}
        <div className="rounded-lg border border-[var(--divider)] bg-[var(--surface)]/80 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-[var(--muted)]">
            <span>
              {answeredCount} of {totalCount} answered
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--divider)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#4F80F8] to-[#3558DE] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question navigator: tap a number to jump, filled = answered */}
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, idx) => {
          const done = answers[q.id] !== undefined;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => scrollToQuestion(q.id)}
              aria-label={`Go to question ${idx + 1}${done ? " (answered)" : ""}`}
              className={`h-7 w-7 rounded-md border text-[12px] font-semibold transition-colors ${
                done
                  ? "border-[#3558DE]/60 bg-[#3558DE]/15 text-[var(--text)]"
                  : "border-[var(--divider)] text-[var(--dim)] hover:border-[#4F7CFF]/40"
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          {error}
        </div>
      )}

      {questions.map((q, idx) => (
        <div
          key={q.id}
          id={`quiz-q-${q.id}`}
          className="scroll-mt-28 rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 p-4"
        >
          <p className="mb-3 text-sm text-[var(--text)] [overflow-wrap:anywhere]">
            <span className="text-[var(--accent-ink)]">{idx + 1}.</span> {q.questionText}
          </p>
          <div className="flex flex-col gap-2">
            {OPTION_KEYS.map((key) => {
              const optionText = q[`option${key}`];
              const selected = answers[q.id] === key;
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] transition-colors ${
                    selected
                      ? "border-[#3558DE]/60 bg-[#3558DE]/10 text-[var(--text)]"
                      : "border-[var(--divider)] text-[var(--muted)] hover:border-[#4F7CFF]/30"
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${q.id}`}
                    checked={selected}
                    onChange={() => selectAnswer(q.id, key)}
                    className="flex-shrink-0 accent-[#3558DE]"
                  />
                  <span className="flex-shrink-0 font-semibold text-[var(--accent-ink)]">{key}.</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{optionText}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {confirmSubmit && unansweredCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/50 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            You have {unansweredCount} unanswered {unansweredCount === 1 ? "question" : "questions"}. Press submit
            again to send your answers as they are.
          </span>
        </div>
      )}

      <button
        onClick={requestSubmit}
        disabled={submitting || answeredCount === 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] py-2.5 text-sm font-medium text-[#FFFFFF] shadow-[0_4px_14px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {confirmSubmit && unansweredCount > 0 ? "Submit anyway" : "Submit answers"}
      </button>
    </div>
  );
}

/* ---------------------------------- results ---------------------------------- */

function QuizResultsPanel({ quizId }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("score"); // score | name | date

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getQuizResults(quizId);
        if (!cancelled) setResults(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message ?? "Could not load results.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (loading) return <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>;

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
        <AlertCircle size={14} />
        {error}
      </div>
    );
  }

  const scores = results.studentScores;
  const percents = scores.map((s) => pctOf(s.score, s.totalQuestions));
  const avgPct = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
  const highPct = percents.length ? Math.max(...percents) : 0;
  const lowPct = percents.length ? Math.min(...percents) : 0;
  const passRate = percents.length
    ? Math.round((percents.filter((p) => p >= PASS_PERCENT).length / percents.length) * 100)
    : 0;

  const sorted = [...scores].sort((a, b) => {
    if (sortBy === "name") return a.username.localeCompare(b.username);
    if (sortBy === "date") return new Date(b.submittedAt) - new Date(a.submittedAt);
    return pctOf(b.score, b.totalQuestions) - pctOf(a.score, a.totalQuestions);
  });

  const exportCsv = () => {
    const rows = [
      ["Student", "Score", "Total", "Percent", "Submitted"],
      ...sorted.map((s) => [
        s.username,
        s.score,
        s.totalQuestions,
        `${pctOf(s.score, s.totalQuestions)}%`,
        formatDate(s.submittedAt),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    // BOM keeps Telugu/Hindi names readable when the file opens in Excel.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (results.title || "quiz").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    a.href = url;
    a.download = `${safeTitle || "quiz"}-results.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-base text-[var(--text)]">
        <Feather size={14} className="text-[var(--accent-ink)]" />
        {results.title}
      </h2>

      {scores.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="Submissions" value={scores.length} />
          <StatCard label="Class average" value={`${avgPct}%`} tone={avgPct >= PASS_PERCENT ? "good" : "bad"} />
          <StatCard label="Highest / lowest" value={`${highPct}% / ${lowPct}%`} />
          <StatCard label={`Pass rate (${PASS_PERCENT}%+)`} value={`${passRate}%`} tone={passRate >= PASS_PERCENT ? "good" : "bad"} />
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="section-title">Student scores</h3>
          {scores.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort scores"
                className="rounded-md border border-[var(--divider)] bg-[var(--surface)]/60 px-2.5 py-1.5 text-[12.5px] text-[var(--muted)] focus:border-[#4F7CFF]/50 focus:outline-none"
              >
                <option value="score">Highest score first</option>
                <option value="name">Name (A to Z)</option>
                <option value="date">Latest submission</option>
              </select>
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/25 bg-transparent px-3 py-1.5 text-[12.5px] font-semibold text-[var(--ok)] transition-all hover:-translate-y-0.5 hover:bg-[#4F7CFF]/10"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>
          )}
        </div>
        {scores.length === 0 ? (
          <p className="text-[13px] text-[var(--dim)]">No submissions yet</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--divider)]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-[var(--surface)]/70 text-left text-[var(--dim)]">
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const pct = pctOf(s.score, s.totalQuestions);
                  return (
                    <tr key={s.username} className="lm-row border-t border-[var(--divider)]">
                      <td className="px-3 py-2.5">{s.username}</td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">
                        {s.score} / {s.totalQuestions}{" "}
                        <span className={pct >= PASS_PERCENT ? "text-[var(--ok)]" : "text-[#E2725B]"}>({pct}%)</span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">{formatDate(s.submittedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="section-title mb-3">Most missed questions</h3>
        {results.mostMissedQuestions.length === 0 ? (
          <p className="text-[13px] text-[var(--dim)]">Nothing to show yet</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {results.mostMissedQuestions.map((m) => (
              <div
                key={m.questionId}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--divider)] bg-[var(--surface)]/60 px-3 py-2 text-[13px]"
              >
                <span className="truncate text-[var(--text)]">{m.questionText}</span>
                <span className="flex-shrink-0 text-[#E2725B]">Missed {m.missCount}×</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}