import { useState } from "react";
import { createPortal } from "react-dom";
import { X, KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "../api/client";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        className="w-full max-w-sm space-y-4 rounded-2xl border border-[#2DD4BF]/20 bg-[#12151F]/95 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-lg text-[#EDE6D6]">
            <KeyRound size={16} className="text-[#C89B3C]" />
            Change password
          </h2>
          <button type="button" onClick={onClose} className="text-[#6E7C79] hover:text-[#EDE6D6]">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <p className="rounded-md border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 px-3 py-2.5 text-xs text-[#2DD4BF]">
            Password updated successfully.
          </p>
        ) : (
          <>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full rounded-lg border border-[#2DD4BF]/15 bg-[#0B0E14]/50 px-3.5 py-2.5 text-sm text-[#EDE6D6] placeholder:text-[#9FB0AC]/50 transition-shadow focus:border-[#2DD4BF]/50 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.12)] focus:outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-lg border border-[#2DD4BF]/15 bg-[#0B0E14]/50 px-3.5 py-2.5 text-sm text-[#EDE6D6] placeholder:text-[#9FB0AC]/50 transition-shadow focus:border-[#2DD4BF]/50 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.12)] focus:outline-none"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-lg border border-[#2DD4BF]/15 bg-[#0B0E14]/50 px-3.5 py-2.5 text-sm text-[#EDE6D6] placeholder:text-[#9FB0AC]/50 transition-shadow focus:border-[#2DD4BF]/50 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.12)] focus:outline-none"
            />

            {error && (
              <p className="rounded-md border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2 text-xs text-[#F3B9A8]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] py-2.5 text-sm font-medium text-[#0B0E14] transition-all disabled:opacity-30"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Update password
            </button>
          </>
        )}
      </form>
    </div>,
    document.body
  );
}