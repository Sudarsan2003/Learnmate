import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileBarChart2, Download, Printer, FileText, Loader2, RefreshCw, Users, Trophy, ChevronLeft, ChevronRight, UserX, Phone } from "lucide-react";
import { getReportClasses, getClassReport, getToppers, getInactiveStudents } from "../api/client";
import { PlaceMedal, MedalLegend } from "./Medal";

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

const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${s}`;
};
const fmtTime = (sec) => (sec == null || sec > 864000 ? "" : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`);

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
  const [weekToppers, setWeekToppers] = useState(null);
  const [monthToppers, setMonthToppers] = useState(null);

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
                {/^passed out/i.test(c.standard) ? c.standard : `Class ${c.standard}`} ({c.studentCount}{" "}
                {c.studentCount === 1 ? "student" : "students"})
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

          <InactivePanel key={`i-${report.standard}-${report.generatedAt}`} standard={report.standard} />

          <section className="rp-section" aria-labelledby="rp-toppers-h">
            <h2 id="rp-toppers-h" className="rp-h2"><Trophy size={17} aria-hidden="true" /> Toppers</h2>
            <div className="rp-toppers-grid">
              <TopperPanel key={`w-${report.standard}-${report.generatedAt}`} standard={report.standard} period="WEEK" onData={setWeekToppers} />
              <TopperPanel key={`m-${report.standard}-${report.generatedAt}`} standard={report.standard} period="MONTH" onData={setMonthToppers} />
            </div>
          </section>

          {report.quizzes.length > 0 && (
            <section className="rp-section" aria-labelledby="rp-podium-h">
              <h2 id="rp-podium-h" className="rp-h2">Quiz toppers</h2>
              <div className="rp-podium-grid">
                {report.quizzes.map((q) => (
                  <QuizPodium key={q.id} quiz={q} />
                ))}
              </div>
            </section>
          )}

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
              <PrintClassSheet report={report} rows={ranked} toppers={[weekToppers, monthToppers]} />
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

// Quizzes per score table on the printed sheet: enough to read, few enough
// that a landscape A4 page never cuts columns off, however many quizzes a
// term has. Each table repeats the student column.
const PRINT_QUIZZES_PER_TABLE = 10;

/**
 * The class sheet as printed (landscape). Quizzes are numbered Q1, Q2, ...
 * with a key, and split across several tables, so long quiz titles or many
 * quizzes don't push columns off the page.
 */
