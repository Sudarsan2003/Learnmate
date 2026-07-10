import { useState, useRef, useEffect } from "react";
import { LogOut, ShieldCheck, User, KeyRound } from "lucide-react";
import ChangePasswordModal from "./ChangePasswordModal";

function initialsFor(name) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

export default function ProfileMenu({ username, role }) {
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const avatarRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleMouseMove(e) {
    const rect = avatarRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -20, y: px * 20 });
  }

  function handleMouseLeaveAvatar() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div ref={containerRef} className="relative" style={{ perspective: "500px" }}>
      <button
        ref={avatarRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeaveAvatar}
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "radial-gradient(circle at 30% 30%, #E4C87A, #C89B3C 55%, #8A6A22 100%)",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 140ms ease-out",
          boxShadow: "0 4px 14px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.4)",
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full font-serif text-sm font-semibold text-[#0B0E14]"
      >
        {initialsFor(username)}
        <span className="absolute inset-0 rounded-full ring-1 ring-[#2DD4BF]/30" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-20 w-52 origin-top-right rounded-xl border border-[#2DD4BF]/20 bg-[#12151F]/95 p-1.5 normal-case shadow-2xl shadow-black/50 backdrop-blur-xl"
          style={{ animation: "pop-in 160ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-[#EDE6D6]">
            <User size={14} className="text-[#2DD4BF]" />
            <span className="truncate">{username}</span>
          </div>
          {role === "ADMIN" && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#C89B3C]">
              <ShieldCheck size={13} />
              admin
            </div>
          )}
          <div className="my-1 h-px bg-gradient-to-r from-transparent via-[#2DD4BF]/25 to-transparent" />
          <button
            onClick={() => {
              setOpen(false);
              setShowPasswordModal(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#9FB0AC] transition-colors hover:bg-[#2DD4BF]/10 hover:text-[#EDE6D6]"
          >
            <KeyRound size={14} />
            change password
          </button>
          <button
            onClick={() => {
              setOpen(false);
              document.dispatchEvent(new CustomEvent("learnmate:logout"));
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#9FB0AC] transition-colors hover:bg-[#2DD4BF]/10 hover:text-[#C89B3C]"
          >
            <LogOut size={14} />
            log out
          </button>
        </div>
      )}

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      <style>{`
        @keyframes pop-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}