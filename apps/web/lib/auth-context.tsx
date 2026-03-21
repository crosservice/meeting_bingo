'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, ApiError } from './api';

interface User {
  id: string;
  nickname: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (nickname: string, password: string) => Promise<void>;
  register: (nickname: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/auth/me');
      setUser(res.user);
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
  };

  const register = async (nickname: string, password: string) => {
    await api.post('/auth/register', { nickname, password });
    // Auto-login after registration
    await login(nickname, password);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear user even if logout request fails
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
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
