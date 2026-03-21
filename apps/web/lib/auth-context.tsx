'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, ApiError } from './api';

interface User {
  id: string;
  nickname: string;
  theme?: 'light' | 'dark';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  theme: 'light' | 'dark';
  login: (nickname: string, password: string) => Promise<void>;
  register: (nickname: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/auth/me');
      setUser(res.user);
      const userTheme = res.user.theme || 'light';
      setThemeState(userTheme);
      applyTheme(userTheme);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (nickname: string, password: string) => {
    const res = await api.post<{ user: User }>('/auth/login', { nickname, password });
    setUser(res.user);
    // Fetch full user to get theme
    await refreshUser();
  };

  const register = async (nickname: string, password: string) => {
    await api.post('/auth/register', { nickname, password });
    await login(nickname, password);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear user even if logout request fails
    }
    setUser(null);
    setThemeState('light');
    applyTheme('light');
  };

  const setTheme = async (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    try {
      await api.patch('/auth/me', { theme: newTheme });
    } catch {
      // Theme save failed, but local toggle still works
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, theme, login, register, logout, refreshUser, setTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export { ApiError };
