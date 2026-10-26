import { useCallback, useEffect, useRef, useState } from "react";
import { getChatQuizAttempt, saveChatQuizAnswers, submitChatQuiz } from "../api/client";
import { AttemptDetailView } from "./PracticeQuizzes";

// Interactive quiz card shown in chat in place of the plain-text quiz.
//
//  - Options are clickable and typed answers are saved to the server as the student goes
//    (debounced), so closing the tab or reloading the chat resumes exactly where they left off.
//  - "Submit quiz" grades the saved answers and swaps the card for the per-question review.
//  - A finished or closed quiz loads in its final state, so old chat messages stay correct.
//
// The backend appends a token like [[LEARNMATE_QUIZ:42]] to the quiz message. Use QUIZ_TOKEN to
// detect it in the chat window and render <ChatQuiz attemptId={42} /> instead of the text.

export const QUIZ_TOKEN = /\[\[LEARNMATE_QUIZ:(\d+)\]\]/;

const OPTION_FIELDS = [
  ["A", "optionA"],
  ["B", "optionB"],
  ["C", "optionC"],
  ["D", "optionD"],
];

const SAVE_LABEL = {
  saving: "Saving…",
  saved: "Progress saved",
  error: "Couldn't save — will retry on your next change",
};

const isFilled = (v) => typeof v === "string" && v.trim() !== "";

export default function ChatQuiz({ attemptId }) {
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [submitting, setSubmitting] = useState(false);

  // Latest answers + "has unsaved changes" flag, readable from timers and unmount cleanup.
  const answersRef = useRef({});
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const persist = useCallback(
    async (next) => {
      try {
        await saveChatQuizAnswers(attemptId, next);
        if (answersRef.current === next) dirtyRef.current = false;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [attemptId]
  );

  const scheduleSave = useCallback(
    (next, delay) => {
      clearTimeout(timerRef.current);
      dirtyRef.current = true;
      setSaveState("saving");
      timerRef.current = setTimeout(() => persist(next), delay);
    },
    [persist]
  );

  // Load the quiz and whatever the student had already answered.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getChatQuizAttempt(attemptId);
        if (cancelled) return;
        setAttempt(data);
        answersRef.current = data.answers ?? {};
        setAnswers(answersRef.current);
        if (data.detail) setDetail(data.detail);
      } catch {
        if (!cancelled) setError("Couldn't load this quiz. Refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // Leaving the page (or the chat re-rendering) must not lose unsaved answers.
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      if (dirtyRef.current) persist(answersRef.current);
    },
    [persist]
  );

  function setAnswer(number, value, delay) {
    const next = { ...answersRef.current };
    if (isFilled(value)) next[String(number)] = value;
    else delete next[String(number)];
    answersRef.current = next;
    setAnswers(next);
    scheduleSave(next, delay);
  }

  async function submit() {
    const total = attempt.questions.length;
    const unanswered = total - Object.values(answersRef.current).filter(isFilled).length;
    if (unanswered > 0 && !window.confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) {
      return;
    }
    setSubmitting(true);
    setError("");
    clearTimeout(timerRef.current);
    try {
      await saveChatQuizAnswers(attemptId, answersRef.current);
      dirtyRef.current = false;
      setDetail(await submitChatQuiz(attemptId));
    } catch {
      setError("Couldn't grade your quiz just now. Your answers are saved — please try submitting again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading your quiz…</p>;
  if (error && !attempt) return <p className="text-sm text-[var(--error-text)]">{error}</p>;

  if (detail) return <AttemptDetailView detail={detail} />;

  if (attempt.status === "ABANDONED") {
    return (
      <div className="rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 p-4 text-sm text-[var(--muted)]">
        This quiz ({attempt.topic}) was closed. Ask for a new one any time.
      </div>
    );
  }

  const total = attempt.questions.length;
  const answered = Object.values(answers).filter(isFilled).length;

  return (
    <div className="rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 p-4">
      <h2 className="text-lg font-semibold text-[var(--text)] [overflow-wrap:anywhere]">Quiz: {attempt.topic}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Difficulty: {attempt.difficulty}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>
            {answered} of {total} answered
          </span>
          <span aria-live="polite">{SAVE_LABEL[saveState] ?? ""}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#5B8DEF]/15">
          <div
            className="h-full rounded-full bg-[#5B8DEF] transition-all"
            style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <ol className="mt-5 space-y-5">
        {attempt.questions.map((q) => {
          const value = answers[String(q.number)] ?? "";
          return (
            <li key={q.number}>
              <p className="font-medium text-[var(--text)] [overflow-wrap:anywhere]">
                Q{q.number}. {q.questionText}
              </p>

              {q.type === "MCQ" ? (
                <div role="radiogroup" aria-label={`Question ${q.number}`} className="mt-2 space-y-1.5">
                  {OPTION_FIELDS.map(([letter, field]) => {
                    const selected = value === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={submitting}
                        onClick={() => setAnswer(q.number, selected ? "" : letter, 300)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] transition-colors disabled:opacity-60"
                        style={{
                          border: `1px solid ${selected ? "#5B8DEF" : "rgba(91,141,239,0.25)"}`,
                          background: selected ? "rgba(91,141,239,0.14)" : "transparent",
                        }}
                      >
                        <span className="font-semibold">{letter}.</span> {q[field]}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={value}
                  disabled={submitting}
                  rows={4}
                  placeholder="Write your answer in your own words."
                  onChange={(e) => setAnswer(q.number, e.target.value, 800)}
                  onBlur={() => dirtyRef.current && scheduleSave(answersRef.current, 0)}
                  className="mt-2 w-full resize-y rounded-lg border border-[#5B8DEF]/25 bg-transparent px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#5B8DEF]/60 disabled:opacity-60"
                />
              )}
            </li>
          );
        })}
      </ol>

      {error && <p className="mt-4 text-sm text-[var(--error-text)]">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || answered === 0}
          className="rounded-lg bg-[#5B8DEF] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Grading…" : "Submit quiz"}
        </button>
        <span className="text-xs text-[var(--muted)]">
          Your answers are saved as you go. You can leave and come back.
        </span>
      </div>
    </div>
  );
}