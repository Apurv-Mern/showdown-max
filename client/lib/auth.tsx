'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface AuthState {
  token: string | null;
  role: 'admin' | 'host' | null;
  email: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, role: 'admin' | 'host') => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  hydrated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'auth_token';
const ROLE_KEY = 'auth_role';

function readStoredAuth(): AuthState {
  if (typeof window === 'undefined') return { token: null, role: null, email: null };
  const token = localStorage.getItem(TOKEN_KEY);
  const role = localStorage.getItem(ROLE_KEY) as AuthState['role'];
  if (token && role) return { token, role, email: null };
  return { token: null, role: null, email: null };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({ token: null, role: null, email: null });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredAuth();
    setState(stored);

    if (stored.token && stored.role) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setState({ token: stored.token, role: data.data.role, email: data.data.email });
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ROLE_KEY);
            setState({ token: null, role: null, email: null });
          }
        })
        .catch(() => {
          /* Keep the local token — server may be temporarily unreachable.
             The next API call will get a 401 and trigger a proper logout. */
        });
    }
    setHydrated(true);
  }, []);

  const login = useCallback(async (email: string, password: string, role: 'admin' | 'host') => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem(TOKEN_KEY, data.data.token);
    localStorage.setItem(ROLE_KEY, data.data.role);
    setState({ token: data.data.token, role: data.data.role, email });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    setState({ token: null, role: null, email: null });
  }, []);

  if (!hydrated) return null;

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isAuthenticated: !!state.token, hydrated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};
