import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeContext";

/**
 * Small icon button that flips between dark and light mode. Drop it into
 * any page header — it's self-contained (reads/writes theme via context).
 *
 * `variant="ghost"` (default) is for use on dark glassy headers.
 * `variant="solid"` adds a visible border/bg, better for plain page tops.
 */
export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[#4F7CFF]/20 text-[var(--accent-ink)] transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/50 hover:bg-[#4F7CFF]/10 ${className}`}
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}