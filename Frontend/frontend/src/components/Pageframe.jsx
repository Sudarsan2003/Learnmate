import { ArrowLeft, Menu } from "lucide-react";

/**
 * Frame for the full-page views (Manage users, Profile, Quizzes, Upload).
 *
 * The "Back to chat" control used to float over the top-right corner of
 * whatever page was showing, so it sat on top of each page's own header
 * buttons (theme toggle, refresh…) and on top of sticky elements while
 * scrolling. Here it lives in a slim bar that is part of the layout: the
 * page scrolls underneath the bar, never behind it, so nothing can collide.
 *
 *   <PageFrame onBack={() => setView("chat")}>
 *     <ManageUsers … />
 *   </PageFrame>
 *
 * The frame fills its parent's height, so the parent needs a definite height
 * (e.g. the flex-1 <main> next to the Sidebar).
 */
export default function PageFrame({ onBack, backLabel = "Back to chat", children }) {
  return (
    <div className="pf-root">
      <style>{CSS}</style>

      <div className="pf-bar">
        <button
          type="button"
          className="pf-btn pf-menu"
          onClick={() => document.dispatchEvent(new CustomEvent("learnmate:toggle-sidebar"))}
          aria-label="Toggle sidebar"
        >
          <Menu size={17} />
        </button>
        <button type="button" className="pf-btn pf-back" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          {backLabel}
        </button>
      </div>

      <div className="pf-scroll">{children}</div>
    </div>
  );
}

const CSS = `

.pf-root {
  display: flex; flex-direction: column; flex: 1 1 0%;
  min-width: 0; min-height: 0; height: 100%; width: 100%;
  background: var(--bg);
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.pf-bar {
  position: relative; z-index: 20; flex: none;
  display: flex; align-items: center; gap: .5rem;
  padding: max(.5rem, env(safe-area-inset-top)) max(.75rem, env(safe-area-inset-right)) .5rem max(.75rem, env(safe-area-inset-left));
  background: var(--bg);
  border-bottom: 1px solid var(--divider);
}
.pf-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
  height: 2.25rem; padding: 0 .75rem; border-radius: 10px;
  font-size: 13.5px; font-weight: 600; color: var(--muted); cursor: pointer;
  border: 1px solid transparent;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}
.pf-btn:hover { color: var(--text); background: color-mix(in srgb, var(--text) 7%, transparent); }
.pf-btn:focus-visible { outline: 2px solid #3558DE; outline-offset: 2px; }
.pf-menu { width: 2.25rem; padding: 0; }
.pf-back { border-color: var(--divider); color: var(--text); }
@media (pointer: coarse) { .pf-btn { height: 2.6rem; } .pf-menu { width: 2.6rem; } }

.pf-scroll {
  flex: 1 1 0%; min-height: 0; min-width: 0;
  overflow-y: auto; overscroll-behavior: contain;
}
`;