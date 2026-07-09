import { useState, useRef, useEffect } from "react";
import { LogOut, ShieldCheck, User } from "lucide-react";

function initialsFor(name) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

function hueFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

export default function ProfileMenu({ username, role }) {
  const [open, setOpen] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const avatarRef = useRef(null);
  const containerRef = useRef(null);

  const hue = hueFor(username || "learner");

  // Close on outside click instead of onMouseLeave
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
    setTilt({ x: py * -18, y: px * 18 });
  }

  function handleMouseLeaveAvatar() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={avatarRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeaveAvatar}
        onClick={() => setOpen((o) => !o)}
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
          transform: `perspective(400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 120ms ease-out",
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs font-semibold text-white shadow-lg shadow-black/30"
      >
        {initialsFor(username)}
      </button>

      {open && (
  <div className="absolute right-0 top-11 z-20 w-48 rounded-lg border border-moss bg-ink/95 p-1.5 normal-case shadow-xl shadow-black/40 backdrop-blur-md">
          <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-parchment">
            <User size={14} className="text-sage" />
            <span className="truncate">{username}</span>
          </div>
          {role === "ADMIN" && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-amber">
              <ShieldCheck size={13} />
              admin
            </div>
          )}
          <div className="my-1 h-px bg-moss/60" />
          <button
            onClick={() => {
              setOpen(false);
              document.dispatchEvent(new CustomEvent("learnmate:logout"));
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-sage hover:bg-moss/50 hover:text-amber"
          >
            <LogOut size={14} />
            log out
          </button>
        </div>
      )}
    </div>
  );
}