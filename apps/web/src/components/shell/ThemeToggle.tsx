'use client';

import { useSyncExternalStore } from 'react';
import { WeatherMoonRegular, WeatherSunnyRegular } from '@/components/icons';

import { THEME_KEY as KEY } from '@/lib/theme';

type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function current(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return media().matches ? 'dark' : 'light';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  media().addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    media().removeEventListener('change', listener);
  };
}

/** Light / dark switch. Remembered per browser; follows the OS until first used. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not saved, but still applied for this page
    }
    listeners.forEach((l) => l());
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`p-2 hover:bg-border-subtle ${className}`}
    >
      {theme === 'dark' ? <WeatherSunnyRegular fontSize={22} aria-hidden /> : <WeatherMoonRegular fontSize={22} aria-hidden />}
    </button>
  );
}
