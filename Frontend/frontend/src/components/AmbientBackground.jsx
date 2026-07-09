export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber/10 blur-3xl animate-float-slow" />
      <div className="absolute right-[-10%] top-1/3 h-[28rem] w-[28rem] rounded-full bg-moss/30 blur-3xl animate-float-slower" />
      <div className="absolute bottom-[-15%] left-1/4 h-80 w-80 rounded-full bg-sage/10 blur-3xl animate-float-slow" />
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -40px) scale(1.08); }
        }
        @keyframes float-slower {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, 30px) scale(1.05); }
        }
        .animate-float-slow { animation: float-slow 14s ease-in-out infinite; }
        .animate-float-slower { animation: float-slower 20s ease-in-out infinite; }
      `}</style>
    </div>
  );
}