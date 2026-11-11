import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImageOff,
  Loader2,
  Pause,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
} from "lucide-react";
import {
  createStory,
  deleteStory,
  editStoryPage,
  getMe,
  getStory,
  getStorySettings,
  listSchools,
  listStories,
  redrawStoryPage,
  setStoryPublished,
  storyPictureUrl,
} from "../api/client";

// Picture-book stories. Teachers write a topic; the AI writes the pages from
// the school's books and draws a picture for each. The teacher checks every
// page, fixes words or redraws a picture, and publishes it for one class.
// Students see their class's published stories as a picture book that can
// read itself aloud.

const CLASS_OPTIONS = [
  { value: "LKG", label: "LKG (KG-1)" },
  { value: "UKG", label: "UKG (KG-2)" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Class ${i + 1}` })),
];
const classLabel = (v) => CLASS_OPTIONS.find((c) => c.value === v)?.label ?? `Class ${v}`;

const SPEECH_LANG = { English: "en-IN", Kannada: "kn-IN", Telugu: "te-IN", Hindi: "hi-IN" };

// ------------------------------------------------------------------ read aloud

function voiceFor(language) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const want = SPEECH_LANG[language] ?? "en-IN";
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === want) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(want.slice(0, 2))) ??
    null
  );
}

// Phone browsers are strict about speech: iPhones only speak when the first
// request comes from a tap, Android Chrome sometimes drops speech asked for
// right after stopping, and nothing plays on an iPhone in silent mode. So:
// - "speaking" is only shown once the phone really starts (onstart);
// - a request that doesn't start is retried once, then `blocked` is set so
//   the page can ask the reader to tap 🔊 (and check silent mode / volume);
// - the reader calls speak() straight from taps (page turns, 🔊), not later.
function useSpeech(language) {
  const [speaking, setSpeaking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [voiceMissing, setVoiceMissing] = useState(false);
  const currentRef = useRef(null); // the utterance we're waiting on (also stops it being garbage-collected)
  const timerRef = useRef(null);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const check = () => setVoiceMissing(language !== "English" && !voiceFor(language));
    check();
    window.speechSynthesis.addEventListener?.("voiceschanged", check);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", check);
      clearTimeout(timerRef.current);
      currentRef.current = null;
      window.speechSynthesis.cancel();
    };
  }, [language]);

  const speak = useCallback(
    (text) => {
      const synth = typeof window === "undefined" ? null : window.speechSynthesis;
      if (!synth || !text) return;
      clearTimeout(timerRef.current);
      if (synth.speaking || synth.pending) synth.cancel();

      const make = () => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = SPEECH_LANG[language] ?? "en-IN";
        const v = voiceFor(language);
        if (v) u.voice = v;
        u.rate = 0.85; // a little slower, for small children
        u.onstart = () => {
          if (currentRef.current !== u) return;
          setSpeaking(true);
          setBlocked(false);
        };
        const done = (e) => {
          if (currentRef.current !== u) return;
          setSpeaking(false);
          if (e?.error === "not-allowed") setBlocked(true);
        };
        u.onend = done;
        u.onerror = done;
        currentRef.current = u;
        return u;
      };

      let u = make();
      synth.speak(u);
      synth.resume(); // Chrome can be left "paused" after a cancel

      // Not started? Try once more (Android drops some requests), then give up and say so.
      timerRef.current = setTimeout(() => {
        if (currentRef.current !== u || synth.speaking) return;
        synth.cancel();
        u = make();
        synth.speak(u);
        synth.resume();
        timerRef.current = setTimeout(() => {
          if (currentRef.current === u && !synth.speaking) {
            setSpeaking(false);
            setBlocked(true);
          }
        }, 1500);
      }, 500);
    },
    [language],
  );

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    currentRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return {
    speak,
    stop,
    speaking,
    blocked,
    voiceMissing,
    supported: typeof window !== "undefined" && !!window.speechSynthesis,
  };
}

// ------------------------------------------------------------------ pictures

const pictureCache = new Map(); // "id-page-version" -> object URL

function StoryPicture({ storyId, pageNo, version, className = "", alt = "" }) {
  const key = `${storyId}-${pageNo}-${version}`;
  const [src, setSrc] = useState(() => pictureCache.get(key) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!version || pictureCache.has(key)) return undefined;
    let cancelled = false;
    storyPictureUrl(storyId, pageNo)
      .then((url) => {
        pictureCache.set(key, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [key, storyId, pageNo, version]);

  const shown = version ? (src ?? pictureCache.get(key)) : null;
  if (!version || failed) {
    return (
      <div className={`flex items-center justify-center bg-[#EEF3FF] text-[#7C8AA8] [[data-theme=dark]_&]:bg-[#1A2440] ${className}`}>
        <ImageOff size={28} aria-hidden="true" />
      </div>
    );
  }
  if (!shown) return <div className={`animate-pulse bg-[#EEF3FF] [[data-theme=dark]_&]:bg-[#1A2440] ${className}`} />;
  return <img src={shown} alt={alt} className={`object-cover ${className}`} />;
}

