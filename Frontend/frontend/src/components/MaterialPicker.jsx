import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getQuizMaterials } from "../api/client";

// Checklist card shown in chat when a student asks to be quizzed.
//
// The backend replies to "Quiz me on ..." with some text plus a token like
// [[LEARNMATE_MATERIALS:id1,id2]] — the ids are books or chapters
// ("sourceId::Chapter 9: Circles") that matched the requested topic and start
// ticked (the list may be empty). Use MATERIALS_TOKEN to detect it and render
// <MaterialPicker /> under the text. A student can tick whole books or open a
// book and tick some of its chapters; "Start quiz" calls onStart([{id, name}]).

export const MATERIALS_TOKEN = /\[\[LEARNMATE_MATERIALS:([^\]]*)\]\]/;

export default function MaterialPicker({ preselected, active, onStart }) {
  const [materials, setMaterials] = useState(null);
  const [selected, setSelected] = useState(() => new Set(preselected));
  // Books whose chapter list is open: those with a pre-ticked chapter start open.
  const [open, setOpen] = useState(
    () => new Set(preselected.filter((id) => id.includes("::")).map((id) => id.split("::")[0]))
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getQuizMaterials()
      .then((data) => !cancelled && setMaterials(data))
      .catch(
        (err) =>
          !cancelled &&
          setError(err.sessionExpired ? err.message : "Couldn't load your study material. Refresh to try again.")
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by subject so a long list stays scannable.
  const groups = useMemo(() => {
    const out = new Map();
    for (const m of materials ?? []) {
      const key = m.subject || "Other";
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(m);
    }
    return [...out.entries()];
  }, [materials]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Ticking a whole book clears its individual chapters (the book already covers them).
  function toggleBook(book) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(book.id)) {
        next.delete(book.id);
      } else {
        next.add(book.id);
        for (const c of book.chapters ?? []) next.delete(c.id);
      }
      return next;
    });
  }

  function toggleOpen(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start() {
    const chosen = [];
    for (const m of materials) {
      if (selected.has(m.id)) chosen.push({ id: m.id, name: m.name });
      for (const c of m.chapters ?? []) if (selected.has(c.id)) chosen.push({ id: c.id, name: c.name });
    }
    if (chosen.length) onStart(chosen);
  }

  if (error) return <p className="text-sm text-[var(--error-text)]">{error}</p>;
  if (!materials) return <p className="text-sm text-[var(--muted)]">Loading your study material…</p>;
  if (materials.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No study material has been uploaded for your class yet.</p>;
  }

  const rowClass = `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text)] transition-colors ${
    active ? "cursor-pointer" : "cursor-default opacity-70"
  }`;
  const rowStyle = (checked) => ({
    border: `1px solid ${checked ? "#5B8DEF" : "rgba(91,141,239,0.25)"}`,
    background: checked ? "rgba(91,141,239,0.14)" : "transparent",
  });

  return (
    <div className="mt-3 rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 p-4">
      <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
        {groups.map(([subject, items]) => (
          <div key={subject}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{subject}</p>
            <div className="space-y-1.5">
              {items.map((m) => {
                const checked = selected.has(m.id);
                const chapters = m.chapters ?? [];
                const isOpen = open.has(m.id);
                const pickedChapters = chapters.filter((c) => selected.has(c.id)).length;
                return (
                  <div key={m.id}>
                    <div className="flex items-stretch gap-1.5">
                      <label className={`${rowClass} min-w-0 flex-1`} style={rowStyle(checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!active}
                          onChange={() => toggleBook(m)}
                          className="h-4 w-4 flex-shrink-0 accent-[#5B8DEF]"
                        />
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          {m.name}
                          {checked && chapters.length > 0 && (
                            <span className="ml-1.5 inline-block whitespace-nowrap text-xs text-[var(--muted)]">(whole book)</span>
                          )}
                        </span>
                      </label>
                      {chapters.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleOpen(m.id)}
                          aria-expanded={isOpen}
                          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[#5B8DEF]/25 px-2.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                        >
                          <span className="hidden sm:inline">
                            {pickedChapters ? `${pickedChapters} chapter${pickedChapters > 1 ? "s" : ""}` : "Chapters"}
                          </span>
                          <span className="sm:hidden">{pickedChapters || chapters.length}</span>
                          <ChevronDown
                            size={14}
                            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </div>
                    {isOpen && chapters.length > 0 && (
                      <div className="ml-4 mt-1.5 space-y-1 border-l-2 border-[#5B8DEF]/20 pl-3">
                        {chapters.map((c) => {
                          const coveredByBook = checked;
                          const chapterChecked = coveredByBook || selected.has(c.id);
                          return (
                            <label key={c.id} className={`${rowClass} py-1.5`} style={rowStyle(selected.has(c.id))}>
                              <input
                                type="checkbox"
                                checked={chapterChecked}
                                disabled={!active || coveredByBook}
                                onChange={() => toggle(c.id)}
                                className="h-4 w-4 flex-shrink-0 accent-[#5B8DEF]"
                              />
                              <span className="[overflow-wrap:anywhere]">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {active ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={selected.size === 0}
            className="rounded-lg bg-[#5B8DEF] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Start quiz
          </button>
          <span className="text-xs text-[var(--muted)]">{selected.size} selected</span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted)]">Ask me to quiz you again to pick new material.</p>
      )}
    </div>
  );
}
