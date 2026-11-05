import { useEffect, useState } from "react";
import { getClassWeakChapters } from "../api/client";
import { LevelBar, LevelPill } from "./WeakLevel";

/**
 * "Weak chapters" tab of Class reports: each chapter's class average with the
 * students who are weak in it, and every student's weak / needs-practice
 * chapters. Only quizzes that cover a known chapter count (a chapter picked
 * when creating the quiz, or a single-chapter practice quiz).
 */
export default function ClassWeakChapters({ standard }) {
  const [data, setData] = useState({ standard: null, value: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    getClassWeakChapters(standard)
      .then((value) => !cancelled && setData({ standard, value, error: "" }))
      .catch((err) =>
        !cancelled &&
        setData({ standard, value: null, error: err.response?.data?.message ?? "Could not load weak chapters." })
      );
    return () => {
      cancelled = true;
    };
  }, [standard]);

  const loaded = data.standard === standard ? data : { value: null, error: "" };
  if (loaded.error) return <p className="cw-muted">{loaded.error}</p>;
  if (!loaded.value) return <p className="cw-muted">Loading…</p>;
  const { chapters, students } = loaded.value;

  return (
    <div className="cw">
      <style>{CSS}</style>
      {chapters.length === 0 ? (
        <div className="cw-empty">
          <p className="cw-empty-title">No chapter results yet for Class {standard}</p>
          <p className="cw-muted">
            Pick a <b>Chapter</b> when you create a quiz, or let students practise a chapter in chat (&quot;Quiz me on
            Chapter 9&quot;). Their scores then show up here, chapter by chapter.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="cw-chapters-h">
            <h2 id="cw-chapters-h" className="cw-h2">Chapters, weakest first</h2>
            <ul className="cw-list">
              {chapters.map((c) => {
                const level = c.averagePercent < 50 ? "WEAK" : c.averagePercent < 70 ? "PRACTISE" : "STRONG";
                return (
                  <li key={`${c.book}|${c.chapter}`} className="cw-chapter">
                    <div className="cw-top">
                      <div className="cw-name">
                        <span className="cw-title">{c.chapter}</span>
                        <span className="cw-muted">{c.book}</span>
                      </div>
                      <div className="cw-avg">
                        <LevelBar level={level} percent={c.averagePercent} />
                        <strong>{c.averagePercent}%</strong>
                        <span className="cw-muted cw-small">class average · {c.students} student{c.students === 1 ? "" : "s"}</span>
                      </div>
                      <LevelPill level={level} />
                    </div>
                    {c.weakStudents.length > 0 && (
                      <p className="cw-weak">
                        <span>Weak ({c.weakStudents.length}):</span>{" "}
                        {c.weakStudents.map((s) => `${s.fullName} ${s.averagePercent}%`).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="cw-students-h">
            <h2 id="cw-students-h" className="cw-h2">Students who need help</h2>
            {students.length === 0 ? (
              <p className="cw-muted">Every student is at 70% or above in the chapters they&apos;ve been quizzed on.</p>
            ) : (
              <div className="cw-table-wrap">
                <table className="cw-table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Weak and needs-practice chapters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.username}>
                        <th scope="row">
                          <span className="cw-student">{s.fullName}</span>
                          <span className="cw-muted cw-small">{s.username}</span>
                        </th>
                        <td>
                          <div className="cw-chips">
                            {s.chapters.map((c) => (
                              <span key={`${c.book}|${c.chapter}`} className={`cw-chip cw-chip-${c.level.toLowerCase()}`}>
                                {c.chapter} · {c.averagePercent}%
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const CSS = `
.cw { display: grid; gap: 1.5rem; }
.cw-h2 { margin: 0 0 .7rem; font-size: 1.05rem; font-weight: 700; }
.cw-muted { margin: 0; font-size: 13px; color: var(--dim); }
.cw-small { font-size: 12px; }
.cw-empty { padding: 1.4rem; border-radius: 14px; border: 1px dashed var(--divider); text-align: center; display: grid; gap: .4rem; }
.cw-empty-title { margin: 0; font-weight: 700; }
.cw-list { margin: 0; padding: 0; list-style: none; display: grid; gap: .55rem; }
.cw-chapter { padding: .75rem .9rem; border-radius: 14px; border: 1px solid var(--divider); background: var(--surface); }
.cw-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 15rem) auto; gap: .9rem; align-items: center; }
.cw-name { min-width: 0; display: flex; flex-direction: column; }
.cw-title { font-weight: 700; font-size: 14.5px; }
.cw-avg { display: grid; grid-template-columns: 1fr auto; column-gap: .55rem; align-items: center; min-width: 0; }
.cw-avg .cw-small { grid-column: 1 / -1; }
.cw-avg strong { font-variant-numeric: tabular-nums; }
.cw-weak { margin: .55rem 0 0; font-size: 13px; color: var(--muted); }
.cw-weak span { font-weight: 700; color: #E2725B; }
.cw-table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid var(--divider); }
.cw-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.cw-table th, .cw-table td { padding: .65rem .85rem; text-align: left; vertical-align: top; border-top: 1px solid var(--divider); }
.cw-table thead th { border-top: 0; font-size: 12px; color: var(--dim); font-weight: 600; background: var(--surface-2); }
.cw-table tbody th { font-weight: 600; white-space: nowrap; }
.cw-student { display: block; }
.cw-chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.cw-chip { padding: .2rem .6rem; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
.cw-chip-weak { color: #E2725B; background: color-mix(in srgb, #E2725B 14%, transparent); }
.cw-chip-practise { color: #B7800A; background: color-mix(in srgb, #D99A0B 16%, transparent); }
@media (max-width: 640px) {
  .cw-top { grid-template-columns: minmax(0, 1fr) auto; }
  .cw-avg { grid-column: 1 / -1; grid-row: 2; }
}
`;
