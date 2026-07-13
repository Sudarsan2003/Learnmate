import { useEffect, useRef } from "react";

/**
 * KnowledgeGraph — the signature element.
 * A slowly-rotating 3D point cloud where nodes represent chunks of source
 * material and edges represent semantic proximity. Nearest neighbours pulse
 * a connecting line every few seconds, echoing how LearnMate threads an
 * answer back to a citation. Pure canvas + a hand-rolled perspective
 * projection — no extra dependencies.
 */
function KnowledgeGraph() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const NODE_COUNT = 46;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2,
      r: 1.1 + Math.random() * 1.8,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.006 + Math.random() * 0.01,
      hue: Math.random() < 0.5 ? "ember" : "electric",
    }));

    let angleX = 0.4;
    let angleY = 0;
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onPointerMove(e) {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      target.x = nx * 0.35;
      target.y = ny * 0.25;
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);

    const EMBER = [255, 143, 107];
    const ELECTRIC = [110, 158, 255];

    function project(n) {
      // rotate around Y then X
      const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
      let x = n.x * cosY - n.z * sinY;
      let z = n.x * sinY + n.z * cosY;
      const cosX = Math.cos(angleX), sinX = Math.sin(angleX);
      let y = n.y * cosX - z * sinX;
      z = n.y * sinX + z * cosX;

      const scale = 1.7; // camera distance factor
      const perspective = scale / (scale + z);
      const cx = width / 2 + x * Math.min(width, height) * 0.34 * perspective;
      const cy = height / 2 + y * Math.min(width, height) * 0.34 * perspective;
      return { cx, cy, z, perspective };
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      pointer.x += (target.x - pointer.x) * 0.03;
      pointer.y += (target.y - pointer.y) * 0.03;
      angleY += 0.0016 + pointer.x * 0.002;
      angleX = 0.4 + pointer.y * 0.25;

      const projected = nodes.map(project);

      // edges: connect each node to its two nearest neighbours in screen space
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const distances = [];
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const dx = projected[i].cx - projected[j].cx;
          const dy = projected[i].cy - projected[j].cy;
          distances.push({ j, d: dx * dx + dy * dy });
        }
        distances.sort((a, b) => a.d - b.d);
        const nearest = distances.slice(0, 2);
        nearest.forEach(({ j }) => {
          if (j < i) return; // draw once
          const a = projected[i];
          const b = projected[j];
          const depth = (a.perspective + b.perspective) / 2;
          const alpha = Math.max(0, Math.min(0.5, (depth - 0.55) * 0.9));
          ctx.strokeStyle = `rgba(160, 150, 210, ${alpha * 0.55})`;
          ctx.beginPath();
          ctx.moveTo(a.cx, a.cy);
          ctx.lineTo(b.cx, b.cy);
          ctx.stroke();
        });
      }

      // nodes
      nodes.forEach((n, i) => {
        const p = projected[i];
        n.pulse += n.pulseSpeed;
        const pulseScale = 0.75 + Math.sin(n.pulse) * 0.25;
        const radius = n.r * p.perspective * pulseScale;
        const [r, g, b] = n.hue === "ember" ? EMBER : ELECTRIC;
        const alpha = Math.max(0.12, Math.min(1, p.perspective));

        const glow = ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, radius * 6);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.35})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, radius * 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, Math.max(0.6, radius), 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-[#0A0916]">
      {/* ember glow, upper right — like a dying star */}
      <div className="absolute -right-28 -top-24 h-[30rem] w-[30rem] rounded-full bg-[#FF6B4A]/[0.12] blur-[110px] animate-drift-a" />
      {/* electric-blue glow, lower left */}
      <div className="absolute -left-20 bottom-[-10%] h-[28rem] w-[28rem] rounded-full bg-[#5B8DEF]/[0.14] blur-[110px] animate-drift-b" />
      {/* soft violet wash, center */}
      <div className="absolute left-1/3 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#A78BFA]/[0.08] blur-[100px] animate-drift-a" style={{ animationDelay: "-9s" }} />

      {/* the signature 3D knowledge graph, rotating slowly behind everything */}
      <div className="absolute inset-0 opacity-[0.55]">
        <KnowledgeGraph />
      </div>

      {/* fine grain so flat gradients don't look plasticky */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.04] mix-blend-overlay">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* vignette so foreground content stays legible */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0A0916_88%)]" />

      <style>{`
        @keyframes drift-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          50% { transform: translate3d(24px, -30px, 0) scale(1.07) rotate(3deg); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          50% { transform: translate3d(-30px, 24px, 0) scale(1.05) rotate(-3deg); }
        }
        .animate-drift-a { animation: drift-a 17s ease-in-out infinite; }
        .animate-drift-b { animation: drift-b 21s ease-in-out infinite; }
      `}</style>
    </div>
  );
}