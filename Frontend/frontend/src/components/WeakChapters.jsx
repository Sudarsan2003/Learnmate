import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { getMyWeakChapters } from "../api/client";
import { LevelBar, LevelPill } from "./WeakLevel";

/**
 * Student dashboard card: the chapters I'm weak in, from my class and practice
 * quiz scores (only quizzes that cover a known chapter count). "Practise" opens
 * a new chat that quizzes me on that chapter.
 */

function practise(c) {
  document.dispatchEvent(
    new CustomEvent("learnmate:navigate", {
      detail: { view: "chat", ask: `Quiz me on ${c.chapter}${c.book ? ` (${c.book})` : ""}` },
    })
  );
}

export default function WeakChapters() {
  const [chapters, setChapters] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyWeakChapters()
      .then((d) => !cancelled && setChapters(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null; // the rest of the dashboard still works
  const needWork = (chapters ?? []).filter((c) => c.level !== "STRONG");
  const strong = (chapters ?? []).filter((c) => c.level === "STRONG");

  return (
    <section className="wc-card" aria-labelledby="wc-title">
      <style>{CSS}</style>
      <div className="wc-head">
        <span className="wc-icon" aria-hidden="true">
          <Target size={18} />
        </span>
        <div>
          <h2 id="wc-title" className="wc-title">Your weak chapters</h2>
          <p className="wc-sub">From your quiz scores. Under 50% is weak; 50–69% needs practice.</p>
        </div>
      </div>

      {chapters === null ? (
        <p className="wc-muted">Loading…</p>
      ) : chapters.length === 0 ? (
        <p className="wc-muted">
          Take a class quiz or ask the tutor &quot;Quiz me on&quot; a chapter, and your strong and weak chapters will
          show up here.
        </p>
      ) : (
        <>
          {needWork.length === 0 ? (
            <p className="wc-muted">No weak chapters right now. Great work, keep it up!</p>
          ) : (
            <ul className="wc-list">
              {needWork.map((c) => (
                <li key={`${c.book}|${c.chapter}`} className="wc-row">
                  <div className="wc-main">
                    <span className="wc-chapter">{c.chapter}</span>
                    <span className="wc-book">{c.book}</span>
                  </div>
                  <div className="wc-score">
                    <LevelBar level={c.level} percent={c.averagePercent} />
                    <strong>{c.averagePercent}%</strong>
                    <span className="wc-muted wc-small">
                      {c.quizzes} quiz{c.quizzes === 1 ? "" : "zes"} · last {c.latestPercent}%
                    </span>
                  </div>
                  <span className="wc-level">
                    <LevelPill level={c.level} />
                  </span>
                  <button type="button" className="wc-btn" onClick={() => practise(c)}>
                    Practise
                  </button>
                </li>
              ))}
            </ul>
          )}
          {strong.length > 0 && (
            <p className="wc-strong">
              <span>Strong:</span> {strong.map((c) => `${c.chapter} (${c.averagePercent}%)`).join(" · ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const CSS = `
.wc-card { margin-top: 1.5rem; padding: 1.1rem 1.2rem; border-radius: 16px; border: 1px solid var(--divider); background: var(--surface); }
.wc-head { display: flex; align-items: flex-start; gap: .65rem; margin-bottom: .9rem; }
.wc-icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 2.1rem; height: 2.1rem; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #E2725B, #C2410C); }
.wc-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.1rem; font-weight: 700; }
.wc-sub { margin: .15rem 0 0; font-size: 12.5px; color: var(--dim); }
.wc-muted { margin: 0; font-size: 13px; color: var(--dim); }
.wc-small { font-size: 11.5px; }
.wc-list { margin: 0; padding: 0; list-style: none; display: grid; gap: .5rem; }
.wc-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 13rem) auto auto; align-items: center; gap: .75rem; padding: .6rem .75rem; border-radius: 12px; background: var(--surface-2); }
.wc-main { min-width: 0; display: flex; flex-direction: column; }
.wc-chapter { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-book { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-score { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: .5rem; min-width: 0; }
.wc-score .wc-small { grid-column: 1 / -1; }
.wc-score strong { font-size: 14px; font-variant-numeric: tabular-nums; }
.wc-btn { border: 1px solid #5B8DEF; color: #5B8DEF; background: transparent; border-radius: 999px; padding: .3rem .85rem; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.wc-btn:hover { background: color-mix(in srgb, #5B8DEF 12%, transparent); }
.wc-btn:focus-visible { outline: 2px solid #5B8DEF; outline-offset: 2px; }
.wc-strong { margin: .8rem 0 0; font-size: 12.5px; color: var(--muted); }
.wc-strong span { font-weight: 700; color: #0F8A5F; }
@media (max-width: 640px) {
  .wc-row { grid-template-columns: minmax(0, 1fr) auto; }
  .wc-score { grid-column: 1 / -1; grid-row: 2; }
  .wc-btn { grid-column: 2; grid-row: 1; }
  .wc-row .wc-level { display: none; }
}
`;