// ------------------------------------------------------------------ main page

export default function Stories({ role }) {
  const staff = role === "TEACHER" || role === "ADMIN";
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // { id, mode: "edit" | "read" }

  const load = useCallback(async () => {
    try {
      setStories(await listStories());
      setError("");
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load stories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listStories()
      .then((data) => !cancelled && setStories(data))
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load stories."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // While a story is being made, check every few seconds.
  const making = stories.some((s) => s.status === "GENERATING");
  useEffect(() => {
    if (!making) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [making, load]);

  if (open?.mode === "read") {
    return <StoryReader storyId={open.id} onClose={() => setOpen(staff ? { id: open.id, mode: "edit" } : null)} />;
  }
  if (open?.mode === "edit") {
    return (
      <StoryEditor
        storyId={open.id}
        onBack={() => {
          setOpen(null);
          load();
        }}
        onPreview={() => setOpen({ id: open.id, mode: "read" })}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFB648] to-[#FF7A59] text-white shadow">
          <BookOpen size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Story time</h1>
          <p className="text-sm text-[var(--muted)]">
            {staff
              ? "Make picture-book stories from your class's material. Students see a story once you publish it."
              : "Picture books from your teacher. Tap a book to read, or let it read to you."}
          </p>
        </div>
      </div>

      {staff && <CreateStory onCreated={load} />}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 [[data-theme=dark]_&]:bg-red-950/40 [[data-theme=dark]_&]:text-red-300">{error}</p>}

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[var(--surface)]" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center text-[var(--muted)]">
          <BookOpen size={36} aria-hidden="true" />
          <p className="mt-3 font-medium text-[var(--text)]">No stories yet</p>
          <p className="mt-1 max-w-sm text-sm">
            {staff ? "Make your first story above." : "When your teacher shares a story, it will appear here."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {stories.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpen({ id: s.id, mode: staff ? "edit" : "read" })}
                disabled={s.status === "GENERATING"}
                className="group flex w-full flex-col overflow-hidden rounded-2xl border border-[#5B8DEF]/20 bg-[var(--surface)] text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait"
              >
                {s.status === "GENERATING" ? (
                  <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-[#FFF6E8] text-[#B7791F] [[data-theme=dark]_&]:bg-[#2A2214]">
                    <Loader2 size={26} className="animate-spin" aria-hidden="true" />
                    <span className="text-xs font-medium">Writing and drawing…</span>
                  </div>
                ) : (
                  <StoryPicture
                    storyId={s.id}
                    pageNo={s.coverPage}
                    version={s.coverVersion}
                    className="aspect-[4/3] w-full"
                  />
                )}
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 font-semibold text-[var(--text)]">{s.title || s.topic}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {classLabel(s.standard)} · {s.language}
                  </p>
                  {staff && <StatusPill story={s} />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ story }) {
  const map = {
    GENERATING: ["Being made", "bg-amber-100 text-amber-800 [[data-theme=dark]_&]:bg-amber-900/40 [[data-theme=dark]_&]:text-amber-300"],
    READY: ["Ready to check", "bg-blue-100 text-blue-800 [[data-theme=dark]_&]:bg-blue-900/40 [[data-theme=dark]_&]:text-blue-300"],
    PUBLISHED: ["Published", "bg-emerald-100 text-emerald-800 [[data-theme=dark]_&]:bg-emerald-900/40 [[data-theme=dark]_&]:text-emerald-300"],
    FAILED: ["Couldn't be made", "bg-red-100 text-red-800 [[data-theme=dark]_&]:bg-red-900/40 [[data-theme=dark]_&]:text-red-300"],
  };
  const [label, cls] = map[story.status] ?? [story.status, ""];
  return <span className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

// ------------------------------------------------------------------ make a story

function CreateStory({ onCreated }) {
  const [standard, setStandard] = useState("LKG");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("English");
  const [pages, setPages] = useState(6);
  const [school, setSchool] = useState("");
  const [schools, setSchools] = useState([]);
  const [owner, setOwner] = useState(false);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getStorySettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {});
    getMe()
      .then((me) => {
        if (cancelled || !me.owner) return;
        setOwner(true);
        setSchool(me.institution || "");
        listSchools()
          .then((list) => !cancelled && setSchools(list.map((s) => s.name)))
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createStory({ standard, topic: topic.trim(), language, pages, institution: owner ? school : undefined });
      setTopic("");
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not start the story.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[#5B8DEF]/25 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#3558DE]";

  return (
    <form onSubmit={handleSubmit} className="mt-5 rounded-2xl border border-[#5B8DEF]/20 bg-[var(--surface)] p-4 sm:p-5">
      <p className="flex items-center gap-2 font-semibold text-[var(--text)]">
        <Sparkles size={16} className="text-[#FF7A59]" aria-hidden="true" /> Make a new story
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">What should it teach?</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={300}
            placeholder='e.g. "Fruits we eat", "The letter B", "Counting to 5", "Being kind to friends"'
            className={`${input} mt-1`}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Class</span>
          <select value={standard} onChange={(e) => setStandard(e.target.value)} className={`${input} mt-1`}>
            {CLASS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={`${input} mt-1`}>
            {(settings?.languages ?? ["English", "Kannada", "Telugu", "Hindi"]).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Pages</span>
          <select value={pages} onChange={(e) => setPages(Number(e.target.value))} className={`${input} mt-1`}>
            {[4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} pages
              </option>
            ))}
          </select>
        </label>
        {owner && (
          <label className="text-sm">
            <span className="text-[var(--muted)]">School</span>
            <select value={school} onChange={(e) => setSchool(e.target.value)} className={`${input} mt-1`}>
              <option value="">Choose a school</option>
              {schools.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {settings && !settings.picturesEnabled && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 [[data-theme=dark]_&]:bg-amber-950/40 [[data-theme=dark]_&]:text-amber-300">
          Pictures aren&apos;t set up on this server yet, so stories will be made with words only.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">
          Takes about a minute. The AI uses your uploaded books for this class when they match the topic.
        </p>
        <button
          type="submit"
          disabled={busy || topic.trim().length < 3}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Make story
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ check and publish

function StoryEditor({ storyId, onBack, onPreview }) {
  const [story, setStory] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); // what's being saved, e.g. "publish", "page-3"
  const [drafts, setDrafts] = useState({}); // pageNo -> { text, scene }

  const load = useCallback(async () => {
    try {
      setStory(await getStory(storyId));
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load the story.");
    }
  }, [storyId]);

  useEffect(() => {
    let cancelled = false;
    getStory(storyId)
      .then((s) => !cancelled && setStory(s))
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load the story."));
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  useEffect(() => {
    if (story?.status !== "GENERATING") return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [story?.status, load]);

  async function run(what, fn) {
    setBusy(what);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.message ?? "That didn't work. Please try again.");
    } finally {
      setBusy("");
    }
  }

  const draftOf = (p) => drafts[p.pageNo] ?? { text: p.text, scene: p.scene };
  const setDraft = (p, change) => setDrafts((d) => ({ ...d, [p.pageNo]: { ...draftOf(p), ...change } }));

  const savePage = (p) =>
    run(`page-${p.pageNo}`, async () => {
      const d = draftOf(p);
      setStory(await editStoryPage(storyId, p.pageNo, { text: d.text, scene: d.scene }));
      setDrafts((all) => {
        const next = { ...all };
        delete next[p.pageNo];
        return next;
      });
    });

  const redraw = (p) =>
    run(`draw-${p.pageNo}`, async () => {
      setStory(await redrawStoryPage(storyId, p.pageNo, draftOf(p).scene));
    });

  const publish = (yes) =>
    run("publish", async () => {
      await setStoryPublished(storyId, yes);
      await load();
    });

  const remove = () => {
    if (!window.confirm("Delete this story and its pictures? This can't be undone.")) return;
    run("delete", async () => {
      await deleteStory(storyId);
      onBack();
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={15} /> All stories
      </button>

      {!story ? (
        error ? <p className="mt-6 text-sm text-red-600">{error}</p> : <Loader2 className="mt-8 animate-spin text-[var(--muted)]" />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[var(--text)]">{story.title || story.topic}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {classLabel(story.standard)} · {story.language} · topic: {story.topic}
              </p>
              <StatusPill story={story} />
            </div>
            {story.canEdit && story.status !== "GENERATING" && (
              <div className="flex flex-wrap gap-2">
                {story.pageCount > 0 && (
                  <button type="button" onClick={onPreview} className="flex items-center gap-1.5 rounded-lg border border-[#5B8DEF]/30 px-3 py-2 text-sm text-[var(--text)]">
                    <Eye size={15} /> Preview
                  </button>
                )}
                {story.status === "PUBLISHED" ? (
                  <button type="button" disabled={!!busy} onClick={() => publish(false)} className="flex items-center gap-1.5 rounded-lg border border-[#5B8DEF]/30 px-3 py-2 text-sm text-[var(--text)]">
                    <Undo2 size={15} /> Unpublish
                  </button>
                ) : (
                  story.status === "READY" && (
                    <button type="button" disabled={!!busy} onClick={() => publish(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publish to {classLabel(story.standard)}
                    </button>
                  )
                )}
                <button type="button" disabled={!!busy} onClick={remove} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 [[data-theme=dark]_&]:hover:bg-red-950/40">
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            )}
          </div>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 [[data-theme=dark]_&]:bg-red-950/40 [[data-theme=dark]_&]:text-red-300">{error}</p>}

          {story.status === "GENERATING" && (
            <p className="mt-6 flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 size={16} className="animate-spin" /> Writing the pages and drawing the pictures. This takes about a minute.
            </p>
          )}
          {story.status === "FAILED" && <p className="mt-6 text-sm text-red-600">{story.error}</p>}
          {story.status === "READY" && (
            <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 [[data-theme=dark]_&]:bg-blue-950/40 [[data-theme=dark]_&]:text-blue-300">
              Check every page before publishing. Fix any words, or redraw a picture that doesn&apos;t look right.
            </p>
          )}

          <ol className="mt-5 space-y-4">
            {story.pages.map((p) => {
              const d = draftOf(p);
              const changed = d.text !== p.text || d.scene !== p.scene;
              return (
                <li key={p.pageNo} className="grid gap-4 rounded-2xl border border-[#5B8DEF]/20 bg-[var(--surface)] p-4 sm:grid-cols-[240px_1fr]">
                  <div>
                    <StoryPicture storyId={story.id} pageNo={p.pageNo} version={p.imageVersion} className="aspect-[4/3] w-full rounded-xl" alt="" />
                    {p.imageError && <p className="mt-2 text-xs text-red-600">{p.imageError}</p>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Page {p.pageNo}</p>
                    <textarea
                      value={d.text}
                      onChange={(e) => setDraft(p, { text: e.target.value })}
                      rows={2}
                      disabled={!story.canEdit}
                      className="w-full resize-none rounded-lg border border-[#5B8DEF]/25 bg-[var(--bg)] px-3 py-2 text-base text-[var(--text)] outline-none focus:border-[#3558DE]"
                    />
                    <label className="text-xs text-[var(--muted)]">
                      Picture shows (in English)
                      <input
                        value={d.scene}
                        onChange={(e) => setDraft(p, { scene: e.target.value })}
                        disabled={!story.canEdit}
                        className="mt-1 w-full rounded-lg border border-[#5B8DEF]/25 bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[#3558DE]"
                      />
                    </label>
                    {story.canEdit && (
                      <div className="flex flex-wrap gap-2">
                        {changed && (
                          <button type="button" disabled={!!busy} onClick={() => savePage(p)} className="rounded-lg bg-[#3558DE] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                            {busy === `page-${p.pageNo}` ? "Saving…" : "Save words"}
                          </button>
                        )}
                        <button type="button" disabled={!!busy} onClick={() => redraw(p)} className="flex items-center gap-1.5 rounded-lg border border-[#5B8DEF]/30 px-3 py-1.5 text-sm text-[var(--text)] disabled:opacity-50">
                          {busy === `draw-${p.pageNo}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Redraw picture
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the picture book

function StoryReader({ storyId, onClose }) {
  const [story, setStory] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [autoRead, setAutoRead] = useState(true);
  const { speak, stop, speaking, blocked, voiceMissing, supported } = useSpeech(story?.language ?? "English");
  const touchX = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getStory(storyId)
      .then((s) => !cancelled && setStory(s))
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not open the story."));
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const pages = story?.pages ?? [];
  const current = pages[page];
  const last = page === pages.length - 1;

  // Try reading the first page as the book opens. Computers allow this; phones
  // may not (no tap yet), in which case `blocked` asks the reader to tap 🔊.
  const firstText = pages[0]?.text;
  useEffect(() => {
    if (firstText && supported) speak(firstText);
    // Only when the book opens: page turns read from their own tap (go below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstText, supported]);

  // Turning a page reads it straight from the tap, which phones allow.
  const go = (delta) => {
    const next = Math.max(0, Math.min(pages.length - 1, page + delta));
    if (next === page) return;
    setPage(next);
    if (autoRead && supported) speak(pages[next].text);
    else stop();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-[#FFF8EC] to-[#EEF3FF] [[data-theme=dark]_&]:from-[#1B1A16] [[data-theme=dark]_&]:to-[#111A2E]">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-sm text-[#334] shadow-sm [[data-theme=dark]_&]:bg-white/10 [[data-theme=dark]_&]:text-[var(--text)]"
        >
          <ArrowLeft size={15} /> Books
        </button>
        {supported && story && (
          <button
            type="button"
            onClick={() => {
              if (autoRead) stop();
              else if (current) speak(current.text);
              setAutoRead((v) => !v);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm shadow-sm ${autoRead ? "bg-[#FF7A59] text-white" : "bg-white/70 text-[#334] [[data-theme=dark]_&]:bg-white/10 [[data-theme=dark]_&]:text-[var(--text)]"}`}
          >
            <Volume2 size={15} /> Read to me {autoRead ? "on" : "off"}
          </button>
        )}
      </div>

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}
      {!story && !error && <Loader2 className="mx-auto mt-16 animate-spin text-[var(--muted)]" />}

      {current && (
        <div
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          {page === 0 && <h1 className="mb-3 text-center font-display text-2xl font-bold text-[#2B2F45] [[data-theme=dark]_&]:text-[var(--text)] sm:text-3xl">{story.title}</h1>}
          <StoryPicture
            storyId={story.id}
            pageNo={current.pageNo}
            version={current.imageVersion}
            className="mx-auto aspect-[4/3] w-full max-w-[calc(52vh*4/3)] rounded-3xl shadow-lg"
            alt=""
          />
          <p
            lang={{ English: "en", Kannada: "kn", Telugu: "te", Hindi: "hi" }[story.language] ?? "en"}
            className="mt-5 text-center text-2xl font-semibold leading-snug text-[#2B2F45] [[data-theme=dark]_&]:text-[var(--text)] sm:text-3xl"
          >
            {current.text}
          </p>
          {blocked && (
            <p role="status" className="mx-auto mt-3 max-w-md rounded-xl bg-[#FF7A59]/15 px-3 py-2 text-center text-sm font-medium text-[#B4441F] [[data-theme=dark]_&]:text-[#FFB59E]">
              Tap the orange 🔊 button to listen. No sound? Turn off silent mode and turn up the volume.
            </p>
          )}
          {voiceMissing && autoRead && (
            <p className="mt-2 text-center text-xs text-[var(--muted)]">
              This device has no {story.language} voice, so reading aloud may not work. Try the phone app or another browser.
            </p>
          )}

          <div className="mt-auto flex items-center justify-between gap-3 pt-6">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={page === 0}
              aria-label="Previous page"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#3558DE] shadow disabled:opacity-30 [[data-theme=dark]_&]:bg-white/10"
            >
              <ChevronLeft size={30} />
            </button>
            <div className="flex items-center gap-3">
              {supported && (
                <button
                  type="button"
                  onClick={() => (speaking ? stop() : speak(current.text))}
                  aria-label={speaking ? "Stop reading" : "Read this page"}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF7A59] text-white shadow"
                >
                  {speaking ? <Pause size={26} /> : <Volume2 size={26} />}
                </button>
              )}
              <span className="text-sm font-medium text-[var(--muted)]">
                {page + 1} / {pages.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => (last ? onClose() : go(1))}
              aria-label={last ? "Finish" : "Next page"}
              className="flex h-14 min-w-14 items-center justify-center rounded-full bg-[#3558DE] px-4 text-white shadow"
            >
              {last ? <span className="text-base font-semibold">The end</span> : <ChevronRight size={30} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
