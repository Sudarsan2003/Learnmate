import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileBarChart2, Download, Printer, FileText, Loader2, RefreshCw, Users } from "lucide-react";
import { getReportClasses, getClassReport } from "../api/client";

/**
 * Class reports (teachers and admins).
 *
 * Pick a class and, optionally, a date range (e.g. one term). The page shows
 * every student's score on each quiz set for that class, plus practice quizzes
 * from chat and game stars. From there:
 *   - Download for Excel: the same sheet as a CSV file
 *   - Print class sheet: the table, laid out for paper
 *   - Report cards: one printable page per student, for parents (or one card
 *     from a student's row)
 * Printing renders into a separate print-only container, so the browser's
 * "Save as PDF" gives a clean document with none of the app around it.
 */

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

function remarkFor(avg) {
  if (avg == null) return "No quizzes were taken in this period.";
  if (avg >= 85) return "Excellent work. Keep it up!";
  if (avg >= 70) return "Good progress, with a strong grasp of most topics.";
  if (avg >= 50) return "Satisfactory. Regular revision will help raise these scores.";
  return "Needs support. Please encourage regular practice at home.";
}

function periodLabel(report) {
  if (!report.from && !report.to) return "All time";
  if (report.from && report.to) return `${fmtDate(report.from)} to ${fmtDate(report.to)}`;
  return report.from ? `From ${fmtDate(report.from)}` : `Up to ${fmtDate(report.to)}`;
}

