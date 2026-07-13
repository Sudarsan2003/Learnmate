import { useState, useEffect, useCallback } from "react";
import { Plus, MessageSquare, Trash2, Feather, X } from "lucide-react";
import { getChatSessions, deleteSession } from "../api/client";

export default function Sidebar({ activeSessionId, onSelectSession, onNewChat, refreshKey }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Open by default on desktop-sized viewports, closed on mobile so it doesn't
  // cover the chat on first load.
  const [isOpen, setIsOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );

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

  // Any hamburger button elsewhere in the app (e.g. ChatWindow's header)
  // dispatches this event to toggle the sidebar without needing shared state.
  useEffect(() => {
    function handleToggle() {
      setIsOpen((o) => !o);
    }
    document.addEventListener("learnmate:toggle-sidebar", handleToggle);
    return () => document.removeEventListener("learnmate:toggle-sidebar", handleToggle);
  }, []);

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    if (activeSessionId === sessionId) onNewChat();
  };

  const handleSelect = (sessionId) => {
    onSelectSession(sessionId);
    // On mobile, picking a chat should close the drawer so the conversation is visible.
    if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
  };

  const handleNewChat = () => {
    onNewChat();
    if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        .sb-serif {
          font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .sb-new-chat {
          box-shadow: 0 4px 14px -6px rgba(200,155,60,0.5);
        }
        .sb-new-chat:hover {
          box-shadow: 0 8px 18px -6px rgba(200,155,60,0.6);
        }
        .sb-item {
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }
      `}</style>

      {/* Backdrop, mobile only, shown while the drawer is open */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 h-full flex-shrink-0 border-r border-[#2DD4BF]/10 bg-[#0B0E14] transition-all duration-300 ease-out md:static md:z-auto ${
          isOpen
            ? "w-72 max-w-[85vw] translate-x-0 md:w-64"
            : "w-72 max-w-[85vw] -translate-x-full md:w-0 md:translate-x-0 md:overflow-hidden md:border-r-0"
        }`}
      >
        {/* Fixed-width inner wrapper keeps content from squishing while the
            desktop rail animates its width down to 0. */}
        <div className="flex h-full w-72 max-w-[85vw] flex-col md:w-64">
          <div className="flex items-center justify-between gap-2 px-5 py-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22] shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
                <Feather size={13} className="text-[#0B0E14]" />
              </div>
              <h1 className="sb-serif truncate text-lg text-[#EDE6D6]">
                LearnMate<span className="text-[#C89B3C]">.</span>
              </h1>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close sidebar"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#9FB0AC] transition-colors hover:bg-[#12151F] hover:text-[#EDE6D6] md:hidden"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-3">
            <button
              onClick={handleNewChat}
              className="sb-new-chat flex w-full items-center gap-2 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-3 py-2.5 text-sm font-medium text-[#0B0E14] transition-all hover:-translate-y-0.5"
            >
              <Plus size={15} />
              New chat
            </button>
          </div>

          <div className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
            <div className="mb-2 flex items-center gap-2 px-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#6E7C79]">
                Recent
              </p>
              <div className="h-px flex-1 bg-gradient-to-r from-[#2DD4BF]/20 to-transparent" />
            </div>

            {loading ? (
              <p className="px-1 text-xs text-[#6E7C79]">loading…</p>
            ) : sessions.length === 0 ? (
              <p className="px-1 text-xs text-[#6E7C79]">No conversations yet</p>
            ) : (
              <div className="flex flex-col gap-1">
                {sessions.map((s) => {
                  const isActive = activeSessionId === s.sessionId;
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => handleSelect(s.sessionId)}
                      className={`sb-item group flex items-center gap-2 rounded-md border-l-2 px-2.5 py-2 text-left text-xs ${
                        isActive
                          ? "border-[#C89B3C] bg-[#C89B3C]/[0.12] text-[#EDE6D6]"
                          : "border-transparent text-[#9FB0AC] hover:bg-[#12151F]/70 hover:text-[#EDE6D6]"
                      }`}
                    >
                      <MessageSquare
                        size={13}
                        className={`flex-shrink-0 ${isActive ? "text-[#C89B3C]" : ""}`}
                      />
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {s.title || "New chat"}
                      </span>
                      <Trash2
                        size={12}
                        onClick={(e) => handleDelete(e, s.sessionId)}
                        className="flex-shrink-0 text-[#6E7C79] opacity-0 transition-opacity hover:text-[#E2725B] group-hover:opacity-100"
                      />
                    </button>
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