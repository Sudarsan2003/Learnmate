import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, PenSquare, Search, Send, ShieldCheck } from "lucide-react";
import {
  getConversations,
  getMe,
  getMessageContacts,
  getSchoolConversations,
  getSchoolThread,
  getThread,
  listSchools,
  sendMessage,
} from "../api/client";

// Messages page: students chat with the teachers of their school, staff with
// students and each other. Admins also get a read-only "School conversations"
// tab (the owner picks which school). New messages arrive by polling while the
// page is open; the bell and the Messages button show unread ones elsewhere.

const THREAD_POLL_MS = 4000;
const LIST_POLL_MS = 15000;
const ROLE_LABEL = { ADMIN: "Admin", TEACHER: "Teacher", USER: "Student" };

const timeOf = (iso) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
};

// Adds messages not already shown (two checks can overlap on a slow connection).
function mergeById(prev, fresh) {
  const seen = new Set((prev ?? []).map((m) => m.id));
  const added = fresh.filter((m) => !seen.has(m.id));
  return added.length ? [...(prev ?? []), ...added].sort((a, b) => a.id - b.id) : prev ?? [];
}

const roleLine = (p) =>
  p.role === "USER" ? (p.standard ? `Student · Class ${p.standard}` : "Student") : ROLE_LABEL[p.role] ?? "";

const initials = (name) =>
  (name || "?")
    .split(/[\s._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function Avatar({ person, size = 36 }) {
  const staff = person.role && person.role !== "USER";
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: staff ? "linear-gradient(135deg,#8B73F5,#6A4DE0)" : "linear-gradient(135deg,#6E9BFF,#3A5FCB)",
      }}
      aria-hidden="true"
    >
      {initials(person.fullName || person.username)}
    </span>
  );
}

// Runs fn every ms while the tab is visible (and once straight away).
function usePolling(fn, ms, active) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!active) return undefined;
    saved.current();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

