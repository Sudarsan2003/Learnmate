import { useState, useRef, useEffect } from "react";
import { sendChatMessage } from "../api/client";

const LEVELS = ["beginner", "intermediate", "advanced"];

export default function ChatWindow({ currentUser, onLogout, isAdmin, onOpenUpload }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("beginner");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

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
      const response = await sendChatMessage({ query, subject: subject || undefined, level });
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
    <div className="flex h-full w-full flex-col bg-ink text-parchment">
      <header className="flex items-center justify-between border-b border-moss px-6 py-4">
        <h1 className="font-display text-2xl tracking-tight">
          LearnMate<span className="text-amber">.</span>
        </h1>
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-sage">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="subject filter (optional)"
            className="w-48 rounded border border-moss bg-transparent px-2 py-1 text-parchment placeholder:text-sage/60 focus:border-amber focus:outline-none"
          />
          <div className="flex overflow-hidden rounded border border-moss">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-3 py-1 transition-colors ${
                  level === l ? "bg-amber text-ink" : "hover:bg-moss/60"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              onClick={onOpenUpload}
              className="ml-1 rounded border border-amber px-3 py-1 text-amber hover:bg-amber hover:text-ink transition-colors"
            >
              upload
            </button>
          )}

          {currentUser && (
            <button onClick={onLogout} className="ml-2 text-sage hover:text-amber">
              log out ({currentUser})
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <p className="font-body text-sm text-sage">
            Ask something and the tutor will answer grounded in whatever's in the knowledge base right
            now — currently a mock response, since the LLM isn't wired in yet.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "learner" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 font-body text-sm leading-relaxed ${
                m.role === "learner"
                  ? "bg-amber text-ink"
                  : m.isError
                  ? "border border-red-400/40 bg-moss/40 text-red-200"
                  : "bg-moss text-parchment"
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
          <div className="flex justify-start">
            <div className="rounded-lg bg-moss px-4 py-3 font-mono text-xs text-sage">
              thinking<span className="animate-pulse">…</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-moss px-6 py-4">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about anything in the knowledge base…"
            rows={1}
            className="flex-1 resize-none rounded-md border border-moss bg-moss/30 px-3 py-2 font-body text-sm text-parchment placeholder:text-sage/60 focus:border-amber focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="rounded-md bg-amber px-5 py-2 font-body text-sm font-medium text-ink transition-opacity disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}