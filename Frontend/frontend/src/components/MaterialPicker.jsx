import { useEffect, useMemo, useState } from "react";
import { getQuizMaterials } from "../api/client";

// Checklist card shown in chat when a student asks to be quizzed.
//
// The backend replies to "Quiz me on ..." with some text plus a token like
// [[LEARNMATE_MATERIALS:id1,id2]] — the ids are materials that matched the
// requested topic and start ticked (the list may be empty). Use
// MATERIALS_TOKEN to detect it and render <MaterialPicker /> under the text.
// Picking material and pressing "Start quiz" calls onStart(materials).

export const MATERIALS_TOKEN = /\[\[LEARNMATE_MATERIALS:([^\]]*)\]\]/;

export default function MaterialPicker({ preselected, active, onStart }) {
  const [materials, setMaterials] = useState(null);
  const [selected, setSelected] = useState(() => new Set(preselected));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getQuizMaterials()
      .then((data) => !cancelled && setMaterials(data))
      .catch(() => !cancelled && setError("Couldn't load your study material. Refresh to try again."));
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

  function start() {
    const chosen = materials.filter((m) => selected.has(m.id));
    if (chosen.length) onStart(chosen);
  }

  if (error) return <p className="text-sm text-[var(--error-text)]">{error}</p>;
  if (!materials) return <p className="text-sm text-[var(--muted)]">Loading your study material…</p>;
  if (materials.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No study material has been uploaded for your class yet.</p>;
  }

  return (
    <div className="mt-3 rounded-xl border border-[#5B8DEF]/20 bg-[var(--surface-2)]/60 p-4">
      <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
        {groups.map(([subject, items]) => (
          <div key={subject}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{subject}</p>
            <div className="space-y-1.5">
              {items.map((m) => {
                const checked = selected.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text)] transition-colors ${
                      active ? "cursor-pointer" : "cursor-default opacity-70"
                    }`}
                    style={{
                      border: `1px solid ${checked ? "#5B8DEF" : "rgba(91,141,239,0.25)"}`,
                      background: checked ? "rgba(91,141,239,0.14)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!active}
                      onChange={() => toggle(m.id)}
                      className="h-4 w-4 flex-shrink-0 accent-[#5B8DEF]"
                    />
                    <span className="[overflow-wrap:anywhere]">{m.name}</span>
                  </label>
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
