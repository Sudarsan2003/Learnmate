import { useEffect, useState } from "react";
import { getChatQuizResults, getChatQuizResult } from "../api/client";

// Lists the student's completed chat practice quizzes and shows a
// per-question review (their answer, verdict, feedback) for the one they pick.
// Drop <PracticeQuizzes /> into a "Practice quizzes" tab inside Quizzes.jsx.

const VERDICT_LABEL = {
  CORRECT: "Correct",
  PARTIALLY_CORRECT: "Partially correct",
  INCORRECT: "Incorrect",
  NOT_ATTEMPTED: "Not answered",
  NOT_GRADED: "Not graded",
};

const VERDICT_COLOR = {
  CORRECT: "#2FBF71",
  PARTIALLY_CORRECT: "#E0A526",
  INCORRECT: "#FF6B81",
  NOT_ATTEMPTED: "#8A93A6",
  NOT_GRADED: "#8A93A6",
};

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function VerdictBadge({ verdict }) {
  const color = VERDICT_COLOR[verdict] ?? "#8A93A6";
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color, border: `1px solid ${color}66`, background: `${color}1A` }}
    >
      {VERDICT_LABEL[verdict] ?? verdict}
    </span>
  );
}

function McqReview({ r }) {
  const options = [
    ["A", r.optionA],
    ["B", r.optionB],
    ["C", r.optionC],
    ["D", r.optionD],
  ];
  return (
    <>
      <ul className="mt-3 space-y-1.5">
        {options.map(([letter, text]) => {
          const isCorrect = r.correctOption === letter;
          const isSelected = r.selectedOption === letter;
          const color = isCorrect ? "#2FBF71" : isSelected ? "#FF6B81" : null;
          return (
            <li
              key={letter}
              className="rounded-lg px-3 py-2 text-sm text-[var(--text)]"
              style={{
                border: `1px solid ${color ? `${color}88` : "rgba(91,141,239,0.2)"}`,
                background: color ? `${color}14` : "transparent",
              }}
            >
              <span className="font-semibold">{letter}.</span> {text}
              {isCorrect && <span className="ml-2 text-xs font-semibold" style={{ color }}>correct answer</span>}
              {isSelected && !isCorrect && <span className="ml-2 text-xs font-semibold" style={{ color }}>your answer</span>}
            </li>
          );
        })}
      </ul>
      {r.explanation && <p className="mt-3 text-sm text-[var(--muted)]">{r.explanation}</p>}
    </>
  );
}

function DescriptiveReview({ r }) {
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div>
        <p className="font-semibold text-[var(--text)]">Your answer</p>
        <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{r.studentAnswer || "No answer given."}</p>
      </div>
      {r.feedback && (
        <div>
          <p className="font-semibold text-[var(--text)]">Feedback</p>
          <p className="mt-1 text-[var(--muted)]">{r.feedback}</p>
        </div>
      )}
      {r.whatToReview && (
        <div>
          <p className="font-semibold text-[var(--text)]">To review</p>
          <p className="mt-1 text-[var(--muted)]">{r.whatToReview}</p>
        </div>
      )}
      {r.referenceAnswer && (
        <details>
          <summary className="cursor-pointer font-semibold text-[var(--text)]">Reference answer</summary>
          <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{r.referenceAnswer}</p>
        </details>
      )}
    </div>
  );
}

export function AttemptDetailView({ detail, onBack }) {
  const { summary, results } = detail;
  return (
    <div>
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 rounded-md border border-[#5B8DEF]/25 px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[#5B8DEF]/50 hover:text-[var(--text)]"
        >
          Back to practice quizzes
        </button>
      )}

      <h2 className="text-xl font-semibold text-[var(--text)]">{summary.topic}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {summary.scorePercent}% · {summary.correctCount} of {summary.totalQuestions} fully correct ·{" "}
        {formatDate(summary.completedAt)}
      </p>

      <ol className="mt-5 space-y-4">
        {results.map((r) => (
          <li key={r.number} className="rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 font-medium text-[var(--text)] [overflow-wrap:anywhere]">
                Q{r.number}. {r.questionText}
              </p>
              <VerdictBadge verdict={r.verdict} />
            </div>
            {r.type === "MCQ" ? <McqReview r={r} /> : <DescriptiveReview r={r} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function PracticeQuizzes() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getChatQuizResults();
        if (!cancelled) setAttempts(list);
      } catch {
        if (!cancelled) setError("Couldn't load your practice quizzes. Refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openAttempt(id) {
    setOpening(true);
    setError("");
    try {
      setDetail(await getChatQuizResult(id));
    } catch {
      setError("Couldn't open that quiz. Try again.");
    } finally {
      setOpening(false);
    }
  }

  if (detail) {
    return <AttemptDetailView detail={detail} onBack={() => setDetail(null)} />;
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading your practice quizzes…</p>;

  return (
    <div>
      {error && <p className="mb-3 text-sm text-[var(--error-text)]">{error}</p>}

      {attempts.length === 0 && !error && (
        <p className="text-sm text-[var(--muted)]">
          No practice quizzes yet. In chat, type "Quiz me on Biology Chapter 5" and reply with your answers.
          They'll be saved here.
        </p>
      )}

      <ul className="space-y-2.5">
        {attempts.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => openAttempt(a.id)}
              disabled={opening}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 px-4 py-3 text-left transition-colors hover:border-[#6A4DE0]/40 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--text)]">{a.topic}</span>
                <span className="block text-xs text-[var(--muted)]">
                  {a.difficulty} · {a.correctCount} of {a.totalQuestions} fully correct · {formatDate(a.completedAt)}
                </span>
              </span>
              <span className="flex-shrink-0 text-lg font-semibold text-[var(--text)]">{a.scorePercent}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}