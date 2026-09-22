import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "learnmate_theme";

function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // First visit: LearnMate opens in the light theme.
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {/*
        Global CSS variables for the two palettes. Brand accents (teal,
        gold, ember, error red) stay the same in both themes — only the
        structural surface/text colors swap, which is what actually needs
        to invert for readability. Individual components reference these
        via Tailwind arbitrary values, e.g. bg-[var(--bg)].
      */}
      <style>{`
        :root {
          /* Dark: deep ink-navy with cool blue-tinted surfaces */
          --bg: #0B1120;
          --bg-canvas: #070C1A;
          --surface: #111A2E;
          --surface-2: #18233D;
          --divider: #22304F;
          --text: #E8EEFF;
          --muted: #A3B4DA;
          --dim: #7386B0;
          --error-bg: #2A1826;
          --error-text: #F7B4A6;
          --ok: #34D3B0;
          --accent-ink: #8DB0FF;
          --shadow-strength: 0.5;
        }
        :root[data-theme="light"] {
          /* Light: airy blue-white background, navy-blue type */
          --bg: #F6F9FF;
          --bg-canvas: #EAF1FE;
          --surface: #FFFFFF;
          --surface-2: #EDF3FF;
          --divider: #D9E4F8;
          --text: #0F2557;
          --muted: #465B8C;
          --dim: #62749F;
          --error-bg: #FDECEA;
          --error-text: #B4341B;
          --ok: #0E8F6E;
          --accent-ink: #2F5BD0;
          --shadow-strength: 0.12;
        }
        [data-theme] { color-scheme: light dark; }
        [data-theme="light"] { color-scheme: light; }
        [data-theme="dark"] { color-scheme: dark; }
      `}</style>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}