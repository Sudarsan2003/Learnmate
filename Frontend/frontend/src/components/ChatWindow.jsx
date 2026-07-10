import { useState, useRef, useEffect } from "react";
import { Feather } from "lucide-react";
import { sendChatMessage, getSessionHistory } from "../api/client";
import ProfileMenu from "./ProfileMenu";
import AmbientBackground from "./AmbientBackground";
import { useTypewriter } from "./useTypewriter";

function TutorBubble({ text, isNew, citations, isError }) {
  const { shown, done } = useTypewriter(text, { active: isNew, speed: 12 });

  return (
    <div
      className={`message-card relative max-w-[75%] rounded-xl px-4 py-3 font-body text-sm leading-relaxed backdrop-blur-sm ${
        isError
          ? "border border-[#E2725B]/40 bg-[#2A1620]/70 text-[#F3B9A8]"
          : "border border-[#2DD4BF]/15 bg-[#231B36]/80 text-[#EDE6D6]"
      }`}
    >
      <p className="whitespace-pre-wrap">
        {shown}
        {!done && <span className="typing-cursor">✒</span>}
      </p>

      {done && citations && citations.length > 0 && (
        <div className="citation-thread mt-3 pt-3">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#2DD4BF]/80">
            <span className="thread-dot" /> sources
          </p>
          <ul className="mt-1.5 space-y-1">
            {citations.map((c) => (
              <li key={c.chunkId} className="font-mono text-[11px] text-[#9FB0AC]">
                <span className="text-[#C89B3C]">[{c.sourceId}]</span> {c.content.slice(0, 90)}
                {c.content.length > 90 ? "…" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ChatWindow({
  currentUser,
  currentRole,
  onLogout,
  isAdmin,
  onOpenUpload,
  sessionId,
  onSessionCreated,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const scrollRef = useRef(null);

  // Set right before we tell the parent a new session was created. Lets the
  // sessionId-change effect below skip its refetch exactly once, so the
  // in-memory message we just typed (isNew:true) isn't immediately replaced
  // by a reloaded copy (isNew:false) before the typewriter has run.
  const justCreatedSessionRef = useRef(false);

  useEffect(() => {
    document.addEventListener("learnmate:logout", onLogout);
    return () => document.removeEventListener("learnmate:logout", onLogout);
  }, [onLogout]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setHistoryLoading(false);
      return;
    }

    if (justCreatedSessionRef.current) {
      justCreatedSessionRef.current = false;
      setHistoryLoading(false);
      return;
    }

    (async () => {
      setHistoryLoading(true);
      try {
        const history = await getSessionHistory(sessionId);
        setMessages(
          history.map((m) => ({
            id: `h-${m.id}`,
            role: m.role,
            text: m.content,
            citations: m.citationsJson ? JSON.parse(m.citationsJson) : undefined,
            isNew: false,
          }))
        );
      } catch {
        setMessages([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSend() {
    const query = input.trim();
    if (!query || isLoading) return;

    const learnerMessage = { id: crypto.randomUUID(), role: "learner", text: query };
    setMessages((prev) => [...prev, learnerMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendChatMessage({ query, subject: subject || undefined, sessionId });

      if (!sessionId && response.sessionId) {
        justCreatedSessionRef.current = true;
        onSessionCreated(response.sessionId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "tutor",
          text: response.answer,
          citations: response.citations,
          isNew: true,
        },
      ]);
    } catch (err) {
      const detail = err.response?.data?.message ?? err.message ?? "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "tutor",
          text: `Couldn't reach the tutor backend (${detail}). Confirm LearnMateApplication is running on :8080.`,
          isError: true,
          isNew: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0B0E14] text-[#EDE6D6]" style={{ perspective: "1400px" }}>
      <AmbientBackground />

      <header className="relative z-30 flex items-center justify-between border-b border-[#2DD4BF]/10 bg-[#0B0E14]/70 px-6 py-4 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.7)] backdrop-blur-md">
        <h1 className="font-serif text-2xl tracking-tight text-[#EDE6D6]">
          {sessionId ? "Chat" : "New chat"}
        </h1>
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-[#9FB0AC]">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="subject filter (optional)"
            className="w-48 rounded-md border border-[#2DD4BF]/15 bg-[#12151F]/60 px-2.5 py-1.5 text-[#EDE6D6] placeholder:text-[#9FB0AC]/50 transition-shadow focus:border-[#C89B3C]/60 focus:shadow-[0_0_0_3px_rgba(200,155,60,0.15)] focus:outline-none"
          />

          {isAdmin && (
            <button
              onClick={onOpenUpload}
              className="ml-1 rounded-md border border-[#C89B3C]/60 px-3 py-1.5 text-[#C89B3C] transition-all hover:-translate-y-0.5 hover:bg-[#C89B3C] hover:text-[#0B0E14] hover:shadow-lg hover:shadow-[#C89B3C]/20"
            >
              upload
            </button>
          )}

          <div className="ml-2">
            <ProfileMenu username={currentUser} role={currentRole} />
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="relative z-10 flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {historyLoading && (
          <p className="font-mono text-xs text-[#9FB0AC]/60">unrolling your history…</p>
        )}

        {!historyLoading && messages.length === 0 && (
          <p className="font-body text-sm text-[#9FB0AC]">
            Ask something and the tutor will answer grounded in whatever's in the knowledge base right now.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={m.id}
            style={{ animation: "message-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${Math.min(i, 6) * 15}ms` }}
            className={`flex items-end gap-2 ${m.role === "learner" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "tutor" && (
              <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22] shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
                <Feather size={12} className="text-[#0B0E14]" />
              </div>
            )}

            {m.role === "learner" ? (
              <div className="message-card max-w-[75%] rounded-xl bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-4 py-3 font-body text-sm leading-relaxed text-[#0B0E14]">
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            ) : (
              <TutorBubble text={m.text} isNew={!!m.isNew} citations={m.citations} isError={m.isError} />
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-end gap-2">
            <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22]">
              <Feather size={12} className="text-[#0B0E14]" />
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#2DD4BF]/15 bg-[#231B36]/80 px-4 py-3 font-mono text-xs text-[#9FB0AC] backdrop-blur-sm">
              <span>consulting the ledger</span>
              <span className="ink-dot" style={{ animationDelay: "0ms" }} />
              <span className="ink-dot" style={{ animationDelay: "160ms" }} />
              <span className="ink-dot" style={{ animationDelay: "320ms" }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 border-t border-[#2DD4BF]/10 bg-[#0B0E14]/70 px-6 py-4 shadow-[0_-8px_28px_-14px_rgba(0,0,0,0.7)] backdrop-blur-md">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about anything in the knowledge base…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[#2DD4BF]/15 bg-[#12151F]/60 px-3.5 py-2.5 font-body text-sm text-[#EDE6D6] placeholder:text-[#9FB0AC]/50 transition-shadow focus:border-[#2DD4BF]/50 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.12)] focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="send-btn flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-5 py-2.5 font-body text-sm font-medium text-[#0B0E14] transition-all disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            <Feather size={14} />
            Ask
          </button>
        </div>
      </div>

      <style>{`
        @keyframes message-in {
          from { opacity: 0; transform: translateY(12px) rotateX(-8deg); }
          to { opacity: 1; transform: translateY(0) rotateX(0deg); }
        }
        .message-card {
          box-shadow: 0 8px 20px -8px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.05) inset;
          transition: transform 180ms ease, box-shadow 180ms ease;
          transform-style: preserve-3d;
        }
        .message-card:hover {
          transform: translateY(-3px) rotateX(2deg) rotateY(-1deg);
          box-shadow: 0 16px 32px -10px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.07) inset;
        }
        .typing-cursor {
          display: inline-block;
          margin-left: 2px;
          color: #2DD4BF;
          animation: blink 0.9s step-start infinite;
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        .citation-thread {
          position: relative;
          border-top: 1px solid rgba(45, 212, 191, 0.18);
        }
        .thread-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: #2DD4BF;
          box-shadow: 0 0 6px 1px rgba(45, 212, 191, 0.6);
        }
        .ink-dot {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: #2DD4BF;
          animation: ink-pulse 1s ease-in-out infinite;
        }
        @keyframes ink-pulse {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        .send-btn {
          box-shadow: 0 4px 14px -4px rgba(200,155,60,0.55);
        }
        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px -6px rgba(200,155,60,0.65);
        }
        .send-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px -2px rgba(200,155,60,0.45);
        }
      `}</style>
    </div>
  );
}