export default function Messages({ currentUsername, role, initialWith }) {
  const isAdmin = role === "ADMIN";
  const [tab, setTab] = useState("inbox");
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        setOwner(!!me.owner);
        if (me.owner) setTab("school"); // the owner doesn't chat; they review schools
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6E9BFF] to-[#3A5FCB] text-white">
            <MessageCircle size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-[Sora] text-xl font-semibold text-[var(--text)]">Messages</h1>
            <p className="text-[13px] text-[var(--muted)]">
              {role === "USER" ? "Chat with the teachers of your school." : "Chat with students and staff of your school."}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex rounded-lg border border-[var(--divider)] p-0.5 text-[13px]" role="tablist">
            {!owner && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "inbox"}
                onClick={() => setTab("inbox")}
                className={`rounded-md px-3 py-1.5 font-medium ${tab === "inbox" ? "bg-[#5B8DEF] text-white" : "text-[var(--muted)]"}`}
              >
                My messages
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={tab === "school"}
              onClick={() => setTab("school")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${tab === "school" ? "bg-[#5B8DEF] text-white" : "text-[var(--muted)]"}`}
            >
              <ShieldCheck size={14} aria-hidden="true" /> School conversations
            </button>
          </div>
        )}
      </div>

      {tab === "school" ? (
        <SchoolReview owner={owner} />
      ) : (
        // Keyed so a notification for another chat opens it fresh.
        <Inbox key={initialWith ?? "inbox"} currentUsername={currentUsername} role={role} initialWith={initialWith} />
      )}
    </div>
  );
}

function Inbox({ currentUsername, role, initialWith }) {
  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState(initialWith || null); // username
  const [composing, setComposing] = useState(false);
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState("");

  const loadConversations = useCallback(() => {
    getConversations()
      .then(setConversations)
      .catch((err) => setError(err.response?.data?.message ?? "Couldn't load your messages."));
  }, []);
  usePolling(loadConversations, LIST_POLL_MS, true);

  function openComposer() {
    setComposing(true);
    setSelected(null);
    if (!contacts) {
      getMessageContacts()
        .then(setContacts)
        .catch(() => setContacts([]));
    }
  }

  const person = useMemo(() => {
    if (!selected) return null;
    return (
      conversations?.find((c) => c.username === selected) ??
      contacts?.find((c) => c.username === selected) ?? { username: selected, fullName: selected }
    );
  }, [selected, conversations, contacts]);

  const showingDetail = !!selected || composing;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)]/70">
      {/* Conversation list */}
      <aside
        className={`${showingDetail ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-r border-[var(--divider)] md:w-80 md:flex-shrink-0`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--divider)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text)]">Chats</span>
          <button
            type="button"
            onClick={openComposer}
            className="flex items-center gap-1.5 rounded-lg bg-[#5B8DEF] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90"
          >
            <PenSquare size={14} aria-hidden="true" /> New message
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="px-4 py-3 text-sm text-[var(--error-text)]">{error}</p>}
          {conversations === null ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">
              <MessageCircle size={28} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
              No messages yet.
              <br />
              {role === "USER" ? "Start a chat with one of your teachers." : "Start a chat with a student or colleague."}
            </div>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.username}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c.username);
                      setComposing(false);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#5B8DEF]/8 ${
                      selected === c.username ? "bg-[#5B8DEF]/12" : ""
                    }`}
                  >
                    <Avatar person={c} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"} text-[var(--text)]`}>
                          {c.fullName}
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-[var(--dim)]">{timeOf(c.lastAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] text-[var(--muted)]">
                          {c.lastFrom === currentUsername ? "You: " : ""}
                          {c.lastMessage}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#5B8DEF] px-1.5 text-[11px] font-semibold text-white">
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread, composer or empty state */}
      <section className={`${showingDetail ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {composing ? (
          <ContactPicker
            contacts={contacts}
            role={role}
            onBack={() => setComposing(false)}
            onPick={(username) => {
              setComposing(false);
              setSelected(username);
            }}
          />
        ) : selected ? (
          <Thread
            key={selected}
            person={person}
            currentUsername={currentUsername}
            onBack={() => setSelected(null)}
            onSent={loadConversations}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--muted)]">
            Pick a chat on the left, or start a new one.
          </div>
        )}
      </section>
    </div>
  );
}

function ContactPicker({ contacts, role, onBack, onPick }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = (contacts ?? []).filter(
      (c) => !q || c.fullName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.standard === q
    );
    const out = new Map();
    for (const c of matching) {
      const key = c.role === "USER" ? (c.standard ? `Class ${c.standard}` : "Students") : "Teachers & staff";
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(c);
    }
    return [...out.entries()];
  }, [contacts, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--divider)] px-3 py-3">
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)]">
          <ArrowLeft size={18} />
        </button>
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={role === "USER" ? "Search teachers…" : "Search by name or class…"}
            className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none focus:border-[#5B8DEF]"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {contacts === null ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            {contacts.length === 0 ? "There's nobody in your school to message yet." : "No one matches that search."}
          </p>
        ) : (
          groups.map(([label, people]) => (
            <div key={label} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--dim)]">{label}</p>
              {people.map((p) => (
                <button
                  key={p.username}
                  type="button"
                  onClick={() => onPick(p.username)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#5B8DEF]/8"
                >
                  <Avatar person={p} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--text)]">{p.fullName}</span>
                    <span className="block text-[12px] text-[var(--muted)]">{roleLine(p)}</span>
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Thread({ person, currentUsername, onBack, onSent }) {
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastId = useRef(0);
  const inFlight = useRef(false);
  const endRef = useRef(null);

  const poll = useCallback(() => {
    if (inFlight.current) return; // the previous check hasn't answered yet
    inFlight.current = true;
    getThread(person.username, lastId.current)
      .then((fresh) => {
        if (fresh.length) lastId.current = Math.max(lastId.current, fresh[fresh.length - 1].id);
        setItems((prev) => mergeById(prev, fresh));
      })
      .catch((err) => setError(err.response?.data?.message ?? "Couldn't load this chat."))
      .finally(() => {
        inFlight.current = false;
      });
  }, [person.username]);
  usePolling(poll, THREAD_POLL_MS, true);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  async function send(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const sent = await sendMessage(person.username, text);
      setDraft("");
      setItems((prev) => mergeById(prev, [sent]));
      onSent?.();
    } catch (err) {
      setError(err.response?.data?.message ?? "Couldn't send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--divider)] px-3 py-3 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Back to chats" className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] md:hidden">
          <ArrowLeft size={18} />
        </button>
        <Avatar person={person} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{person.fullName || person.username}</p>
          <p className="text-[12px] text-[var(--muted)]">{roleLine(person)}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5">
        {items === null ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="pt-10 text-center text-sm text-[var(--muted)]">Say hello to start the conversation.</p>
        ) : (
          items.map((m) => <Bubble key={m.id} message={m} mine={m.from === currentUsername} />)
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t border-[var(--divider)] px-3 py-3 sm:px-4">
        {error && <p className="mb-2 text-[13px] text-[var(--error-text)]">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            rows={1}
            maxLength={2000}
            placeholder="Write a message…"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-[var(--divider)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#5B8DEF]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl bg-[#5B8DEF] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ message, mine }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[70%] ${
          mine
            ? "rounded-br-md bg-gradient-to-br from-[#6E9BFF] to-[#3A5FCB] text-white"
            : "rounded-bl-md border border-[var(--divider)] bg-[var(--surface-2)] text-[var(--text)]"
        }`}
      >
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
        <p className={`mt-0.5 text-right text-[10.5px] ${mine ? "text-white/75" : "text-[var(--dim)]"}`}>
          {timeOf(message.createdAt)}
          {mine && message.readAt ? " · Seen" : ""}
        </p>
      </div>
    </div>
  );
}

