"use client";

import * as React from "react";

/** Matches previous next-themes default so existing localStorage values keep working. */
export const THEME_STORAGE_KEY = "theme";

export type ThemeSetting = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeSetting;
  setTheme: (theme: string) => void;
  resolvedTheme: ResolvedTheme;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function systemPref(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDocument(theme: ThemeSetting): ResolvedTheme {
  const resolved = theme === "system" ? systemPref() : theme;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved === "dark" ? "dark" : "light";
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeSetting>("system");
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("light");
  const themeRef = React.useRef(theme);
  themeRef.current = theme;

  React.useEffect(() => {
    let stored: ThemeSetting = "system";
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* ignore */
    }
    setThemeState(stored);
    setResolvedTheme(applyToDocument(stored));
  }, []);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onPrefChange = () => {
      if (themeRef.current === "system") {
        setResolvedTheme(applyToDocument("system"));
      }
    };
    mq.addEventListener("change", onPrefChange);
    return () => mq.removeEventListener("change", onPrefChange);
  }, []);

  const setTheme = React.useCallback((next: string) => {
    const t: ThemeSetting =
      next === "light" || next === "dark" || next === "system" ? next : "system";
    setThemeState(t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    setResolvedTheme(applyToDocument(t));
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
