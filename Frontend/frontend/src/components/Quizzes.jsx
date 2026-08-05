import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import {
  createQuiz,
  getAvailableQuizzes,
  getQuizQuestions,
  submitQuiz,
  getQuizResults,
  closeQuiz,
  listInstitutions,
} from "../api/client";

const OPTION_KEYS = ["A", "B", "C", "D"];
const EMPTY_MANUAL_QUESTION = () => ({
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  questionText: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "A",
});

// The backend has no "list my quizzes" endpoint — results/close require a
// quizId the caller already knows. We remember quizzes an admin/teacher
// creates (per browser, per username) purely so they don't have to copy the
// id down manually right after creating one.
function createdQuizzesKey(username) {
  return `learnmate_created_quizzes_${username}`;
}
function loadCreatedQuizzes(username) {
  try {
    return JSON.parse(localStorage.getItem(createdQuizzesKey(username)) || "[]");
  } catch {
    return [];
  }
}
function rememberCreatedQuiz(username, quiz) {
  const existing = loadCreatedQuizzes(username);
  const next = [
    { id: quiz.id, title: quiz.title, subject: quiz.subject, standard: quiz.standard, mode: quiz.mode },
    ...existing.filter((q) => q.id !== quiz.id),
  ];
  localStorage.setItem(createdQuizzesKey(username), JSON.stringify(next));
  return next;
}

