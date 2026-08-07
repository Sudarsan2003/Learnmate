import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Users, RefreshCw, Loader2, ShieldCheck, Check, Building2, X, Pencil, KeyRound } from "lucide-react";
import { listUsers, updateUserRole, updateUserProfile, resetUserPassword, listInstitutions } from "../api/client";
import ThemeToggle from "./ThemeToggle";

const ROLES = ["USER", "TEACHER", "ADMIN"];

export default function ManageUsers({ currentUsername }) {
  const [viewMode, setViewMode] = useState("all"); // "all" | "institutions"
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUsername, setUpdatingUsername] = useState(null);
  const [profileDrafts, setProfileDrafts] = useState({}); // username -> { institution, standard }
  const [savingProfileUsername, setSavingProfileUsername] = useState(null);
  const [editingUser, setEditingUser] = useState(null); // full user object, or null when modal closed

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
      setProfileDrafts(
        Object.fromEntries(data.map((u) => [u.username, { institution: u.institution || "", standard: u.standard || "" }]))
      );
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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

  const handleProfileSave = async (u) => {
    const draft = profileDrafts[u.username] || {};
    if (u.role !== "ADMIN" && (!draft.institution || !draft.institution.trim())) {
      setError("Institution cannot be blank.");
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
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not update profile for ${u.username}.`);
    } finally {
      setSavingProfileUsername(null);
    }
  };

  // Admins aren't scoped to an institution — this clears any stale
  // institution/standard left over from before they were promoted.
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

  return (
    <div className="doc-upload min-h-full bg-[var(--bg)] px-4 py-6 font-mono text-[var(--text)] sm:px-8 sm:py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .doc-upload { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; }
        .lm-row { transition: background 140ms ease; }
        .lm-row:hover { background: rgba(45,212,191,0.05); }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: #22283a; border-radius: 4px; }
      `}</style>

      <div className="mx-auto max-w-[820px]">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[19px] font-bold tracking-tight text-[var(--text)] sm:text-[22px]">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22]">
                <Users size={12} className="text-[#0B0E14]" />
              </span>
              manage users <span className="text-[#C89B3C]">·</span> admin
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--muted)]">
              promote learners to teacher so they can upload documents, or grant admin
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <ThemeToggle />
            <div className="flex items-center gap-1 rounded-md border border-[#2DD4BF]/15 p-1">
              <button
                onClick={() => setViewMode("all")}
                className={`rounded px-2.5 py-1.5 text-[11px] transition-colors ${
                  viewMode === "all" ? "bg-[#2DD4BF]/15 text-[var(--text)]" : "text-[var(--dim)] hover:text-[var(--muted)]"
                }`}
              >
                all users
              </button>
              <button
                onClick={() => setViewMode("institutions")}
                className={`rounded px-2.5 py-1.5 text-[11px] transition-colors ${
                  viewMode === "institutions" ? "bg-[#2DD4BF]/15 text-[var(--text)]" : "text-[var(--dim)] hover:text-[var(--muted)]"
                }`}
              >
                by institution
              </button>
            </div>
            {viewMode === "all" && (
              <button
                onClick={loadUsers}
                className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[var(--text)]"
              >
                <RefreshCw size={13} strokeWidth={2} />
                refresh
              </button>
            )}
          </div>
        </div>

        {viewMode === "institutions" ? (
          <InstitutionsView />
        ) : (
          <>
        {error && (
          <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-5 text-xs text-[var(--dim)]">loading…</div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-xs text-[var(--dim)]">
            no users found
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--divider)]">
            <div className="lm-scroll max-h-[480px] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[680px] border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--surface)]/70 text-left text-[var(--dim)]">
                    <th className="px-3 py-2.5 font-medium">username</th>
                    <th className="px-3 py-2.5 font-medium">email</th>
                    <th className="px-3 py-2.5 font-medium">institution</th>
                    <th className="px-3 py-2.5 font-medium">standard</th>
                    <th className="px-3 py-2.5 font-medium">role</th>
                    <th className="px-3 py-2.5 font-medium">edit</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="lm-row border-t border-[var(--divider)]">
                      <td className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5">
                        {u.username}
                        {u.username === currentUsername && (
                          <span className="ml-1.5 text-[10px] text-[var(--dim)]">(you)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">{u.email || "—"}</td>
                      {u.role === "ADMIN" ? (
                        <>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--dim)]">
                              <span>{u.institution || "not applicable"}</span>
                              {(u.institution || u.standard) && (
                                <button
                                  onClick={() => handleClearAdminScope(u)}
                                  disabled={savingProfileUsername === u.username}
                                  title="Admins aren't scoped to one institution — clear this"
                                  className="flex-shrink-0 text-[var(--dim)] transition-colors hover:text-[#E2725B] disabled:opacity-40"
                                >
                                  {savingProfileUsername === u.username ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <X size={12} />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-[var(--dim)]">{u.standard || "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                value={profileDrafts[u.username]?.institution ?? ""}
                                onChange={(e) => updateDraft(u.username, "institution", e.target.value)}
                                placeholder="institution"
                                className="w-28 rounded-md border border-[#2DD4BF]/15 bg-[var(--surface)]/70 px-2 py-1.5 text-[11px] text-[var(--text)] outline-none transition-shadow focus:border-[#C89B3C]/60"
                              />
                              {draftChanged(u) && (
                                <button
                                  onClick={() => handleProfileSave(u)}
                                  disabled={savingProfileUsername === u.username}
                                  title="Save institution/standard"
                                  className="flex-shrink-0 text-[#2DD4BF] transition-colors hover:text-[var(--text)] disabled:opacity-40"
                                >
                                  {savingProfileUsername === u.username ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Check size={13} />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={profileDrafts[u.username]?.standard ?? ""}
                              onChange={(e) => updateDraft(u.username, "standard", e.target.value)}
                              placeholder="e.g. 5"
                              className="w-16 rounded-md border border-[#2DD4BF]/15 bg-[var(--surface)]/70 px-2 py-1.5 text-[11px] text-[var(--text)] outline-none transition-shadow focus:border-[#C89B3C]/60"
                            />
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            disabled={updatingUsername === u.username || u.username === currentUsername}
                            onChange={(e) => handleRoleChange(u.username, e.target.value)}
                            className="rounded-md border border-[#2DD4BF]/15 bg-[var(--surface)]/70 px-2 py-1.5 text-[11px] text-[var(--text)] outline-none transition-shadow focus:border-[#C89B3C]/60 disabled:opacity-40"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          {updatingUsername === u.username && (
                            <Loader2 size={13} className="animate-spin text-[#C89B3C]" />
                          )}
                          {u.role === "ADMIN" && updatingUsername !== u.username && (
                            <ShieldCheck size={13} className="text-[#C89B3C]" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => setEditingUser(u)}
                          title="Edit all details"
                          className="flex items-center gap-1 rounded-md border border-[#2DD4BF]/20 px-2 py-1 text-[11px] text-[#2DD4BF] transition-colors hover:bg-[#2DD4BF]/10"
                        >
                          <Pencil size={12} />
                          edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((prev) =>
              prev.map((row) => (row.username === updated.username ? { ...row, ...updated } : row))
            );
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------- edit user modal ---------------------------------- */

function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
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
      setError("Institution cannot be blank for a non-admin user.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUserProfile(user.username, {
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
      setPasswordMessage("Password reset.");
      setNewPassword("");
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not reset password for ${user.username}.`);
    } finally {
      setResetting(false);
    }
  };

  // Portaled to <body> for the same reason as ChangePasswordModal — this
  // page has no transform ancestor today, but keeping modals consistent
  // avoids the class of bug where a future style change breaks positioning.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSave}
        className="doc-upload max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-[#2DD4BF]/20 bg-[var(--surface)]/95 p-6 font-mono shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-[var(--text)]">
            edit <span className="text-[#C89B3C]">{user.username}</span>
          </h2>
          <button type="button" onClick={onClose} className="text-[var(--dim)] hover:text-[var(--text)]">
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="rounded-md border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2 text-xs text-[#F3B9A8]">
            {error}
          </p>
        )}

        <ModalField label="email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            className="lm-modal-input"
          />
        </ModalField>
        <ModalField label="mobile">
          <input value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} className="lm-modal-input" />
        </ModalField>
        <ModalField label="gender">
          <select value={form.gender} onChange={(e) => setField("gender", e.target.value)} className="lm-modal-input">
            <option value="">—</option>
            <option value="female">female</option>
            <option value="male">male</option>
            <option value="other">other</option>
            <option value="prefer_not_to_say">prefer not to say</option>
          </select>
        </ModalField>
        <ModalField label="address">
          <textarea
            rows={2}
            value={form.address}
            onChange={(e) => setField("address", e.target.value)}
            className="lm-modal-input resize-none"
          />
        </ModalField>
        {user.role === "ADMIN" ? (
          <p className="text-[11px] text-[var(--dim)]">
            institution / standard don't apply to admins — clear them from the main table if stale.
          </p>
        ) : (
          <>
            <ModalField label="institution">
              <input
                value={form.institution}
                onChange={(e) => setField("institution", e.target.value)}
                className="lm-modal-input"
              />
            </ModalField>
            <ModalField label="standard / class">
              <input
                value={form.standard}
                onChange={(e) => setField("standard", e.target.value)}
                className="lm-modal-input"
              />
            </ModalField>
          </>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] py-2.5 text-sm font-medium text-[#0B0E14] disabled:opacity-40"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          save changes
        </button>

        <div className="my-1 h-px bg-gradient-to-r from-transparent via-[#2DD4BF]/25 to-transparent" />

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--dim)]">
            <KeyRound size={12} />
            reset password
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="new password (min 6 chars)"
              className="lm-modal-input flex-1"
            />
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetting || !newPassword}
              className="flex-shrink-0 rounded-lg border border-[#2DD4BF]/20 px-3 py-2.5 text-xs text-[#2DD4BF] transition-colors hover:bg-[#2DD4BF]/10 disabled:opacity-40"
            >
              {resetting ? <Loader2 size={13} className="animate-spin" /> : "reset"}
            </button>
          </div>
          {passwordMessage && <p className="mt-1.5 text-xs text-[#2DD4BF]">{passwordMessage}</p>}
        </div>

        <style>{`
          .lm-modal-input {
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid rgba(45,212,191,0.15);
            background: rgba(11,14,20,0.5);
            padding: 0.55rem 0.75rem;
            font-size: 12px;
            color: #EDE6D6;
            outline: none;
            transition: box-shadow 140ms ease, border-color 140ms ease;
          }
          .lm-modal-input:focus {
            border-color: rgba(200,155,60,0.6);
            box-shadow: 0 0 0 3px rgba(200,155,60,0.15);
          }
        `}</style>
      </form>
    </div>,
    document.body
  );
}

function ModalField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--dim)]">{label}</span>
      {children}
    </label>
  );
}

/* ---------------------------------- institutions view ---------------------------------- */

function InstitutionsView() {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[var(--text)]"
        >
          <RefreshCw size={13} strokeWidth={2} />
          refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-5 text-xs text-[var(--dim)]">loading…</div>
      ) : institutions.length === 0 ? (
        <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-xs text-[var(--dim)]">
          no institutions yet — they show up here once users have one set
        </div>
      ) : (
        <div className="space-y-4">
          {institutions.map((inst) => (
            <div key={inst.institution} className="overflow-hidden rounded-lg border border-[var(--divider)]">
              <div className="flex items-center justify-between bg-[var(--surface)]/70 px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm text-[var(--text)]">
                  <Building2 size={13} className="text-[#C89B3C]" />
                  {inst.institution}
                </span>
                <span className="text-[11px] text-[var(--dim)]">
                  {inst.userCount} user{inst.userCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="lm-scroll max-h-[320px] overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[480px] border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-[var(--dim)]">
                      <th className="px-4 py-2 font-medium">username</th>
                      <th className="px-4 py-2 font-medium">email</th>
                      <th className="px-4 py-2 font-medium">standard</th>
                      <th className="px-4 py-2 font-medium">role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inst.users.map((u) => (
                      <tr key={u.username} className="lm-row border-t border-[var(--divider)]">
                        <td className="px-4 py-2">{u.username}</td>
                        <td className="px-4 py-2 text-[var(--muted)]">{u.email || "—"}</td>
                        <td className="px-4 py-2 text-[var(--muted)]">{u.standard || "—"}</td>
                        <td className="px-4 py-2 text-[var(--muted)]">{u.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}