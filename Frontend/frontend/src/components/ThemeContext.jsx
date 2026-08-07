import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "learnmate_theme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // Fall back to the visitor's OS preference the first time they show up.
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
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
          --bg: #0B0E14;
          --bg-canvas: #0A0916;
          --surface: #12151F;
          --surface-2: #1B2333;
          --divider: #1B2333;
          --text: #EDE6D6;
          --muted: #9FB0AC;
          --dim: #6E7C79;
          --error-bg: #2A1620;
          --shadow-strength: 0.5;
        }
        :root[data-theme="light"] {
          --bg: #FAF7F0;
          --bg-canvas: #F4EFE2;
          --surface: #FFFFFF;
          --surface-2: #EFE9DA;
          --divider: #E4DECD;
          --text: #241F17;
          --muted: #5B6460;
          --dim: #8A9490;
          --error-bg: #FBEAE7;
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