import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getMe, giveConsent } from "../api/client";

// Asks once, after sign-in, for agreement to the current Privacy Policy and
// Terms when the account doesn't have it yet (accounts made before consent
// was asked, or after the policy changes). For a student the parent or
// guardian agrees. Covers the app until answered; "Log out" is the way out.
export default function ConsentGate({ username, onLogout }) {
  const [me, setMe] = useState(null);
  const [agree, setAgree] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((data) => !cancelled && setMe(data))
      .catch(() => {}); // a failed check never blocks the app
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!me?.consentNeeded) return null;
  const student = me.role === "USER";

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await giveConsent(student ? guardianName.trim() : undefined);
      setMe((m) => ({ ...m, consentNeeded: false }));
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-[var(--muted)]/30 bg-[var(--surface)] p-6 text-[var(--text)] shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={22} className="text-[#3558DE]" aria-hidden="true" />
          <h2 id="consent-title" className="text-lg font-semibold">
            {student ? "A parent or guardian needs to agree" : "Please review our policies"}
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {student
            ? "LearnMate stores your child's questions, quiz results and progress so their school can help them learn. Questions are answered by an AI service. Please ask a parent or guardian to read the policies below and agree before continuing."
            : "LearnMate has published its Privacy Policy and Terms. Please read them and agree before continuing."}
        </p>
        <p className="mt-3 flex gap-4 text-sm">
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-[#3558DE] underline">
            Privacy Policy
          </a>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-[#3558DE] underline">
            Terms of Use
          </a>
        </p>

        {student && (
          <input
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            placeholder="Parent / guardian name"
            className="mt-4 w-full rounded-lg border border-[var(--muted)]/30 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#3558DE]"
          />
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm leading-snug">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#3558DE]"
          />
          <span>
            {student
              ? "I am this student's parent or guardian and I agree to the Privacy Policy and Terms of Use."
              : "I agree to the Privacy Policy and Terms of Use."}
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            Log out
          </button>
          <button
            type="submit"
            disabled={!agree || saving}
            className="rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Agree and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
