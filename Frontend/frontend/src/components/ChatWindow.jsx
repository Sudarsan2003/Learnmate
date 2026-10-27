import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Orbit, Menu, Sparkles, Plus, Copy, Check, RotateCcw, Square, ArrowDown, LayoutDashboard, Gamepad2 } from "lucide-react";
import { sendChatMessage, getSessionHistory } from "../api/client";
import ProfileMenu from "./ProfileMenu";
import AmbientBackground from "./AmbientBackground";
import { useTypewriter } from "./Usetypewriter";
import ThemeToggle from "./ThemeToggle";
import ChatQuiz, { QUIZ_TOKEN } from "./ChatQuiz";
import NotificationBell from "./NotificationBell";
import MaterialPicker, { MATERIALS_TOKEN } from "./MaterialPicker";

// Matches the key Quizzes.jsx writes to when a student clicks
// "Ask LearnMate" after submitting a quiz.
const PENDING_QUIZ_CHAT_KEY = "learnmate_pending_quiz_chat";

const EXAMPLE_PROMPTS = [
  "Explain a concept from scratch",
  "Quiz me on Biology Chapter 5",
  "Summarize the last reading",
  "Compare two related ideas",
];

// When the backend generates a practice quiz it appends [[LEARNMATE_QUIZ:<id>]] to the message.
// Returns that attempt id for a tutor message, or null for ordinary messages.
function quizIdOf(message) {
  if (message.role !== "tutor" || typeof message.text !== "string") return null;
  const match = message.text.match(QUIZ_TOKEN);
  return match ? Number(match[1]) : null;
}

// When the backend asks which material to quiz on it appends [[LEARNMATE_MATERIALS:<ids>]].
// Returns { text, preselected } for those tutor messages (token stripped), or null otherwise.
function materialPromptOf(message) {
  if (message.role !== "tutor" || typeof message.text !== "string") return null;
  const match = message.text.match(MATERIALS_TOKEN);
  if (!match) return null;
  return {
    text: message.text.replace(MATERIALS_TOKEN, "").trim(),
    preselected: match[1].split(",").filter(Boolean),
  };
}

// Wider than a normal tutor bubble: it holds the interactive quiz (selectable answers,
// autosaved progress, graded result) instead of plain text.
function QuizBubble({ attemptId }) {
  return (
    <div className="min-w-0 w-full max-w-[95%] rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/80 px-4 py-3 font-chat text-[16px] leading-[1.7] text-[var(--text)] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:max-w-[85%]">
      <ChatQuiz attemptId={attemptId} />
    </div>
  );
}

