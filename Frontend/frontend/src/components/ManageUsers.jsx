import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  RefreshCw,
  Loader2,
  Check,
  Building2,
  X,
  Pencil,
  KeyRound,
  Trash2,
  Lock,
  Unlock,
  Search,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  User,
  FileUp,
} from "lucide-react";
import {
  listUsers,
  updateUserRole,
  updateUserProfile,
  resetUserPassword,
  listInstitutions,
  deleteUser,
  setUserLocked,
} from "../api/client";
import ThemeToggle from "./ThemeToggle";
import SchoolsView from "./SchoolsView";
import ImportStudents from "./ImportStudents";
import PromoteClasses from "./PromoteClasses";

/* -------------------------------------------------------------------------- */
/*  constants + helpers                                                        */
/* -------------------------------------------------------------------------- */

const ROLES = ["USER", "TEACHER", "ADMIN"];

const ROLE_META = {
  USER: { label: "Student", token: "user" },
  TEACHER: { label: "Teacher", token: "teacher" },
  ADMIN: { label: "Admin", token: "admin" },
};

const roleMeta = (role) => ROLE_META[role] ?? { label: role || "Unknown", token: "user" };
const roleVars = (role) => ({ "--role": `var(--um-${roleMeta(role).token})` });

const GENDER_LABEL = {
  female: "Female",
  male: "Male",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

const FILTERS = [
  { id: "all", label: "Everyone" },
  { id: "USER", label: "Students" },
  { id: "TEACHER", label: "Teachers" },
  { id: "ADMIN", label: "Admins" },
  { id: "LOCKED", label: "Locked" },
];

function initialsFor(name) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

const lc = (v) => (v == null ? "" : String(v).toLowerCase());

// One search token has to match somewhere on the user. Short tokens are kept
// strict on purpose (class "5" shouldn't match every phone number, "st"
// shouldn't match every student).
function tokenMatches(u, t) {
  if (lc(u.username).includes(t) || lc(u.email).includes(t) || lc(u.institution).includes(t)) return true;
  const standard = lc(u.standard);
  if (standard && (standard === t || (t.length > 1 && standard.includes(t)))) return true;
  if (t.length >= 3) {
    if (lc(u.mobile).includes(t)) return true;
    if (lc(roleMeta(u.role).label).startsWith(t)) return true;
    if (u.locked && "locked".startsWith(t)) return true;
  }
  return false;
}

const matchesAll = (u, tokens) => tokens.every((t) => tokenMatches(u, t));

/* -------------------------------------------------------------------------- */
/*  small shared pieces                                                        */
/* -------------------------------------------------------------------------- */

function Highlight({ text, tokens }) {
  const str = text == null ? "" : String(text);
  if (!tokens.length || !str) return <>{str}</>;
  const pattern = tokens
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const parts = str.split(new RegExp(`(${pattern})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="um-mark">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function Avatar({ name, role, size = 40 }) {
  return (
    <span
      className="um-avatar"
      style={{ ...roleVars(role), width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="um-label">{label}</span>
      {children}
    </label>
  );
}

// Escape to close, keep Tab inside the dialog, and hand focus back to
// whatever opened it.
function useDialog(ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const previouslyFocused = document.activeElement;
    const focusable =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll(focusable)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [ref]);
}

function Toast({ message, onDismiss }) {
  return createPortal(
    <div className="um-root um-toast-wrap">
      <div role="alert" className="um-toast">
        <span className="um-toast-text">{message}</span>
        <button type="button" className="um-toast-x" onClick={onDismiss} aria-label="Dismiss message">
          <X size={15} />
        </button>
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/*  page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ManageUsers({ currentUsername }) {
  const [viewMode, setViewMode] = useState("all"); // "all" | "institutions" | "schools"
  const [importing, setImporting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // the list itself failed to load
  const [error, setError] = useState(null); // an action failed (shown as a toast)
  const [updatingUsername, setUpdatingUsername] = useState(null);
  const [profileDrafts, setProfileDrafts] = useState({}); // username -> { institution, standard }
  const [savingProfileUsername, setSavingProfileUsername] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingUsername, setDeletingUsername] = useState(null);
  const [lockingUsername, setLockingUsername] = useState(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [expanded, setExpanded] = useState(null); // username of the open row
  const [refreshTick, setRefreshTick] = useState(0);
  const searchRef = useRef(null);

  const draftFor = (u) => ({ institution: u.institution || "", standard: u.standard || "" });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listUsers();
      setUsers(data);
      setProfileDrafts(Object.fromEntries(data.map((u) => [u.username, draftFor(u)])));
    } catch (err) {
      setLoadError(err.response?.data?.message ?? "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Action errors are a toast so they're visible however far down the list
  // you've scrolled; they clear themselves after a few seconds.
  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(id);
  }, [error]);

  // Press "/" anywhere on the page to jump to search.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------ handlers ------------------------------ */

  const handleRoleChange = async (username, newRole) => {
    setUpdatingUsername(username);
    setError(null);
    try {
      await updateUserRole(username, newRole);
      setUsers((prev) => prev.map((u) => (u.username === username ? { ...u, role: newRole } : u)));
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not update role for ${username}.`);
    } finally {
      setUpdatingUsername(null);
    }
  };

  const updateDraft = (username, field, value) =>
    setProfileDrafts((prev) => ({ ...prev, [username]: { ...prev[username], [field]: value } }));

  const draftChanged = (u) => {
    const draft = profileDrafts[u.username] || {};
    return draft.institution !== (u.institution || "") || draft.standard !== (u.standard || "");
  };

  const discardDraft = (u) => setProfileDrafts((prev) => ({ ...prev, [u.username]: draftFor(u) }));

  const handleProfileSave = async (u) => {
    const draft = profileDrafts[u.username] || {};
    if (u.role !== "ADMIN" && (!draft.institution || !draft.institution.trim())) {
      setError("Institution can't be blank.");
      return;
    }
    setSavingProfileUsername(u.username);
    setError(null);
    try {
      const updated = await updateUserProfile(u.username, {
        institution: draft.institution?.trim() || "",
        standard: draft.standard?.trim() || "",
      });
      setUsers((prev) =>
        prev.map((row) =>
          row.username === u.username ? { ...row, institution: updated.institution, standard: updated.standard } : row
        )
      );
      setProfileDrafts((prev) => ({ ...prev, [u.username]: draftFor(updated) }));
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not update profile for ${u.username}.`);
    } finally {
      setSavingProfileUsername(null);
    }
  };

  // Admins aren't scoped to an institution, so this clears anything left over
  // from before they were promoted.
  const handleClearAdminScope = async (u) => {
    setSavingProfileUsername(u.username);
    setError(null);
    try {
      const updated = await updateUserProfile(u.username, { institution: "", standard: "" });
      setUsers((prev) =>
        prev.map((row) =>
          row.username === u.username ? { ...row, institution: updated.institution, standard: updated.standard } : row
        )
      );
      setProfileDrafts((prev) => ({ ...prev, [u.username]: { institution: "", standard: "" } }));
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not clear scope for ${u.username}.`);
    } finally {
      setSavingProfileUsername(null);
    }
  };

  const handleDeleteUser = async (username) => {
    setDeletingUsername(username);
    setError(null);
    try {
      await deleteUser(username);
      setUsers((prev) => prev.filter((u) => u.username !== username));
      setExpanded((cur) => (cur === username ? null : cur));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not delete ${username}.`);
    } finally {
      setDeletingUsername(null);
    }
  };

  // Flips User.locked; the backend's JWT filter rejects that user's next
  // request with 403, so no logout is needed.
  const handleToggleLock = async (u) => {
    setLockingUsername(u.username);
    setError(null);
    try {
      const updated = await setUserLocked(u.username, !u.locked);
      setUsers((prev) => prev.map((row) => (row.username === u.username ? { ...row, locked: updated.locked } : row)));
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not update lock for ${u.username}.`);
    } finally {
      setLockingUsername(null);
    }
  };

  const handleRefresh = () => {
    if (viewMode === "all") loadUsers();
    else setRefreshTick((t) => t + 1);
  };

  /* ------------------------------ derived ------------------------------ */

  const tokens = useMemo(() => tokenize(query), [query]);

  // Tab counts follow the search, so typing narrows the numbers as well.
  const searched = useMemo(() => users.filter((u) => matchesAll(u, tokens)), [users, tokens]);

  const counts = useMemo(
    () => ({
      all: searched.length,
      USER: searched.filter((u) => u.role === "USER").length,
      TEACHER: searched.filter((u) => u.role === "TEACHER").length,
      ADMIN: searched.filter((u) => u.role === "ADMIN").length,
      LOCKED: searched.filter((u) => u.locked).length,
    }),
    [searched]
  );

  const visible = useMemo(() => {
    if (roleFilter === "all") return searched;
    if (roleFilter === "LOCKED") return searched.filter((u) => u.locked);
    return searched.filter((u) => u.role === roleFilter);
  }, [searched, roleFilter]);

  const filtersActive = tokens.length > 0 || roleFilter !== "all";
  const noun = (n) => (n === 1 ? "person" : "people");
  const summary = loading
    ? ""
    : filtersActive
    ? `${visible.length} of ${users.length} ${noun(users.length)}`
    : `${users.length} ${noun(users.length)}`;

  const clearFilters = () => {
    setQuery("");
    setRoleFilter("all");
    searchRef.current?.focus();
  };

  /* ------------------------------- render ------------------------------- */

  return (
    <div className="um-root min-h-full bg-[var(--bg)] px-4 pb-16 pt-6 text-[var(--text)] sm:px-8 sm:pt-9">
      <style>{CSS}</style>

      <div className="mx-auto max-w-[960px]">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="um-display m-0 text-[28px] leading-tight sm:text-[34px]">Manage users</h1>
            <p className="mt-2 max-w-[50ch] text-[14.5px] leading-relaxed text-[var(--muted)]">
              Promote students to teachers, set their institution and class, pause access, or remove accounts.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <ThemeToggle />
            <button type="button" className="um-btn um-btn-quiet" onClick={() => setImporting(true)}>
              <FileUp size={15} />
              Import students
            </button>
            <button type="button" className="um-btn um-btn-quiet" onClick={() => setPromoting(true)}>
              <GraduationCap size={15} />
              Year-end promotion
            </button>
            <button
              type="button"
              className="um-btn um-btn-quiet"
              onClick={handleRefresh}
              disabled={viewMode === "all" && loading}
            >
              <RefreshCw size={15} className={viewMode === "all" && loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </header>

        {importing && <ImportStudents onClose={() => setImporting(false)} onImported={loadUsers} />}
        {promoting && <PromoteClasses onClose={() => setPromoting(false)} onChanged={loadUsers} />}

        <div className="um-toolbar">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="um-search sm:flex-1">
              <Search size={18} className="um-search-ico" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder={viewMode === "all" ? "Search by username, email, institution or class" : "Search institutions or people"}
                aria-label={viewMode === "all" ? "Search users" : "Search institutions and people"}
              />
              {query ? (
                <button type="button" className="um-search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">
                  <X size={15} />
                </button>
              ) : (
                <kbd className="um-kbd" aria-hidden="true">/</kbd>
              )}
            </div>

            <div className="um-seg" role="group" aria-label="Group users by">
              <button type="button" aria-pressed={viewMode === "all"} onClick={() => setViewMode("all")}>
                All users
              </button>
              <button type="button" aria-pressed={viewMode === "institutions"} onClick={() => setViewMode("institutions")}>
                By institution
              </button>
              <button type="button" aria-pressed={viewMode === "schools"} onClick={() => setViewMode("schools")}>
                Schools
              </button>
            </div>
          </div>
        </div>

        {viewMode === "schools" ? (
          <SchoolsView />
        ) : viewMode === "institutions" ? (
          <InstitutionsView tokens={tokens} query={query} refreshTick={refreshTick} onClear={clearFilters} />
        ) : (
          <>
            <div className="um-tabs" role="group" aria-label="Filter by role">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="um-tab"
                  aria-pressed={roleFilter === f.id}
                  onClick={() => setRoleFilter(f.id)}
                >
                  {f.label}
                  <span className="um-count">{loading ? "–" : counts[f.id]}</span>
                </button>
              ))}
            </div>

            <p className="um-summary" aria-live="polite">
              {summary || "\u00A0"}
            </p>

            {loadError ? (
              <div className="um-empty" role="alert">
                <p className="um-empty-title">{loadError}</p>
                <p className="um-empty-body">Check your connection, then try again.</p>
                <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={loadUsers}>
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            ) : loading ? (
              <div className="um-card" aria-busy="true" aria-label="Loading users">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="um-row flex items-center gap-4 px-5 py-4">
                    <span className="h-10 w-10 flex-shrink-0 animate-pulse rounded-full um-skel" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3.5 w-1/3 animate-pulse rounded um-skel" />
                      <span className="block h-3 w-1/2 animate-pulse rounded um-skel" />
                    </span>
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="um-empty">
                <Users size={26} aria-hidden="true" />
                <p className="um-empty-title">No accounts yet</p>
                <p className="um-empty-body">People show up here as soon as they register.</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="um-empty">
                <Search size={26} aria-hidden="true" />
                <p className="um-empty-title">
                  {tokens.length ? <>No one matches “{query.trim()}”</> : "No one in this group yet"}
                </p>
                <p className="um-empty-body">
                  {tokens.length
                    ? "Try a username, email, institution or class."
                    : "Choose another tab to see everyone else."}
                </p>
                <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={clearFilters}>
                  Clear search and filters
                </button>
              </div>
            ) : (
              <ul className="um-card m-0 list-none p-0">
                {visible.map((u) => (
                  <UserRow
                    key={u.id ?? u.username}
                    u={u}
                    tokens={tokens}
                    isSelf={u.username === currentUsername}
                    isOpen={expanded === u.username}
                    onToggle={() => setExpanded((cur) => (cur === u.username ? null : u.username))}
                    draft={profileDrafts[u.username] || draftFor(u)}
                    dirty={draftChanged(u)}
                    updating={updatingUsername === u.username}
                    saving={savingProfileUsername === u.username}
                    locking={lockingUsername === u.username}
                    onDraft={(field, value) => updateDraft(u.username, field, value)}
                    onRoleChange={(role) => handleRoleChange(u.username, role)}
                    onSave={() => handleProfileSave(u)}
                    onDiscard={() => discardDraft(u)}
                    onClearScope={() => handleClearAdminScope(u)}
                    onToggleLock={() => handleToggleLock(u)}
                    onEdit={() => setEditingUser(u)}
                    onDelete={() => setDeleteTarget(u)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {editingUser && (
        <EditUserDrawer
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((row) => (row.username === updated.username ? { ...row, ...updated } : row)));
            setProfileDrafts((prev) => ({ ...prev, [updated.username]: draftFor(updated) }));
            setEditingUser(null);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteUserDialog
          user={deleteTarget}
          deleting={deletingUsername === deleteTarget.username}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteUser(deleteTarget.username)}
        />
      )}

      {error && <Toast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  a single user row                                                          */
/* -------------------------------------------------------------------------- */

function ScopeCell({ u, tokens }) {
  if (u.role === "ADMIN" && !u.institution && !u.standard) {
    return <p className="um-scope um-scope-quiet">Not tied to an institution</p>;
  }
  const showClass = u.role === "USER" || !!u.standard;
  return (
    <div className="um-scope">
      <p className={`um-scope-line ${u.institution ? "" : "um-warn"}`}>
        <Building2 size={14} aria-hidden="true" />
        <span className="um-truncate">
          {u.institution ? <Highlight text={u.institution} tokens={tokens} /> : "No institution set"}
        </span>
      </p>
      {showClass && (
        <p className={`um-scope-line ${u.standard ? "" : "um-warn"}`}>
          <GraduationCap size={14} aria-hidden="true" />
          <span className="um-truncate">
            {u.standard ? (
              <>
                Class <Highlight text={u.standard} tokens={tokens} />
              </>
            ) : (
              "No class set"
            )}
          </span>
        </p>
      )}
    </div>
  );
}

function RoleSelect({ user, disabled, updating, onChange }) {
  return (
    <label className="um-role" style={roleVars(user.role)} title={disabled && !updating ? "You can't change your own role" : undefined}>
      <span className="sr-only">Role for {user.username}</span>
      {updating ? (
        <Loader2 size={12} className="um-role-lead animate-spin" />
      ) : (
        <span className="um-role-lead um-dot" />
      )}
      <select value={user.role} disabled={disabled || updating} onChange={(e) => onChange(e.target.value)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_META[r].label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="um-role-chev" aria-hidden="true" />
    </label>
  );
}

function UserRow({
  u,
  tokens,
  isSelf,
  isOpen,
  onToggle,
  draft,
  dirty,
  updating,
  saving,
  locking,
  onDraft,
  onRoleChange,
  onSave,
  onDiscard,
  onClearScope,
  onToggleLock,
  onEdit,
  onDelete,
}) {
  const panelId = `um-panel-${u.id ?? u.username}`;
  const hasScope = !!(u.institution || u.standard);

  return (
    <li className="um-row" data-locked={u.locked ? "true" : undefined}>
      <div className="grid items-center gap-x-5 gap-y-3 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_8.75rem_7.5rem]">
        <button type="button" className="um-who" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle}>
          <Avatar name={u.username} role={u.role} />
          <span className="min-w-0 flex-1">
            <span className="um-name">
              <span className="um-name-text">
                <Highlight text={u.username} tokens={tokens} />
              </span>
              {isSelf && <span className="um-pill um-pill-quiet">You</span>}
              {u.locked && (
                <span className="um-pill um-pill-danger">
                  <Lock size={10} strokeWidth={2.75} aria-hidden="true" />
                  Locked
                </span>
              )}
            </span>
            <span className="um-sub">
              {u.email ? <Highlight text={u.email} tokens={tokens} /> : <span className="um-dim">No email on file</span>}
            </span>
          </span>
          <ChevronDown size={16} className="um-chevron" aria-hidden="true" />
        </button>

        <ScopeCell u={u} tokens={tokens} />

        <div className="flex items-center justify-between gap-3 md:contents">
          <RoleSelect user={u} disabled={isSelf} updating={updating} onChange={onRoleChange} />
          <div className="flex items-center justify-end gap-0.5">
            <button type="button" className="um-icon" onClick={onEdit} aria-label={`Edit ${u.username}`} title="Edit details or reset password">
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="um-icon"
              data-on={u.locked ? "true" : undefined}
              onClick={onToggleLock}
              disabled={isSelf || locking}
              aria-label={u.locked ? `Unlock ${u.username}` : `Lock ${u.username}`}
              title={
                isSelf ? "You can't lock your own account" : u.locked ? "Unlock account" : "Lock account (blocks quiz & chat)"
              }
            >
              {locking ? <Loader2 size={16} className="animate-spin" /> : u.locked ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
            <button
              type="button"
              className="um-icon um-icon-danger"
              onClick={onDelete}
              disabled={isSelf}
              aria-label={`Delete ${u.username}`}
              title={isSelf ? "You can't delete your own account" : "Delete user"}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div id={panelId} className="um-panel">
          <div className="grid gap-7 px-4 py-5 sm:grid-cols-2 sm:px-5">
            <section>
              <h3 className="um-h3">Institution and class</h3>
              {u.role === "ADMIN" ? (
                <div className="space-y-3">
                  <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
                    Admins can see every institution, so they don't have an institution or class of their own.
                  </p>
                  {hasScope && (
                    <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={onClearScope} disabled={saving}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      Clear leftover institution and class
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Field label="Institution">
                    <input
                      className="um-input"
                      value={draft.institution}
                      onChange={(e) => onDraft("institution", e.target.value)}
                      placeholder="School or college name"
                    />
                  </Field>
                  <Field label="Class">
                    <input
                      className="um-input"
                      value={draft.standard}
                      onChange={(e) => onDraft("standard", e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && dirty && !saving && onSave()}
                      placeholder="e.g. 5"
                    />
                  </Field>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" className="um-btn um-btn-primary um-btn-sm" onClick={onSave} disabled={!dirty || saving}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Save
                    </button>
                    {dirty && !saving && (
                      <button type="button" className="um-btn um-btn-ghost um-btn-sm" onClick={onDiscard}>
                        Discard
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section>
              <h3 className="um-h3">Contact</h3>
              <dl className="m-0 space-y-3">
                <ContactLine icon={<Mail size={15} />} label="Email" value={u.email} />
                <ContactLine icon={<Phone size={15} />} label="Mobile" value={u.mobile} />
                <ContactLine icon={<User size={15} />} label="Gender" value={GENDER_LABEL[u.gender] ?? u.gender} />
                <ContactLine icon={<MapPin size={15} />} label="Address" value={u.address} />
              </dl>
              <button type="button" className="um-btn um-btn-quiet um-btn-sm mt-4" onClick={onEdit}>
                <Pencil size={14} />
                Edit all details
              </button>
            </section>
          </div>
        </div>
      )}
    </li>
  );
}

function ContactLine({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--dim)]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] text-[var(--dim)]">{label}</dt>
        <dd className={`m-0 break-words text-[14px] ${value ? "text-[var(--text)]" : "um-dim"}`}>{value || "Not provided"}</dd>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  delete dialog                                                              */
/* -------------------------------------------------------------------------- */

function DeleteUserDialog({ user, deleting, onCancel, onConfirm }) {
  const ref = useRef(null);
  useDialog(ref, deleting ? undefined : onCancel);

  return createPortal(
    <div className="um-root">
      <div className="um-center" onClick={deleting ? undefined : onCancel}>
        <div
          ref={ref}
          className="um-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="um-del-title"
          aria-describedby="um-del-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="um-dialog-icon" aria-hidden="true">
            <Trash2 size={20} />
          </span>
          <h2 id="um-del-title" className="um-display m-0 text-[22px]">
            Delete {user.username}?
          </h2>
          <p id="um-del-desc" className="mb-0 mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
            This permanently removes the {roleMeta(user.role).label.toLowerCase()} account. It can't be undone.
          </p>
          <div className="mt-6 flex items-center justify-end gap-2">
            <button type="button" className="um-btn um-btn-quiet" onClick={onCancel} disabled={deleting} autoFocus>
              Cancel
            </button>
            <button type="button" className="um-btn um-btn-danger" onClick={onConfirm} disabled={deleting}>
              {deleting && <Loader2 size={14} className="animate-spin" />}
              Delete user
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/*  edit drawer                                                                */
/* -------------------------------------------------------------------------- */

function EditUserDrawer({ user, onClose, onSaved }) {
  const ref = useRef(null);
  useDialog(ref, onClose);

  const [form, setForm] = useState({
    fullName: user.fullName || "",
    email: user.email || "",
    mobile: user.mobile || "",
    gender: user.gender || "",
    address: user.address || "",
    institution: user.institution || "",
    standard: user.standard || "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (user.role !== "ADMIN" && !form.institution.trim()) {
      setError("Institution can't be blank for a non-admin user.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUserProfile(user.username, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        gender: form.gender.trim(),
        address: form.address.trim(),
        institution: form.institution.trim(),
        standard: form.standard.trim(),
      });
      onSaved(updated);
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not save changes for ${user.username}.`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setResetting(true);
    setError(null);
    setPasswordMessage(null);
    try {
      await resetUserPassword(user.username, newPassword);
      setPasswordMessage("Password reset. Share the new one with them securely.");
      setNewPassword("");
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not reset password for ${user.username}.`);
    } finally {
      setResetting(false);
    }
  };

  // Portaled to <body> so `fixed` is measured against the viewport even if a
  // parent ever gains a transform.
  return createPortal(
    <div className="um-root">
      <div className="um-scrim" onClick={onClose} />
      <aside ref={ref} className="um-drawer" role="dialog" aria-modal="true" aria-labelledby="um-edit-title">
        <header className="um-drawer-head">
          <Avatar name={user.username} role={user.role} size={44} />
          <div className="min-w-0 flex-1">
            <h2 id="um-edit-title" className="um-display m-0 truncate text-[22px] leading-tight">
              {user.username}
            </h2>
            <span className="um-pill um-pill-role mt-1" style={roleVars(user.role)}>
              {roleMeta(user.role).label}
            </span>
          </div>
          <button type="button" className="um-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="um-drawer-body">
          {error && (
            <p role="alert" className="um-inline-error">
              {error}
            </p>
          )}

          <form id="um-edit-form" onSubmit={handleSave} className="space-y-7">
            <section className="space-y-3.5">
              <h3 className="um-h3">Contact</h3>
              <Field label="Full name (shown on report cards)">
                <input
                  className="um-input"
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="um-input"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </Field>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Mobile">
                  <input className="um-input" value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} />
                </Field>
                <Field label="Gender">
                  <select className="um-input" value={form.gender} onChange={(e) => setField("gender", e.target.value)}>
                    <option value="">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </Field>
              </div>
              <Field label="Address">
                <textarea
                  rows={2}
                  className="um-input"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                />
              </Field>
            </section>

            <section className="space-y-3.5">
              <h3 className="um-h3">Institution and class</h3>
              {user.role === "ADMIN" ? (
                <p className="m-0 text-[13.5px] leading-relaxed text-[var(--muted)]">
                  Admins aren't tied to an institution or class. If old values are still showing, clear them from the
                  user's row.
                </p>
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-[1fr_7rem]">
                  <Field label="Institution">
                    <input
                      className="um-input"
                      value={form.institution}
                      onChange={(e) => setField("institution", e.target.value)}
                    />
                  </Field>
                  <Field label="Class">
                    <input
                      className="um-input"
                      value={form.standard}
                      onChange={(e) => setField("standard", e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </section>
          </form>

          <section className="um-reset">
            <h3 className="um-h3 flex items-center gap-1.5">
              <KeyRound size={14} aria-hidden="true" />
              Reset password
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="password"
                autoComplete="new-password"
                className="um-input flex-1"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newPassword && !resetting) handleResetPassword();
                  }
                }}
                placeholder="New password, at least 6 characters"
                aria-label="New password"
              />
              <button
                type="button"
                className="um-btn um-btn-quiet flex-shrink-0"
                onClick={handleResetPassword}
                disabled={resetting || !newPassword}
              >
                {resetting && <Loader2 size={14} className="animate-spin" />}
                Reset
              </button>
            </div>
            {passwordMessage && (
              <p role="status" className="um-ok">
                <Check size={14} aria-hidden="true" /> {passwordMessage}
              </p>
            )}
          </section>
        </div>

        <footer className="um-drawer-foot">
          <button type="button" className="um-btn um-btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="um-edit-form" className="um-btn um-btn-primary" disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/*  by-institution view                                                        */
/* -------------------------------------------------------------------------- */

function InstitutionsView({ tokens, query, refreshTick, onClear }) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listInstitutions();
      setInstitutions(data);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load institutions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  // A user matches when every search word hits either their institution's
  // name or one of their own fields.
  const groups = useMemo(
    () =>
      institutions
        .map((inst) => {
          const name = lc(inst.institution);
          const matched = (inst.users || []).filter((u) =>
            tokens.every((t) => name.includes(t) || tokenMatches({ ...u, institution: inst.institution }, t))
          );
          return { inst, users: matched };
        })
        .filter((g) => tokens.length === 0 || g.users.length > 0),
    [institutions, tokens]
  );

  if (error) {
    return (
      <div className="um-empty mt-6" role="alert">
        <p className="um-empty-title">{error}</p>
        <p className="um-empty-body">Check your connection, then try again.</p>
        <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={load}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading institutions">
        {[0, 1].map((i) => (
          <div key={i} className="um-card px-5 py-4">
            <span className="block h-4 w-1/4 animate-pulse rounded um-skel" />
            <span className="mt-4 block h-3 w-2/3 animate-pulse rounded um-skel" />
            <span className="mt-2 block h-3 w-1/2 animate-pulse rounded um-skel" />
          </div>
        ))}
      </div>
    );
  }

  if (institutions.length === 0) {
    return (
      <div className="um-empty mt-6">
        <Building2 size={26} aria-hidden="true" />
        <p className="um-empty-title">No institutions yet</p>
        <p className="um-empty-body">They appear here once a user has an institution set.</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="um-empty mt-6">
        <Search size={26} aria-hidden="true" />
        <p className="um-empty-title">No one matches “{query.trim()}”</p>
        <p className="um-empty-body">Try an institution name, username, email or class.</p>
        <button type="button" className="um-btn um-btn-quiet um-btn-sm" onClick={onClear}>
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map(({ inst, users }) => {
        // While searching, every matching group stays open so nothing is hidden.
        const open = tokens.length > 0 || !collapsed[inst.institution];
        const total = inst.userCount ?? (inst.users || []).length;
        return (
          <section key={inst.institution} className="um-card">
            <button
              type="button"
              className="um-inst-head"
              aria-expanded={open}
              onClick={() => setCollapsed((c) => ({ ...c, [inst.institution]: open }))}
            >
              <span className="um-inst-icon" aria-hidden="true">
                <Building2 size={16} />
              </span>
              <span className="um-display um-inst-name">
                <Highlight text={inst.institution} tokens={tokens} />
              </span>
              <span className="um-inst-count">
                {tokens.length ? `${users.length} of ${total}` : total} {total === 1 ? "person" : "people"}
              </span>
              <ChevronDown size={16} className="um-chevron" aria-hidden="true" />
            </button>

            {open && (
              <ul className="m-0 list-none p-0">
                {users.map((u) => (
                  <li key={u.username} className="um-inst-user">
                    <Avatar name={u.username} role={u.role} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="um-name-text um-name">
                        <Highlight text={u.username} tokens={tokens} />
                      </div>
                      <div className="um-sub">
                        {u.email ? <Highlight text={u.email} tokens={tokens} /> : <span className="um-dim">No email on file</span>}
                      </div>
                    </div>
                    {(u.role === "USER" || u.standard) && (
                      <span className="um-inst-class">
                        {u.standard ? (
                          <>
                            Class <Highlight text={u.standard} tokens={tokens} />
                          </>
                        ) : (
                          <span className="um-warn">No class</span>
                        )}
                      </span>
                    )}
                    <span className="um-pill um-pill-role" style={roleVars(u.role)}>
                      {roleMeta(u.role).label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  styles                                                                     */
/* -------------------------------------------------------------------------- */

const CSS = `

.um-root {
  --um-user: #7EA6FF;
  --um-teacher: #2DD4BF;
  --um-admin: #B39DFF;
  --um-danger: #E2725B;
  --um-danger-ink: #F3B9A8;
  --um-focus: #7FA2FF;
  --um-hover: color-mix(in srgb, var(--text) 4%, transparent);
  --um-hover-strong: color-mix(in srgb, var(--text) 9%, transparent);
  --um-line-strong: color-mix(in srgb, var(--text) 16%, transparent);
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
:root[data-theme="light"] .um-root {
  --um-user: #3A5FCB;
  --um-teacher: #0F8A7C;
  --um-admin: #6D4FD6;
  --um-danger: #C2432B;
  --um-danger-ink: #9C2F1B;
  --um-focus: #24389E;
}

.um-root :focus-visible { outline: 2px solid var(--um-focus); outline-offset: 2px; }
.um-display { font-family: 'Sora', system-ui, sans-serif; font-weight: 600; letter-spacing: -0.015em; }
.um-dim { color: var(--dim); }
.um-warn { color: var(--um-danger); }
.um-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.um-skel { background: var(--um-hover-strong); }

/* buttons */
.um-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
  height: 2.5rem; padding: 0 1rem; border-radius: 10px;
  font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, opacity 140ms ease;
}
.um-btn:disabled { opacity: .4; cursor: not-allowed; }
.um-btn-sm { height: 2.15rem; padding: 0 .8rem; font-size: 13px; }
.um-btn-primary { background: linear-gradient(135deg, #4F80F8, #3558DE); color: #FFFFFF; box-shadow: 0 6px 16px -8px rgba(53,88,222,.75); }
.um-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.um-btn-quiet { background: var(--surface); color: var(--text); border: 1px solid var(--um-line-strong); }
.um-btn-quiet:hover:not(:disabled) { background: var(--um-hover-strong); }
.um-btn-ghost { color: var(--muted); }
.um-btn-ghost:hover:not(:disabled) { color: var(--text); background: var(--um-hover); }
.um-btn-danger { background: #C2432B; color: #fff; }
.um-btn-danger:hover:not(:disabled) { background: #A93620; }

.um-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem; border-radius: 10px; color: var(--muted); cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.um-icon:hover:not(:disabled) { background: var(--um-hover-strong); color: var(--text); }
.um-icon:disabled { opacity: .3; cursor: not-allowed; }
.um-icon[data-on="true"] { color: var(--um-danger); background: color-mix(in srgb, var(--um-danger) 14%, transparent); }
.um-icon-danger:hover:not(:disabled) { color: var(--um-danger); background: color-mix(in srgb, var(--um-danger) 14%, transparent); }
@media (pointer: coarse) { .um-icon { width: 2.6rem; height: 2.6rem; } }

/* search + toolbar */
.um-toolbar { margin-bottom: 1rem; }
.um-search {
  display: flex; align-items: center; gap: .75rem; height: 3.25rem; padding: 0 .9rem;
  background: var(--surface); border: 1px solid var(--um-line-strong); border-radius: 14px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.um-search:focus-within { border-color: var(--um-focus); box-shadow: 0 0 0 4px color-mix(in srgb, var(--um-focus) 18%, transparent); }
.um-search-ico { flex: none; color: var(--dim); }
.um-search:focus-within .um-search-ico { color: var(--um-focus); }
.um-search input { flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; color: var(--text); font-size: 15px; text-overflow: ellipsis; }
.um-search input:focus, .um-search input:focus-visible { outline: none; }
.um-search input::placeholder { color: var(--dim); }
.um-search-clear { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 8px; color: var(--muted); cursor: pointer; }
.um-search-clear:hover { background: var(--um-hover-strong); color: var(--text); }
.um-kbd { display: none; align-items: center; justify-content: center; min-width: 1.5rem; height: 1.5rem; padding: 0 .35rem; border: 1px solid var(--um-line-strong); border-bottom-width: 2px; border-radius: 6px; font-family: inherit; font-size: 12px; color: var(--dim); }
@media (min-width: 640px) and (pointer: fine) { .um-kbd { display: inline-flex; } }

.um-seg { display: inline-flex; align-self: flex-start; padding: 3px; border-radius: 12px; background: var(--surface-2); flex: none; }
.um-seg button { height: 2.6rem; padding: 0 .95rem; border-radius: 9px; font-size: 13.5px; font-weight: 500; color: var(--muted); cursor: pointer; transition: background 140ms ease, color 140ms ease; }
.um-seg button:hover { color: var(--text); }
.um-seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,var(--shadow-strength)); }

.um-seg { max-width: 100%; }
@media (max-width: 639px) { .um-seg { align-self: stretch; } .um-seg button { flex: 1; padding: 0 .5rem; } }
.um-tabs { display: flex; gap: .25rem; margin: .25rem -.25rem 0; padding: .25rem; overflow-x: auto; scrollbar-width: none; }
.um-tabs::-webkit-scrollbar { display: none; }
.um-tab { flex: none; display: inline-flex; align-items: center; gap: .45rem; padding: .45rem .85rem; border: 1px solid transparent; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--muted); cursor: pointer; transition: background 140ms ease, color 140ms ease, border-color 140ms ease; }
.um-tab:hover { color: var(--text); background: var(--um-hover); }
.um-tab[aria-pressed="true"] { color: var(--text); font-weight: 600; background: color-mix(in srgb, var(--um-focus) 14%, transparent); border-color: color-mix(in srgb, var(--um-focus) 40%, transparent); }
.um-count { font-size: 12.5px; font-weight: 500; color: var(--dim); font-variant-numeric: tabular-nums; }
.um-tab[aria-pressed="true"] .um-count { color: var(--muted); }
.um-summary { margin: .5rem 0 .75rem; font-size: 13px; color: var(--dim); min-height: 1.25rem; }

.um-mark { background: color-mix(in srgb, #4F80F8 45%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }

/* list */
.um-card { background: var(--surface); border: 1px solid var(--divider); border-radius: 16px; overflow: hidden; }
.um-row + .um-row { border-top: 1px solid var(--divider); }
.um-row { transition: background 140ms ease; }
.um-row:hover { background: var(--um-hover); }
.um-who { display: flex; align-items: center; gap: .8rem; width: 100%; min-width: 0; padding: .25rem; margin: -.25rem; border-radius: 12px; text-align: left; cursor: pointer; }
.um-name { display: flex; align-items: center; gap: .45rem; min-width: 0; font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.35; }
.um-name-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--muted); font-weight: 400; }
.um-chevron { flex: none; margin-left: auto; color: var(--dim); transition: transform 180ms ease; }
[aria-expanded="true"] > .um-chevron { transform: rotate(180deg); }
.um-scope { min-width: 0; font-size: 13.5px; color: var(--muted); }
.um-scope-quiet { margin: 0; color: var(--dim); }
.um-scope-line { display: flex; align-items: center; gap: .45rem; margin: 0; line-height: 1.6; }
.um-scope-line svg { flex: none; }

.um-avatar {
  display: inline-flex; flex: none; align-items: center; justify-content: center; border-radius: 50%;
  font-family: 'Sora', system-ui, sans-serif; font-weight: 600; letter-spacing: 0; line-height: 1;
  color: var(--role); background: color-mix(in srgb, var(--role) 14%, var(--surface));
  border: 1.5px solid color-mix(in srgb, var(--role) 45%, transparent);
}

.um-pill { display: inline-flex; flex: none; align-items: center; gap: .25rem; padding: .1rem .5rem; border-radius: 999px; font-size: 11.5px; font-weight: 600; line-height: 1.5; }
.um-pill-quiet { color: var(--muted); background: var(--um-hover-strong); }
.um-pill-danger { color: var(--um-danger); background: color-mix(in srgb, var(--um-danger) 13%, transparent); }
.um-pill-role { color: var(--role); background: color-mix(in srgb, var(--role) 14%, transparent); }

/* role select */
.um-role { position: relative; display: inline-flex; align-items: center; }
.um-role select {
  appearance: none; -webkit-appearance: none; cursor: pointer;
  padding: .42rem 1.85rem .42rem 1.6rem; border-radius: 999px;
  font-size: 13px; font-weight: 600; color: var(--role);
  background: color-mix(in srgb, var(--role) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--role) 34%, transparent);
  transition: background 140ms ease;
}
.um-role select:hover:not(:disabled) { background: color-mix(in srgb, var(--role) 20%, transparent); }
.um-role select:disabled { opacity: .55; cursor: not-allowed; }
.um-role option { color: var(--text); background: var(--surface); }
.um-role-lead { position: absolute; left: .7rem; pointer-events: none; color: var(--role); }
.um-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--role); }
.um-role-chev { position: absolute; right: .6rem; pointer-events: none; color: var(--role); }
@media (min-width: 768px) { .um-role, .um-role select { width: 100%; } }

/* expanded panel */
.um-panel { border-top: 1px dashed var(--um-line-strong); background: color-mix(in srgb, var(--text) 3%, transparent); animation: um-open 180ms ease-out both; }
.um-h3 { margin: 0 0 .75rem; font-size: 13.5px; font-weight: 600; color: var(--muted); }
.um-label { display: block; margin-bottom: .35rem; font-size: 12.5px; font-weight: 600; color: var(--muted); }
.um-input {
  width: 100%; height: 2.6rem; padding: 0 .8rem; border-radius: 10px;
  background: var(--bg); color: var(--text); border: 1px solid var(--um-line-strong); font-size: 14px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.um-input::placeholder { color: var(--dim); }
.um-input:focus { outline: none; border-color: var(--um-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--um-focus) 20%, transparent); }
textarea.um-input { height: auto; padding: .6rem .8rem; resize: none; line-height: 1.5; }
select.um-input { cursor: pointer; }

/* empty states */
.um-empty { display: flex; flex-direction: column; align-items: center; gap: .35rem; padding: 3rem 1.5rem; text-align: center; color: var(--dim); border: 1px dashed var(--um-line-strong); border-radius: 16px; }
.um-empty .um-btn { margin-top: .9rem; }
.um-empty-title { margin: .4rem 0 0; font-size: 16px; font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.um-empty-body { margin: 0; font-size: 14px; color: var(--muted); }

/* institutions */
.um-inst-head { display: flex; align-items: center; gap: .75rem; width: 100%; padding: .95rem 1.25rem; text-align: left; cursor: pointer; transition: background 140ms ease; }
.um-inst-head:hover { background: var(--um-hover); }
.um-inst-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 10px; color: var(--um-focus); background: color-mix(in srgb, var(--um-focus) 14%, transparent); }
.um-inst-name { flex: 1; min-width: 0; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-inst-count { flex: none; font-size: 13px; color: var(--dim); font-variant-numeric: tabular-nums; }
.um-inst-head .um-chevron { margin-left: .25rem; }
.um-inst-user { display: flex; align-items: center; gap: .8rem; padding: .7rem 1.25rem; border-top: 1px solid var(--divider); }
.um-inst-class { flex: none; font-size: 13px; color: var(--muted); }

/* toast */
.um-toast-wrap { position: fixed; left: 0; right: 0; bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px)); z-index: 70; display: flex; justify-content: center; padding: 0 1rem; pointer-events: none; }
.um-toast { pointer-events: auto; display: flex; align-items: center; gap: .75rem; max-width: 32rem; padding: .7rem .75rem .7rem 1rem; border-radius: 12px; background: var(--error-bg); color: var(--um-danger-ink); border: 1px solid color-mix(in srgb, var(--um-danger) 40%, transparent); box-shadow: 0 16px 40px -16px rgba(0,0,0,var(--shadow-strength)); font-size: 13.5px; line-height: 1.45; animation: um-rise 200ms cubic-bezier(.22,1,.36,1) both; }
.um-toast-text { flex: 1; }
.um-toast-x { display: inline-flex; flex: none; padding: .3rem; border-radius: 8px; cursor: pointer; color: inherit; }
.um-toast-x:hover { background: color-mix(in srgb, var(--um-danger) 18%, transparent); }

/* dialog + drawer */
.um-scrim, .um-center { position: fixed; inset: 0; z-index: 60; background: rgba(6,8,12,.55); backdrop-filter: blur(3px); animation: um-fade 160ms ease-out both; }
.um-center { display: flex; align-items: center; justify-content: center; padding: 1rem; }
.um-dialog { width: min(100%, 26rem); padding: 1.5rem; border-radius: 18px; background: var(--surface); color: var(--text); border: 1px solid var(--divider); box-shadow: 0 30px 70px -30px rgba(0,0,0,.8); animation: um-pop 200ms cubic-bezier(.22,1,.36,1) both; }
.um-dialog-icon { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; margin-bottom: 1rem; border-radius: 12px; color: var(--um-danger); background: color-mix(in srgb, var(--um-danger) 14%, transparent); }
.um-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; display: flex; flex-direction: column; width: min(100vw, 30rem); background: var(--surface); color: var(--text); border-left: 1px solid var(--divider); box-shadow: -28px 0 60px -34px rgba(0,0,0,.7); animation: um-slide 240ms cubic-bezier(.22,1,.36,1) both; }
.um-drawer-head { display: flex; align-items: center; gap: .85rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--divider); }
.um-drawer-body { flex: 1; overflow-y: auto; padding: 1.5rem 1.25rem; }
.um-drawer-foot { display: flex; justify-content: flex-end; gap: .5rem; padding: .9rem 1.25rem calc(.9rem + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--divider); background: var(--surface); }
.um-reset { margin-top: 1.75rem; padding-top: 1.5rem; border-top: 1px dashed var(--um-line-strong); }
.um-inline-error { margin: 0 0 1.25rem; padding: .65rem .8rem; border-radius: 10px; font-size: 13.5px; line-height: 1.45; color: var(--um-danger-ink); background: var(--error-bg); border: 1px solid color-mix(in srgb, var(--um-danger) 40%, transparent); }
.um-ok { display: flex; align-items: center; gap: .4rem; margin: .6rem 0 0; font-size: 13px; color: var(--um-teacher); }

@keyframes um-open { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes um-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes um-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes um-slide { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes um-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .um-root *, .um-root *::before, .um-root *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
`;