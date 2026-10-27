import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Copy, Plus, RefreshCw } from "lucide-react";
import { createSchool, listSchools, regenerateSchoolCode, setSchoolActive } from "../api/client";

// "Schools" tab of Manage users (ADMIN only). Each customer school gets a
// join code; students enter it at sign-up and are placed in that school.
// Rendered inside ManageUsers, so it uses that page's um-* styles.

export default function SchoolsView() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSchools(await listSchools());
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load schools.");
    } finally {
      setLoading(false);
    }
  }, []);

  // First load (loading already starts true); "Try again" uses load() above.
  useEffect(() => {
    let cancelled = false;
    listSchools()
      .then((data) => !cancelled && setSchools(data))
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load schools."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps the member count (only sent by the list endpoint) when replacing a row.
  function replace(updated) {
    setSchools((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      const school = await createSchool(name.trim());
      setSchools((prev) => [...prev, school].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (err) {
      setFormError(err.response?.data?.message ?? "Could not add that school.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerate(school) {
    const ok = window.confirm(
      `Issue a new code for ${school.name}? The current code (${school.joinCode}) will stop working for new sign-ups.`
    );
    if (!ok) return;
    setBusyId(school.id);
    try {
      replace(await regenerateSchoolCode(school.id));
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not issue a new code.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(school) {
    setBusyId(school.id);
    try {
      replace(await setSchoolActive(school.id, !school.active));
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not update that school.");
    } finally {
      setBusyId(null);
    }
  }

  function handleCopy(school) {
    navigator.clipboard?.writeText(school.joinCode).then(() => {
      setCopiedId(school.id);
      setTimeout(() => setCopiedId((c) => (c === school.id ? null : c)), 1500);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={handleCreate} className="um-card px-5 py-4">
        <label htmlFor="new-school" className="um-label">
          Add a school
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="new-school"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="School name, e.g. Sri Vidya High School"
            className="um-input min-w-0 flex-1"
            disabled={creating}
          />
          <button type="submit" className="um-btn um-btn-primary" disabled={creating || !name.trim()}>
            <Plus size={15} /> {creating ? "Adding…" : "Add school"}
          </button>
        </div>
        {formError && <p className="um-inline-error mt-2">{formError}</p>}
        <p className="um-dim mt-2 text-[13px]">
          Each school gets a sign-up code. Share it with that school&apos;s students and teachers; they enter it when
          creating an account.
        </p>
      </form>

      {error && (
        <div className="um-empty" role="alert">
          <p className="um-empty-title">{error}</p>
          <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={load}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="um-card px-5 py-4" aria-busy="true" aria-label="Loading schools">
          <span className="block h-4 w-1/3 animate-pulse rounded um-skel" />
          <span className="mt-3 block h-3 w-1/2 animate-pulse rounded um-skel" />
        </div>
      ) : schools.length === 0 ? (
        <div className="um-empty">
          <Building2 size={26} aria-hidden="true" />
          <p className="um-empty-title">No schools yet</p>
          <p className="um-empty-body">Add your first school above to get its sign-up code.</p>
        </div>
      ) : (
        <ul className="um-card divide-y divide-[var(--um-line-strong)]">
          {schools.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="um-display um-truncate font-semibold">{s.name}</p>
                <p className="um-dim mt-0.5 text-[13px]">
                  {s.memberCount ?? 0} {s.memberCount === 1 ? "person" : "people"}
                  {!s.active && <span className="um-pill um-pill-danger ml-2">Sign-ups paused</span>}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <code
                  className="rounded-lg border border-[var(--um-line-strong)] px-3 py-1.5 font-mono text-[14px] tracking-[0.2em]"
                  aria-label={`Sign-up code ${s.joinCode.split("").join(" ")}`}
                >
                  {s.joinCode}
                </code>
                <button
                  type="button"
                  className="um-icon"
                  onClick={() => handleCopy(s)}
                  aria-label={`Copy sign-up code for ${s.name}`}
                  title="Copy code"
                >
                  {copiedId === s.id ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  type="button"
                  className="um-btn um-btn-quiet um-btn-sm"
                  onClick={() => handleRegenerate(s)}
                  disabled={busyId === s.id}
                >
                  New code
                </button>
                <button
                  type="button"
                  className="um-btn um-btn-ghost um-btn-sm"
                  onClick={() => handleToggle(s)}
                  disabled={busyId === s.id}
                >
                  {s.active ? "Pause sign-ups" : "Resume sign-ups"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