export default function Quizzes({ currentUsername, role }) {
  const canManage = role === "ADMIN" || role === "TEACHER";
  // "list" (default) | "create" | "take" | "results"
  const [view, setView] = useState("list");
  const [activeQuizId, setActiveQuizId] = useState(null);

  return (
    <div className="quiz-view min-h-full bg-[#0B0E14] px-4 py-6 font-mono text-[#EDE6D6] sm:px-8 sm:py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .quiz-view { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; }
        .lm-row { transition: background 140ms ease; }
        .lm-row:hover { background: rgba(45,212,191,0.05); }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: #22283a; border-radius: 4px; }
        @keyframes row-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="mx-auto max-w-[820px]">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[19px] font-bold tracking-tight text-[#EDE6D6] sm:text-[22px]">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22]">
                <ClipboardList size={12} className="text-[#0B0E14]" />
              </span>
              quizzes <span className="text-[#C89B3C]">·</span> {canManage ? (role === "TEACHER" ? "teacher" : "admin") : "student"}
            </h1>
            <p className="mt-1.5 text-[13px] text-[#9FB0AC]">
              {canManage
                ? "create quizzes for your class, mixing manual and AI-generated questions"
                : "quizzes open for your class right now"}
            </p>
          </div>

          {view !== "list" && (
            <button
              onClick={() => {
                setView("list");
                setActiveQuizId(null);
              }}
              className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[#9FB0AC] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[#EDE6D6]"
            >
              <ArrowLeft size={13} strokeWidth={2} />
              back
            </button>
          )}
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
          <StudentQuizList
            onTakeQuiz={(id) => {
              setActiveQuizId(id);
              setView("take");
            }}
          />
        )}

        {view === "create" && canManage && (
          <CreateQuizForm
            role={role}
            onCreated={(quiz) => {
              rememberCreatedQuiz(currentUsername, quiz);
              setView("list");
            }}
          />
        )}

        {view === "take" && activeQuizId && (
          <TakeQuiz quizId={activeQuizId} onDone={() => setView("list")} />
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
  const [createdQuizzes, setCreatedQuizzes] = useState(() => loadCreatedQuizzes(currentUsername));
  const [closingId, setClosingId] = useState(null);
  const [error, setError] = useState(null);

  const handleClose = async (id) => {
    setClosingId(id);
    setError(null);
    try {
      await closeQuiz(id);
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not close quiz ${id}.`);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div>
      <button
        onClick={onCreate}
        className="mb-6 flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-4 py-2.5 text-sm font-medium text-[#0B0E14] shadow-[0_4px_14px_-4px_rgba(200,155,60,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_rgba(200,155,60,0.65)]"
      >
        <Plus size={15} />
        new quiz
      </button>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
          {error}
        </div>
      )}

      <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-[#9FB0AC]">
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
        quizzes you've created (this browser)
      </h2>

      {createdQuizzes.length === 0 ? (
        <div className="rounded-lg border border-[#1B2333] px-4 py-7 text-center text-xs text-[#6E7C79]">
          nothing created yet — quizzes you create here will show up in this list so you can
          jump to their results or close them
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#1B2333]">
          <div className="lm-scroll max-h-[420px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="bg-[#12151F]/70 text-left text-[#6E7C79]">
                  <th className="px-3 py-2.5 font-medium">title</th>
                  <th className="px-3 py-2.5 font-medium">subject</th>
                  <th className="px-3 py-2.5 font-medium">standard</th>
                  <th className="px-3 py-2.5 font-medium">mode</th>
                  <th className="px-3 py-2.5 text-right font-medium">actions</th>
                </tr>
              </thead>
              <tbody>
                {createdQuizzes.map((q) => (
                  <tr key={q.id} className="lm-row border-t border-[#1B2333]">
                    <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5">
                      {q.title}
                    </td>
                    <td className="px-3 py-2.5 text-[#9FB0AC]">{q.subject || "—"}</td>
                    <td className="px-3 py-2.5 text-[#9FB0AC]">{q.standard || "—"}</td>
                    <td className="px-3 py-2.5 text-[#9FB0AC]">{q.mode}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => onViewResults(q.id)}
                          title="View results"
                          className="flex items-center gap-1 rounded-md border border-[#2DD4BF]/20 px-2 py-1 text-[11px] text-[#2DD4BF] transition-colors hover:bg-[#2DD4BF]/10"
                        >
                          <BarChart3 size={12} />
                          results
                        </button>
                        <button
                          onClick={() => handleClose(q.id)}
                          disabled={closingId === q.id}
                          title="Close quiz"
                          className="flex items-center gap-1 rounded-md border border-[#E2725B]/30 px-2 py-1 text-[11px] text-[#E2725B] transition-colors hover:bg-[#E2725B]/10 disabled:opacity-40"
                        >
                          {closingId === q.id ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                          close
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
        <div className="rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 checkpoint"
            className="lm-input"
          />
        </Field>
        <Field label="standard (class this targets)">
          <input
            value={standard}
            onChange={(e) => setStandard(e.target.value)}
            placeholder='e.g. "5"'
            className="lm-input"
          />
        </Field>
        <Field label="subject (optional — filters AI question retrieval)">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. data-structures"
            className="lm-input"
          />
        </Field>
        {isAdmin && (
          <Field label="institution (which school this quiz is for)">
            <input
              list="lm-known-institutions"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder={loadingInstitutions ? "loading…" : "type or pick an institution"}
              className="lm-input"
            />
            <datalist id="lm-known-institutions">
              {knownInstitutions.map((inst) => (
                <option key={inst} value={inst} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-[#6E7C79]">
              must exactly match the institution set on students' profiles (see "manage users") or they won't see this quiz
            </p>
          </Field>
        )}
        <Field label="mode">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="lm-input">
            <option value="OPEN">open — available immediately</option>
            <option value="SCHEDULED">scheduled</option>
          </select>
        </Field>
      </div>

      {mode === "SCHEDULED" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ animation: "row-in 200ms ease both" }}>
          <Field label="opens at">
            <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="lm-input" />
          </Field>
          <Field label="closes at (optional — admin closes manually if blank)">
            <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="lm-input" />
          </Field>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-[#9FB0AC]">
            <span className="inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
            manual questions
          </h2>
          <button
            type="button"
            onClick={addManualQuestion}
            className="flex items-center gap-1.5 rounded-md border border-[#2DD4BF]/20 px-2.5 py-1.5 text-[11px] text-[#2DD4BF] transition-colors hover:bg-[#2DD4BF]/10"
          >
            <Plus size={12} />
            add question
          </button>
        </div>

        {manualQuestions.length === 0 ? (
          <p className="text-xs text-[#6E7C79]">none yet — optional if you're using AI-generated questions</p>
        ) : (
          <div className="flex flex-col gap-3">
            {manualQuestions.map((q, idx) => (
              <div
                key={q.clientId}
                style={{ animation: "row-in 180ms ease both" }}
                className="rounded-lg border border-[#1B2333] bg-[#12151F]/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] text-[#6E7C79]">question {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeManualQuestion(q.clientId)}
                    className="text-[#E2725B] transition-colors hover:text-[#F3B9A8]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <input
                  value={q.questionText}
                  onChange={(e) => updateManualQuestion(q.clientId, "questionText", e.target.value)}
                  placeholder="question text"
                  className="lm-input mb-2"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OPTION_KEYS.map((key) => (
                    <input
                      key={key}
                      value={q[`option${key}`]}
                      onChange={(e) => updateManualQuestion(q.clientId, `option${key}`, e.target.value)}
                      placeholder={`option ${key}`}
                      className="lm-input"
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-[#6E7C79]">correct option</span>
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

      <Field label="AI-generated questions (pulled from that standard's study material)">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#C89B3C]" />
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
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] py-2.5 text-sm font-medium text-[#0B0E14] shadow-[0_4px_14px_-4px_rgba(200,155,60,0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        create quiz
      </button>

      <style>{`
        .lm-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgba(45,212,191,0.15);
          background: rgba(18,21,31,0.7);
          padding: 0.625rem 0.75rem;
          font-size: 13px;
          color: #EDE6D6;
          outline: none;
          transition: box-shadow 140ms ease, border-color 140ms ease;
        }
        .lm-input:focus {
          border-color: rgba(200,155,60,0.6);
          box-shadow: 0 0 0 3px rgba(200,155,60,0.15);
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] text-[#9FB0AC]">{label}</label>
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
          className="flex items-center gap-1.5 rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[#9FB0AC] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[#EDE6D6]"
        >
          <RefreshCw size={13} strokeWidth={2} />
          refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-5 text-xs text-[#6E7C79]">loading…</div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-lg border border-[#1B2333] px-4 py-7 text-center text-xs text-[#6E7C79]">
          no quizzes open for your class right now
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="lm-row flex items-center justify-between gap-3 rounded-lg border border-[#1B2333] bg-[#12151F]/60 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[#EDE6D6]">{q.title}</p>
                <p className="mt-0.5 text-[11px] text-[#6E7C79]">
                  {q.subject || "general"} · standard {q.standard} · {q.mode.toLowerCase()}
                </p>
              </div>
              <button
                onClick={() => onTakeQuiz(q.id)}
                className="flex-shrink-0 rounded-md bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] shadow-[0_4px_12px_-4px_rgba(200,155,60,0.55)] transition-all hover:-translate-y-0.5"
              >
                start
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TakeQuiz({ quizId, onDone }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId -> "A".."D"
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getQuizQuestions(quizId);
        if (!cancelled) setQuestions(data);
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

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        answers: Object.entries(answers).map(([questionId, selectedOption]) => ({
          questionId: Number(questionId),
          selectedOption,
        })),
      };
      const res = await submitQuiz(quizId, payload);
      setResult(res);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not submit this quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-5 text-xs text-[#6E7C79]">loading…</div>;

  if (error && !questions) {
    return (
      <div className="rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
        {error}
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-[#2DD4BF]/20 bg-[#12151F]/70 px-6 py-10 text-center">
        <CheckCircle2 size={28} className="text-[#2DD4BF]" />
        <p className="text-lg text-[#EDE6D6]">
          {result.score} / {result.totalQuestions}
        </p>
        <p className="text-xs text-[#9FB0AC]">submitted successfully</p>
        <button
          onClick={onDone}
          className="mt-2 rounded-md border border-[#2DD4BF]/20 px-4 py-2 text-xs text-[#2DD4BF] transition-colors hover:bg-[#2DD4BF]/10"
        >
          back to quizzes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
          {error}
        </div>
      )}

      {questions.map((q, idx) => (
        <div key={q.id} className="rounded-lg border border-[#1B2333] bg-[#12151F]/60 p-4">
          <p className="mb-3 text-sm text-[#EDE6D6]">
            <span className="text-[#C89B3C]">{idx + 1}.</span> {q.questionText}
          </p>
          <div className="flex flex-col gap-2">
            {OPTION_KEYS.map((key) => {
              const optionText = q[`option${key}`];
              const selected = answers[q.id] === key;
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors ${
                    selected
                      ? "border-[#C89B3C]/60 bg-[#C89B3C]/10 text-[#EDE6D6]"
                      : "border-[#1B2333] text-[#9FB0AC] hover:border-[#2DD4BF]/30"
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${q.id}`}
                    checked={selected}
                    onChange={() => selectAnswer(q.id, key)}
                    className="accent-[#C89B3C]"
                  />
                  <span className="font-semibold text-[#C89B3C]">{key}.</span>
                  {optionText}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={submitting || Object.keys(answers).length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] py-2.5 text-sm font-medium text-[#0B0E14] shadow-[0_4px_14px_-4px_rgba(200,155,60,0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        submit answers
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

  if (loading) return <div className="py-5 text-xs text-[#6E7C79]">loading…</div>;

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
        <AlertCircle size={14} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-base text-[#EDE6D6]">
        <Feather size={14} className="text-[#C89B3C]" />
        {results.title}
      </h2>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-[#9FB0AC]">student scores</h3>
        {results.studentScores.length === 0 ? (
          <p className="text-xs text-[#6E7C79]">no submissions yet</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#1B2333]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#12151F]/70 text-left text-[#6E7C79]">
                  <th className="px-3 py-2.5 font-medium">student</th>
                  <th className="px-3 py-2.5 font-medium">score</th>
                </tr>
              </thead>
              <tbody>
                {results.studentScores.map((s) => (
                  <tr key={s.username} className="lm-row border-t border-[#1B2333]">
                    <td className="px-3 py-2.5">{s.username}</td>
                    <td className="px-3 py-2.5 text-[#9FB0AC]">
                      {s.score} / {s.totalQuestions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-[#9FB0AC]">most missed questions</h3>
        {results.mostMissedQuestions.length === 0 ? (
          <p className="text-xs text-[#6E7C79]">nothing to show yet</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {results.mostMissedQuestions.map((m) => (
              <div
                key={m.questionId}
                className="flex items-center justify-between gap-3 rounded-md border border-[#1B2333] bg-[#12151F]/60 px-3 py-2 text-xs"
              >
                <span className="truncate text-[#EDE6D6]">{m.questionText}</span>
                <span className="flex-shrink-0 text-[#E2725B]">missed {m.missCount}x</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}