function PrintClassSheet({ report, rows, toppers }) {
  const numbered = report.quizzes.map((q, i) => ({ ...q, code: `Q${i + 1}` }));
  const chunks = [];
  for (let i = 0; i < numbered.length; i += PRINT_QUIZZES_PER_TABLE) {
    chunks.push(numbered.slice(i, i + PRINT_QUIZZES_PER_TABLE));
  }
  return (
    <div className="rp-sheet">
      <h1>{report.institution}: Class {report.standard} report</h1>
      <p className="rp-sheet-meta">
        {periodLabel(report)} · {report.students.length} students · {report.quizzes.length} quizzes · class average{" "}
        {report.classAveragePercent == null ? "–" : `${report.classAveragePercent}%`} · printed {fmtDate(report.generatedAt)}
      </p>

      <h2>Summary</h2>
      <table className="rp-print-summary">
        <thead>
          <tr><th>#</th><th>Student</th><th>Quizzes taken</th><th>Average</th><th>Practice quizzes</th><th>Game stars</th><th>Last active</th></tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.username}>
              <td>{i + 1}</td>
              <td>{nameOf(s)}</td>
              <td>{s.quizzesTaken} of {report.quizzes.length}</td>
              <td><strong>{s.averagePercent == null ? "–" : `${s.averagePercent}%`}</strong></td>
              <td>{s.practiceQuizzes}{s.practiceAveragePercent != null ? ` (${s.practiceAveragePercent}%)` : ""}</td>
              <td>{s.gameStars}</td>
              <td>{fmtDate(s.lastActive) || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {chunks.map((chunk, n) => (
        <div key={n} className="rp-print-block">
          <h2>
            Quiz scores{chunks.length > 1 ? ` (${chunk[0].code}–${chunk[chunk.length - 1].code})` : ""}
          </h2>
          <table className="rp-print-scores">
            <thead>
              <tr>
                <th>Student</th>
                {chunk.map((q) => <th key={q.id}>{q.code}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.username}>
                  <td>{nameOf(s)}</td>
                  {chunk.map((q) => {
                    const r = s.quizScores[q.id];
                    return (
                      <td key={q.id}>
                        {r ? `${r.percent}%` : "–"}
                        {r && r.percent > 0 && r.rank <= 3 && <> <PlaceMedal rank={r.rank} size={10} /></>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {numbered.length > 0 && <MedalLegend />}

      {numbered.length > 0 && (
        <div className="rp-print-block">
          <h2>Quiz key</h2>
          <table className="rp-print-key">
            <thead><tr><th>No.</th><th>Quiz</th><th>Subject</th><th>Set on</th><th>Took it</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead>
            <tbody>
              {numbered.map((q) => (
                <tr key={q.id}>
                  <td><strong>{q.code}</strong></td>
                  <td>{q.title}</td>
                  <td>{q.subject || ""}</td>
                  <td>{fmtDate(q.createdAt)}</td>
                  <td>{q.participants}</td>
                  {[1, 2, 3].map((place) => (
                    <td key={place}>{q.podium.filter((p) => p.rank === place).map((p) => `${nameOf(p)} (${p.percent}%)`).join(", ") || "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toppers.filter((t) => t?.toppers?.length).map((t) => (
        <div key={t.period} className="rp-print-block">
          <h2>{t.period === "WEEK" ? "Toppers of the week" : "Toppers of the month"}: {periodTitle(t)}</h2>
          <p className="rp-print-toppers">
            {t.toppers.map((x) => (
              <span key={x.username}><PlaceMedal rank={x.rank} size={12} /> {nameOf(x)} ({x.averagePercent}%)</span>
            ))}
          </p>
        </div>
      ))}
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
                <td
                  key={q.id}
                  className={r ? band(r.percent) : "rp-missing"}
                  title={r ? `${r.score} of ${r.total} · ${ordinal(r.rank)} of ${r.participants}` : "Not attempted"}
                >
                  {r ? `${r.percent}%` : "–"}
                  {r && r.percent > 0 && r.rank <= 3 && <> <PlaceMedal rank={r.rank} /></>}
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

/** "19–25 Oct 2026" for a week, "October 2026" for a month. */
function periodTitle(t) {
  const s = new Date(`${t.start}T00:00:00`);
  const e = new Date(`${t.end}T00:00:00`);
  if (t.period === "MONTH") return s.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const sameMonth = s.getMonth() === e.getMonth();
  const left = s.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  return `${left}–${e.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Weekly or monthly toppers for a class, with arrows to step back through earlier periods. */
function TopperPanel({ standard, period, onData }) {
  const [anchor, setAnchor] = useState(() => isoDate(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getToppers({ standard, period, date: anchor })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
        onData?.(d);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load toppers."));
    return () => {
      cancelled = true;
    };
  }, [standard, period, anchor, onData]);

  function step(dir) {
    const d = new Date(`${anchor}T00:00:00`);
    if (period === "WEEK") d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir, 1);
    setAnchor(isoDate(d));
  }

  const today = isoDate(new Date());
  const current = data && data.start <= today && today <= data.end;
  const label = period === "WEEK" ? (current ? "This week" : "Week") : current ? "This month" : "Month";

  return (
    <div className="rp-toppers">
      <div className="rp-toppers-head">
        <button type="button" className="rp-arrow" onClick={() => step(-1)} aria-label={`Previous ${period === "WEEK" ? "week" : "month"}`}>
          <ChevronLeft size={16} />
        </button>
        <div className="rp-toppers-title">
          <span>{label}</span>
          <small>{data ? periodTitle(data) : "…"}</small>
        </div>
        <button
          type="button"
          className="rp-arrow"
          onClick={() => step(1)}
          disabled={!data || data.end >= today}
          aria-label={`Next ${period === "WEEK" ? "week" : "month"}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {error ? (
        <p className="rp-toppers-empty">{error}</p>
      ) : !data ? (
        <p className="rp-toppers-empty">Loading…</p>
      ) : data.toppers.length === 0 ? (
        <p className="rp-toppers-empty">
          {data.quizzesSet === 0 ? "No quizzes were set in this period." : "No one has taken this period's quizzes yet."}
        </p>
      ) : (
        <ol className="rp-topper-list">
          {data.toppers.map((t) => (
            <li key={t.username} className={`rp-topper rp-place-${t.rank}`}>
              <span className="rp-topper-medal"><PlaceMedal rank={t.rank} size={20} /></span>
              <span className="rp-topper-name">{nameOf(t)}</span>
              <span className="rp-topper-score">
                {t.averagePercent}%<small>{t.quizzesTaken} of {data.quizzesSet} {data.quizzesSet === 1 ? "quiz" : "quizzes"}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function lastSeen(iso) {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 60) return `${days} days ago`;
  return fmtDate(iso);
}

/** Students in this class with no login, quiz, chat, practice or game for a while. */
function InactivePanel({ standard }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getInactiveStudents({ standard, days })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not check activity."));
    return () => {
      cancelled = true;
    };
  }, [standard, days]);

  return (
    <section className="rp-section" aria-labelledby="rp-inactive-h">
      <div className="rp-section-head">
        <h2 id="rp-inactive-h" className="rp-h2"><UserX size={17} aria-hidden="true" /> Needs attention</h2>
        <label className="rp-days">
          No activity for
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
      </div>
      {error ? (
        <p className="rp-error">{error}</p>
      ) : !data ? (
        <p className="rp-toppers-empty">Checking…</p>
      ) : data.students.length === 0 ? (
        <p className="rp-allgood">Everyone in Class {data.standard} has been active in the last {data.days} days.</p>
      ) : (
        <div className="rp-inactive">
          <p className="rp-inactive-sum">
            <strong>{data.students.length}</strong> of {data.classSize} students haven&apos;t logged in, taken a quiz, chatted or
            played in the last {data.days} days.
          </p>
          <ul>
            {data.students.map((s) => (
              <li key={s.username}>
                <span className="rp-inactive-name">
                  {nameOf(s)}
                  {s.fullName && <span className="rp-user">{s.username}</span>}
                </span>
                <span className={`rp-inactive-seen ${s.lastActive ? "" : "rp-never"}`}>Last active: {lastSeen(s.lastActive)}</span>
                <span className="rp-inactive-missed">
                  {data.quizzesSet > 0 ? `Missed ${s.missedQuizzes} of ${data.quizzesSet} recent ${data.quizzesSet === 1 ? "quiz" : "quizzes"}` : ""}
                </span>
                {s.mobile ? (
                  <a className="rp-call" href={`tel:${s.mobile.replace(/[^\d+]/g, "")}`}>
                    <Phone size={13} aria-hidden="true" /> {s.mobile}
                  </a>
                ) : (
                  <span className="rp-dim">No mobile</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 1st, 2nd and 3rd on one quiz (tied students share a place). */
function QuizPodium({ quiz }) {
  return (
    <div className="rp-podium">
      <div className="rp-podium-head">
        <span className="rp-podium-title" title={quiz.title}>{quiz.title}</span>
        <small>
          {quiz.subject ? `${quiz.subject} · ` : ""}
          {quiz.participants} {quiz.participants === 1 ? "student" : "students"} took it
        </small>
      </div>
      {quiz.podium.length === 0 ? (
        <p className="rp-toppers-empty">
          {quiz.participants === 0 ? "No one has taken this quiz yet." : "No one has scored on this quiz yet."}
        </p>
      ) : (
        <ol className="rp-topper-list">
          {quiz.podium.map((p) => (
            <li key={p.username} className={`rp-topper rp-place-${p.rank}`}>
              <span className="rp-topper-medal"><PlaceMedal rank={p.rank} size={20} /></span>
              <span className="rp-topper-name">{nameOf(p)}</span>
              <span className="rp-topper-score">
                {p.percent}%<small>{p.score}/{p.total}{fmtTime(p.timeTakenSeconds) ? ` · ${fmtTime(p.timeTakenSeconds)}` : ""}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
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
            <tr><th>Quiz</th><th>Subject</th><th>Date</th><th>Score</th><th>%</th><th>Place in class</th></tr>
          </thead>
          <tbody>
            {report.quizzes.map((q) => {
              const r = student.quizScores[q.id];
              const placed = r && r.percent > 0;
              return (
                <tr key={q.id} className={placed && r.rank <= 3 ? `rp-row-place-${r.rank}` : undefined}>
                  <td>
                    {placed && r.rank <= 3 && <><PlaceMedal rank={r.rank} size={13} />{" "}</>}
                    {q.title}
                  </td>
                  <td>{q.subject || ""}</td>
                  <td>{fmtDate(r?.submittedAt ?? q.createdAt)}</td>
                  <td>{r ? `${r.score} / ${r.total}` : "Not attempted"}</td>
                  <td>{r ? `${r.percent}%` : ""}</td>
                  <td>{placed ? `${ordinal(r.rank)} of ${r.participants}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {report.quizzes.some((q) => student.quizScores[q.id]?.rank <= 3 && student.quizScores[q.id]?.percent > 0) && <MedalLegend />}

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
.rp-medal { display: inline-block; vertical-align: -2px; flex-shrink: 0; }
.rp-legend { margin: .4rem 0 0; font-size: 12px; color: var(--dim); }

.rp-section { margin-top: 1.5rem; }
.rp-section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .75rem; }
.rp-section-head .rp-h2 { margin: 0; }
.rp-days { display: inline-flex; align-items: center; gap: .45rem; font-size: 13px; color: var(--muted); }
.rp-days select { height: 2.1rem; padding: 0 .5rem; border-radius: 8px; border: 1px solid var(--divider); background: var(--surface); color: var(--text); font: inherit; }
.rp-allgood { margin: 0; padding: .8rem 1rem; border-radius: 12px; font-size: 13.5px; color: #0F8A5F; background: color-mix(in srgb, #0F8A5F 10%, var(--surface)); }
.rp-inactive { border: 1px solid color-mix(in srgb, #E5484D 35%, var(--divider)); border-radius: 14px; background: var(--surface); overflow: hidden; }
.rp-inactive-sum { margin: 0; padding: .7rem 1rem; font-size: 13.5px; background: color-mix(in srgb, #E5484D 8%, var(--surface)); }
.rp-inactive ul { margin: 0; padding: 0; list-style: none; }
.rp-inactive li { display: grid; grid-template-columns: minmax(9rem, 1.4fr) 1fr 1.2fr auto; gap: .5rem 1rem; align-items: center; padding: .6rem 1rem; border-top: 1px solid var(--divider); font-size: 13px; }
@media (max-width: 640px) { .rp-inactive li { grid-template-columns: 1fr 1fr; } }
.rp-inactive-name { font-weight: 600; }
.rp-inactive-seen { color: var(--muted); }
.rp-never { color: #C2432B; font-weight: 600; }
.rp-inactive-missed { color: var(--dim); }
.rp-call { display: inline-flex; align-items: center; gap: .3rem; font-weight: 600; color: #4F80F8; text-decoration: none; white-space: nowrap; }
.rp-h2 { display: flex; align-items: center; gap: .45rem; margin: 0 0 .75rem; font-family: 'Sora', system-ui, sans-serif; font-size: 1.05rem; font-weight: 700; }
.rp-toppers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: .75rem; }
.rp-podium-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: .75rem; }
.rp-toppers, .rp-podium { padding: .9rem 1rem; border: 1px solid var(--divider); border-radius: 14px; background: var(--surface); }
.rp-toppers { background: linear-gradient(160deg, color-mix(in srgb, #E4A93B 10%, var(--surface)), var(--surface) 60%); }
.rp-toppers-head { display: flex; align-items: center; gap: .5rem; margin-bottom: .6rem; }
.rp-toppers-title { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; font-weight: 700; font-size: 14.5px; }
.rp-toppers-title small, .rp-podium-head small { font-size: 12px; font-weight: 500; color: var(--dim); }
.rp-arrow { display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 999px; border: 1px solid var(--divider); background: var(--surface); color: var(--text); cursor: pointer; }
.rp-arrow:disabled { opacity: .35; cursor: not-allowed; }
.rp-podium-head { display: flex; flex-direction: column; gap: .1rem; margin-bottom: .6rem; }
.rp-podium-title { font-weight: 700; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-toppers-empty { margin: .4rem 0; font-size: 13px; color: var(--dim); text-align: center; }
.rp-topper-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .35rem; }
.rp-topper { display: flex; align-items: center; gap: .6rem; padding: .45rem .6rem; border-radius: 10px; background: var(--surface-2); }
.rp-place-1 { background: color-mix(in srgb, #E4A93B 18%, var(--surface)); }
.rp-topper-medal { display: flex; line-height: 1; }
.rp-topper-name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-topper-score { display: flex; flex-direction: column; align-items: flex-end; font-weight: 700; font-size: 13.5px; }
.rp-topper-score small { font-size: 11px; font-weight: 500; color: var(--dim); }
`;

// Only applies while printing: hide the app, show the print container.
const PRINT_CSS = `
@media print {
  body > *:not(.rp-print) { display: none !important; }
  .rp-print { display: block !important; color: #000; background: #fff; font-family: Georgia, 'Times New Roman', serif; }
  @page { size: A4; margin: 14mm; }
  /* The class sheet prints landscape; report cards stay portrait. */
  @page sheet { size: A4 landscape; margin: 10mm; }
  .rp-sheet { page: sheet; }
  .rp-print svg, .rp-print .rp-row-place-1, .rp-print .rp-row-place-2, .rp-print .rp-row-place-3 {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .rp-print thead { display: table-header-group; } /* repeat headings on each page */
  .rp-print tr { break-inside: avoid; page-break-inside: avoid; }
  .rp-print-block { break-inside: auto; }
  .rp-print-block h2 { break-after: avoid; page-break-after: avoid; }
  .rp-print-scores th, .rp-print-scores td { text-align: center; white-space: nowrap; font-size: 9pt; padding: 3pt 4pt; }
  .rp-print-scores td:first-child, .rp-print-scores th:first-child { text-align: left; white-space: normal; width: 22%; }
  .rp-print-summary td, .rp-print-summary th, .rp-print-key td, .rp-print-key th { font-size: 9pt; padding: 3pt 5pt; }
  .rp-print-toppers { display: flex; flex-wrap: wrap; gap: 4pt 18pt; font-size: 10.5pt; }
  .rp-legend { font-size: 9pt; color: #333; margin-top: 4pt; }
  .rp-row-place-1 td { background: #FFF6D6; }
  .rp-row-place-2 td { background: #F1F3F5; }
  .rp-row-place-3 td { background: #F8EBDD; }
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
