const PLACE = { 1: "1st", 2: "2nd", 3: "3rd" };
const ordinal = (n) => PLACE[n] ?? `${n}th`;

// Gold, silver and bronze medals for 1st, 2nd and 3rd place. Drawn as SVG
// (not emoji, which print tiny and blurry in PDFs) so they look the same on
// every device and print in colour.
const MEDAL_COLOURS = {
  1: { fill: "#F2B705", stroke: "#B8860B", name: "Gold" },
  2: { fill: "#B9C1CA", stroke: "#7C8691", name: "Silver" },
  3: { fill: "#CD7F32", stroke: "#8B5A2B", name: "Bronze" },
};

/** A gold/silver/bronze medal for places 1-3; nothing for any other place. */
export function PlaceMedal({ rank, size = 14 }) {
  const c = MEDAL_COLOURS[rank];
  if (!c) return null;
  return (
    <svg
      className="rp-medal"
      style={{ display: "inline-block", verticalAlign: "-2px", flexShrink: 0 }}
      width={size}
      height={size} viewBox="0 0 24 24" role="img" aria-label={`${c.name} medal, ${ordinal(rank)} place`}>
      <path d="M6.5 1.5h4.2l2.3 6.3H8.8z" fill="#3B6FD8" />
      <path d="M17.5 1.5h-4.2l-2.3 6.3h4.2z" fill="#D9534F" />
      <circle cx="12" cy="15" r="7.2" fill={c.fill} stroke={c.stroke} strokeWidth="1.4" />
      <text x="12" y="18.6" textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="Arial, sans-serif" fill="#fff">
        {rank}
      </text>
    </svg>
  );
}

/** Key explaining the medals, for printed sheets and report cards. */
export function MedalLegend() {
  return (
    <p className="rp-legend">
      <PlaceMedal rank={1} /> 1st in class &nbsp; <PlaceMedal rank={2} /> 2nd &nbsp; <PlaceMedal rank={3} /> 3rd
    </p>
  );
}
