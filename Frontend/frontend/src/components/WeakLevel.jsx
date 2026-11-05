// The weak / needs-practice / strong pill and score bar, shared by the student's
// "Your weak chapters" card and the teachers' Weak chapters report.

const LEVEL = {
  WEAK: { label: "Weak", tone: "#E2725B" },
  PRACTISE: { label: "Needs practice", tone: "#D99A0B" },
  STRONG: { label: "Strong", tone: "#0F8A5F" },
};

export function LevelPill({ level }) {
  const l = LEVEL[level] ?? LEVEL.PRACTISE;
  return (
    <span
      style={{
        padding: ".15rem .55rem",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: "nowrap",
        color: l.tone,
        background: `color-mix(in srgb, ${l.tone} 14%, transparent)`,
      }}
    >
      {l.label}
    </span>
  );
}

export function LevelBar({ level, percent }) {
  const l = LEVEL[level] ?? LEVEL.PRACTISE;
  return (
    <span
      aria-hidden="true"
      style={{ display: "block", height: 7, borderRadius: 99, background: "var(--divider)", overflow: "hidden" }}
    >
      <i style={{ display: "block", height: "100%", borderRadius: 99, width: `${Math.max(4, percent)}%`, background: l.tone }} />
    </span>
  );
}
