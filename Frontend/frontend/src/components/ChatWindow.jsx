import { useState, useRef, useEffect, useCallback } from "react";
import { Orbit, Menu, Sparkles, Plus, Copy, Check, RotateCcw, Square, ArrowDown } from "lucide-react";
import { sendChatMessage, getSessionHistory } from "../api/client";
import ProfileMenu from "./ProfileMenu";
import AmbientBackground from "./AmbientBackground";
import { useTypewriter } from "./Usetypewriter";

const EXAMPLE_PROMPTS = [
  "Explain a concept from scratch",
  "Quiz me on recent material",
  "Summarize the last reading",
  "Compare two related ideas",
];

function TutorBubble({ text, isNew, citations, isError, onCopy, copied, onRegenerate, canRegenerate }) {
  const { shown, done } = useTypewriter(text, { active: isNew, speed: 12 });

  return (
    <div
      className={`message-card group relative max-w-[85%] rounded-xl px-4 py-3 font-body text-sm leading-relaxed backdrop-blur-sm sm:max-w-[75%] ${
        isError
          ? "border border-[#FF6B81]/40 bg-[#2A1020]/70 text-[#FFC2CC]"
          : "border border-[#5B8DEF]/20 bg-[#14122A]/80 text-[#F1EEFB]"
      }`}
    >
      <p className="whitespace-pre-wrap">
        {shown}
        {!done && <span className="typing-cursor">●</span>}
      </p>

      {done && citations && citations.length > 0 && (
        <div className="citation-thread mt-3 pt-3">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#5B8DEF]/90">
            <span className="thread-dot" /> sources
          </p>
          <ul className="mt-1.5 space-y-1">
            {citations.map((c) => (
              <li key={c.chunkId} className="font-mono text-[11px] text-[#9691B8]">
                <span className="text-[#FF8F6B]">[{c.sourceId}]</span> {c.content.slice(0, 90)}
                {c.content.length > 90 ? "…" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {done && !isError && (onCopy || (canRegenerate && onRegenerate)) && (
        <div className="msg-actions mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onCopy && (
            <button
              onClick={onCopy}
              aria-label="Copy answer"
              title="Copy answer"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#9691B8] transition-colors hover:bg-[#5B8DEF]/15 hover:text-[#F1EEFB]"
            >
              {copied ? <Check size={12} className="text-[#5B8DEF]" /> : <Copy size={12} />}
            </button>
          )}
          {canRegenerate && onRegenerate && (
            <button
              onClick={onRegenerate}
              aria-label="Regenerate answer"
              title="Regenerate answer"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#9691B8] transition-colors hover:bg-[#FF6B4A]/15 hover:text-[#FF8F6B]"
            >
              <RotateCcw size={12} />
            </button>
          )}
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
  onNewChat,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Bumped on every stop request; an in-flight response is only applied if
  // its captured token still matches, so "Stop" can abandon a request
  // without needing real cancellation support from the API client.
  const requestTokenRef = useRef(0);

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
    if (isAtBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading, isAtBottom]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < 80);
  }

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
  }

  function toggleSidebar() {
    document.dispatchEvent(new CustomEvent("learnmate:toggle-sidebar"));
  }

  function handlePromptClick(text) {
    setInput(text);
    textareaRef.current?.focus();
  }

  function handleCopy(id, text) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    });
  }

  const performSend = useCallback(
    async (query) => {
      const token = ++requestTokenRef.current;
      setIsLoading(true);

      try {
        const response = await sendChatMessage({ query, sessionId });
        if (token !== requestTokenRef.current) return; // stopped or superseded

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
        if (token !== requestTokenRef.current) return;
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
        if (token === requestTokenRef.current) setIsLoading(false);
      }
    },
    [sessionId, onSessionCreated]
  );

  async function handleSend() {
    const query = input.trim();
    if (!query || isLoading) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "learner", text: query }]);
    setInput("");
    await performSend(query);
  }

  function handleStop() {
    requestTokenRef.current++; // orphan any in-flight response
    setIsLoading(false);
  }

  function handleRegenerate(index) {
    const query = messages[index - 1]?.text;
    if (!query || messages[index - 1]?.role !== "learner") return;
    setMessages((prev) => prev.slice(0, index));
    performSend(query);
  }

  function handleNewChatClick() {
    setInput("");
    onNewChat?.();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const lastTutorIndex = [...messages].map((m) => m.role).lastIndexOf("tutor");

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0A0916] text-[#F1EEFB]" style={{ perspective: "1400px" }}>
      <AmbientBackground />

      <header className="relative z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#5B8DEF]/15 bg-[#0A0916]/70 px-4 py-3 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.7)] backdrop-blur-md sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#9691B8] transition-colors hover:bg-[#14122A] hover:text-[#F1EEFB]"
          >
            <Menu size={18} />
          </button>
          <h1 className="hero-serif truncate text-xl text-[#F1EEFB] sm:text-2xl">
            {sessionId ? "Chat" : "New chat"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wide text-[#9691B8] sm:gap-3">
          <button
            onClick={handleNewChatClick}
            className="flex items-center gap-1.5 rounded-md border border-[#5B8DEF]/20 px-3 py-1.5 text-[#9691B8] transition-all hover:-translate-y-0.5 hover:border-[#5B8DEF]/50 hover:text-[#F1EEFB]"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">new chat</span>
          </button>

          {isAdmin && (
            <button
              onClick={onOpenUpload}
              className="rounded-md border border-[#FF6B4A]/60 px-3 py-1.5 text-[#FF8F6B] transition-all hover:-translate-y-0.5 hover:bg-[#FF6B4A] hover:text-[#0A0916] hover:shadow-lg hover:shadow-[#FF6B4A]/20"
            >
              upload
            </button>
          )}

          <div className="ml-0 sm:ml-2">
            <ProfileMenu username={currentUser} role={currentRole} />
          </div>
        </div>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="relative z-10 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        {historyLoading && (
          <p className="font-mono text-xs text-[#9691B8]/60">mapping the knowledge graph…</p>
        )}

        {!historyLoading && messages.length === 0 && (
          <div
            style={{ animation: "hero-in 500ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
            className="mx-auto flex max-w-2xl flex-col items-center gap-9 pt-8 text-center sm:pt-16"
          >
            <div className="flex flex-col items-center gap-3.5">
              <div className="orbit-avatar flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#FF8F6B] to-[#C4482B] shadow-[0_6px_20px_rgba(255,107,74,0.35)]">
                <Orbit size={20} className="text-[#0A0916]" />
              </div>
              <h2 className="hero-serif text-3xl italic leading-[1.15] text-[#F1EEFB] sm:text-[2.5rem]">
                What are we studying today?
              </h2>
              <svg width="128" height="12" viewBox="0 0 128 12" fill="none" className="opacity-70">
                <path
                  d="M2 7 C 34 -2, 92 16, 126 5"
                  stroke="#FF6B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="spark-stroke"
                />
              </svg>
              <p className="max-w-md font-body text-sm text-[#9691B8]">
                Ask anything — every answer traces a path back to a node in your knowledge base.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button
                  key={p}
                  onClick={() => handlePromptClick(p)}
                  style={{ animation: "message-in 300ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${180 + i * 60}ms` }}
                  className="prompt-chip group flex items-center gap-2.5 rounded-xl border border-[#5B8DEF]/20 bg-[#14122A]/50 px-4 py-3 text-left text-sm text-[#9691B8] transition-all hover:-translate-y-0.5 hover:border-[#FF6B4A]/40 hover:bg-[#14122A]/85 hover:text-[#F1EEFB]"
                >
                  <Sparkles size={14} className="flex-shrink-0 text-[#5B8DEF]/80 transition-colors group-hover:text-[#FF8F6B]" />
                  <span className="font-body">{p}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m, i) => (
            <div
              key={m.id}
              style={{ animation: "message-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${Math.min(i, 6) * 15}ms` }}
              className={`flex items-end gap-2 ${m.role === "learner" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "tutor" && (
                <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF8F6B] to-[#C4482B] shadow-[0_3px_10px_rgba(255,107,74,0.4)]">
                  <Orbit size={12} className="text-[#0A0916]" />
                </div>
              )}

              {m.role === "learner" ? (
                <div className="message-card max-w-[85%] rounded-xl bg-gradient-to-br from-[#6E9BFF] to-[#3A5FCB] px-4 py-3 font-body text-sm leading-relaxed text-[#0A0916] sm:max-w-[75%]">
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              ) : (
                <TutorBubble
                  text={m.text}
                  isNew={!!m.isNew}
                  citations={m.citations}
                  isError={m.isError}
                  onCopy={() => handleCopy(m.id, m.text)}
                  copied={copiedId === m.id}
                  canRegenerate={i === lastTutorIndex && !isLoading}
                  onRegenerate={() => handleRegenerate(i)}
                />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF8F6B] to-[#C4482B]">
                <Orbit size={12} className="text-[#0A0916]" />
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-[#5B8DEF]/20 bg-[#14122A]/80 px-4 py-3 font-mono text-xs text-[#9691B8] backdrop-blur-sm">
                <span>tracing the graph</span>
                <span className="spark-dot" style={{ animationDelay: "0ms" }} />
                <span className="spark-dot" style={{ animationDelay: "160ms" }} />
                <span className="spark-dot" style={{ animationDelay: "320ms" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
          className="scroll-fab absolute bottom-[92px] left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[#5B8DEF]/30 bg-[#14122A]/90 text-[#F1EEFB] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.6)] backdrop-blur-md transition-transform hover:-translate-y-0.5"
        >
          <ArrowDown size={16} />
        </button>
      )}

      <div className="relative z-10 border-t border-[#5B8DEF]/15 bg-[#0A0916]/70 px-4 py-3 shadow-[0_-8px_28px_-14px_rgba(0,0,0,0.7)] backdrop-blur-md sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 sm:gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about anything in the knowledge base…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#5B8DEF]/20 bg-[#14122A]/60 px-4 py-3 font-body text-sm text-[#F1EEFB] placeholder:text-[#9691B8]/50 transition-shadow focus:border-[#FF6B4A]/50 focus:shadow-[0_0_0_3px_rgba(255,107,74,0.12)] focus:outline-none"
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              className="stop-btn flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[#5B8DEF]/40 bg-[#14122A] px-4 py-3 font-body text-sm font-medium text-[#F1EEFB] transition-all hover:border-[#FF6B81]/50 hover:text-[#FF8F6B] sm:px-5"
            >
              <Square size={13} fill="currentColor" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="send-btn flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FF8F6B] to-[#FF6B4A] px-4 py-3 font-body text-sm font-medium text-[#0A0916] transition-all disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:px-5"
            >
              <Orbit size={14} />
              <span className="hidden sm:inline">Ask</span>
            </button>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&display=swap');
        .hero-serif {
          font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        @keyframes hero-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .orbit-avatar {
          animation: orbit-spin 12s linear infinite;
        }
        @keyframes orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spark-stroke {
          stroke-dasharray: 140;
          stroke-dashoffset: 140;
          animation: spark-draw 900ms 250ms cubic-bezier(0.22,1,0.36,1) forwards;
        }
        @keyframes spark-draw {
          to { stroke-dashoffset: 0; }
        }
        .prompt-chip {
          box-shadow: 0 4px 14px -8px rgba(0,0,0,0.5);
        }
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
          color: #FF6B4A;
          animation: blink 0.9s step-start infinite;
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        .citation-thread {
          position: relative;
          border-top: 1px solid rgba(91, 141, 239, 0.2);
        }
        .thread-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: #5B8DEF;
          box-shadow: 0 0 6px 1px rgba(91, 141, 239, 0.6);
        }
        .spark-dot {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: #FF6B4A;
          animation: spark-pulse 1s ease-in-out infinite;
        }
        @keyframes spark-pulse {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        .send-btn {
          box-shadow: 0 4px 14px -4px rgba(255,107,74,0.55);
        }
        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px -6px rgba(255,107,74,0.65);
        }
        .send-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px -2px rgba(255,107,74,0.45);
        }
        .stop-btn:active {
          transform: translateY(1px);
        }
        .scroll-fab {
          animation: fab-in 200ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes fab-in {
          from { opacity: 0; transform: translate(-50%, 6px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}