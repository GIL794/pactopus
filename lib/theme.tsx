'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  prefersReducedMotion: boolean;
}

const STORAGE_KEY = 'pactopus_theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function getReducedMotionPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return saved === 'light' || saved === 'dark' ? saved : getSystemTheme();
  } catch {
    return getSystemTheme();
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getReducedMotionPreference);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.motion = prefersReducedMotion ? 'reduced' : 'full';
    document.body.dataset.motion = prefersReducedMotion ? 'reduced' : 'full';
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mqTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const mqMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    const onThemeChange = () => {
      const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark') return;
      setThemeState(getSystemTheme());
    };

    const onMotionChange = () => {
      setPrefersReducedMotion(getReducedMotionPreference());
    };

    mqTheme?.addEventListener?.('change', onThemeChange);
    mqMotion?.addEventListener?.('change', onMotionChange);

    return () => {
      mqTheme?.removeEventListener?.('change', onThemeChange);
      mqMotion?.removeEventListener?.('change', onMotionChange);
    };
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme,
    prefersReducedMotion,
  }), [theme, setTheme, toggleTheme, prefersReducedMotion]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
