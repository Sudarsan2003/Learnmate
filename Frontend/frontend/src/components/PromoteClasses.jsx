import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GraduationCap, Loader2, X, CheckCircle2, AlertTriangle, Undo2, ChevronDown } from "lucide-react";
import { getPromotionPlan, promoteClasses, undoPromotion } from "../api/client";

/**
 * "Year-end promotion" dialog in Manage users (ADMIN). Moves every class up
 * at once (9 -> 10, the top class -> "Passed out 2027"), with chosen students
 * held back, and offers to undo the most recent promotion.
 * Rendered inside ManageUsers' .um-root, so it uses that page's um-* styles.
 */

const fmt = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function PromoteClasses({ onClose, onChanged }) {
  const [plan, setPlan] = useState(null);
  const [targets, setTargets] = useState({});
  const [held, setHeld] = useState(new Set());
  const [open, setOpen] = useState(null); // class whose student list is expanded
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPromotionPlan()
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        setTargets(Object.fromEntries(p.classes.map((c) => [c.standard, c.suggestedTarget])));
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load classes."));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Every class name the admin might want, for the "Move to" suggestions.
  const options = useMemo(() => {
    if (!plan) return [];
    const set = new Set();
    plan.classes.forEach((c) => {
      set.add(c.standard);
      set.add(c.suggestedTarget);
    });
    for (let n = 1; n <= 12; n++) set.add(String(n));
    set.add(plan.passedOutLabel);
    return [...set];
  }, [plan]);

  const moving = plan
    ? plan.classes.reduce((n, c) => {
        const to = (targets[c.standard] ?? "").trim();
        if (!to || to === c.standard) return n;
        return n + c.students.filter((s) => !held.has(s.username)).length;
      }, 0)
    : 0;

  function toggleHeld(username) {
    setHeld((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  async function promote() {
    const summary = plan.classes
      .filter((c) => (targets[c.standard] ?? "").trim() && targets[c.standard].trim() !== c.standard)
      .map((c) => `Class ${c.standard} → ${targets[c.standard].trim()}`)
      .join("\n");
    if (!window.confirm(`Move ${moving} students?\n\n${summary}${held.size ? `\n\n${held.size} held back.` : ""}`)) return;
    setBusy(true);
    setError("");
    try {
      const clean = Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, (v ?? "").trim()]));
      setResult(await promoteClasses(clean, [...held]));
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message ?? "The promotion didn't go through. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!window.confirm("Undo the last promotion and put students back in their previous classes?")) return;
    setBusy(true);
    setError("");
    try {
      const r = await undoPromotion();
      setResult({ undone: r.restored });
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not undo.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="um-root">
      <div className="um-center" onClick={busy ? undefined : onClose}>
        <div className="um-dialog pc-dialog" role="dialog" aria-modal="true" aria-labelledby="pc-title" onClick={(e) => e.stopPropagation()}>
          <style>{CSS}</style>
          <div className="pc-head">
            <h2 id="pc-title" className="um-display m-0 text-[22px]">
              <GraduationCap size={22} aria-hidden="true" /> Year-end promotion
            </h2>
            <button type="button" className="um-icon" onClick={onClose} disabled={busy} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {error && <p role="alert" className="um-inline-error mt-3">{error}</p>}

          {result ? (
            <div className="mt-4">
              <p className="pc-ok">
                <CheckCircle2 size={18} aria-hidden="true" />
                {result.undone != null
                  ? `Undone: ${result.undone} students are back in their previous classes.`
                  : `Moved ${result.moved} students to their new classes${result.heldBack ? `; ${result.heldBack} held back` : ""}.`}
              </p>
              {result.undone == null && (
                <p className="pc-note">Made a mistake? Open Year-end promotion again and choose Undo.</p>
              )}
              <div className="pc-actions">
                <button type="button" className="um-btn um-btn-primary" onClick={onClose} autoFocus>Done</button>
              </div>
            </div>
          ) : !plan ? (
            !error && <p className="pc-note mt-4"><Loader2 size={14} className="animate-spin" /> Loading classes…</p>
          ) : (
            <>
              {plan.last && !plan.last.undone && (
                <div className="pc-last">
                  <span>
                    Last promotion: {fmt(plan.last.at)} by {plan.last.doneBy}, {plan.last.moved} students moved.
                  </span>
                  <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={undo} disabled={busy}>
                    <Undo2 size={14} /> Undo
                  </button>
                </div>
              )}

              <p className="pc-warn">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  Print or download this year&apos;s <strong>Class reports</strong> first. Reports list students by their
                  current class, so after promoting, Class 9&apos;s report will show next year&apos;s Class 9.
                </span>
              </p>

              {plan.classes.length === 0 ? (
                <p className="pc-note">No students have a class set yet.</p>
              ) : (
                <div className="pc-table">
                  <div className="pc-row pc-row-head">
                    <span>Class now</span><span>Students</span><span>Move to</span><span>Hold back</span>
                  </div>
                  {plan.classes.map((c) => {
                    const heldHere = c.students.filter((s) => held.has(s.username)).length;
                    const stays = (targets[c.standard] ?? "").trim() === c.standard;
                    return (
                      <div key={c.standard} className="pc-class">
                        <div className="pc-row">
                          <span className="pc-class-name">Class {c.standard}</span>
                          <span>{c.studentCount}</span>
                          <span>
                            <input
                              className="um-input pc-target"
                              list="pc-options"
                              value={targets[c.standard] ?? ""}
                              onChange={(e) => setTargets((t) => ({ ...t, [c.standard]: e.target.value }))}
                              aria-label={`Move Class ${c.standard} to`}
                            />
                            {stays && <small className="pc-stays">Stays in Class {c.standard}</small>}
                          </span>
                          <span>
                            <button
                              type="button"
                              className="um-btn um-btn-ghost um-btn-sm"
                              aria-expanded={open === c.standard}
                              onClick={() => setOpen((o) => (o === c.standard ? null : c.standard))}
                            >
                              {heldHere ? `${heldHere} held` : "Choose"} <ChevronDown size={14} />
                            </button>
                          </span>
                        </div>
                        {open === c.standard && (
                          <ul className="pc-students">
                            {c.students.map((s) => (
                              <li key={s.username}>
                                <label>
                                  <input type="checkbox" checked={held.has(s.username)} onChange={() => toggleHeld(s.username)} />
                                  {s.fullName || s.username}
                                  {s.fullName && <span className="pc-user">{s.username}</span>}
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  <datalist id="pc-options">
                    {options.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </div>
              )}

              <div className="pc-actions">
                <button type="button" className="um-btn um-btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="button" className="um-btn um-btn-primary" onClick={promote} disabled={busy || moving === 0}>
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Promote {moving} {moving === 1 ? "student" : "students"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const CSS = `
.um-dialog.pc-dialog { width: min(100%, 46rem); max-height: calc(100vh - 2rem); overflow-y: auto; }
.pc-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.pc-head h2 { display: flex; align-items: center; gap: .5rem; }
.pc-note { display: flex; align-items: center; gap: .4rem; font-size: 13.5px; color: var(--muted); }
.pc-ok { display: flex; align-items: center; gap: .5rem; margin: 0; font-size: 14.5px; font-weight: 600; color: #0F8A5F; }
.pc-warn { display: flex; gap: .5rem; margin: 1rem 0 0; padding: .7rem .85rem; border-radius: 12px; font-size: 13px; line-height: 1.5; color: var(--text); background: color-mix(in srgb, #F2B705 14%, var(--surface)); }
.pc-warn svg { flex-shrink: 0; margin-top: 2px; color: #B8860B; }
.pc-last { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; margin-top: 1rem; padding: .6rem .85rem; border-radius: 12px; font-size: 13px; background: var(--surface-2); }
.pc-table { margin-top: 1rem; border: 1px solid var(--divider); border-radius: 12px; overflow: hidden; }
.pc-row { display: grid; grid-template-columns: 1.1fr .7fr 1.6fr 1fr; gap: .75rem; align-items: center; padding: .55rem .85rem; font-size: 13.5px; }
.pc-row-head { font-size: 12px; font-weight: 700; color: var(--muted); background: var(--surface-2); }
.pc-class + .pc-class, .pc-row-head + .pc-class { border-top: 1px solid var(--divider); }
.pc-class-name { font-weight: 700; }
.pc-target { height: 2.2rem; width: 100%; }
.pc-stays { display: block; margin-top: .2rem; font-size: 11.5px; color: var(--dim); }
.pc-students { margin: 0; padding: .3rem .85rem .7rem 2rem; list-style: none; columns: 2; font-size: 13px; }
.pc-students li { break-inside: avoid; padding: .15rem 0; }
.pc-students label { display: inline-flex; align-items: center; gap: .45rem; cursor: pointer; }
.pc-user { margin-left: .3rem; font-size: 11.5px; color: var(--dim); }
.pc-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; margin-top: 1.25rem; }
@media (max-width: 560px) { .pc-row { grid-template-columns: 1fr 1fr; } .pc-students { columns: 1; } }
`;
