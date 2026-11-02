import { useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rb_theme';
const CHRISTMAS_SEASON_START = new Date(2026, 10, 2);
const CHRISTMAS_SEASON_END = new Date(2027, 0, 7);

export const isChristmasSeason = (date: Date) =>
  date >= CHRISTMAS_SEASON_START && date < CHRISTMAS_SEASON_END;

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

  let dayChangeTimer: number | undefined;

  const updateSeason = () => {
    const now = new Date();
    const isInChristmasSeason = isChristmasSeason(now);
    const root = document.documentElement;

    if (isInChristmasSeason) {
      root.setAttribute('data-season', 'christmas');
    } else {
      root.removeAttribute('data-season');
    }

    if (dayChangeTimer !== undefined) {
      window.clearTimeout(dayChangeTimer);
    }

    const nextUpdate =
      now < CHRISTMAS_SEASON_START
        ? CHRISTMAS_SEASON_START
        : now < CHRISTMAS_SEASON_END
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
          : undefined;

    if (nextUpdate) {
      dayChangeTimer = window.setTimeout(
        updateSeason,
        Math.max(1, nextUpdate.getTime() - now.getTime()),
      );
    }
  };

  updateSeason();
  window.addEventListener('focus', updateSeason);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateSeason();
  });
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
