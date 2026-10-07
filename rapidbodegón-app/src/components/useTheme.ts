import { useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rb_theme';

const readSavedTheme = (): Theme => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Use the default when browser storage is unavailable.
  }
  return 'dark';
};

export const initializeTheme = () => {
  document.documentElement.setAttribute('data-theme', readSavedTheme());
};

const saveTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for the current page when storage is unavailable.
  }
};

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(readSavedTheme);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    saveTheme(nextTheme);
  };

  return { theme, setTheme };
};
