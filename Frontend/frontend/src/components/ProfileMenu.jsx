import { useState, useRef, useEffect } from "react";
import { LogOut, User, KeyRound, Users, ClipboardList, ChevronDown, FileBarChart2 } from "lucide-react";
import ChangePasswordModal from "./ChangePasswordModal";

const ROLE_META = {
  ADMIN: { label: "Admin", token: "admin" },
  TEACHER: { label: "Teacher", token: "teacher" },
  USER: { label: "Student", token: "user" },
};

function initialsFor(name) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

const emit = (name) => document.dispatchEvent(new CustomEvent(name));

export default function ProfileMenu({ username, role }) {
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const meta = ROLE_META[role] ?? ROLE_META.USER;
  const roleStyle = { "--role": `var(--pm-${meta.token})` };
  const initials = initialsFor(username);

  // Close on outside press or Escape (Escape hands focus back to the button).
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Menu-button pattern: move focus into the menu when it opens.
  useEffect(() => {
    if (open) panelRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  function handlePanelKeyDown(e) {
    const items = [...panelRef.current.querySelectorAll('[role="menuitem"]')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = items[(i + 1) % items.length];
    else if (e.key === "ArrowUp") next = items[(i - 1 + items.length) % items.length];
    else if (e.key === "Home") next = items[0];
    else if (e.key === "End") next = items[items.length - 1];
    else if (e.key === "Tab") setOpen(false);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  const choose = (action) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={containerRef} className="pm-root relative">
      <style>{CSS}</style>

      <button
        ref={triggerRef}
        type="button"
        className="pm-trigger"
        style={roleStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${username}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="pm-avatar">{initials}</span>
        <span className="pm-caret" aria-hidden="true">
          <ChevronDown size={10} strokeWidth={3} />
        </span>
      </button>

      {open && (
        <div ref={panelRef} role="menu" aria-label="Account" className="pm-panel" style={roleStyle} onKeyDown={handlePanelKeyDown}>
          <div className="pm-head">
            <span className="pm-avatar pm-avatar-lg" aria-hidden="true">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="pm-name" title={username}>
                {username}
              </p>
              <span className="pm-role">{meta.label}</span>
            </div>
          </div>

          <div className="pm-group" role="none">
            <MenuItem icon={User} label="View profile" onClick={choose(() => emit("learnmate:open-profile"))} />
            <MenuItem icon={ClipboardList} label="Quizzes" onClick={choose(() => emit("learnmate:open-quizzes"))} />
            {(role === "ADMIN" || role === "TEACHER") && (
              <MenuItem icon={FileBarChart2} label="Class reports" onClick={choose(() => emit("learnmate:open-reports"))} />
            )}
            {role === "ADMIN" && (
              <MenuItem icon={Users} label="Manage users" onClick={choose(() => emit("learnmate:open-users"))} />
            )}
          </div>

          <div className="pm-group" role="none">
            <MenuItem icon={KeyRound} label="Change password" onClick={choose(() => setShowPasswordModal(true))} />
          </div>

          <div className="pm-group" role="none">
            <MenuItem icon={LogOut} label="Log out" tone="danger" onClick={choose(() => emit("learnmate:logout"))} />
          </div>
        </div>
      )}

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, tone }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={`pm-item ${tone === "danger" ? "pm-item-danger" : ""}`} onClick={onClick}>
      <span className="pm-ico" aria-hidden="true">
        <Icon size={15} />
      </span>
      {label}
    </button>
  );
}

const CSS = `

.pm-root {
  --pm-user: #7EA6FF;
  --pm-teacher: #2DD4BF;
  --pm-admin: #B39DFF;
  --pm-danger: #E2725B;
  --pm-focus: #7FA2FF;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
:root[data-theme="light"] .pm-root {
  --pm-user: #3A5FCB;
  --pm-teacher: #0F8A7C;
  --pm-admin: #6D4FD6;
  --pm-danger: #C2432B;
  --pm-focus: #2F5BD0;
}

.pm-avatar {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 100%; height: 100%; border-radius: 50%;
  font-family: 'Sora', system-ui, sans-serif; font-weight: 600; font-size: 14px; line-height: 1;
  color: var(--role);
  background: color-mix(in srgb, var(--role) 15%, var(--surface));
  border: 1.5px solid color-mix(in srgb, var(--role) 50%, transparent);
}

.pm-trigger { position: relative; width: 2.5rem; height: 2.5rem; border-radius: 50%; cursor: pointer; transition: box-shadow 140ms ease, transform 140ms ease; }
.pm-trigger:hover { box-shadow: 0 0 0 4px color-mix(in srgb, var(--role) 16%, transparent); }
.pm-trigger[aria-expanded="true"] { box-shadow: 0 0 0 4px color-mix(in srgb, var(--role) 24%, transparent); }
.pm-trigger:focus-visible { outline: 2px solid var(--pm-focus); outline-offset: 3px; }
.pm-caret {
  position: absolute; right: -3px; bottom: -3px; display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; border-radius: 50%;
  color: var(--dim); background: var(--surface); border: 1px solid var(--divider);
}
.pm-caret svg { transition: transform 180ms ease; }
.pm-trigger[aria-expanded="true"] .pm-caret svg { transform: rotate(180deg); }

.pm-panel {
  position: absolute; right: 0; top: calc(100% + 12px); z-index: 50;
  width: 17rem; max-width: calc(100vw - 1.5rem); max-height: calc(100dvh - 5.5rem); overflow-y: auto; overscroll-behavior: contain;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--divider); border-radius: 16px;
  box-shadow: 0 24px 48px -20px rgba(0,0,0, calc(var(--shadow-strength) + .15));
  transform-origin: top right;
  animation: pm-pop 150ms cubic-bezier(.22,1,.36,1) both;
}

.pm-head {
  display: flex; align-items: center; gap: .8rem; padding: 1rem;
  background: color-mix(in srgb, var(--role) 8%, var(--surface));
  border-bottom: 1px solid var(--divider);
}
.pm-avatar-lg { width: 2.9rem; height: 2.9rem; font-size: 17px; }
.pm-name { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Sora', system-ui, sans-serif; font-weight: 600; font-size: 18px; letter-spacing: -0.01em; line-height: 1.25; color: var(--text); }
.pm-role {
  display: inline-flex; align-items: center; margin-top: .25rem; padding: .1rem .55rem; border-radius: 999px;
  font-size: 11.5px; font-weight: 600; line-height: 1.5;
  color: var(--role); background: color-mix(in srgb, var(--role) 15%, transparent);
}

.pm-group { padding: .35rem; }
.pm-group + .pm-group { border-top: 1px solid var(--divider); }

.pm-item {
  display: flex; align-items: center; gap: .7rem; width: 100%; padding: .45rem .55rem; border-radius: 10px;
  font-size: 14px; font-weight: 500; text-align: left; color: var(--text); cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.pm-item:hover, .pm-item:focus-visible { background: color-mix(in srgb, var(--text) 7%, transparent); }
.pm-item:focus-visible { outline: 2px solid var(--pm-focus); outline-offset: -2px; }
.pm-ico {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 1.9rem; height: 1.9rem; border-radius: 9px;
  color: var(--muted); background: color-mix(in srgb, var(--text) 6%, transparent);
  transition: color 120ms ease, background 120ms ease;
}
.pm-item:hover .pm-ico, .pm-item:focus-visible .pm-ico { color: var(--text); }

.pm-item-danger { color: var(--pm-danger); }
.pm-item-danger .pm-ico { color: var(--pm-danger); background: color-mix(in srgb, var(--pm-danger) 13%, transparent); }
.pm-item-danger:hover, .pm-item-danger:focus-visible { background: color-mix(in srgb, var(--pm-danger) 12%, transparent); }
.pm-item-danger:hover .pm-ico, .pm-item-danger:focus-visible .pm-ico { color: var(--pm-danger); }

@keyframes pm-pop {
  from { opacity: 0; transform: translateY(-6px) scale(.97); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .pm-root *, .pm-root *::before, .pm-root *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;