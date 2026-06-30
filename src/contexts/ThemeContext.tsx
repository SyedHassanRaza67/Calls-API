import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type ThemeId =
  | "theme-indigo"
  | "theme-emerald"
  | "theme-rose"
  | "theme-midnight"
  | "theme-aurora"
  | "theme-sunset";

export type ThemeKind = "static" | "live";

export interface AppTheme {
  id: ThemeId;
  label: string;
  kind: ThemeKind;
  /** A CSS color or gradient used for the picker swatch dot. */
  swatch: string;
}

export const themes: AppTheme[] = [
  {
    id: "theme-indigo",
    label: "Indigo",
    kind: "static",
    swatch: "hsl(224 76% 33%)",
  },
  {
    id: "theme-emerald",
    label: "Emerald",
    kind: "static",
    swatch: "hsl(160 84% 32%)",
  },
  {
    id: "theme-rose",
    label: "Rose",
    kind: "static",
    swatch: "hsl(346 77% 50%)",
  },
  {
    id: "theme-midnight",
    label: "Midnight",
    kind: "static",
    swatch: "hsl(190 95% 50%)",
  },
  {
    id: "theme-aurora",
    label: "Aurora",
    kind: "live",
    swatch:
      "linear-gradient(135deg, hsl(245 80% 45%), hsl(265 75% 50%), hsl(190 85% 50%))",
  },
  {
    id: "theme-sunset",
    label: "Sunset",
    kind: "live",
    swatch:
      "linear-gradient(135deg, hsl(25 90% 52%), hsl(330 80% 55%), hsl(280 70% 50%))",
  },
];

const THEME_IDS = themes.map((t) => t.id);
const STORAGE_KEY = "app-theme";
const DEFAULT_THEME: ThemeId = "theme-indigo";

function isThemeId(value: string | null): value is ThemeId {
  return value != null && (THEME_IDS as string[]).includes(value);
}

function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  THEME_IDS.forEach((t) => root.classList.remove(t));
  root.classList.add(id);
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: AppTheme[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore persistence errors (e.g. private mode) */
    }
    applyTheme(id);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }
  return ctx;
}
