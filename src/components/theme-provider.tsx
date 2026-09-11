import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

type ThemeCtx = { theme: Theme; setTheme: (t: Theme) => void; resolved: "light" | "dark" };

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = "clause.theme";

function resolveSystem(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function applyClass(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? resolveSystem() : theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR and first client paint stay on "system"; html.dark is already set by the boot script.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const apply = () => {
      const stored = readStored();
      const r = resolveTheme(stored);
      setThemeState(stored);
      setResolved(r);
      applyClass(r);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    const onVis = () => {
      if (document.visibilityState === "visible") apply();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", apply);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) apply();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", apply);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    const r = resolveTheme(t);
    applyClass(r);
    setResolved(r);
    setThemeState(t);
  };

  return <Ctx.Provider value={{ theme, setTheme, resolved }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
