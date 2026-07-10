export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-[#0B0E14]">
      {/* lamplight glow, top-left, like a desk lamp over the page */}
      <div className="absolute -left-24 -top-32 h-[32rem] w-[32rem] rounded-full bg-[#C89B3C]/[0.14] blur-[100px] animate-drift-a" />
      {/* citation-teal glow, drifting through the middle */}
      <div className="absolute right-[-8%] top-1/4 h-[26rem] w-[26rem] rounded-full bg-[#2DD4BF]/[0.10] blur-[110px] animate-drift-b" />
      {/* plum glow, bottom */}
      <div className="absolute bottom-[-12%] left-1/3 h-96 w-96 rounded-full bg-[#4C3B6E]/[0.20] blur-[90px] animate-drift-a" style={{ animationDelay: "-7s" }} />

      {/* faint knowledge-graph nodes, like stars/citations in a night sky */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.15]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="kg-nodes" width="140" height="140" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="30" r="1.4" fill="#2DD4BF" />
            <circle cx="90" cy="70" r="1" fill="#C89B3C" />
            <circle cx="60" cy="110" r="1.2" fill="#EDE6D6" />
            <line x1="20" y1="30" x2="90" y2="70" stroke="#2DD4BF" strokeWidth="0.4" />
            <line x1="90" y1="70" x2="60" y2="110" stroke="#C89B3C" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#kg-nodes)" />
      </svg>

      {/* subtle vignette so content stays readable */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0B0E14_85%)]" />

      <style>{`
        @keyframes drift-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          50% { transform: translate3d(26px, -34px, 0) scale(1.08) rotate(4deg); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          50% { transform: translate3d(-34px, 26px, 0) scale(1.05) rotate(-3deg); }
        }
        .animate-drift-a { animation: drift-a 16s ease-in-out infinite; }
        .animate-drift-b { animation: drift-b 22s ease-in-out infinite; }
      `}</style>
    </div>
  );
}