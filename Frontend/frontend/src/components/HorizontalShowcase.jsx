import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { MessagesSquare, ClipboardCheck, UploadCloud, Users2 } from "lucide-react";
import img1 from "../assets/1.png";
import img2 from "../assets/2.png";
import img3 from "../assets/3.png";
import img4 from "../assets/4.png";

const ITEMS = [
  {
    icon: MessagesSquare,
    label: "Ask a question",
    body: "Type it in plain language. Passages from your class library are retrieved first, then the answer is written.",
    image: img1,
    from: "#5EEAD4",
    to: "#0F766E",
  },
  {
    icon: ClipboardCheck,
    label: "Take a quiz",
    body: "Only quizzes that match your institution and standard show up. Nothing meant for another class.",
    image: img2,
    from: "#4F80F8",
    to: "#24389E",
  },
  {
    icon: UploadCloud,
    label: "Upload material",
    body: "Drop in a PDF or slide deck. It's indexed once and ready to be cited the moment a student asks.",
    image: img3,
    from: "#BDB0FF",
    to: "#35268F",
  },
  {
    icon: Users2,
    label: "Manage users",
    body: "Admins see every class. Teachers see their own. Students see only what they were assigned.",
    image: img4,
    from: "#A9C2FF",
    to: "#2E4E9C",
  },
];

export default function HorizontalShowcase() {
  const containerRef = useRef(null);
  const galleryRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const x = useTransform(scrollYProgress, (p) => {
    const g = galleryRef.current;
    if (!g || !g.firstElementChild) return 0;
    return -p * (g.scrollWidth - g.firstElementChild.offsetWidth);
  });

  return (
    <div className="hs-root">
      <div ref={containerRef} className="hs-scroll">
        <div className="hs-sticky">
          <motion.div ref={galleryRef} className="hs-gallery" style={{ x }}>
            {ITEMS.map((item, i) => (
              <div
                key={item.label}
                className="hs-item"
                style={{ background: `linear-gradient(160deg, ${item.from}, ${item.to})` }}
              >
                <div className="hs-media">
                  <img src={item.image} alt={item.label} loading="lazy" draggable="false" />
                </div>
                <div className="hs-content">
                  <div className="hs-meta">
                    <span className="hs-chip">
                      <item.icon size={15} color="#FFFFFF" strokeWidth={2.2} />
                    </span>
                    <span className="hs-num">0{i + 1}</span>
                  </div>
                  <h3>{item.label}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      <style>{`
        .hs-scroll { height: 300vh; position: relative; }
        .hs-sticky {
          position: sticky; top: 0; height: 100vh; width: 360px;
          margin: 0 auto; display: flex; align-items: center;
          justify-content: flex-start; overflow: visible;
        }
        .hs-gallery { display: flex; gap: 30px; will-change: transform; }
        .hs-item {
          flex-shrink: 0; width: 360px; height: 480px; border-radius: 20px;
          position: relative; overflow: hidden; padding: 24px 24px 28px;
          display: flex; flex-direction: column;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.3);
        }
        .hs-item::before {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.35));
        }
        .hs-media {
          position: relative; z-index: 1; flex: 1; min-height: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .hs-media img {
          width: 100%; height: 100%; object-fit: contain;
          filter: drop-shadow(0 14px 24px rgba(0,0,0,0.3));
          transition: transform 500ms cubic-bezier(0.16,1,0.3,1);
          user-select: none;
        }
        .hs-item:hover .hs-media img { transform: scale(1.06) translateY(-4px); }
        .hs-content { position: relative; z-index: 1; color: #fff; margin-top: 12px; }
        .hs-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .hs-chip {
          display: inline-flex; width: 28px; height: 28px; border-radius: 9px;
          align-items: center; justify-content: center;
          background: rgba(255,255,255,0.2); backdrop-filter: blur(4px);
        }
        .hs-num { font-size: 13px; opacity: 0.8; }
        .hs-item h3 { font-size: 24px; font-weight: 600; margin: 0 0 8px; }
        .hs-item p { font-size: 14px; line-height: 1.5; margin: 0; opacity: 0.92; max-width: 32ch; }

        @media (max-width: 600px) {
          .hs-sticky { width: 280px; }
          .hs-gallery { gap: 15px; }
          .hs-item { width: 280px; height: 440px; padding: 18px 20px 22px; }
          .hs-item h3 { font-size: 21px; }
          .hs-item p { font-size: 13.5px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hs-gallery { transform: none !important; }
          .hs-scroll { height: auto; }
          .hs-sticky { position: relative; height: auto; width: 100%; overflow-x: auto; padding: 50px 24px; }
        }
      `}</style>
    </div>
  );
}