// Real name when the school has given one (e.g. through bulk import), otherwise the username.
const nameOf = (s) => s.fullName || s.username;

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(report) {
  const header = [
    "Student", "Username", "Email",
    ...report.quizzes.map((q) => `${q.title} (%)`),
    "Quizzes taken", "Average %", "Practice quizzes", "Practice average %", "Game stars", "Last active",
  ];
  const rows = report.students.map((s) => [
    nameOf(s), s.username, s.email,
    ...report.quizzes.map((q) => (s.quizScores[q.id] ? s.quizScores[q.id].percent : "")),
    `${s.quizzesTaken} of ${report.quizzes.length}`,
    s.averagePercent ?? "",
    s.practiceQuizzes,
    s.practiceAveragePercent ?? "",
    s.gameStars,
    fmtDate(s.lastActive),
  ]);
  // The BOM makes Excel read the file as UTF-8; CRLF line ends suit Excel on Windows.
  const text = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Class-${report.standard}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [classes, setClasses] = useState(null);
  const [standard, setStandard] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(null); // { kind: "class" } | { kind: "cards", students }

  useEffect(() => {
    let cancelled = false;
    getReportClasses()
      .then((data) => {
        if (cancelled) return;
        setClasses(data);
        if (data.length) setStandard(data[0].standard);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load your classes."));
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!standard) return;
    setLoading(true);
    setError("");
    try {
      setReport(await getClassReport({ standard, from: from || undefined, to: to || undefined }));
    } catch (err) {
      setReport(null);
      setError(err.response?.data?.message ?? "Could not build the report.");
    } finally {
      setLoading(false);
    }
  }, [standard, from, to]);

  // Print once the print-only content has rendered, then clear it.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    const id = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const ranked = useMemo(() => {
    if (!report) return [];
    return [...report.students].sort((a, b) => (b.averagePercent ?? -1) - (a.averagePercent ?? -1));
  }, [report]);

  const notStarted = report ? report.students.filter((s) => s.quizzesTaken === 0).length : 0;

  return (
    <div className="rp-page">
      <style>{CSS}</style>

      <header className="rp-head">
        <span className="rp-head-icon" aria-hidden="true">
          <FileBarChart2 size={18} />
        </span>
        <div>
          <h1 className="rp-title">Class reports</h1>
          <p className="rp-sub">Scores for a whole class, ready to download or print as report cards for parents.</p>
        </div>
      </header>

      <form
        className="rp-filters"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label className="rp-field">
          <span>Class</span>
          <select value={standard} onChange={(e) => setStandard(e.target.value)} disabled={!classes?.length}>
            {classes === null && <option>Loading…</option>}
            {classes?.length === 0 && <option>No classes yet</option>}
            {classes?.map((c) => (
              <option key={c.standard} value={c.standard}>
                Class {c.standard} ({c.studentCount} {c.studentCount === 1 ? "student" : "students"})
              </option>
            ))}
          </select>
        </label>
        <label className="rp-field">
          <span>From (optional)</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="rp-field">
          <span>To (optional)</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="rp-btn rp-btn-primary" disabled={!standard || loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {report ? "Update report" : "Show report"}
        </button>
      </form>

      {error && <p className="rp-error" role="alert">{error}</p>}

      {classes?.length === 0 && (
        <div className="rp-empty">
          <Users size={26} aria-hidden="true" />
          <p>No students have a class set yet. Classes appear here once students are added with their class.</p>
        </div>
      )}

      {report && (
        <>
          <section className="rp-stats" aria-label="Class summary">
            <div className="rp-stat">
              <span className="rp-stat-n">{report.students.length}</span>
              <span className="rp-stat-l">students</span>
            </div>
            <div className="rp-stat">
              <span className="rp-stat-n">{report.quizzes.length}</span>
              <span className="rp-stat-l">quizzes set</span>
            </div>
            <div className="rp-stat">
              <span className="rp-stat-n">{report.classAveragePercent == null ? "–" : `${report.classAveragePercent}%`}</span>
              <span className="rp-stat-l">class average</span>
            </div>
            <div className="rp-stat">
              <span className="rp-stat-n">{notStarted}</span>
              <span className="rp-stat-l">took no quiz</span>
            </div>
          </section>

          <div className="rp-actions">
            <button type="button" className="rp-btn" onClick={() => downloadCsv(report)} disabled={!report.students.length}>
              <Download size={15} /> Download for Excel
            </button>
            <button type="button" className="rp-btn" onClick={() => setPrinting({ kind: "class" })} disabled={!report.students.length}>
              <Printer size={15} /> Print class sheet
            </button>
            <button
              type="button"
              className="rp-btn"
              onClick={() => setPrinting({ kind: "cards", students: report.students })}
              disabled={!report.students.length}
            >
              <FileText size={15} /> Print all report cards
            </button>
          </div>
          <p className="rp-hint">Tip: choose “Save as PDF” in the print window to get a file you can email to parents.</p>

          {report.students.length === 0 ? (
            <div className="rp-empty">
              <p>No students in Class {report.standard} yet.</p>
            </div>
          ) : (
            <div className="rp-table-wrap">
              <ClassTable report={report} rows={ranked} onCard={(s) => setPrinting({ kind: "cards", students: [s] })} />
            </div>
          )}
        </>
      )}

      {printing &&
        report &&
        createPortal(
          <div className="rp-print">
            <style>{PRINT_CSS}</style>
            {printing.kind === "class" ? (
              <div className="rp-sheet">
                <h1>{report.institution}: Class {report.standard} report</h1>
                <p className="rp-sheet-meta">
                  {periodLabel(report)} · {report.students.length} students · class average{" "}
                  {report.classAveragePercent == null ? "–" : `${report.classAveragePercent}%`} · printed {fmtDate(report.generatedAt)}
                </p>
                <ClassTable report={report} rows={ranked} />
              </div>
            ) : (
              printing.students.map((s) => (
                <ReportCard key={s.username} report={report} student={s} />
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

function ClassTable({ report, rows, onCard }) {
  return (
    <table className="rp-table">
      <thead>
        <tr>
          <th scope="col" className="rp-sticky">Student</th>
          {report.quizzes.map((q) => (
            <th key={q.id} scope="col" title={`${q.title}${q.subject ? ` · ${q.subject}` : ""} · ${fmtDate(q.createdAt)}`}>
              <span className="rp-qtitle">{q.title}</span>
            </th>
          ))}
          <th scope="col">Average</th>
          <th scope="col">Practice</th>
          <th scope="col">Stars</th>
          <th scope="col">Last active</th>
          {onCard && <th scope="col"><span className="sr-only">Report card</span></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.username}>
            <th scope="row" className="rp-sticky">
              {nameOf(s)}
              {s.fullName && <span className="rp-user">{s.username}</span>}
            </th>
            {report.quizzes.map((q) => {
              const r = s.quizScores[q.id];
              return (
                <td key={q.id} className={r ? band(r.percent) : "rp-missing"} title={r ? `${r.score} of ${r.total}` : "Not attempted"}>
                  {r ? `${r.percent}%` : "–"}
                </td>
              );
            })}
            <td className={`rp-strong ${s.averagePercent == null ? "rp-missing" : band(s.averagePercent)}`}>
              {s.averagePercent == null ? "–" : `${s.averagePercent}%`}
            </td>
            <td>
              {s.practiceQuizzes}
              {s.practiceAveragePercent != null && <span className="rp-dim"> ({s.practiceAveragePercent}%)</span>}
            </td>
            <td>{s.gameStars}</td>
            <td className="rp-dim">{fmtDate(s.lastActive) || "–"}</td>
            {onCard && (
              <td>
                <button type="button" className="rp-link" onClick={() => onCard(s)}>
                  Report card
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const band = (p) => (p >= 70 ? "rp-good" : p >= 50 ? "rp-mid" : "rp-low");

function ReportCard({ report, student }) {
  return (
    <article className="rp-card">
      <header className="rp-card-head">
        <div>
          <p className="rp-card-school">{report.institution}</p>
          <h1>Progress report</h1>
        </div>
        <dl className="rp-card-meta">
          <div><dt>Student</dt><dd>{nameOf(student)}</dd></div>
          {student.fullName && <div><dt>Username</dt><dd>{student.username}</dd></div>}
          <div><dt>Class</dt><dd>{report.standard}</dd></div>
          <div><dt>Period</dt><dd>{periodLabel(report)}</dd></div>
        </dl>
      </header>

      <section className="rp-card-summary">
        <div><span>{student.averagePercent == null ? "–" : `${student.averagePercent}%`}</span>Quiz average</div>
        <div><span>{student.quizzesTaken} / {report.quizzes.length}</span>Quizzes taken</div>
        <div><span>{student.practiceQuizzes}</span>Practice quizzes</div>
        <div><span>{student.gameStars}</span>Game stars</div>
      </section>

      <h2>Class quizzes</h2>
      {report.quizzes.length === 0 ? (
        <p>No quizzes were set for this class in this period.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Quiz</th><th>Subject</th><th>Date</th><th>Score</th><th>%</th></tr>
          </thead>
          <tbody>
            {report.quizzes.map((q) => {
              const r = student.quizScores[q.id];
              return (
                <tr key={q.id}>
                  <td>{q.title}</td>
                  <td>{q.subject || ""}</td>
                  <td>{fmtDate(r?.submittedAt ?? q.createdAt)}</td>
                  <td>{r ? `${r.score} / ${r.total}` : "Not attempted"}</td>
                  <td>{r ? `${r.percent}%` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {student.practiceQuizzes > 0 && (
        <p className="rp-card-note">
          Also completed {student.practiceQuizzes} practice {student.practiceQuizzes === 1 ? "quiz" : "quizzes"} with the AI tutor
          {student.practiceAveragePercent != null ? `, averaging ${student.practiceAveragePercent}%` : ""}.
        </p>
      )}

      <h2>Remark</h2>
      <p className="rp-card-remark">{remarkFor(student.averagePercent)}</p>

      <h2>Teacher&apos;s comments</h2>
      <div className="rp-card-comments" />

      <footer className="rp-card-sign">
        <div>Class teacher</div>
        <div>Parent / guardian</div>
      </footer>
      <p className="rp-card-printed">Printed {fmtDate(report.generatedAt)} from LearnMate</p>
    </article>
  );
}

const CSS = `
.rp-page { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 72rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; color: var(--text); }
@media (min-width: 640px) { .rp-page { padding: 2rem 1.5rem 3rem; } }
.rp-head { display: flex; align-items: center; gap: .8rem; margin-bottom: 1.4rem; }
.rp-head-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 2.5rem; height: 2.5rem; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #4F80F8, #3558DE); }
.rp-title { margin: 0; font-family: 'Sora', system-ui, sans-serif; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; }
.rp-sub { margin: .15rem 0 0; font-size: 13px; color: var(--dim); }

.rp-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: .75rem; padding: 1rem; border: 1px solid var(--divider); border-radius: 16px; background: var(--surface); }
.rp-field { display: flex; flex-direction: column; gap: .3rem; font-size: 12.5px; font-weight: 600; color: var(--muted); min-width: 10rem; flex: 1 1 10rem; }
.rp-field select, .rp-field input { height: 2.5rem; padding: 0 .7rem; border-radius: 10px; border: 1px solid var(--divider); background: var(--bg); color: var(--text); font: inherit; font-weight: 500; }
.rp-btn { display: inline-flex; align-items: center; justify-content: center; gap: .45rem; height: 2.5rem; padding: 0 1rem; border-radius: 10px; border: 1px solid var(--divider); background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.rp-btn:hover:not(:disabled) { border-color: #4F80F8; }
.rp-btn:disabled { opacity: .45; cursor: not-allowed; }
.rp-btn-primary { border: none; color: #fff; background: linear-gradient(135deg, #4F80F8, #3558DE); }
.rp-error { margin: 1rem 0 0; padding: .7rem .9rem; border-radius: 10px; font-size: 13.5px; color: var(--error-text, #C2432B); background: var(--error-bg, #FDECEA); }
.rp-empty { display: flex; flex-direction: column; align-items: center; gap: .6rem; margin-top: 1.5rem; padding: 2rem 1rem; border: 1px dashed var(--divider); border-radius: 16px; text-align: center; font-size: 14px; color: var(--dim); }

.rp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .75rem; margin-top: 1.25rem; }
.rp-stat { display: flex; flex-direction: column; padding: .9rem 1rem; border: 1px solid var(--divider); border-radius: 14px; background: var(--surface); }
.rp-stat-n { font-family: 'Sora', system-ui, sans-serif; font-size: 1.5rem; font-weight: 700; }
.rp-stat-l { font-size: 12.5px; color: var(--dim); }
.rp-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1.25rem; }
.rp-hint { margin: .5rem 0 0; font-size: 12.5px; color: var(--dim); }

.rp-table-wrap { margin-top: 1rem; overflow-x: auto; border: 1px solid var(--divider); border-radius: 14px; background: var(--surface); }
.rp-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.rp-table th, .rp-table td { padding: .6rem .75rem; border-bottom: 1px solid var(--divider); text-align: center; white-space: nowrap; }
.rp-table thead th { font-size: 12px; font-weight: 700; color: var(--muted); background: var(--surface-2); }
.rp-table tbody th { text-align: left; font-weight: 600; }
.rp-sticky { position: sticky; left: 0; z-index: 1; background: var(--surface); text-align: left !important; }
.rp-table thead .rp-sticky { background: var(--surface-2); }
.rp-qtitle { display: inline-block; max-width: 9rem; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
.rp-good { color: #0F8A5F; font-weight: 600; }
.rp-mid { color: #B7791F; font-weight: 600; }
.rp-low { color: #C2432B; font-weight: 600; }
.rp-missing, .rp-dim { color: var(--dim); }
.rp-strong { font-weight: 700; }
.rp-user { display: block; font-size: 11.5px; font-weight: 500; color: var(--dim); }
.rp-link { border: none; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: #4F80F8; cursor: pointer; }
.rp-link:hover { text-decoration: underline; }
.rp-print { display: none; }
`;

// Only applies while printing: hide the app, show the print container.
const PRINT_CSS = `
@media print {
  body > *:not(.rp-print) { display: none !important; }
  .rp-print { display: block !important; color: #000; background: #fff; font-family: Georgia, 'Times New Roman', serif; }
  @page { size: A4; margin: 14mm; }
  .rp-print h1 { font-size: 20pt; margin: 0 0 4pt; }
  .rp-print h2 { font-size: 12pt; margin: 14pt 0 6pt; text-transform: uppercase; letter-spacing: .05em; }
  .rp-print table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .rp-print th, .rp-print td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; }
  .rp-print thead th { background: #eee; }
  .rp-sheet .rp-table th, .rp-sheet .rp-table td { text-align: center; white-space: normal; }
  .rp-sheet .rp-table tbody th { text-align: left; }
  .rp-sheet-meta { margin: 0 0 10pt; font-size: 10pt; }
  .rp-sticky { position: static; }
  .rp-good, .rp-mid, .rp-low, .rp-missing, .rp-dim { color: #000; }
  .rp-card { page-break-after: always; break-after: page; }
  .rp-card:last-child { page-break-after: auto; break-after: auto; }
  .rp-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16pt; padding-bottom: 8pt; border-bottom: 2px solid #000; }
  .rp-card-school { margin: 0; font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: .06em; }
  .rp-card-meta { margin: 0; font-size: 10.5pt; }
  .rp-card-meta div { display: flex; gap: 6pt; }
  .rp-card-meta dt { font-weight: bold; min-width: 48pt; }
  .rp-card-meta dd { margin: 0; }
  .rp-card-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-top: 12pt; }
  .rp-card-summary div { border: 1px solid #999; padding: 6pt; font-size: 9.5pt; text-align: center; }
  .rp-card-summary span { display: block; font-size: 16pt; font-weight: bold; }
  .rp-card-note, .rp-card-remark { font-size: 11pt; }
  .rp-card-remark { padding: 8pt; border: 1px solid #999; }
  .rp-card-comments { height: 60pt; border: 1px solid #999; }
  .rp-card-sign { display: flex; justify-content: space-between; gap: 24pt; margin-top: 40pt; font-size: 10pt; }
  .rp-card-sign div { flex: 1; padding-top: 4pt; border-top: 1px solid #000; }
  .rp-card-printed { margin-top: 14pt; font-size: 8.5pt; color: #555; }
}
`;