// Admins: read-only view of the conversations in their school (the owner picks the school).
function SchoolReview({ owner }) {
  const [schools, setSchools] = useState([]);
  const [school, setSchool] = useState("");
  // Results are stored with the school / conversation they belong to, so switching
  // shows "Loading…" until the new ones arrive instead of the previous school's.
  const [loadedList, setLoadedList] = useState({ school: null, list: null });
  const [openState, setOpen] = useState(null); // { school, conversation }
  const [loadedThread, setLoadedThread] = useState({ key: null, items: null });
  const [error, setError] = useState("");
  const conversations = loadedList.school === school ? loadedList.list : null;
  const open = openState && openState.school === school ? openState.conversation : null;
  const openKey = open ? `${school}|${open.a.username}|${open.b.username}` : null;
  const thread = loadedThread.key === openKey ? loadedThread.items : null;

  useEffect(() => {
    if (!owner) return undefined;
    let cancelled = false;
    listSchools()
      .then((list) => {
        if (cancelled) return;
        setSchools(list);
        if (list.length) setSchool(list[0].name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [owner]);

  useEffect(() => {
    if (owner && !school) return undefined;
    let cancelled = false;
    getSchoolConversations(owner ? school : undefined)
      .then((data) => !cancelled && setLoadedList({ school, list: data }))
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Couldn't load conversations."));
    return () => {
      cancelled = true;
    };
  }, [owner, school]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    getSchoolThread(open.a.username, open.b.username, owner ? school : undefined)
      .then((data) => !cancelled && setLoadedThread({ key: openKey, items: data }))
      .catch(() => !cancelled && setLoadedThread({ key: openKey, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [open, openKey, owner, school]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--muted)]">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>Read-only. Students and teachers aren&apos;t told when you open a conversation.</span>
        {owner && (
          <select
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="ml-auto rounded-lg border border-[var(--divider)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--text)]"
            aria-label="School"
          >
            {schools.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)]/70">
        <aside className={`${open ? "hidden md:block" : "block"} w-full overflow-y-auto border-r border-[var(--divider)] md:w-96 md:flex-shrink-0`}>
          {error && <p className="px-4 py-3 text-sm text-[var(--error-text)]">{error}</p>}
          {conversations === null ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">No conversations in this school yet.</p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={`${c.a.username}|${c.b.username}`}>
                  <button
                    type="button"
                    onClick={() => setOpen({ school, conversation: c })}
                    className={`w-full px-4 py-3 text-left hover:bg-[#5B8DEF]/8 ${open === c ? "bg-[#5B8DEF]/12" : ""}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[var(--text)]">
                        {c.a.fullName} ↔ {c.b.fullName}
                      </span>
                      <span className="flex-shrink-0 text-[11px] text-[var(--dim)]">{timeOf(c.lastAt)}</span>
                    </span>
                    <span className="block truncate text-[12.5px] text-[var(--muted)]">
                      {c.messageCount} message{c.messageCount === 1 ? "" : "s"} · {c.lastMessage}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className={`${open ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {!open ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--muted)]">
              Pick a conversation to read it.
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-[var(--divider)] px-3 py-3 sm:px-4">
                <button type="button" onClick={() => setOpen(null)} aria-label="Back" className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] md:hidden">
                  <ArrowLeft size={18} />
                </button>
                <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
                  {open.a.fullName} <span className="font-normal text-[var(--muted)]">({roleLine(open.a)})</span> ↔{" "}
                  {open.b.fullName} <span className="font-normal text-[var(--muted)]">({roleLine(open.b)})</span>
                </p>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5">
                {thread === null ? (
                  <p className="text-sm text-[var(--muted)]">Loading…</p>
                ) : (
                  thread.map((m) => <Bubble key={m.id} message={m} mine={m.from === open.a.username} />)
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
