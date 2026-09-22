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
} from "../api/client";
import ThemeToggle from "./ThemeToggle";
import Leaderboard from "./Leaderboard";
import Confetti, { isCelebrationScore } from "./Confetti";

// Used to hand a quiz explanation off to the chat page. ChatWindow reads
// this once on mount, drops it into the conversation, and clears it, so
// this only ever "arrives" once per Ask LearnMate click.
const PENDING_QUIZ_CHAT_KEY = "learnmate_pending_quiz_chat";

const OPTION_KEYS = ["A", "B", "C", "D"];
// Admin-selectable quiz timer choices — 15 to 60 minutes in 5-minute steps.
const DURATION_OPTIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
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
              <MyResultsList />
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

/* ---------------------------------- admin dashboard ---------------------------------- */

function AdminDashboard({ currentUsername, onCreate, onViewResults }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState(null);
  const [error, setError] = useState(null);

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

      {loading ? (
        <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
          Nothing created yet. Quizzes you create will show up here with live submission counts, so you can jump to their results or close them.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {quizzes.map((q) => {
            const isOpen = q.status === "OPEN";
            const isClosing = closingId === q.id;
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
                    onClick={() => handleClose(q.id)}
                    disabled={isClosing || !isOpen}
                    title={isOpen ? "Close quiz" : "Quiz already closed"}
                    className="lm-pill-btn flex-1 justify-center border-[#E2725B]/25 bg-[#E2725B]/[0.06] text-[#E2725B] hover:border-[#E2725B]/50 hover:bg-[#E2725B]/15 hover:shadow-[0_6px_16px_-8px_rgba(226,114,91,0.5)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
                  >
                    {isClosing ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                    {isOpen ? "Close" : "Closed"}
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

  const toIsoOrNull = (localValue) => (localValue ? new Date(localValue).toISOString() : null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Title is required.");
    if (!standard.trim()) return setError("Standard is required (e.g. \"5\").");
    if (isAdmin && !institution.trim()) {
      return setError("Institution is required — pick which school/institution this quiz is for.");
    }
    const aiCount = aiGenerateCount ? parseInt(aiGenerateCount, 10) : 0;
    if (manualQuestions.length === 0 && aiCount <= 0) {
      return setError("Add at least one manual question, or set an AI question count.");
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
        standard: standard.trim(),
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
          <input
            value={standard}
            onChange={(e) => setStandard(e.target.value)}
            placeholder='e.g. "5"'
            className="lm-input"
          />
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
          <button
            type="button"
            onClick={addManualQuestion}
            className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/20 px-2.5 py-1.5 text-xs text-[var(--ok)] transition-colors hover:bg-[#4F7CFF]/10"
          >
            <Plus size={12} />
            Add question
          </button>
        </div>

        {manualQuestions.length === 0 ? (
          <p className="text-[13px] text-[var(--dim)]">None yet. Optional if you're using AI-generated questions.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {manualQuestions.map((q, idx) => (
              <div
                key={q.clientId}
                style={{ animation: "row-in 180ms ease both" }}
                className="rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-[var(--dim)]">Question {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeManualQuestion(q.clientId)}
                    className="text-[#E2725B] transition-colors hover:text-[var(--error-text)]"
                  >
                    <Trash2 size={13} />
                  </button>
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
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[var(--dim)]">Correct option</span>
                  <select
                    value={q.correctOption}
                    onChange={(e) => updateManualQuestion(q.clientId, "correctOption", e.target.value)}
                    className="lm-input w-auto py-1.5 text-[12px]"
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

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] py-2.5 text-sm font-medium text-[#FFFFFF] shadow-[0_4px_14px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Create quiz
      </button>

      <style>{`
        .lm-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid color-mix(in srgb, #4F7CFF 22%, transparent);
          background: color-mix(in srgb, var(--surface-2) 60%, transparent);
          padding: 0.625rem 0.75rem;
          font-size: 14px;
          color: var(--text);
          outline: none;
          transition: box-shadow 140ms ease, border-color 140ms ease;
        }
        .lm-input:focus {
          border-color: rgba(53,88,222,0.6);
          box-shadow: 0 0 0 3px rgba(53,88,222,0.15);
        }
      `}</style>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
        {label}
        {hint && <span className="ml-1.5 text-[12px] font-normal text-[var(--dim)]">{hint}</span>}
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
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
          No quizzes submitted yet. Your marks and submission date will show up here as soon as you submit one.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r) => {
            const isOpen = expandedQuizId === r.quizId;
            const pct = r.totalQuestions > 0 ? Math.round((r.score / r.totalQuestions) * 100) : 0;
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
                      <Award size={13} className={pct >= 50 ? "text-[var(--ok)]" : "text-[#E2725B]"} />
                      <span className={pct >= 50 ? "text-[var(--text)]" : "text-[var(--error-text)]"}>
                        {r.score} / {r.totalQuestions}
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

  return (
    <div className="space-y-2.5 border-t border-[var(--divider)] px-4 py-4">
      {detail.questions.map((q, idx) => (
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

  const selectAnswer = (questionId, option) =>
    setAnswers((a) => ({ ...a, [questionId]: option }));

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

  return (
    <div className="space-y-4">
      {deadline && secondsLeft !== null && (
        <div
          className={`sticky top-0 z-10 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold backdrop-blur-sm ${
            timeIsShort
              ? "border-[#E2725B]/40 bg-[var(--error-bg)]/80 text-[var(--error-text)]"
              : "border-[#4F7CFF]/20 bg-[var(--surface)]/80 text-[var(--text)]"
          }`}
        >
          <Timer size={14} className={timeIsShort ? "text-[#E2725B]" : "text-[var(--accent-ink)]"} />
          Time left: {formatCountdown(secondsLeft)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
          {error}
        </div>
      )}

      {questions.map((q, idx) => (
        <div key={q.id} className="rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 p-4">
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

      <button
        onClick={handleSubmit}
        disabled={submitting || Object.keys(answers).length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] py-2.5 text-sm font-medium text-[#FFFFFF] shadow-[0_4px_14px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Submit answers
      </button>
    </div>
  );
}

/* ---------------------------------- results ---------------------------------- */

function QuizResultsPanel({ quizId }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-base text-[var(--text)]">
        <Feather size={14} className="text-[var(--accent-ink)]" />
        {results.title}
      </h2>

      <div>
        <h3 className="section-title mb-3">Student scores</h3>
        {results.studentScores.length === 0 ? (
          <p className="text-[13px] text-[var(--dim)]">No submissions yet</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--divider)]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-[var(--surface)]/70 text-left text-[var(--dim)]">
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {results.studentScores.map((s) => (
                  <tr key={s.username} className="lm-row border-t border-[var(--divider)]">
                    <td className="px-3 py-2.5">{s.username}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">
                      {s.score} / {s.totalQuestions}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{formatDate(s.submittedAt)}</td>
                  </tr>
                ))}
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