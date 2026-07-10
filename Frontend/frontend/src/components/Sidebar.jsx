import { useState, useEffect, useCallback } from "react";
import { Plus, MessageSquare, Trash2, Feather } from "lucide-react";
import { getChatSessions, deleteSession } from "../api/client";

export default function Sidebar({ activeSessionId, onSelectSession, onNewChat, refreshKey }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    if (activeSessionId === sessionId) onNewChat();
  };

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-[#2DD4BF]/10 bg-[#0B0E14]">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22] shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
          <Feather size={13} className="text-[#0B0E14]" />
        </div>
        <h1 className="font-serif text-lg tracking-tight text-[#EDE6D6]">
          LearnMate<span className="text-[#C89B3C]">.</span>
        </h1>
      </div>

      <div className="px-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-[#2DD4BF]/15 bg-[#12151F]/70 px-3 py-2.5 text-sm text-[#EDE6D6] transition-all hover:-translate-y-0.5 hover:border-[#C89B3C]/50 hover:bg-[#C89B3C]/[0.08]"
        >
          <Plus size={15} />
          New chat
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
        <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-wider text-[#6E7C79]">
          Recent
        </p>

        {loading ? (
          <p className="px-1 text-xs text-[#6E7C79]">loading…</p>
        ) : sessions.length === 0 ? (
          <p className="px-1 text-xs text-[#6E7C79]">No conversations yet</p>
        ) : (
          <div className="flex flex-col gap-1">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => onSelectSession(s.sessionId)}
                className={`group flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                  activeSessionId === s.sessionId
                    ? "bg-[#C89B3C]/[0.12] text-[#EDE6D6]"
                    : "text-[#9FB0AC] hover:bg-[#12151F]/70 hover:text-[#EDE6D6]"
                }`}
              >
                <MessageSquare size={13} className="flex-shrink-0" />
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {s.title || "New chat"}
                </span>
                <Trash2
                  size={12}
                  onClick={(e) => handleDelete(e, s.sessionId)}
                  className="flex-shrink-0 text-[#6E7C79] opacity-0 transition-opacity hover:text-[#E2725B] group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}