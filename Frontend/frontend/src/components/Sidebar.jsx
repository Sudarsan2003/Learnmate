import { useState, useEffect, useCallback } from "react";
import { Plus, MessageSquare, Trash2, Feather, X } from "lucide-react";
import { getChatSessions, deleteSession } from "../api/client";
import ThemeToggle from "./ThemeToggle";

// The sidebar sits beside the page only from this width up. Below it, it's a
// slide-over drawer. It has to be wider than Tailwind's `md` (768px): with a
// 256px rail docked, a 768-1023px screen leaves the page only ~510-770px,
// which is what made the pages squeeze and their headers collide.
const DESKTOP_MIN = 1024;
const isDesktop = () => typeof window === "undefined" || window.innerWidth >= DESKTOP_MIN;

export default function Sidebar({ activeSessionId, onSelectSession, onNewChat, refreshKey }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Open by default when docked beside the page, closed as a drawer so it
  // doesn't cover the chat on first load.
  const [isOpen, setIsOpen] = useState(isDesktop);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getChatSessions();
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  // Any hamburger button elsewhere in the app (ChatWindow's header, the
  // PageFrame bar) dispatches this event to toggle the sidebar without
  // needing shared state.
  useEffect(() => {
    function handleToggle() {
      setIsOpen((o) => !o);
    }
    document.addEventListener("learnmate:toggle-sidebar", handleToggle);
    return () => document.removeEventListener("learnmate:toggle-sidebar", handleToggle);
  }, []);

  // Escape closes the drawer (only meaningful while it's overlaying the page).
  useEffect(() => {
    if (!isOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !isDesktop()) setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    if (activeSessionId === sessionId) onNewChat();
  };

  const handleSelect = (sessionId) => {
    onSelectSession(sessionId);
    // As a drawer, picking a chat should close it so the conversation is visible.
    if (!isDesktop()) setIsOpen(false);
  };

  const handleNewChat = () => {
    onNewChat();
    if (!isDesktop()) setIsOpen(false);
  };

  return (
    <>
      <style>{`
        .sb-serif {
          font-family: 'Sora', system-ui, sans-serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .sb-new-chat {
          box-shadow: 0 4px 14px -6px rgba(53,88,222,0.5);
        }
        .sb-new-chat:hover {
          box-shadow: 0 8px 18px -6px rgba(53,88,222,0.6);
        }
        .sb-item {
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .sb-item button:focus-visible {
          outline: 2px solid #3558DE;
          outline-offset: -2px;
          border-radius: 6px;
        }
        /* The delete button is hover-revealed on desktop. Touch screens have no
           hover, so keep it visible there. */
        @media (hover: none) {
          .sb-del { opacity: 1 !important; }
        }
        @media (pointer: coarse) {
          .sb-del { width: 2.25rem; height: 2.25rem; }
        }
        @supports (padding: max(0px)) {
          .sb-safe { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
        }
      `}</style>

      {/* Backdrop, drawer mode only, shown while the drawer is open */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        aria-label="Conversations"
        className={`font-ui fixed inset-y-0 left-0 z-40 h-full flex-shrink-0 border-r border-[#4F7CFF]/10 bg-[var(--bg)] transition-all duration-300 ease-out lg:static lg:z-auto ${
          isOpen
            ? "w-72 max-w-[85vw] translate-x-0 lg:w-64"
            : "w-72 max-w-[85vw] -translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden lg:border-r-0"
        }`}
      >
        {/* Fixed-width inner wrapper keeps content from squishing while the
            desktop rail animates its width down to 0. */}
        <div className="flex h-full w-72 max-w-[85vw] flex-col lg:w-64">
          <div className="flex items-center justify-between gap-2 px-5 py-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F80F8] to-[#24389E] shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
                <Feather size={13} className="text-[#FFFFFF]" />
              </div>
              <h1 className="sb-serif truncate text-lg text-[var(--text)]">
                LearnMate<span className="text-[var(--accent-ink)]">.</span>
              </h1>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <ThemeToggle />
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close sidebar"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)] lg:hidden"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="px-3">
            <button
              onClick={handleNewChat}
              className="sb-new-chat flex w-full items-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-3 py-2.5 text-sm font-medium text-[#FFFFFF] transition-all hover:-translate-y-0.5"
            >
              <Plus size={15} />
              New chat
            </button>
          </div>

          <div className="sb-safe mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
            <div className="mb-2 flex items-center gap-2 px-1">
              <p className="text-[12.5px] font-semibold text-[var(--dim)]">
                Recent
              </p>
              <div className="h-px flex-1 bg-gradient-to-r from-[#4F7CFF]/20 to-transparent" />
            </div>

            {loading ? (
              <p className="px-1 text-xs text-[var(--dim)]">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="px-1 text-xs text-[var(--dim)]">No conversations yet</p>
            ) : (
              <div className="flex flex-col gap-1">
                {sessions.map((s) => {
                  const isActive = activeSessionId === s.sessionId;
                  // Two sibling buttons instead of a delete icon nested inside
                  // the select button: nested buttons are invalid HTML and the
                  // icon was unreachable by keyboard and on touch screens.
                  return (
                    <div
                      key={s.sessionId}
                      className={`sb-item group flex items-center rounded-md border-l-2 text-[13.5px] ${
                        isActive
                          ? "border-[#3558DE] bg-[#3558DE]/[0.12] text-[var(--text)]"
                          : "border-transparent text-[var(--muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--text)]"
                      }`}
                    >
                      <button
                        onClick={() => handleSelect(s.sessionId)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                      >
                        <MessageSquare
                          size={13}
                          className={`flex-shrink-0 ${isActive ? "text-[var(--accent-ink)]" : ""}`}
                        />
                        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                          {s.title || "New chat"}
                        </span>
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, s.sessionId)}
                        aria-label={`Delete conversation ${s.title || "New chat"}`}
                        title="Delete conversation"
                        className="sb-del mr-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--dim)] opacity-0 transition-opacity hover:text-[#E2725B] focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}