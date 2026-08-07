import { useState, useEffect, useCallback } from "react";
import { User, Building2, GraduationCap, Mail, ShieldCheck, RefreshCw, AlertTriangle, Check, Loader2, Pencil } from "lucide-react";
import { getMe, updateMyStandard } from "../api/client";
import ThemeToggle from "./ThemeToggle";

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingStandard, setEditingStandard] = useState(false);
  const [standardDraft, setStandardDraft] = useState("");
  const [savingStandard, setSavingStandard] = useState(false);
  const [standardError, setStandardError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMe();
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const missingScope = profile && (!profile.institution || !profile.standard) && profile.role === "USER";

  const startEditingStandard = () => {
    setStandardDraft(profile?.standard || "");
    setStandardError(null);
    setEditingStandard(true);
  };

  const cancelEditingStandard = () => {
    setEditingStandard(false);
    setStandardError(null);
  };

  const saveStandard = async () => {
    if (!standardDraft.trim()) {
      setStandardError("Standard can't be blank.");
      return;
    }
    setSavingStandard(true);
    setStandardError(null);
    try {
      const updated = await updateMyStandard(standardDraft.trim());
      setProfile((prev) => ({ ...prev, standard: updated.standard }));
      setEditingStandard(false);
    } catch (err) {
      setStandardError(err.response?.data?.message ?? "Could not update your class.");
    } finally {
      setSavingStandard(false);
    }
  };

  return (
    <div className="min-h-full bg-[var(--bg)] px-4 py-6 font-mono text-[var(--text)] sm:px-8 sm:py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .profile-page { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; }
      `}</style>

      <div className="profile-page mx-auto max-w-[560px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[19px] font-bold tracking-tight text-[var(--text)] sm:text-[22px]">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22]">
                <User size={12} className="text-[#0B0E14]" />
              </span>
              my profile
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--muted)]">
              what the system knows about your account
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 self-start">
            <ThemeToggle />
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[var(--text)]"
            >
              <RefreshCw size={13} strokeWidth={2} />
              refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-5 text-xs text-[var(--dim)]">loading…</div>
        ) : profile ? (
          <div className="space-y-3">
            {missingScope && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-4 py-3 text-xs text-[#F3B9A8]">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">institution and/or standard isn't set</p>
                  <p className="mt-1 text-[#C89B3C]/90">
                    Quizzes are only shown to students whose institution and standard exactly
                    match the quiz. Ask an admin to set these in "manage users" — until then
                    you won't see any quizzes, even open ones.
                  </p>
                </div>
              </div>
            )}

            <Row icon={<User size={14} />} label="username" value={profile.username} />
            {profile.email && <Row icon={<Mail size={14} />} label="email" value={profile.email} />}
            <Row icon={<ShieldCheck size={14} />} label="role" value={profile.role} accent />
            <Row
              icon={<Building2 size={14} />}
              label="institution"
              value={profile.institution || "— not set —"}
              warn={!profile.institution}
            />
            {profile.role === "USER" ? (
              <div className="rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-[11px] uppercase tracking-wide text-[var(--dim)]">
                    <span className="text-[var(--muted)]"><GraduationCap size={14} /></span>
                    standard / class
                  </div>

                  {!editingStandard && (
                    <div className="flex items-center gap-2.5">
                      <span className={`text-sm ${!profile.standard ? "text-[#E2725B]" : "text-[var(--text)]"}`}>
                        {profile.standard || "— not set —"}
                      </span>
                      <button
                        onClick={startEditingStandard}
                        title="Edit your class"
                        className="text-[var(--dim)] transition-colors hover:text-[#C89B3C]"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {editingStandard && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      autoFocus
                      value={standardDraft}
                      onChange={(e) => setStandardDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveStandard()}
                      placeholder="e.g. 5"
                      className="w-24 rounded-md border border-[#2DD4BF]/15 bg-[var(--bg)]/50 px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none transition-shadow focus:border-[#C89B3C]/60"
                    />
                    <button
                      onClick={saveStandard}
                      disabled={savingStandard}
                      className="flex items-center gap-1 rounded-md bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-2.5 py-1.5 text-[11px] font-medium text-[#0B0E14] disabled:opacity-40"
                    >
                      {savingStandard ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      save
                    </button>
                    <button
                      onClick={cancelEditingStandard}
                      disabled={savingStandard}
                      className="px-2 py-1.5 text-[11px] text-[var(--dim)] transition-colors hover:text-[var(--text)]"
                    >
                      cancel
                    </button>
                  </div>
                )}

                {standardError && (
                  <p className="mt-2 text-xs text-[#F3B9A8]">{standardError}</p>
                )}
              </div>
            ) : (
              <Row
                icon={<GraduationCap size={14} />}
                label="standard / class"
                value={profile.standard || "— not set —"}
                warn={!profile.standard}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ icon, label, value, accent, warn }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 px-4 py-3">
      <div className="flex items-center gap-2.5 text-[11px] uppercase tracking-wide text-[var(--dim)]">
        <span className="text-[var(--muted)]">{icon}</span>
        {label}
      </div>
      <span
        className={`text-sm ${
          warn ? "text-[#E2725B]" : accent ? "text-[#C89B3C] font-semibold" : "text-[var(--text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}