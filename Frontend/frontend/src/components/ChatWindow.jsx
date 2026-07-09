import { useState, useRef, useEffect } from "react";
import { sendChatMessage, getChatHistory } from "../api/client";
import ProfileMenu from "./ProfileMenu";
import AmbientBackground from "./AmbientBackground";

export default function ChatWindow({ currentUser, currentRole, onLogout, isAdmin, onOpenUpload }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    document.addEventListener("learnmate:logout", onLogout);
    return () => document.removeEventListener("learnmate:logout", onLogout);
  }, [onLogout]);

  useEffect(() => {
    (async () => {
      try {
        const history = await getChatHistory();
        setMessages(
          history.map((m) => ({
            id: `h-${m.id}`,
            role: m.role,
            text: m.content,
            citations: m.citationsJson ? JSON.parse(m.citationsJson) : undefined,
          }))
        );
      } catch {
        // fresh session, no history yet
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

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
      const response = await sendChatMessage({ query, subject: subject || undefined });
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "tutor", text: response.answer, citations: response.citations },
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
    <div className="relative flex h-full w-full flex-col bg-ink text-parchment" style={{ perspective: "1400px" }}>
      <AmbientBackground />

      <header className="relative z-30 flex items-center justify-between border-b border-moss/70 bg-ink/70 px-6 py-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <h1 className="font-display text-2xl tracking-tight">
          LearnMate<span className="text-amber">.</span>
        </h1>
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-sage">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="subject filter (optional)"
            className="w-48 rounded border border-moss bg-transparent px-2 py-1 text-parchment placeholder:text-sage/60 transition-shadow focus:border-amber focus:shadow-[0_0_0_3px_rgba(217,164,65,0.15)] focus:outline-none"
          />

          {isAdmin && (
            <button
              onClick={onOpenUpload}
              className="ml-1 rounded border border-amber px-3 py-1 text-amber transition-all hover:-translate-y-0.5 hover:bg-amber hover:text-ink hover:shadow-lg hover:shadow-amber/20"
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
          <p className="font-mono text-xs text-sage/60">loading your history…</p>
        )}

        {!historyLoading && messages.length === 0 && (
          <p className="font-body text-sm text-sage">
            Ask something and the tutor will answer grounded in whatever's in the knowledge base right now.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={m.id}
            style={{ animation: "message-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${Math.min(i, 6) * 15}ms` }}
            className={`flex items-end gap-2 ${m.role === "learner" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "tutor" && (
              <div className="mb-0.5 h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-br from-amber to-orange-600 shadow-[0_3px_8px_rgba(0,0,0,0.4)]" />
            )}

            <div
              className={`message-card max-w-[75%] rounded-lg px-4 py-3 font-body text-sm leading-relaxed ${
                m.role === "learner"
                  ? "bg-amber text-ink"
                  : m.isError
                  ? "border border-red-400/40 bg-moss/40 text-red-200"
                  : "border border-moss/60 bg-moss/70 text-parchment backdrop-blur-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>

              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 border-t border-parchment/15 pt-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-sage">Sources</p>
                  <ul className="mt-1 space-y-1">
                    {m.citations.map((c) => (
                      <li key={c.chunkId} className="font-mono text-[11px] text-sage">
                        [{c.sourceId}] {c.content.slice(0, 90)}
                        {c.content.length > 90 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-end gap-2">
            <div className="mb-0.5 h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-br from-amber to-orange-600" />
            <div className="rounded-lg border border-moss/60 bg-moss/70 px-4 py-3 font-mono text-xs text-sage backdrop-blur-sm">
              thinking<span className="animate-pulse">…</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 border-t border-moss/70 bg-ink/70 px-6 py-4 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about anything in the knowledge base…"
            rows={1}
            className="flex-1 resize-none rounded-md border border-moss bg-moss/30 px-3 py-2 font-body text-sm text-parchment placeholder:text-sage/60 transition-shadow focus:border-amber focus:shadow-[0_0_0_3px_rgba(217,164,65,0.15)] focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="send-btn rounded-md bg-amber px-5 py-2 font-body text-sm font-medium text-ink transition-all disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            Ask
          </button>
        </div>
      </div>

      <style>{`
        @keyframes message-in {
          from { opacity: 0; transform: translateY(10px) rotateX(-6deg); }
          to { opacity: 1; transform: translateY(0) rotateX(0deg); }
        }
        .message-card {
          box-shadow: 0 6px 16px -6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
          transition: transform 160ms ease, box-shadow 160ms ease;
          transform-style: preserve-3d;
        }
        .message-card:hover {
          transform: translateY(-2px) rotateX(1.5deg);
          box-shadow: 0 12px 24px -8px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset;
        }
        .send-btn {
          box-shadow: 0 4px 12px -4px rgba(217,164,65,0.5);
        }
        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px -6px rgba(217,164,65,0.6);
        }
        .send-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px -2px rgba(217,164,65,0.4);
        }
      `}</style>
    </div>
  );
}