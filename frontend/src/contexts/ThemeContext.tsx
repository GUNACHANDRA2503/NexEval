import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type ThemeMode = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  theme: 'dark',
  setMode: () => {},
});

const STORAGE_KEY = 'nexeval-theme';

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'dark';
  });

  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    mode === 'system' ? getSystemTheme() : mode,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const update = () => setTheme(mq.matches ? 'light' : 'dark');
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    setTheme(mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
