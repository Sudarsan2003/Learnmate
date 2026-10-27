import { useEffect, useState } from "react";
import { Trophy, Lock } from "lucide-react";
import { getMyAchievements } from "../api/client";
import { PlaceMedal } from "./Medal";

/**
 * Student dashboard card: the medals I've won on class quizzes and my class's
 * toppers for this week, last week and this month, with my own name
 * highlighted. Medal and topper notifications open the dashboard here.
 */

const PLACE = { 1: "1st", 2: "2nd", 3: "3rd" };
const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${s}`;
};
const QUIZZES_AT_FIRST = 6;
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

export default function HallOfFame({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("thisWeek");
  const [allQuizzes, setAllQuizzes] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyAchievements()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Open on last week if it has toppers and this week doesn't yet.
        if (!d.thisWeek?.toppers?.length && d.lastWeek?.toppers?.length) setPeriod("lastWeek");
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load your medals."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return null; // the rest of the dashboard still works
  if (!data) return <div className="hf-card hf-loading" aria-busy="true">Loading your medals…</div>;

  const total = data.gold + data.silver + data.bronze;
  const board = data[period];
  const tabs = [
    ["thisWeek", "This week"],
    ["lastWeek", "Last week"],
    ["thisMonth", "This month"],
  ];

  return (
    <section className="hf-card" aria-labelledby="hf-title">
      <style>{CSS}</style>
      <div className="hf-head">
        <span className="hf-icon" aria-hidden="true"><Trophy size={18} /></span>
        <h2 id="hf-title" className="hf-title">Hall of fame</h2>
      </div>

      <div className="hf-grid">
        <div>
          <p className="hf-label">My medals</p>
          <div className="hf-counts">
            {[1, 2, 3].map((r) => (
              <span key={r} className="hf-count">
                <PlaceMedal rank={r} size={30} />
                <strong>{[0, data.gold, data.silver, data.bronze][r]}</strong>
              </span>
            ))}
          </div>
          {total === 0 ? (
            <p className="hf-muted">
              Finish in the top 3 of a class quiz to win your first medal. Score well and be quick!
            </p>
          ) : (
            <ul className="hf-medals">
              {data.medals.slice(0, 5).map((m) => (
                <li key={m.quizId}>
                  <PlaceMedal rank={m.rank} size={18} />
                  <span className="hf-medal-title">{m.title}</span>
                  <span className="hf-muted">
                    {PLACE[m.rank]} of {m.participants} · {m.percent}% · {fmtDay(m.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="hf-label">Class {data.standard} toppers</p>
          <div className="hf-tabs" role="tablist" aria-label="Toppers period">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={period === id}
                className={`hf-tab ${period === id ? "hf-tab-on" : ""}`}
                onClick={() => setPeriod(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {!board || board.toppers.length === 0 ? (
            <p className="hf-muted">
              {board?.quizzesSet ? "No toppers yet. There's still time to take the quizzes!" : "No quizzes were set in this period."}
            </p>
          ) : (
            <ol className="hf-board">
              {board.toppers.map((t) => (
                <li key={t.username} className={t.username === username ? "hf-me" : undefined}>
                  <PlaceMedal rank={t.rank} size={20} />
                  <span className="hf-name">
                    {t.fullName || t.username}
                    {t.username === username && <span className="hf-you">You</span>}
                  </span>
                  <span className="hf-score">{t.averagePercent}%</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {data.quizToppers?.length > 0 && (
        <div className="hf-quizzes">
          <p className="hf-label">Quiz toppers</p>
          <div className="hf-quiz-grid">
            {(allQuizzes ? data.quizToppers : data.quizToppers.slice(0, QUIZZES_AT_FIRST)).map((q) => (
              <QuizCard key={q.quizId} quiz={q} username={username} />
            ))}
          </div>
          {data.quizToppers.length > QUIZZES_AT_FIRST && (
            <button type="button" className="hf-more" onClick={() => setAllQuizzes((v) => !v)}>
              {allQuizzes ? "Show fewer" : `Show all ${data.quizToppers.length} quizzes`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** One class quiz: its 1st/2nd/3rd, and my own place. */
function QuizCard({ quiz, username }) {
  const inPodium = quiz.podium.some((p) => p.username === username);
  return (
    <div className="hf-quiz">
      <div className="hf-quiz-head">
        <span className="hf-quiz-title" title={quiz.title}>{quiz.title}</span>
        <span className={`hf-badge ${quiz.open ? "hf-badge-open" : ""}`}>{quiz.open ? "Open" : "Closed"}</span>
      </div>
      <span className="hf-muted">
        {quiz.subject ? `${quiz.subject} · ` : ""}
        {fmtDay(quiz.createdAt)} · {quiz.participants} took it
      </span>

      {quiz.locked ? (
        <button
          type="button"
          className="hf-locked"
          onClick={() => document.dispatchEvent(new CustomEvent("learnmate:navigate", { detail: { view: "quizzes" } }))}
        >
          <Lock size={14} aria-hidden="true" /> Submit this quiz to see its toppers
        </button>
      ) : quiz.podium.length === 0 ? (
        <p className="hf-muted hf-quiz-empty">{quiz.participants === 0 ? "No one has taken it yet." : "No one has scored on it yet."}</p>
      ) : (
        <ol className="hf-board hf-board-sm">
          {quiz.podium.map((p) => (
            <li key={p.username} className={p.username === username ? "hf-me" : undefined}>
              <PlaceMedal rank={p.rank} size={16} />
              <span className="hf-name">
                {p.fullName || p.username}
                {p.username === username && <span className="hf-you">You</span>}
              </span>
              <span className="hf-score">{p.percent}%</span>
            </li>
          ))}
        </ol>
      )}

      {!quiz.locked && !inPodium && quiz.myPercent != null && (
        <p className="hf-mine">
          {quiz.myRank ? `Your place: ${ordinal(quiz.myRank)} of ${quiz.participants} (${quiz.myPercent}%)` : `You scored ${quiz.myPercent}%`}
        </p>
      )}
    </div>
  );
}

const CSS = `
.hf-card {
  margin-top: 1.5rem; padding: 1.1rem 1.2rem; border-radius: 16px; border: 1px solid var(--divider);
  background: linear-gradient(150deg, color-mix(in srgb, #F2B705 12%, var(--surface)), var(--surface) 55%);
}
.hf-loading { font-size: 13.5px; color: var(--dim); }
.hf-head { display: flex; align-items: center; gap: .6rem; margin-bottom: .9rem; }
.hf-icon { display: flex; align-items: center; justify-content: center; width: 2.1rem; height: 2.1rem; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #F2B705, #C98A00); }
.hf-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.1rem; font-weight: 700; }
.hf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1.25rem; }
.hf-label { margin: 0 0 .5rem; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.hf-counts { display: flex; gap: 1.1rem; margin-bottom: .6rem; }
.hf-count { display: inline-flex; align-items: center; gap: .4rem; font-size: 1.25rem; }
.hf-muted { margin: 0; font-size: 12.5px; color: var(--dim); }
.hf-medals, .hf-board { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .35rem; }
.hf-medals li { display: grid; grid-template-columns: auto 1fr; column-gap: .5rem; align-items: center; padding: .4rem .55rem; border-radius: 10px; background: var(--surface-2); }
.hf-medals li .hf-muted { grid-column: 2; font-size: 11.5px; }
.hf-medal-title { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-tabs { display: flex; gap: .3rem; margin-bottom: .55rem; }
.hf-tab { padding: .3rem .7rem; border-radius: 999px; border: 1px solid var(--divider); background: var(--surface); font-size: 12.5px; font-weight: 600; color: var(--muted); cursor: pointer; }
.hf-tab-on { color: var(--text); border-color: #F2B705; background: color-mix(in srgb, #F2B705 16%, var(--surface)); }
.hf-board li { display: flex; align-items: center; gap: .55rem; padding: .45rem .6rem; border-radius: 10px; background: var(--surface-2); }
.hf-board li.hf-me { background: color-mix(in srgb, #F2B705 22%, var(--surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, #F2B705 55%, transparent); }
.hf-name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-you { margin-left: .4rem; padding: .05rem .4rem; border-radius: 999px; font-size: 10.5px; font-weight: 700; color: #7A5A00; background: #FFE9A8; }
.hf-score { font-weight: 700; font-size: 13.5px; }
.hf-quizzes { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--divider); }
.hf-quiz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: .65rem; }
.hf-quiz { display: flex; flex-direction: column; gap: .35rem; padding: .7rem .8rem; border-radius: 12px; border: 1px solid var(--divider); background: var(--surface); }
.hf-quiz-head { display: flex; align-items: center; gap: .5rem; }
.hf-quiz-title { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-badge { flex-shrink: 0; padding: .05rem .45rem; border-radius: 999px; font-size: 10.5px; font-weight: 700; color: var(--muted); background: var(--surface-2); }
.hf-badge-open { color: #0F8A5F; background: color-mix(in srgb, #0F8A5F 12%, var(--surface)); }
.hf-board-sm li { padding: .3rem .5rem; }
.hf-board-sm .hf-name, .hf-board-sm .hf-score { font-size: 12.5px; }
.hf-quiz-empty { padding: .3rem 0; }
.hf-locked { display: inline-flex; align-items: center; gap: .4rem; align-self: flex-start; margin-top: .2rem; padding: .4rem .7rem; border: 1px dashed var(--divider); border-radius: 10px; background: var(--surface-2); font: inherit; font-size: 12.5px; font-weight: 600; color: var(--muted); cursor: pointer; }
.hf-locked:hover { color: var(--text); border-color: #4F80F8; }
.hf-mine { margin: .15rem 0 0; font-size: 12px; font-weight: 600; color: var(--muted); }
.hf-more { margin-top: .65rem; padding: 0; border: none; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #4F80F8; cursor: pointer; }
`;
