import { useState } from "react";
import { createPortal } from "react-dom";
import { X, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { changePassword } from "../api/client";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not update password. Check your current password.");
    } finally {
      setIsLoading(false);
    }
  };

  // Rendered via a portal straight into <body>. Without this, `fixed`
  // positioning here would be computed relative to the nearest ancestor
  // that sets a transform/perspective/filter (ChatWindow's root div uses
  // `perspective: 1400px` for its 3D hover effects) instead of the actual
  // viewport — which is why the modal was showing up off-center and
  // clipped on small screens. Portaling to document.body sidesteps that
  // entirely.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="font-ui max-h-[calc(100dvh-2rem)] w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl border border-[#4F7CFF]/20 bg-[var(--surface)]/95 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl text-white">
            <KeyRound size={16} className="text-[var(--accent-ink)]" />
            Change password
          </h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <p className="rounded-md border border-[#4F7CFF]/30 bg-[#2DD4BF]/10 px-3 py-2.5 text-xs text-[var(--ok)]">
            Password updated successfully.
          </p>
        ) : (
          <>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                tabIndex={-1}
                aria-label={showCurrent ? "Hide password" : "Show password"}
                className="eye-toggle absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <span key={showCurrent ? "on" : "off"} className="eye-icon-pop flex items-center justify-center">
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
                aria-label={showNew ? "Hide password" : "Show password"}
                className="eye-toggle absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <span key={showNew ? "on" : "off"} className="eye-icon-pop flex items-center justify-center">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-lg border border-[#4F7CFF]/15 bg-[var(--bg)]/50 px-3.5 py-2.5 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow focus:border-[#4F7CFF]/50 focus:shadow-[0_0_0_3px_rgba(79,124,255,0.18)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                tabIndex={-1}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="eye-toggle absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <span key={showConfirm ? "on" : "off"} className="eye-icon-pop flex items-center justify-center">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              </button>
            </div>

            {error && (
              <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-800/60 dark:bg-red-950/50 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] py-2.5 text-sm font-medium text-[#FFFFFF] transition-all disabled:opacity-30"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Update password
            </button>
          </>
        )}
      </form>

      <style>{`
        .eye-toggle {
          -webkit-tap-highlight-color: transparent;
        }
        .eye-icon-pop {
          animation: eyePop 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes eyePop {
          from { opacity: 0; transform: scale(0.5) rotate(-15deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </div>,
    document.body
  );
}