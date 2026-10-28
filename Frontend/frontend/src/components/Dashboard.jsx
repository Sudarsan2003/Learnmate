import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  RefreshCw,
  Loader2,
  Search,
  X,
  ChevronDown,
  Lock,
  AlertCircle,
  GraduationCap,
  Building2,
  Users,
  ClipboardList,
  Trophy,
} from "lucide-react";
import {
  getAllQuizzes,
  getMyCreatedQuizzes,
  getQuizResults,
  closeQuiz,
  getMyResults,
  getAvailableQuizzes,
  getMyAttemptDetail,
} from "../api/client";
import HallOfFame from "./HallOfFame";
import Leaderboard from "./Leaderboard";

/**
 * Dashboard for every role.
 *   ADMIN   – every quiz in the system: who created it, when, its status and
 *             submissions, plus each student's result. Filter by creator.
 *   TEACHER – the quizzes they created and how their students did.
 *   USER    – their own results, a score trend, and what's open for them.
 *
 * Props: role ("ADMIN" | "TEACHER" | "USER"), currentUsername, onOpenQuizzes
 * (called by the student's "Go to quizzes" button).
 * The admin view needs GET /api/quizzes/all (see BACKEND_NOTES.md); until it
 * exists it falls back to the admin's own quizzes and says so.
 */

/* -------------------------------------------------------------------------- */
/*  helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ROLE_META = {
  ADMIN: { label: "Admin", token: "admin" },
  TEACHER: { label: "Teacher", token: "teacher" },
  USER: { label: "Student", token: "user" },
};
const roleMeta = (r) =>
  ROLE_META[r] ?? { label: r ? r.charAt(0) + r.slice(1).toLowerCase() : "Unknown", token: "user" };
const roleVars = (r) => ({ "--role": `var(--db-${roleMeta(r).token})` });

const lc = (v) => (v == null ? "" : String(v).toLowerCase());
const initialsFor = (name) => (name ? name.trim().slice(0, 2).toUpperCase() : "?");
const pctOf = (score, total) => (total > 0 ? Math.round((score / total) * 100) : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sentenceCase = (v) => {
  if (!v) return "";
  const s = String(v);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const bandOf = (pct) => (pct >= 75 ? "good" : pct >= 40 ? "mid" : "low");
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const fmtDate = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
};
const fmtTime = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
};
const fmtDateTime = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
};
const RTF = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
function timeAgo(v) {
  const d = parseDate(v);
  if (!d || !RTF) return "";
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "just now";
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of units) if (abs >= secs) return RTF.format(Math.round(s / secs), unit);
  return "";
}

// The list endpoints can name the creator a few ways; accept them all so the
// page keeps working while the backend field names settle.
function normalizeQuiz(raw, fallbackCreator) {
  const cb = raw.createdBy ?? raw.createdByUsername ?? raw.creator ?? raw.owner ?? null;
  const createdBy = typeof cb === "string" ? cb : cb?.username ?? fallbackCreator?.username ?? null;
  const createdByRole =
    raw.createdByRole ?? raw.creatorRole ?? (cb && typeof cb === "object" ? cb.role : null) ?? fallbackCreator?.role ?? null;
  return {
    id: raw.id,
    title: raw.title || "Untitled",
    subject: raw.subject || "",
    institution: raw.institution || "",
    standard: raw.standard || "",
    mode: raw.mode || "OPEN",
    status: String(raw.status || "OPEN").toUpperCase(),
    submittedAttempts: raw.submittedAttempts ?? 0,
    createdBy,
    createdByRole,
    createdAt: raw.createdAt ?? raw.created_at ?? raw.createdOn ?? null,
    durationMinutes: raw.durationMinutes ?? null,
    opensAt: raw.opensAt ?? null,
    closesAt: raw.closesAt ?? null,
    questionCount: raw.questionCount ?? raw.totalQuestions ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  small shared pieces                                                        */
/* -------------------------------------------------------------------------- */

function Highlight({ text, tokens }) {
  const str = text == null ? "" : String(text);
  if (!tokens?.length || !str) return <>{str}</>;
  const pattern = tokens.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const parts = str.split(new RegExp(`(${pattern})`, "ig"));
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="db-mark">{p}</mark> : p))}
    </>
  );
}

