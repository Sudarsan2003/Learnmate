import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Download, Loader2, X, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { importStudents, listSchools } from "../api/client";

/**
 * "Import students" dialog in Manage users (ADMIN). Three steps:
 *   1. choose the school and an Excel/CSV class list (a template is offered)
 *   2. check it: the server validates every row without saving anything
 *   3. create the accounts, then download everyone's login details once
 * Rendered inside ManageUsers' .um-root, so it uses that page's um-* styles.
 */

const TEMPLATE = [
  ["Name", "Class", "Username", "Password", "Email", "Mobile"],
  ["Ravi Kumar", "9", "", "", "", ""],
  ["Priya Sharma", "9", "priya.s", "", "", ""],
];

function downloadText(filename, rows) {
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ImportStudents({ onClose, onImported }) {
  const [schools, setSchools] = useState([]);
  const [school, setSchool] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    listSchools()
      .then((list) => {
        if (cancelled) return;
        const active = list.filter((s) => s.active);
        setSchools(active);
        if (active.length === 1) setSchool(active[0].name);
      })
      .catch(() => {}); // no schools set up yet: the admin's own school is used
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function check() {
    setBusy(true);
    setError("");
    try {
      setPreview(await importStudents(file, { dryRun: true, institution: school || undefined }));
    } catch (err) {
      setError(err.response?.data?.message ?? "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await importStudents(file, { dryRun: false, institution: school || undefined });
      if (res.errors?.length) {
        // Something changed since the check (e.g. a username was taken meanwhile).
        setPreview(res);
      } else {
        setResult(res);
        onImported?.();
      }
    } catch (err) {
      setError(err.response?.data?.message ?? "Couldn't create the accounts.");
    } finally {
      setBusy(false);
    }
  }

  function downloadLogins() {
    downloadText(`student-logins-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Name", "Class", "Username", "Password"],
      ...result.rows.map((r) => [r.fullName, r.standard, r.username, r.password ?? "(as given in your file)"]),
    ]);
  }

  const reset = () => {
    setPreview(null);
    setFile(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return createPortal(
    <div className="um-root">
      <div className="um-center" onClick={busy ? undefined : onClose}>
        <div
          className="um-dialog is-wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="imp-title"
          onClick={(e) => e.stopPropagation()}
        >
          <style>{CSS}</style>
          <div className="imp-head">
            <h2 id="imp-title" className="um-display m-0 text-[22px]">Import students</h2>
            <button type="button" className="um-icon" onClick={onClose} disabled={busy} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {error && <p role="alert" className="um-inline-error mt-3">{error}</p>}

          {result ? (
            <div className="mt-4">
              <p className="imp-ok">
                <CheckCircle2 size={18} aria-hidden="true" /> Created {result.created} student {result.created === 1 ? "account" : "accounts"} in {result.institution}.
              </p>
              <p className="imp-note">
                Download the login details now. Generated passwords are shown only this once; students can change them
                after logging in.
              </p>
              <div className="imp-actions">
                <button type="button" className="um-btn um-btn-primary" onClick={downloadLogins} autoFocus>
                  <Download size={15} /> Download login details
                </button>
                <button type="button" className="um-btn um-btn-quiet" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : preview ? (
            <div className="mt-4">
              {preview.errors.length > 0 ? (
                <>
                  <p className="imp-warn">
                    <AlertTriangle size={18} aria-hidden="true" /> {preview.errors.length} {preview.errors.length === 1 ? "problem" : "problems"} to fix. Nothing has been created.
                  </p>
                  <ul className="imp-errors">
                    {preview.errors.map((e, i) => (
                      <li key={i}><strong>Row {e.row}:</strong> {e.message}</li>
                    ))}
                  </ul>
                  <p className="imp-note">Fix these in your spreadsheet, save it, and choose it again.</p>
                </>
              ) : (
                <p className="imp-ok">
                  <CheckCircle2 size={18} aria-hidden="true" /> {preview.rows.length} {preview.rows.length === 1 ? "student is" : "students are"} ready to add to {preview.institution}.
                </p>
              )}

              {preview.rows.length > 0 && (
                <div className="imp-table-wrap">
                  <table className="imp-table">
                    <thead>
                      <tr><th>Row</th><th>Name</th><th>Username</th><th>Class</th><th>Password</th></tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 200).map((r) => (
                        <tr key={r.row}>
                          <td>{r.row}</td>
                          <td>{r.fullName || "–"}</td>
                          <td>{r.username}{r.usernameGenerated && <span className="imp-tag">auto</span>}</td>
                          <td>{r.standard}</td>
                          <td>{r.passwordGenerated ? <span className="imp-tag">generated</span> : "from file"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 200 && <p className="imp-note">…and {preview.rows.length - 200} more.</p>}
                </div>
              )}

              <div className="imp-actions">
                <button type="button" className="um-btn um-btn-quiet" onClick={reset} disabled={busy}>
                  Choose another file
                </button>
                <button
                  type="button"
                  className="um-btn um-btn-primary"
                  onClick={create}
                  disabled={busy || preview.errors.length > 0 || preview.rows.length === 0}
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Create {preview.rows.length} {preview.rows.length === 1 ? "account" : "accounts"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="imp-note m-0">
                Upload the class list as an Excel (.xlsx) or CSV file. Only <strong>Name</strong> and <strong>Class</strong> are
                needed: usernames are made from names and passwords are generated, unless your file has its own.
              </p>
              <button type="button" className="um-btn um-btn-ghost um-btn-sm" onClick={() => downloadText("student-import-template.csv", TEMPLATE)}>
                <FileSpreadsheet size={15} /> Download template
              </button>

              {schools.length > 1 && (
                <label className="block">
                  <span className="um-label">School</span>
                  <select className="um-input" value={school} onChange={(e) => setSchool(e.target.value)}>
                    <option value="">Choose a school…</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="um-label">Class list</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="um-input imp-file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <div className="imp-actions">
                <button type="button" className="um-btn um-btn-quiet" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="um-btn um-btn-primary"
                  onClick={check}
                  disabled={busy || !file || (schools.length > 1 && !school)}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={15} />}
                  Check file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const CSS = `
.um-dialog.is-wide { width: min(100%, 44rem); max-height: calc(100vh - 2rem); overflow-y: auto; }
.imp-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.imp-note { font-size: 13.5px; line-height: 1.55; color: var(--muted); }
.imp-ok, .imp-warn { display: flex; align-items: center; gap: .5rem; margin: 0; font-size: 14.5px; font-weight: 600; }
.imp-ok { color: #0F8A5F; }
.imp-warn { color: var(--um-danger); }
.imp-errors { margin: .75rem 0 0; padding-left: 1.1rem; max-height: 10rem; overflow-y: auto; font-size: 13.5px; line-height: 1.6; }
.imp-table-wrap { margin-top: 1rem; max-height: 18rem; overflow: auto; border: 1px solid var(--divider); border-radius: 12px; }
.imp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.imp-table th, .imp-table td { padding: .45rem .65rem; border-bottom: 1px solid var(--divider); text-align: left; white-space: nowrap; }
.imp-table th { position: sticky; top: 0; background: var(--surface-2); font-size: 12px; color: var(--muted); }
.imp-tag { margin-left: .4rem; padding: .05rem .4rem; border-radius: 999px; font-size: 11px; font-weight: 600; color: var(--muted); background: var(--surface-2); }
.imp-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; margin-top: 1.25rem; }
.imp-file { padding-top: .45rem; height: auto; min-height: 2.5rem; }
`;
