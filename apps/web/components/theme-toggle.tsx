'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function ThemeToggle() {
  const { user, theme: authTheme, setTheme: setAuthTheme } = useAuth();
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>('light');

  // On mount, read from localStorage if not authenticated
  useEffect(() => {
    if (!user) {
      const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
      if (stored === 'dark' || stored === 'light') {
        setLocalTheme(stored);
        document.documentElement.classList.toggle('dark', stored === 'dark');
      }
    }
  }, [user]);

  const currentTheme = user ? authTheme : localTheme;

  function handleToggle() {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    if (user) {
      setAuthTheme(next);
    } else {
      setLocalTheme(next);
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    }
  }

  return (
    <button
      onClick={handleToggle}
      className="rounded bg-gray-200 dark:bg-gray-700 px-2 py-2 text-lg leading-none hover:bg-gray-300 dark:hover:bg-gray-600"
      aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
    >
      {currentTheme === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
    </button>
  );
}