function Avatar({ name, role, size = 32 }) {
  return (
    <span className="db-avatar" style={{ ...roleVars(role), width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {initialsFor(name)}
    </span>
  );
}

function ScoreBar({ pct }) {
  return (
    <span className="db-scorebar" data-band={bandOf(pct)} role="img" aria-label={`${pct} percent`}>
      <span style={{ width: `${Math.max(3, pct)}%` }} />
    </span>
  );
}

function Skeleton({ rows = 4 }) {
  return (
    <div className="db-card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="db-row" style={{ padding: "1rem 1.25rem" }}>
          <span className="db-skel animate-pulse" style={{ display: "block", height: 14, width: "38%", borderRadius: 6 }} />
          <span className="db-skel animate-pulse" style={{ display: "block", height: 12, width: "60%", borderRadius: 6, marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

function Message({ icon, title, body, action, alert }) {
  return (
    <div className="db-empty" role={alert ? "alert" : undefined}>
      {icon}
      <p className="db-empty-title">{title}</p>
      {body && <p className="db-empty-body">{body}</p>}
      {action}
    </div>
  );
}

function StatStrip({ items }) {
  return (
    <div className="db-stats">
      {items.map((s) => (
        <div key={s.label} className="db-stat">
          <span className="db-stat-label">{s.label}</span>
          <span className="db-stat-value">{s.value}</span>
          {s.sub ? <span className="db-stat-sub">{s.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

function DashHeader({ role, onRefresh, busy }) {
  const sub = {
    ADMIN: "Every quiz in the system: who created it, when, and how each student did.",
    TEACHER: "The quizzes you've created and how your students are doing.",
    USER: "Your quiz results, and what's open for you right now.",
  }[role];
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F80F8] to-[#24389E]">
            <LayoutDashboard size={16} className="text-[#FFFFFF]" />
          </span>
          Dashboard
          <span className="role-pill">{roleMeta(role).label}</span>
        </h1>
        <p className="page-sub">{sub}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button type="button" className="db-btn" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  entry point                                                                */
/* -------------------------------------------------------------------------- */

export default function Dashboard({ role, currentUsername, onOpenQuizzes }) {
  const isStaff = role === "ADMIN" || role === "TEACHER";
  return (
    <div className="db-root min-h-full bg-[var(--bg)] px-4 pb-16 pt-6 text-[var(--text)] sm:px-8 sm:pt-9">
      <style>{CSS}</style>
      <div className="mx-auto max-w-[1040px]">
        {isStaff ? (
          <StaffDashboard role={role} currentUsername={currentUsername} />
        ) : (
          <StudentDashboard onOpenQuizzes={onOpenQuizzes} currentUsername={currentUsername} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  admin + teacher                                                            */
/* -------------------------------------------------------------------------- */

function StaffDashboard({ role, currentUsername }) {
  const isAdmin = role === "ADMIN";
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [tab, setTab] = useState("quizzes"); // "quizzes" | "students"
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all"); // "all" | "OPEN" | "CLOSED"
  const [creator, setCreator] = useState(null);
  const [sort, setSort] = useState("newest");
  const [expanded, setExpanded] = useState(null);

  const [results, setResults] = useState({}); // quizId -> { status, data?, error?, code? }
  const resultsRef = useRef({});
  resultsRef.current = results;
  const [closingId, setClosingId] = useState(null);
  const [closeError, setCloseError] = useState({}); // quizId -> message

  const self = useMemo(() => ({ username: currentUsername, role }), [currentUsername, role]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setResults({});
    try {
      let data;
      if (isAdmin) {
        try {
          data = await getAllQuizzes();
        } catch (err) {
          const code = err.response?.status;
          // Endpoint not built yet: still show something useful.
          if (code === 404 || code === 405) {
            data = await getMyCreatedQuizzes();
            setNotice(
              "This server doesn't have GET /api/quizzes/all yet, so you're only seeing quizzes you created yourself. See BACKEND_NOTES.md."
            );
          } else {
            throw err;
          }
        }
      } else {
        data = await getMyCreatedQuizzes();
      }
      setQuizzes((data || []).map((q) => normalizeQuiz(q, self)));
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load quizzes.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, self]);

  useEffect(() => {
    load();
  }, [load]);

  const loadResults = useCallback(async (id, force = false) => {
    const cur = resultsRef.current[id];
    if (!force && cur && (cur.status === "loading" || cur.status === "done")) return;
    setResults((p) => ({ ...p, [id]: { status: "loading" } }));
    try {
      const data = await getQuizResults(id);
      setResults((p) => ({ ...p, [id]: { status: "done", data } }));
    } catch (err) {
      setResults((p) => ({
        ...p,
        [id]: { status: "error", error: err.response?.data?.message ?? "Could not load results.", code: err.response?.status },
      }));
    }
  }, []);

  /* ------------------------------ derived ------------------------------ */

  const tokens = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const scoped = useMemo(
    () => (creator ? quizzes.filter((q) => (q.createdBy ?? "Unknown") === creator) : quizzes),
    [quizzes, creator]
  );

  const creators = useMemo(() => {
    const m = new Map();
    quizzes.forEach((q) => {
      const key = q.createdBy ?? "Unknown";
      const e = m.get(key) ?? { name: key, role: q.createdByRole, count: 0, submissions: 0, last: null };
      e.count += 1;
      e.submissions += q.submittedAttempts;
      const d = parseDate(q.createdAt);
      if (d && (!e.last || d > e.last)) e.last = d;
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [quizzes]);

  const matchesSearch = useCallback(
    (q) =>
      tokens.every((t) =>
        [q.title, q.subject, q.institution, q.standard, q.createdBy, sentenceCase(q.status), roleMeta(q.createdByRole).label].some((v) =>
          lc(v).includes(t)
        )
      ),
    [tokens]
  );

  const searched = useMemo(() => scoped.filter(matchesSearch), [scoped, matchesSearch]);
  const statusCounts = useMemo(
    () => ({
      all: searched.length,
      OPEN: searched.filter((q) => q.status === "OPEN").length,
      CLOSED: searched.filter((q) => q.status === "CLOSED").length,
    }),
    [searched]
  );

  const visible = useMemo(() => {
    const list = status === "all" ? searched.slice() : searched.filter((q) => q.status === status);
    const created = (q) => parseDate(q.createdAt)?.getTime() ?? 0;
    if (sort === "oldest") list.sort((a, b) => created(a) - created(b) || a.id - b.id);
    else if (sort === "submissions") list.sort((a, b) => b.submittedAttempts - a.submittedAttempts || created(b) - created(a));
    else list.sort((a, b) => created(b) - created(a) || b.id - a.id);
    return list;
  }, [searched, status, sort]);

  const stats = useMemo(() => {
    const open = quizzes.filter((q) => q.status === "OPEN").length;
    const submissions = quizzes.reduce((n, q) => n + q.submittedAttempts, 0);
    const teachers = new Set(quizzes.filter((q) => q.createdByRole === "TEACHER").map((q) => q.createdBy)).size;
    return { total: quizzes.length, open, closed: quizzes.length - open, submissions, creators: creators.length, teachers };
  }, [quizzes, creators]);

  const statItems = isAdmin
    ? [
        { label: "Quizzes", value: stats.total, sub: `${stats.open} open, ${stats.closed} closed` },
        { label: "Submissions", value: stats.submissions, sub: "across all quizzes" },
        { label: "Creators", value: stats.creators, sub: stats.teachers ? plural(stats.teachers, "teacher", "teachers") : "" },
        { label: "Open now", value: stats.open, sub: stats.open === 1 ? "quiz taking answers" : "quizzes taking answers" },
      ]
    : [
        { label: "Quizzes", value: stats.total, sub: "you've created" },
        { label: "Open now", value: stats.open, sub: "taking answers" },
        { label: "Closed", value: stats.closed, sub: "finished" },
        { label: "Submissions", value: stats.submissions, sub: "from your students" },
      ];

  /* ------------------------------ actions ------------------------------ */

  const toggleRow = (q) => {
    const next = expanded === q.id ? null : q.id;
    setExpanded(next);
    if (next != null && q.submittedAttempts > 0) loadResults(q.id);
  };

  const handleClose = async (q) => {
    setClosingId(q.id);
    setCloseError((p) => ({ ...p, [q.id]: null }));
    try {
      await closeQuiz(q.id);
      setQuizzes((qs) => qs.map((x) => (x.id === q.id ? { ...x, status: "CLOSED" } : x)));
    } catch (err) {
      setCloseError((p) => ({ ...p, [q.id]: err.response?.data?.message ?? "Could not close this quiz." }));
    } finally {
      setClosingId(null);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setCreator(null);
  };

  /* ------------------------------- render ------------------------------- */

  return (
    <>
      <DashHeader role={role} onRefresh={load} busy={loading} />

      {notice && (
        <div className="db-notice" role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {error ? (
        <Message
          alert
          icon={<AlertCircle size={26} aria-hidden="true" />}
          title={error}
          body="Check your connection, then try again."
          action={<button type="button" className="db-btn" onClick={load}><RefreshCw size={14} /> Try again</button>}
        />
      ) : (
        <>
          {loading ? (
            <div className="db-stats" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="db-stat">
                  <span className="db-skel animate-pulse" style={{ display: "block", height: 12, width: "50%", borderRadius: 6 }} />
                  <span className="db-skel animate-pulse" style={{ display: "block", height: 28, width: "35%", borderRadius: 6, marginTop: 10 }} />
                </div>
              ))}
            </div>
          ) : (
            <StatStrip items={statItems} />
          )}

          {isAdmin && !loading && creators.length > 0 && (
            <section className="mt-6" aria-label="Filter by creator">
              <h2 className="db-h2">Created by</h2>
              <div className="db-chips">
                <button type="button" className="db-chip" aria-pressed={creator === null} onClick={() => setCreator(null)}>
                  Everyone
                  <span className="db-count">{quizzes.length}</span>
                </button>
                {creators.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="db-chip"
                    aria-pressed={creator === c.name}
                    onClick={() => setCreator((cur) => (cur === c.name ? null : c.name))}
                    title={`${roleMeta(c.role).label}${c.last ? `, last created ${fmtDate(c.last)}` : ""}`}
                  >
                    <Avatar name={c.name} role={c.role} size={22} />
                    {c.name}
                    <span className="db-count">{c.count}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="db-tabs mt-6" role="tablist" aria-label="Dashboard sections">
            <button type="button" role="tab" aria-selected={tab === "quizzes"} className="db-tab" onClick={() => setTab("quizzes")}>
              <ClipboardList size={15} aria-hidden="true" /> Quizzes
            </button>
            <button type="button" role="tab" aria-selected={tab === "students"} className="db-tab" onClick={() => setTab("students")}>
              <Users size={15} aria-hidden="true" /> Students
            </button>
          </div>

          {tab === "quizzes" ? (
            <QuizzesPanel
              isAdmin={isAdmin}
              loading={loading}
              total={quizzes.length}
              visible={visible}
              tokens={tokens}
              query={query}
              setQuery={setQuery}
              status={status}
              setStatus={setStatus}
              statusCounts={statusCounts}
              sort={sort}
              setSort={setSort}
              expanded={expanded}
              onToggle={toggleRow}
              results={results}
              onRetry={(id) => loadResults(id, true)}
              onCloseQuiz={handleClose}
              closingId={closingId}
              closeError={closeError}
              onClear={clearFilters}
              filtersActive={tokens.length > 0 || status !== "all" || creator !== null}
            />
          ) : (
            <StudentsPanel
              loading={loading}
              scoped={scoped}
              results={results}
              loadResults={loadResults}
              resultsRef={resultsRef}
            />
          )}
        </>
      )}
    </>
  );
}

/* ---------------------------- quizzes tab ---------------------------- */

function QuizzesPanel({
  isAdmin, loading, total, visible, tokens, query, setQuery, status, setStatus, statusCounts, sort, setSort,
  expanded, onToggle, results, onRetry, onCloseQuiz, closingId, closeError, onClear, filtersActive,
}) {
  const STATUS_TABS = [
    { id: "all", label: "All" },
    { id: "OPEN", label: "Open" },
    { id: "CLOSED", label: "Closed" },
  ];
  return (
    <div role="tabpanel" aria-label="Quizzes">
      <div className="db-toolbar">
        <div className="db-search">
          <Search size={17} aria-hidden="true" className="db-search-ico" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) setQuery("");
            }}
            placeholder={isAdmin ? "Search by title, subject, creator or institution" : "Search by title, subject or class"}
            aria-label="Search quizzes"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="db-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>
        <label className="db-select">
          <span className="sr-only">Sort quizzes</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="submissions">Most submissions</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      <div className="db-status" role="group" aria-label="Filter by status">
        {STATUS_TABS.map((s) => (
          <button key={s.id} type="button" className="db-pill-btn" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
            {s.label}
            <span className="db-count">{loading ? "–" : statusCounts[s.id]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton />
      ) : total === 0 ? (
        <Message
          icon={<ClipboardList size={26} aria-hidden="true" />}
          title="No quizzes yet"
          body={isAdmin ? "Quizzes created by teachers and admins will appear here." : "Quizzes you create will appear here with their results."}
        />
      ) : visible.length === 0 ? (
        <Message
          icon={<Search size={26} aria-hidden="true" />}
          title={tokens.length ? `No quizzes match “${query.trim()}”` : "No quizzes in this view"}
          body="Try another search, or clear the filters."
          action={filtersActive ? <button type="button" className="db-btn" onClick={onClear}>Clear filters</button> : null}
        />
      ) : (
        <div className="db-card">
          <div className="db-cols" aria-hidden="true">
            <span>Quiz</span>
            <span>Created by</span>
            <span>Created</span>
            <span>Status</span>
            <span>Submitted</span>
          </div>
          <ul className="m-0 list-none p-0">
            {visible.map((q) => (
              <QuizRow
                key={q.id}
                q={q}
                tokens={tokens}
                isOpen={expanded === q.id}
                onToggle={() => onToggle(q)}
                res={results[q.id]}
                onRetry={() => onRetry(q.id)}
                onCloseQuiz={() => onCloseQuiz(q)}
                closing={closingId === q.id}
                closeError={closeError[q.id]}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuizRow({ q, tokens, isOpen, onToggle, res, onRetry, onCloseQuiz, closing, closeError }) {
  const panelId = `db-quiz-${q.id}`;
  const hasCreated = !!parseDate(q.createdAt);
  return (
    <li className="db-row" data-status={q.status}>
      <div className="db-grid db-grid-quiz">
        <button type="button" className="db-titlebtn" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle}>
          <span className="min-w-0 flex-1">
            <span className="db-title">
              <Highlight text={q.title} tokens={tokens} />
            </span>
            <span className="db-meta">
              <span>{q.subject ? <Highlight text={q.subject} tokens={tokens} /> : "General"}</span>
              {q.standard ? (
                <span className="db-meta-item">
                  <GraduationCap size={13} aria-hidden="true" />
                  Class <Highlight text={q.standard} tokens={tokens} />
                </span>
              ) : null}
              {q.institution ? (
                <span className="db-meta-item">
                  <Building2 size={13} aria-hidden="true" />
                  <Highlight text={q.institution} tokens={tokens} />
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown size={16} className="db-chevron" aria-hidden="true" />
        </button>

        <div className="db-cell">
          <span className="db-lbl">Created by</span>
          {q.createdBy ? (
            <span className="db-creator">
              <Avatar name={q.createdBy} role={q.createdByRole} size={30} />
              <span className="min-w-0">
                <span className="db-strong db-trunc">
                  <Highlight text={q.createdBy} tokens={tokens} />
                </span>
                {q.createdByRole ? <span className="db-muted">{roleMeta(q.createdByRole).label}</span> : null}
              </span>
            </span>
          ) : (
            <span className="db-muted">Unknown</span>
          )}
        </div>

        <div className="db-cell" title={hasCreated ? fmtDateTime(q.createdAt) : "The server didn't record when this quiz was created"}>
          <span className="db-lbl">Created</span>
          {hasCreated ? (
            <>
              <span className="db-strong">{fmtDate(q.createdAt)}</span>
              <span className="db-muted">
                {fmtTime(q.createdAt)}
                {timeAgo(q.createdAt) ? `, ${timeAgo(q.createdAt)}` : ""}
              </span>
            </>
          ) : (
            <span className="db-muted">Not recorded</span>
          )}
        </div>

        <div className="db-cell">
          <span className="db-lbl">Status</span>
          <span>
            <span className={`db-status-pill ${q.status === "OPEN" ? "is-open" : "is-closed"}`}>{sentenceCase(q.status)}</span>
          </span>
          <span className="db-muted">{sentenceCase(q.mode)}</span>
        </div>

        <div className="db-cell">
          <span className="db-lbl">Submitted</span>
          <span className="db-num">{q.submittedAttempts}</span>
        </div>
      </div>

      {isOpen && (
        <div id={panelId}>
          <QuizDetail q={q} res={res} onRetry={onRetry} onCloseQuiz={onCloseQuiz} closing={closing} closeError={closeError} />
        </div>
      )}
    </li>
  );
}

function Fact({ label, children }) {
  return (
    <div className="db-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function QuizDetail({ q, res, onRetry, onCloseQuiz, closing, closeError }) {
  const [confirming, setConfirming] = useState(false);
  const scores = useMemo(() => {
    const list = res?.data?.studentScores ?? [];
    return list
      .map((s) => ({ ...s, pct: pctOf(s.score, s.totalQuestions) }))
      .sort((a, b) => b.pct - a.pct || String(a.username).localeCompare(String(b.username)));
  }, [res]);
  const missed = res?.data?.mostMissedQuestions ?? [];
  const avg = scores.length ? Math.round(scores.reduce((n, s) => n + s.pct, 0) / scores.length) : null;
  const top = scores.length ? scores[0].pct : null;

  return (
    <div className="db-panel">
      <dl className="db-facts">
        <Fact label="Created by">
          {q.createdBy ? (
            <>
              {q.createdBy}
              {q.createdByRole ? <span className="db-muted"> ({roleMeta(q.createdByRole).label})</span> : null}
            </>
          ) : (
            "Unknown"
          )}
        </Fact>
        <Fact label="Created on">{fmtDateTime(q.createdAt)}</Fact>
        <Fact label="Mode">{sentenceCase(q.mode)}</Fact>
        <Fact label="Timer">{q.durationMinutes ? `${q.durationMinutes} minutes` : "No timer"}</Fact>
        {q.opensAt ? <Fact label="Opens">{fmtDateTime(q.opensAt)}</Fact> : null}
        {q.closesAt ? <Fact label="Closes">{fmtDateTime(q.closesAt)}</Fact> : null}
        {q.questionCount != null ? <Fact label="Questions">{q.questionCount}</Fact> : null}
      </dl>

      <div className="db-panel-head">
        <h3 className="db-h3">Student results</h3>
        {q.status === "OPEN" && (
          <span className="db-actions">
            {confirming ? (
              <>
                <span className="db-muted">Close this quiz for everyone?</span>
                <button type="button" className="db-btn db-btn-danger" onClick={() => { setConfirming(false); onCloseQuiz(); }} disabled={closing}>
                  Yes, close it
                </button>
                <button type="button" className="db-btn" onClick={() => setConfirming(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="db-btn" onClick={() => setConfirming(true)} disabled={closing}>
                {closing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                Close quiz
              </button>
            )}
          </span>
        )}
      </div>
      {closeError && <p className="db-inline-error" role="alert">{closeError}</p>}

      {q.submittedAttempts === 0 ? (
        <p className="db-muted db-pad">No one has submitted this quiz yet.</p>
      ) : !res || res.status === "loading" ? (
        <p className="db-muted db-pad" aria-busy="true"><Loader2 size={14} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />Loading results…</p>
      ) : res.status === "error" ? (
        <div className="db-inline-error" role="alert">
          <span>
            {res.error}
            {res.code === 403 ? " The server may only allow the quiz's creator to open results; it needs to let admins see them too." : ""}
          </span>
          <button type="button" className="db-btn" onClick={onRetry}>Try again</button>
        </div>
      ) : (
        <>
          <p className="db-summary">
            {plural(scores.length, "student", "students")} submitted
            {avg != null ? `, class average ${avg}%` : ""}
            {top != null ? `, highest ${top}%` : ""}.
          </p>
          <div className="db-tablewrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.username}>
                    <td>
                      <span className="db-creator">
                        <Avatar name={s.username} role="USER" size={26} />
                        <span className="db-strong db-trunc">{s.username}</span>
                      </span>
                    </td>
                    <td className="db-nowrap">{s.score} / {s.totalQuestions}</td>
                    <td>
                      <span className="db-result">
                        <ScoreBar pct={s.pct} />
                        <span className="db-pct">{s.pct}%</span>
                      </span>
                    </td>
                    <td className="db-nowrap db-muted">{fmtDateTime(s.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {missed.length > 0 && (
            <>
              <h3 className="db-h3" style={{ marginTop: "1.5rem" }}>Most missed questions</h3>
              <ul className="db-missed">
                {missed.map((m) => (
                  <li key={m.questionId}>
                    <span className="db-trunc">{m.questionText}</span>
                    <span className="db-missed-count">Missed {m.missCount}×</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------- students tab ---------------------------- */

function StudentsPanel({ loading, scoped, results, loadResults, resultsRef }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [open, setOpen] = useState(null);

  const eligible = useMemo(() => scoped.filter((q) => q.submittedAttempts > 0), [scoped]);

  // Scores are fetched per quiz, a few at a time, the first time this tab is
  // opened (and cached for the session).
  useEffect(() => {
    if (loading || eligible.length === 0) return undefined;
    let cancelled = false;
    const ids = eligible.filter((q) => !resultsRef.current[q.id]).map((q) => q.id);
    let i = 0;
    const worker = async () => {
      while (!cancelled && i < ids.length) {
        const id = ids[i++];
        await loadResults(id);
      }
    };
    Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    return () => {
      cancelled = true;
    };
  }, [loading, eligible, loadResults, resultsRef]);

  const done = eligible.filter((q) => results[q.id]?.status === "done").length;
  const failed = eligible.filter((q) => results[q.id]?.status === "error").length;
  const pending = eligible.length - done - failed;

  const students = useMemo(() => {
    const m = new Map();
    scoped.forEach((q) => {
      const r = results[q.id];
      if (r?.status !== "done") return;
      (r.data?.studentScores ?? []).forEach((s) => {
        const e = m.get(s.username) ?? { username: s.username, attempts: [] };
        e.attempts.push({
          quizId: q.id, title: q.title, createdBy: q.createdBy,
          score: s.score, total: s.totalQuestions, pct: pctOf(s.score, s.totalQuestions), submittedAt: s.submittedAt,
        });
        m.set(s.username, e);
      });
    });
    return [...m.values()].map((e) => {
      const pcts = e.attempts.map((a) => a.pct);
      const last = e.attempts.map((a) => parseDate(a.submittedAt)).filter(Boolean).sort((a, b) => b - a)[0] ?? null;
      return { ...e, taken: e.attempts.length, avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length), best: Math.max(...pcts), last };
    });
  }, [scoped, results]);

  const tokens = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const rows = useMemo(() => {
    const list = students.filter((s) => tokens.every((t) => lc(s.username).includes(t)));
    if (sort === "high") list.sort((a, b) => b.avg - a.avg || a.username.localeCompare(b.username));
    else if (sort === "low") list.sort((a, b) => a.avg - b.avg || a.username.localeCompare(b.username));
    else if (sort === "taken") list.sort((a, b) => b.taken - a.taken || a.username.localeCompare(b.username));
    else list.sort((a, b) => a.username.localeCompare(b.username));
    return list;
  }, [students, tokens, sort]);

  return (
    <div role="tabpanel" aria-label="Students">
      <div className="db-toolbar">
        <div className="db-search">
          <Search size={17} aria-hidden="true" className="db-search-ico" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students by username"
            aria-label="Search students"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="db-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>
        <label className="db-select">
          <span className="sr-only">Sort students</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name, A to Z</option>
            <option value="high">Average, high to low</option>
            <option value="low">Average, low to high</option>
            <option value="taken">Most quizzes taken</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      {!loading && eligible.length > 0 && pending > 0 && (
        <div className="db-progress" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Loading scores, {done} of {eligible.length} quizzes
        </div>
      )}
      {failed > 0 && pending === 0 && (
        <div className="db-notice" role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <span>Couldn't load scores for {plural(failed, "quiz", "quizzes")}, so some students may be missing. Open those quizzes in the Quizzes tab to see the error.</span>
        </div>
      )}

      {loading ? (
        <Skeleton />
      ) : eligible.length === 0 ? (
        <Message icon={<Users size={26} aria-hidden="true" />} title="No student results yet" body="Once students submit quizzes, each student's results will show up here." />
      ) : rows.length === 0 && pending > 0 ? (
        <Skeleton rows={3} />
      ) : rows.length === 0 ? (
        <Message icon={<Search size={26} aria-hidden="true" />} title={tokens.length ? `No students match “${query.trim()}”` : "No results to show"} body="Try another name." />
      ) : (
        <div className="db-card">
          <div className="db-cols db-cols-students" aria-hidden="true">
            <span>Student</span>
            <span>Quizzes taken</span>
            <span>Average</span>
            <span>Best</span>
            <span>Last submitted</span>
          </div>
          <ul className="m-0 list-none p-0">
            {rows.map((s) => {
              const isOpen = open === s.username;
              return (
                <li key={s.username} className="db-row">
                  <div className="db-grid db-grid-students">
                    <button type="button" className="db-titlebtn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.username)}>
                      <Avatar name={s.username} role="USER" size={32} />
                      <span className="db-title db-trunc" style={{ flex: 1 }}>
                        <Highlight text={s.username} tokens={tokens} />
                      </span>
                      <ChevronDown size={16} className="db-chevron" aria-hidden="true" />
                    </button>
                    <div className="db-cell">
                      <span className="db-lbl">Quizzes taken</span>
                      <span className="db-num">{s.taken}</span>
                    </div>
                    <div className="db-cell">
                      <span className="db-lbl">Average</span>
                      <span className="db-result">
                        <ScoreBar pct={s.avg} />
                        <span className="db-pct">{s.avg}%</span>
                      </span>
                    </div>
                    <div className="db-cell">
                      <span className="db-lbl">Best</span>
                      <span className="db-num">{s.best}%</span>
                    </div>
                    <div className="db-cell">
                      <span className="db-lbl">Last submitted</span>
                      {s.last ? (
                        <>
                          <span className="db-strong">{fmtDate(s.last)}</span>
                          <span className="db-muted">{fmtTime(s.last)}</span>
                        </>
                      ) : (
                        <span className="db-muted">Not recorded</span>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="db-panel">
                      <h3 className="db-h3">{s.username}'s results</h3>
                      <div className="db-tablewrap">
                        <table className="db-table">
                          <thead>
                            <tr>
                              <th>Quiz</th>
                              <th>Created by</th>
                              <th>Score</th>
                              <th>Result</th>
                              <th>Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.attempts
                              .slice()
                              .sort((a, b) => (parseDate(b.submittedAt)?.getTime() ?? 0) - (parseDate(a.submittedAt)?.getTime() ?? 0))
                              .map((a) => (
                                <tr key={a.quizId}>
                                  <td className="db-strong">{a.title}</td>
                                  <td className="db-muted">{a.createdBy ?? "Unknown"}</td>
                                  <td className="db-nowrap">{a.score} / {a.total}</td>
                                  <td>
                                    <span className="db-result">
                                      <ScoreBar pct={a.pct} />
                                      <span className="db-pct">{a.pct}%</span>
                                    </span>
                                  </td>
                                  <td className="db-nowrap db-muted">{fmtDateTime(a.submittedAt)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  student                                                                    */
/* -------------------------------------------------------------------------- */

function StudentDashboard({ onOpenQuizzes, currentUsername }) {
  const [results, setResults] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [r, a] = await Promise.allSettled([getMyResults(), getAvailableQuizzes()]);
    if (r.status === "fulfilled") setResults(r.value || []);
    else {
      setResults([]);
      setError(r.reason?.response?.data?.message ?? "Could not load your results.");
    }
    setAvailable(a.status === "fulfilled" ? a.value || [] : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      results
        .map((r) => ({ ...r, pct: pctOf(r.score, r.totalQuestions) }))
        .sort((a, b) => (parseDate(b.submittedAt)?.getTime() ?? 0) - (parseDate(a.submittedAt)?.getTime() ?? 0)),
    [results]
  );
  const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.pct, 0) / rows.length) : null;
  const best = rows.length ? Math.max(...rows.map((r) => r.pct)) : null;
  const trend = useMemo(() => rows.slice(0, 12).reverse(), [rows]);

  // The Dashboard replaces the chat (which normally listens for the menu
  // events), so navigate through the callback the app gives us.
  const goToQuizzes = () => {
    if (onOpenQuizzes) onOpenQuizzes();
    else document.dispatchEvent(new CustomEvent("learnmate:open-quizzes"));
  };

  return (
    <>
      <DashHeader role="USER" onRefresh={load} busy={loading} />

      {error && (
        <div className="db-notice" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <>
          <div className="db-stats" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="db-stat">
                <span className="db-skel animate-pulse" style={{ display: "block", height: 12, width: "50%", borderRadius: 6 }} />
                <span className="db-skel animate-pulse" style={{ display: "block", height: 28, width: "35%", borderRadius: 6, marginTop: 10 }} />
              </div>
            ))}
          </div>
          <div className="mt-6"><Skeleton rows={3} /></div>
        </>
      ) : (
        <>
          <StatStrip
            items={[
              { label: "Quizzes taken", value: rows.length, sub: rows.length ? "so far" : "none yet" },
              { label: "Average score", value: avg == null ? "–" : `${avg}%`, sub: avg == null ? "" : "across all quizzes" },
              { label: "Best score", value: best == null ? "–" : `${best}%`, sub: "" },
              { label: "Open for you", value: available.length, sub: available.length === 1 ? "quiz waiting" : "quizzes waiting" },
            ]}
          />

          <HallOfFame username={currentUsername} />

          <div className="db-two mt-6">
            <section aria-label="Recent scores">
              <h2 className="db-h2">Recent scores</h2>
              {trend.length === 0 ? (
                <div className="db-card db-pad db-muted">Your scores will chart here after your first quiz.</div>
              ) : (
                <div className="db-card db-pad">
                  <TrendChart items={trend} />
                  <p className="db-muted" style={{ margin: "0.6rem 0 0", fontSize: 12.5 }}>
                    Last {plural(trend.length, "quiz", "quizzes")}, oldest to newest. Hover a bar for details.
                  </p>
                </div>
              )}
            </section>

            <section aria-label="Open for you">
              <h2 className="db-h2">Open for you</h2>
              {available.length === 0 ? (
                <div className="db-card db-pad db-muted">Nothing is open for your class right now.</div>
              ) : (
                <div className="db-card">
                  <ul className="m-0 list-none p-0">
                    {available.slice(0, 5).map((q) => (
                      <li key={q.id} className="db-row db-avail">
                        <span className="min-w-0">
                          <span className="db-title db-trunc">{q.title}</span>
                          <span className="db-meta">
                            <span>{q.subject || "General"}</span>
                            {q.standard ? <span>Class {q.standard}</span> : null}
                            <span>{sentenceCase(q.mode)}</span>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="db-card-foot">
                    <button type="button" className="db-btn db-btn-primary" onClick={goToQuizzes}>
                      Go to quizzes
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="mt-8" aria-label="My results">
            <h2 className="db-h2">My results</h2>
            {rows.length === 0 ? (
              <Message icon={<ClipboardList size={26} aria-hidden="true" />} title="No quizzes submitted yet" body="Your marks and submission dates will show up here as soon as you submit one." />
            ) : (
              <div className="db-card">
                <ul className="m-0 list-none p-0">
                  {rows.map((r) => {
                    const isOpen = expanded === r.quizId;
                    return (
                      <li key={r.quizId} className="db-row">
                        <button type="button" className="db-mine" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : r.quizId)}>
                          <span className="min-w-0 flex-1">
                            <span className="db-title db-trunc">
                              {r.title}
                              {r.pct >= 90 && <Trophy size={13} aria-label="Top score" style={{ display: "inline", marginLeft: 6, verticalAlign: "-2px", color: "var(--db-mid)" }} />}
                            </span>
                            <span className="db-muted">Submitted {fmtDateTime(r.submittedAt)}</span>
                          </span>
                          <span className="db-result">
                            <ScoreBar pct={r.pct} />
                            <span className="db-pct">{r.score} / {r.totalQuestions}</span>
                          </span>
                          <ChevronDown size={16} className="db-chevron" aria-hidden="true" />
                        </button>
                        {isOpen && (
                          <>
                            <div className="db-panel">
                              <Leaderboard quizId={r.quizId} />
                            </div>
                            <AttemptReview quizId={r.quizId} />
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function TrendChart({ items }) {
  const W = 360;
  const H = 132;
  const pad = { top: 8, bottom: 6 };
  const n = items.length;
  const gap = 8;
  const bw = Math.max(8, Math.min(34, (W - gap * (n - 1)) / n));
  const total = bw * n + gap * (n - 1);
  const x0 = (W - total) / 2;
  const innerH = H - pad.top - pad.bottom;
  const summary = items.map((r) => `${r.title}: ${r.pct}%`).join("; ");
  return (
    <svg className="db-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Recent scores. ${summary}`} preserveAspectRatio="xMidYMid meet">
      {[0, 50, 100].map((g) => {
        const y = pad.top + innerH - (g / 100) * innerH;
        return <line key={g} x1="0" x2={W} y1={y} y2={y} className="db-grid-line" />;
      })}
      {items.map((r, i) => {
        const h = Math.max(3, (r.pct / 100) * innerH);
        const x = x0 + i * (bw + gap);
        const y = pad.top + innerH - h;
        return (
          <rect key={r.quizId} x={x} y={y} width={bw} height={h} rx="4" className={`db-bar db-bar-${bandOf(r.pct)}`}>
            <title>{`${r.title}: ${r.score} / ${r.totalQuestions} (${r.pct}%)`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function AttemptReview({ quizId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMyAttemptDetail(quizId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message ?? "Could not load this review.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (error) return <div className="db-panel"><p className="db-inline-error" role="alert">{error}</p></div>;
  if (!detail) return <div className="db-panel db-muted" aria-busy="true">Loading review…</div>;

  return (
    <div className="db-panel">
      <div className="db-review">
        {detail.questions.map((q, idx) => (
          <div key={q.questionId} className={`db-review-q ${q.correct ? "is-right" : "is-wrong"}`}>
            <p className="db-review-text">
              <span className="db-review-n">{idx + 1}.</span> {q.questionText}
            </p>
            <p className="db-muted">
              Your answer:{" "}
              <span className={q.correct ? "db-right" : "db-wrong"}>
                {q.selectedOption ? `${q.selectedOption}) ${q[`option${q.selectedOption}`]}` : "Not answered"}
              </span>
            </p>
            {!q.correct && (
              <p className="db-muted">
                Correct answer:{" "}
                <span className="db-right">
                  {q.correctOption}) {q[`option${q.correctOption}`]}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  styles                                                                     */
/* -------------------------------------------------------------------------- */

const CSS = `
.db-root {
  container-type: inline-size;
  container-name: db;
  font-family: var(--font-ui);
  font-size: 14px;
  --db-user: #7EA6FF;
  --db-teacher: #2DD4BF;
  --db-admin: #B39DFF;
  --db-good: #2DD4BF;
  --db-mid: #F2B84B;
  --db-low: #E2725B;
  --db-danger-ink: #F3B9A8;
  --db-focus: #7FA2FF;
  --db-hover: color-mix(in srgb, var(--text) 4%, transparent);
  --db-hover-strong: color-mix(in srgb, var(--text) 9%, transparent);
  --db-line-strong: color-mix(in srgb, var(--text) 16%, transparent);
}
:root[data-theme="light"] .db-root {
  --db-user: #3A5FCB;
  --db-teacher: #0F8A7C;
  --db-admin: #6D4FD6;
  --db-good: #0F8A7C;
  --db-mid: #B7791F;
  --db-low: #C2432B;
  --db-danger-ink: #9C2F1B;
  --db-focus: #24389E;
}
.db-root :focus-visible { outline: 2px solid var(--db-focus); outline-offset: 2px; }
.db-muted { color: var(--muted); }
.db-strong { font-weight: 600; color: var(--text); }
.db-trunc { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-nowrap { white-space: nowrap; }
.db-pad { padding: 1rem 1.15rem; }
.db-skel { background: var(--db-hover-strong); }
.db-mark { background: color-mix(in srgb, #4F80F8 45%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
.db-h2 { margin: 0 0 .65rem; font-size: 15px; font-weight: 600; color: var(--text); }
.db-h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--muted); }

/* buttons */
.db-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .45rem; height: 2.4rem; padding: 0 .95rem;
  border-radius: 10px; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: pointer;
  color: var(--text); background: var(--surface); border: 1px solid var(--db-line-strong);
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, opacity 140ms ease;
}
.db-btn:hover:not(:disabled) { background: var(--db-hover-strong); }
.db-btn:disabled { opacity: .45; cursor: not-allowed; }
.db-btn-primary { color: #FFFFFF; border-color: transparent; background: linear-gradient(135deg, #4F80F8, #3558DE); box-shadow: 0 6px 16px -8px rgba(53,88,222,.75); }
.db-btn-primary:hover:not(:disabled) { background: linear-gradient(135deg, #4F80F8, #3558DE); transform: translateY(-1px); }
.db-btn-danger { color: #fff; background: #C2432B; border-color: transparent; }
.db-btn-danger:hover:not(:disabled) { background: #A93620; }

/* stat strip: hairlines are the gaps between cells */
.db-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--divider); border: 1px solid var(--divider); border-radius: 16px; overflow: hidden; }
.db-stat { display: flex; flex-direction: column; gap: .2rem; padding: 1rem 1.15rem; background: var(--surface); min-width: 0; }
.db-stat-label { font-size: 13px; font-weight: 500; color: var(--muted); }
.db-stat-value { font-family: var(--font-display); font-weight: 600; font-size: 2rem; line-height: 1.1; letter-spacing: -0.02em; color: var(--text); font-variant-numeric: tabular-nums; }
.db-stat-sub { font-size: 12.5px; color: var(--dim); }

/* creator chips */
.db-chips { display: flex; gap: .4rem; padding: .15rem; margin: -.15rem; overflow-x: auto; scrollbar-width: none; }
.db-chips::-webkit-scrollbar { display: none; }
.db-chip {
  flex: none; display: inline-flex; align-items: center; gap: .5rem; padding: .3rem .8rem .3rem .35rem; border-radius: 999px;
  font-size: 13.5px; font-weight: 500; color: var(--muted); cursor: pointer;
  background: var(--surface); border: 1px solid var(--divider);
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}
.db-chip:first-child { padding-left: .8rem; }
.db-chip:hover { color: var(--text); background: var(--db-hover-strong); }
.db-chip[aria-pressed="true"] { color: var(--text); font-weight: 600; background: color-mix(in srgb, var(--db-focus) 15%, transparent); border-color: color-mix(in srgb, var(--db-focus) 45%, transparent); }
.db-count { font-size: 12.5px; font-weight: 500; color: var(--dim); font-variant-numeric: tabular-nums; }

/* tabs */
.db-tabs { display: flex; gap: .25rem; border-bottom: 1px solid var(--divider); margin-bottom: 1.1rem; }
.db-tab { display: inline-flex; align-items: center; gap: .5rem; padding: .7rem .9rem; margin-bottom: -1px; font-size: 14px; font-weight: 500; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; transition: color 140ms ease, border-color 140ms ease; }
.db-tab:hover { color: var(--text); }
.db-tab[aria-selected="true"] { color: var(--text); font-weight: 600; border-bottom-color: var(--db-focus); }

/* toolbar */
.db-toolbar { display: flex; flex-direction: column; gap: .6rem; margin-bottom: .75rem; }
.db-search { display: flex; align-items: center; gap: .7rem; flex: 1; min-width: 0; height: 2.9rem; padding: 0 .85rem; background: var(--surface); border: 1px solid var(--db-line-strong); border-radius: 12px; transition: border-color 140ms ease, box-shadow 140ms ease; }
.db-search:focus-within { border-color: var(--db-focus); box-shadow: 0 0 0 4px color-mix(in srgb, var(--db-focus) 18%, transparent); }
.db-search-ico { flex: none; color: var(--dim); }
.db-search input { flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; color: var(--text); font-size: 14.5px; text-overflow: ellipsis; }
.db-search input:focus, .db-search input:focus-visible { outline: none; }
.db-search input::placeholder { color: var(--dim); }
.db-search-clear { display: inline-flex; padding: .3rem; border-radius: 8px; color: var(--muted); cursor: pointer; }
.db-search-clear:hover { background: var(--db-hover-strong); color: var(--text); }
.db-select { position: relative; display: inline-flex; align-items: center; flex: none; }
.db-select select { appearance: none; -webkit-appearance: none; width: 100%; height: 2.9rem; padding: 0 2.2rem 0 .9rem; border-radius: 12px; font-size: 14px; font-weight: 500; color: var(--text); cursor: pointer; background: var(--surface); border: 1px solid var(--db-line-strong); }
.db-select select option { color: var(--text); background: var(--surface); }
.db-select svg { position: absolute; right: .8rem; pointer-events: none; color: var(--dim); }

.db-status { display: flex; gap: .3rem; margin-bottom: .9rem; overflow-x: auto; scrollbar-width: none; }
.db-status::-webkit-scrollbar { display: none; }
.db-pill-btn { flex: none; display: inline-flex; align-items: center; gap: .45rem; padding: .4rem .85rem; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--muted); cursor: pointer; border: 1px solid transparent; transition: background 140ms ease, color 140ms ease; }
.db-pill-btn:hover { color: var(--text); background: var(--db-hover); }
.db-pill-btn[aria-pressed="true"] { color: var(--text); font-weight: 600; background: var(--db-hover-strong); }

/* list card */
.db-card { background: var(--surface); border: 1px solid var(--divider); border-radius: 16px; overflow: hidden; }
.db-card-foot { padding: .8rem 1rem; border-top: 1px solid var(--divider); display: flex; justify-content: flex-end; }
.db-row + .db-row { border-top: 1px solid var(--divider); }
.db-row { transition: background 140ms ease; }
.db-row:hover { background: var(--db-hover); }
.db-cols { display: none; }
.db-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem 1rem; padding: 1rem 1.1rem; align-items: start; }
.db-titlebtn { grid-column: 1 / -1; display: flex; align-items: center; gap: .75rem; width: 100%; min-width: 0; padding: .25rem; margin: -.25rem; border-radius: 12px; text-align: left; cursor: pointer; }
.db-title { display: block; font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.35; overflow-wrap: anywhere; }
.db-meta { display: flex; flex-wrap: wrap; gap: .15rem .9rem; margin-top: .2rem; font-size: 13px; color: var(--muted); }
.db-meta-item { display: inline-flex; align-items: center; gap: .3rem; }
.db-chevron { flex: none; margin-left: auto; color: var(--dim); transition: transform 180ms ease; }
[aria-expanded="true"] > .db-chevron { transform: rotate(180deg); }
.db-cell { display: flex; flex-direction: column; gap: .1rem; min-width: 0; font-size: 13.5px; }
.db-lbl { font-size: 12px; font-weight: 500; color: var(--dim); margin-bottom: .1rem; }
.db-num { font-family: var(--font-display); font-weight: 600; font-size: 1.25rem; line-height: 1.2; color: var(--text); font-variant-numeric: tabular-nums; }
.db-creator { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.db-creator > span:last-child { display: flex; flex-direction: column; min-width: 0; }

.db-avatar { display: inline-flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; font-family: var(--font-display); font-weight: 600; line-height: 1; color: var(--role); background: color-mix(in srgb, var(--role) 14%, var(--surface)); border: 1.5px solid color-mix(in srgb, var(--role) 45%, transparent); }

.db-status-pill { display: inline-flex; align-items: center; padding: .12rem .6rem; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
.db-status-pill.is-open { color: var(--db-good); background: color-mix(in srgb, var(--db-good) 14%, transparent); }
.db-status-pill.is-closed { color: var(--muted); background: var(--db-hover-strong); }

/* score bars */
.db-result { display: inline-flex; align-items: center; gap: .6rem; min-width: 0; }
.db-scorebar { position: relative; display: inline-block; width: 6.5rem; height: 8px; border-radius: 999px; background: var(--db-hover-strong); overflow: hidden; flex: none; }
.db-scorebar > span { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: var(--db-mid); }
.db-scorebar[data-band="good"] > span { background: var(--db-good); }
.db-scorebar[data-band="low"] > span { background: var(--db-low); }
.db-pct { font-size: 13.5px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* expanded panel */
.db-panel { padding: 1.1rem 1.1rem 1.3rem; border-top: 1px dashed var(--db-line-strong); background: color-mix(in srgb, var(--text) 3%, transparent); animation: db-open 180ms ease-out both; }
.db-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: .9rem 1.25rem; margin: 0 0 1.4rem; }
.db-fact dt { font-size: 12px; font-weight: 500; color: var(--dim); margin-bottom: .15rem; }
.db-fact dd { margin: 0; font-size: 14px; color: var(--text); overflow-wrap: anywhere; }
.db-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: .75rem; }
.db-actions { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.db-summary { margin: 0 0 .75rem; font-size: 13.5px; color: var(--muted); }
.db-tablewrap { overflow-x: auto; border: 1px solid var(--divider); border-radius: 12px; background: var(--surface); }
.db-table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 13.5px; }
.db-table th { padding: .65rem .9rem; text-align: left; font-size: 12.5px; font-weight: 600; color: var(--dim); background: color-mix(in srgb, var(--text) 3%, var(--surface)); }
.db-table td { padding: .65rem .9rem; border-top: 1px solid var(--divider); vertical-align: middle; }
.db-missed { margin: .6rem 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .4rem; }
.db-missed li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .6rem .85rem; border-radius: 10px; background: var(--surface); border: 1px solid var(--divider); font-size: 13.5px; }
.db-missed-count { flex: none; font-weight: 600; color: var(--db-low); }

/* messages */
.db-notice { display: flex; align-items: flex-start; gap: .6rem; margin: 0 0 1.1rem; padding: .75rem .95rem; border-radius: 12px; font-size: 13.5px; line-height: 1.5; color: var(--text); background: color-mix(in srgb, var(--db-mid) 13%, transparent); border: 1px solid color-mix(in srgb, var(--db-mid) 40%, transparent); }
.db-notice svg { flex: none; margin-top: .1rem; color: var(--db-mid); }
.db-inline-error { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; margin: 0 0 .9rem; padding: .7rem .9rem; border-radius: 10px; font-size: 13.5px; line-height: 1.45; color: var(--db-danger-ink); background: var(--error-bg); border: 1px solid color-mix(in srgb, var(--db-low) 40%, transparent); }
.db-progress { display: flex; align-items: center; gap: .55rem; margin-bottom: .9rem; font-size: 13.5px; color: var(--muted); }
.db-empty { display: flex; flex-direction: column; align-items: center; gap: .35rem; padding: 3rem 1.5rem; text-align: center; color: var(--dim); border: 1px dashed var(--db-line-strong); border-radius: 16px; }
.db-empty .db-btn { margin-top: .8rem; }
.db-empty-title { margin: .4rem 0 0; font-size: 16px; font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.db-empty-body { margin: 0; font-size: 14px; color: var(--muted); }

/* student view */
.db-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
.db-chart { display: block; width: 100%; height: auto; max-height: 200px; }
.db-grid-line { stroke: var(--divider); stroke-width: 1; }
.db-bar-good { fill: var(--db-good); }
.db-bar-mid { fill: var(--db-mid); }
.db-bar-low { fill: var(--db-low); }
.db-avail { padding: .85rem 1.1rem; }
.db-mine { display: flex; align-items: center; gap: 1rem; width: 100%; padding: .95rem 1.1rem; text-align: left; cursor: pointer; }
.db-mine > span:first-child { display: flex; flex-direction: column; gap: .15rem; }
.db-review { display: flex; flex-direction: column; gap: .6rem; }
.db-review-q { padding: .75rem .9rem; border-radius: 10px; font-size: 13.5px; border: 1px solid var(--divider); background: var(--surface); }
.db-review-q.is-right { border-color: color-mix(in srgb, var(--db-good) 35%, transparent); }
.db-review-q.is-wrong { border-color: color-mix(in srgb, var(--db-low) 40%, transparent); }
.db-review-q p { margin: 0; }
.db-review-text { margin-bottom: .4rem !important; color: var(--text); overflow-wrap: anywhere; }
.db-review-n { color: var(--db-focus); font-weight: 600; }
.db-right { color: var(--db-good); font-weight: 600; }
.db-wrong { color: var(--db-low); font-weight: 600; }

@keyframes db-open { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

/* layout depends on the width of the page area, not the screen, so it still
   works with the sidebar docked beside it */
@container db (min-width: 560px) {
  .db-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .db-toolbar { flex-direction: row; align-items: center; }
}
@container db (min-width: 760px) {
  .db-two { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); }
}
@container db (min-width: 800px) {
  .db-cols, .db-grid-quiz { grid-template-columns: minmax(0, 2.3fr) minmax(0, 1.4fr) minmax(0, 1.15fr) 6.25rem 5rem; }
  .db-cols-students, .db-grid-students { grid-template-columns: minmax(0, 1.8fr) 6.5rem minmax(0, 1.5fr) 4.5rem minmax(0, 1.1fr); }
  .db-cols { display: grid; gap: 1rem; padding: .7rem 1.1rem; font-size: 12.5px; font-weight: 600; color: var(--dim); border-bottom: 1px solid var(--divider); background: color-mix(in srgb, var(--text) 3%, var(--surface)); }
  .db-grid { align-items: center; }
  .db-titlebtn { grid-column: auto; }
  .db-lbl { display: none; }
}

@media (pointer: coarse) { .db-btn { height: 2.7rem; } }
@media (prefers-reduced-motion: reduce) {
  .db-root *, .db-root *::before, .db-root *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;