function TutorBubble({ text, isNew, citations, isError, onCopy, copied, onRegenerate, canRegenerate, children }) {
  const { shown, done } = useTypewriter(text, { active: isNew, speed: 12 });
  const [showSources, setShowSources] = useState(false);

  return (
    <div
      className={`message-card group relative min-w-0 max-w-[85%] rounded-xl px-4 py-3 font-chat text-[16px] leading-[1.7] backdrop-blur-sm sm:max-w-[75%] ${
        isError
          ? "border border-[#FF6B81]/40 bg-[var(--error-bg)]/70 text-[var(--error-text)]"
          : "border border-[#5B8DEF]/20 bg-[var(--surface-2)]/80 text-[var(--text)]"
      }`}
    >
      {/* Tutor answers (and quizzes) are Markdown: headings, lists, bold, tables. */}
      <div className="chat-md [overflow-wrap:anywhere]">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{shown}</ReactMarkdown>
        {!done && <span className="typing-cursor" aria-hidden="true">▍</span>}
      </div>

      {done && children}

      {done && citations && citations.length > 0 && (
        <div className="citation-thread mt-3 pt-3">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            aria-expanded={showSources}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5B8DEF]/90 transition-colors hover:text-[#8B73F5]"
          >
            <span className="thread-dot" />
            {showSources ? "Hide sources" : `Sources (${citations.length})`}
          </button>
          {showSources && (
            <ul className="mt-1.5 space-y-1">
              {citations.map((c) => (
                <li key={c.chunkId} className="text-[12.5px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]">
                  <span className="text-[#8B73F5]">[{c.sourceId}]</span> {c.content.slice(0, 90)}
                  {c.content.length > 90 ? "…" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {done && !isError && (onCopy || (canRegenerate && onRegenerate)) && (
        <div className="msg-actions mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onCopy && (
            <button
              onClick={onCopy}
              aria-label="Copy answer"
              title="Copy answer"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[#5B8DEF]/15 hover:text-[var(--text)]"
            >
              {copied ? <Check size={12} className="text-[#5B8DEF]" /> : <Copy size={12} />}
            </button>
          )}
          {canRegenerate && onRegenerate && (
            <button
              onClick={onRegenerate}
              aria-label="Regenerate answer"
              title="Regenerate answer"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[#6A4DE0]/15 hover:text-[#8B73F5]"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// True when a learner message looks like a quiz answer sheet ("1. B  2. D ...").
// Regenerating those would re-send answers to an already-graded quiz.
function looksLikeQuizAnswers(text) {
  return typeof text === "string" && /^\s*[Qq]?1\s*[.):\-]/.test(text);
}

export default function ChatWindow({
  currentUser,
  currentRole,
  onLogout,
  isAdmin,
  onOpenUpload,
  onOpenUsers,
  onOpenQuizzes,
  onOpenProfile,
  onOpenDashboard,
  onOpenReports,
  onOpenGames,
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
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
  );
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
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.addEventListener("learnmate:logout", onLogout);
    return () => document.removeEventListener("learnmate:logout", onLogout);
  }, [onLogout]);

  // add alongside the existing logout listener:
  useEffect(() => {
    function handleOpenUsers() {
      onOpenUsers?.();
    }
    document.addEventListener("learnmate:open-users", handleOpenUsers);
    return () => document.removeEventListener("learnmate:open-users", handleOpenUsers);
  }, [onOpenUsers]);

  useEffect(() => {
    function handleOpenQuizzes() {
      onOpenQuizzes?.();
    }
    document.addEventListener("learnmate:open-quizzes", handleOpenQuizzes);
    return () => document.removeEventListener("learnmate:open-quizzes", handleOpenQuizzes);
  }, [onOpenQuizzes]);

  useEffect(() => {
    function handleOpenDashboard() {
      onOpenDashboard?.();
    }
    document.addEventListener("learnmate:open-dashboard", handleOpenDashboard);
    return () => document.removeEventListener("learnmate:open-dashboard", handleOpenDashboard);
  }, [onOpenDashboard]);

  useEffect(() => {
    function handleOpenReports() {
      onOpenReports?.();
    }
    document.addEventListener("learnmate:open-reports", handleOpenReports);
    return () => document.removeEventListener("learnmate:open-reports", handleOpenReports);
  }, [onOpenReports]);

  useEffect(() => {
    function handleOpenGames() {
      onOpenGames?.();
    }
    document.addEventListener("learnmate:open-games", handleOpenGames);
    return () => document.removeEventListener("learnmate:open-games", handleOpenGames);
  }, [onOpenGames]);

  useEffect(() => {
    function handleOpenProfile() {
      onOpenProfile?.();
    }
    document.addEventListener("learnmate:open-profile", handleOpenProfile);
    return () => document.removeEventListener("learnmate:open-profile", handleOpenProfile);
  }, [onOpenProfile]);

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

  // One-time hand-off from the quiz page: a student who clicked "Ask
  // LearnMate" after submitting a quiz arrives here with an explanation
  // already generated (scoped server-side to their own attempt). Drop it
  // straight into the conversation as a learner/tutor turn and clear the
  // storage slot so it doesn't reappear on a later visit.
  useEffect(() => {
    let raw;
    try {
      raw = sessionStorage.getItem(PENDING_QUIZ_CHAT_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    sessionStorage.removeItem(PENDING_QUIZ_CHAT_KEY);
    try {
      const pending = JSON.parse(raw);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "learner", text: pending.question },
        { id: crypto.randomUUID(), role: "tutor", text: pending.answer, isNew: true },
      ]);
    } catch {
      // malformed payload — ignore
    }
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading, isAtBottom]);

  // Grow the composer with its content (up to ~10rem) so long questions
  // aren't stuck in a one-line box; shrinks back once the input is cleared.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, 160)}px`;
  }, [input]);

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
    async (query, materialIds) => {
      const token = ++requestTokenRef.current;
      setIsLoading(true);

      try {
        const response = await sendChatMessage({ query, sessionId, materialIds });
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

  // "Start quiz" in the material picker: ask for a quiz built from just those documents.
  function handleStartMaterialQuiz(materials) {
    if (isLoading) return;
    const query = `Quiz me on ${materials.map((m) => m.name).join(", ")}`;
    const materialIds = materials.map((m) => m.id);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "learner", text: query, materialIds }]);
    performSend(query, materialIds);
  }

  function handleStop() {
    requestTokenRef.current++; // orphan any in-flight response
    setIsLoading(false);
  }

  function handleRegenerate(index) {
    const query = messages[index - 1]?.text;
    if (!query || messages[index - 1]?.role !== "learner") return;
    setMessages((prev) => prev.slice(0, index));
    performSend(query, messages[index - 1].materialIds);
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
    <div className="relative flex h-full w-full flex-col bg-[var(--bg-canvas)] text-[var(--text)]" style={{ perspective: "1400px" }}>
      <AmbientBackground />

      <header className="relative z-30 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-[#5B8DEF]/15 bg-[var(--bg-canvas)]/70 px-3 py-2.5 shadow-[0_8px_28px_-14px_rgba(40,70,160,0.28)] backdrop-blur-md sm:flex-nowrap sm:gap-x-3 sm:px-6 sm:py-4">
        {/* Left: menu + title (takes remaining space so the profile sits at the far right) */}
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2">
          <button
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:h-8 sm:w-8"
          >
            <Menu size={20} />
          </button>
          <h1 className="hero-serif truncate text-xl text-[var(--text)] sm:text-2xl">
            {sessionId ? "Chat" : "New chat"}
          </h1>
        </div>

        {/* Theme + profile: stay on the first row on phones, far right on desktop */}
        <div className="order-2 flex flex-shrink-0 items-center gap-2 sm:order-3 sm:ml-1">
          <NotificationBell />
          <ThemeToggle />
          <div
            className="profile-badge flex-shrink-0 rounded-full"
            title={currentUser}
          >
            <ProfileMenu username={currentUser} role={currentRole} />
          </div>
        </div>

        {/* Actions: own scrollable row on phones, inline on desktop */}
        <nav
          aria-label="Primary actions"
          className="no-scrollbar order-3 -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 overflow-x-auto px-3 pb-0.5 text-[13.5px] font-medium text-[var(--muted)] sm:order-2 sm:mx-0 sm:w-auto sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0"
        >
          <button onClick={handleNewChatClick} aria-label="New chat" className="flex h-10 min-w-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#5B8DEF]/25 px-2.5 text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#5B8DEF]/50 hover:text-[var(--text)] sm:h-auto sm:px-3 sm:py-1.5">
            <Plus size={16} />
            <span className="hidden sm:inline">New chat</span>
          </button>

          <button onClick={onOpenDashboard} aria-label="Dashboard" className="flex h-10 min-w-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#5B8DEF]/25 px-2.5 text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#5B8DEF]/50 hover:text-[var(--text)] sm:h-auto sm:px-3 sm:py-1.5">
            <LayoutDashboard size={16} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          <button onClick={onOpenGames} aria-label="Games" className="flex h-10 min-w-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#5B8DEF]/25 px-2.5 text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#5B8DEF]/50 hover:text-[var(--text)] sm:h-auto sm:px-3 sm:py-1.5">
            <Gamepad2 size={16} />
            <span className="hidden sm:inline">Games</span>
          </button>

          <button onClick={onOpenQuizzes} className="flex h-10 min-w-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#5B8DEF]/25 px-2.5 text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#5B8DEF]/50 hover:text-[var(--text)] sm:h-auto sm:px-3 sm:py-1.5">
            <span className="hidden sm:inline">Quizzes</span>
            <span className="sm:hidden">Quiz</span>
          </button>

          {isAdmin && (
            <button
              onClick={onOpenUpload}
              className="flex h-10 flex-shrink-0 items-center rounded-md border border-[#6A4DE0]/60 px-3 text-[#8B73F5] transition-all hover:-translate-y-0.5 hover:bg-[#6A4DE0] hover:text-[#FFFFFF] hover:shadow-lg hover:shadow-[#6A4DE0]/20 sm:h-auto sm:py-1.5"
            >
              Upload
            </button>
          )}
        </nav>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
        {historyLoading && (
          <p className="text-sm text-[var(--muted)]/70">Mapping the knowledge graph…</p>
        )}

        {!historyLoading && messages.length === 0 && (
          <div
            style={{ animation: "hero-in 500ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
            className="mx-auto flex w-full min-w-0 max-w-2xl flex-col items-center gap-6 pt-4 text-center sm:gap-9 sm:pt-16"
          >
            <div className="flex flex-col items-center gap-3.5">
              <div className="orbit-avatar flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#8B73F5] to-[#4A33B5] shadow-[0_6px_20px_rgba(106,77,224,0.35)]">
                <Orbit size={20} className="text-[#FFFFFF]" />
              </div>
              <h2 className="hero-serif text-[1.75rem] italic leading-[1.15] text-[var(--text)] [overflow-wrap:anywhere] min-[400px]:text-3xl sm:text-[2.5rem]">
                What are we studying today?
              </h2>
              <svg width="128" height="12" viewBox="0 0 128 12" fill="none" className="opacity-70">
                <path
                  d="M2 7 C 34 -2, 92 16, 126 5"
                  stroke="#6A4DE0"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="spark-stroke"
                />
              </svg>
              <p className="max-w-md font-ui text-sm text-[var(--muted)]">
                Ask anything — every answer traces a path back to a node in your knowledge base.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button
                  key={p}
                  onClick={() => handlePromptClick(p)}
                  style={{ animation: "message-in 300ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${180 + i * 60}ms` }}
                  className="prompt-chip group flex min-h-11 items-center gap-2.5 rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/50 px-4 py-3 text-left text-sm text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[#6A4DE0]/40 hover:bg-[var(--surface-2)]/85 hover:text-[var(--text)]"
                >
                  <Sparkles size={14} className="flex-shrink-0 text-[#5B8DEF]/80 transition-colors group-hover:text-[#8B73F5]" />
                  <span className="font-ui">{p}</span>
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
                <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B73F5] to-[#4A33B5] shadow-[0_3px_10px_rgba(106,77,224,0.4)]">
                  <Orbit size={12} className="text-[#FFFFFF]" />
                </div>
              )}

              {m.role === "learner" ? (
                <div className="message-card min-w-0 max-w-[85%] rounded-xl bg-gradient-to-br from-[#6E9BFF] to-[#3A5FCB] px-4 py-3 font-chat text-[16px] leading-[1.7] text-[#FFFFFF] sm:max-w-[75%]">
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</p>
                </div>
              ) : quizIdOf(m) !== null ? (
                <QuizBubble attemptId={quizIdOf(m)} />
              ) : materialPromptOf(m) ? (
                <TutorBubble text={materialPromptOf(m).text} isNew={!!m.isNew}>
                  <MaterialPicker
                    preselected={materialPromptOf(m).preselected}
                    active={i === messages.length - 1 && !isLoading}
                    onStart={handleStartMaterialQuiz}
                  />
                </TutorBubble>
              ) : (
                <TutorBubble
                  text={m.text}
                  isNew={!!m.isNew}
                  citations={m.citations}
                  isError={m.isError}
                  onCopy={() => handleCopy(m.id, m.text)}
                  copied={copiedId === m.id}
                  canRegenerate={
                    i === lastTutorIndex &&
                    !isLoading &&
                    !looksLikeQuizAnswers(messages[i - 1]?.text)
                  }
                  onRegenerate={() => handleRegenerate(i)}
                />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B73F5] to-[#4A33B5]">
                <Orbit size={12} className="text-[#FFFFFF]" />
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/80 px-4 py-3 font-chat text-[14px] text-[var(--muted)] backdrop-blur-sm">
                <span>Tracing the graph</span>
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
          className="scroll-fab absolute bottom-4 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[#5B8DEF]/30 bg-[var(--surface-2)]/90 text-[var(--text)] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.6)] backdrop-blur-md transition-transform hover:-translate-y-0.5"
        >
          <ArrowDown size={16} />
        </button>
      )}
      </div>

      <div className="relative z-10 border-t border-[#5B8DEF]/15 bg-[var(--bg-canvas)]/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_-14px_rgba(40,70,160,0.28)] backdrop-blur-md sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 sm:gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? "Ask anything…" : "Ask about anything in the knowledge base…"}
            rows={1}
            className="max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 px-4 py-3 font-ui text-[16px] text-[var(--text)] placeholder:text-[var(--muted)]/50 transition-shadow sm:text-sm focus:border-[#6A4DE0]/50 focus:shadow-[0_0_0_3px_rgba(106,77,224,0.12)] focus:outline-none"
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              className="stop-btn flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[#5B8DEF]/40 bg-[var(--surface-2)] px-4 py-3 font-ui text-sm font-medium text-[var(--text)] transition-all hover:border-[#FF6B81]/50 hover:text-[#8B73F5] sm:px-5"
            >
              <Square size={13} fill="currentColor" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="send-btn flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B73F5] to-[#6A4DE0] px-4 py-3 font-ui text-sm font-medium text-[#FFFFFF] transition-all disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:px-5"
            >
              <Orbit size={14} />
              <span className="hidden sm:inline">Ask</span>
            </button>
          )}
        </div>
      </div>

      <style>{`
        /* Markdown inside tutor bubbles (Tailwind preflight strips these defaults) */
        .chat-md > :first-child { margin-top: 0; }
        .chat-md > :last-child { margin-bottom: 0; }
        .chat-md h1 { font-size: 1.4rem; font-weight: 600; margin: 0.25rem 0 0.6rem; }
        .chat-md h2 { font-size: 1.3rem; font-weight: 600; margin: 0.25rem 0 0.5rem; }
        .chat-md h3 { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.4rem; }
        .chat-md p { margin: 0.4rem 0; }
        .chat-md ul { list-style: disc; padding-left: 1.25rem; margin: 0.4rem 0; }
        .chat-md ol { list-style: decimal; padding-left: 1.25rem; margin: 0.4rem 0; }
        .chat-md li { margin: 0.15rem 0; }
        .chat-md strong { font-weight: 600; }
        .chat-md code { background: rgba(91, 141, 239, 0.15); padding: 0 0.3rem; border-radius: 4px; font-size: 0.9em; }
        .chat-md hr { margin: 1rem 0; border: 0; border-top: 1px solid rgba(91, 141, 239, 0.3); }
        .chat-md table { border-collapse: collapse; margin: 0.6rem 0; display: block; overflow-x: auto; }
        .chat-md th, .chat-md td { border: 1px solid rgba(91, 141, 239, 0.25); padding: 0.3rem 0.6rem; text-align: left; }

        /* Profile avatar: always clearly visible on dark & light themes */
        .profile-badge {
          padding: 2px;
          background: linear-gradient(135deg, #8B73F5, #5B8DEF);
          box-shadow: 0 0 0 2px var(--bg-canvas), 0 4px 14px -2px rgba(106, 77, 224, 0.65);
        }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .hero-serif {
          font-family: 'Sora', system-ui, sans-serif;
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
        /* Hover lift only where there's a real hover; on touch it sticks after a tap. */
        @media (hover: hover) and (pointer: fine) {
          .message-card:hover {
          transform: translateY(-3px) rotateX(2deg) rotateY(-1deg);
          box-shadow: 0 16px 32px -10px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.07) inset;
          }
        }
        /* Copy / regenerate are hover-revealed on desktop; always show them (and
           make them tappable) on touch screens where hover doesn't exist. */
        @media (hover: none) {
          .msg-actions { opacity: 1 !important; }
        }
        @media (pointer: coarse) {
          .msg-actions button { width: 2rem; height: 2rem; }
        }
        .typing-cursor {
          display: inline-block;
          margin-left: 2px;
          color: #4F80F8;
          font-family: var(--font-ui);
          line-height: 1;
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
          background: #6A4DE0;
          animation: spark-pulse 1s ease-in-out infinite;
        }
        @keyframes spark-pulse {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        .send-btn {
          box-shadow: 0 4px 14px -4px rgba(106,77,224,0.55);
        }
        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px -6px rgba(106,77,224,0.65);
        }
        .send-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px -2px rgba(106,77,224,0.45);
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