'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
type AuthRole = 'admin' | 'host';

interface AuthState {
  token: string | null;
  role: AuthRole | null;
  email: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, role: AuthRole) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  hydrated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LEGACY_TOKEN_KEY = 'auth_token';
const LEGACY_ROLE_KEY = 'auth_role';
const ACTIVE_ROLE_KEY = 'auth_active_role';

const TOKEN_KEYS: Record<AuthRole, string> = {
  admin: 'auth_token_admin',
  host: 'auth_token_host',
};

const EMAIL_KEYS: Record<AuthRole, string> = {
  admin: 'auth_email_admin',
  host: 'auth_email_host',
};

const getRoleFromPath = (pathname: string | null): AuthRole | null => {
  if (!pathname) return null;
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/host')) return 'host';
  return null;
};

const migrateLegacyAuthIfNeeded = () => {
  if (typeof window === 'undefined') return;
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  const legacyRole = localStorage.getItem(LEGACY_ROLE_KEY) as AuthRole | null;
  if (!legacyToken || !legacyRole || !TOKEN_KEYS[legacyRole]) return;
  if (!localStorage.getItem(TOKEN_KEYS[legacyRole])) {
    localStorage.setItem(TOKEN_KEYS[legacyRole], legacyToken);
  }
  localStorage.setItem(ACTIVE_ROLE_KEY, legacyRole);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ROLE_KEY);
};

const resolveRole = (preferredRole?: AuthRole | null): AuthRole | null => {
  if (preferredRole) return preferredRole;
  if (typeof window === 'undefined') return null;
  const activeRole = localStorage.getItem(ACTIVE_ROLE_KEY) as AuthRole | null;
  if (activeRole && TOKEN_KEYS[activeRole]) return activeRole;
  if (localStorage.getItem(TOKEN_KEYS.admin)) return 'admin';
  if (localStorage.getItem(TOKEN_KEYS.host)) return 'host';
  return null;
};

function readStoredAuth(preferredRole?: AuthRole | null): AuthState {
  if (typeof window === 'undefined') return { token: null, role: null, email: null };
  migrateLegacyAuthIfNeeded();
  const role = resolveRole(preferredRole);
  if (!role) return { token: null, role: null, email: null };
  const token = localStorage.getItem(TOKEN_KEYS[role]);
  const email = localStorage.getItem(EMAIL_KEYS[role]);
  if (token) return { token, role, email };
  return { token: null, role: null, email: null };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const scopedRole = getRoleFromPath(pathname);

  const [state, setState] = useState<AuthState>({ token: null, role: null, email: null });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredAuth(scopedRole);
    setState(stored);

    if (stored.token && stored.role) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            localStorage.setItem(TOKEN_KEYS[stored.role!], stored.token!);
            localStorage.setItem(EMAIL_KEYS[stored.role!], data.data.email || '');
            localStorage.setItem(ACTIVE_ROLE_KEY, stored.role!);
            setState({ token: stored.token, role: data.data.role, email: data.data.email });
          } else {
            localStorage.removeItem(TOKEN_KEYS[stored.role!]);
            localStorage.removeItem(EMAIL_KEYS[stored.role!]);
            setState(readStoredAuth(scopedRole));
          }
        })
        .catch(() => {
          // Keep local token if server is temporarily unreachable.
        });
    }

    setHydrated(true);
  }, [scopedRole]);

  const login = useCallback(async (email: string, password: string, role: AuthRole) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem(TOKEN_KEYS[data.data.role], data.data.token);
    localStorage.setItem(EMAIL_KEYS[data.data.role], email);
    localStorage.setItem(ACTIVE_ROLE_KEY, data.data.role);

    if (!scopedRole || scopedRole === data.data.role) {
      setState({ token: data.data.token, role: data.data.role, email });
    }
  }, [scopedRole]);

  const logout = useCallback(() => {
    const roleToLogout = scopedRole || state.role;
    if (roleToLogout) {
      localStorage.removeItem(TOKEN_KEYS[roleToLogout]);
      localStorage.removeItem(EMAIL_KEYS[roleToLogout]);
    }
    const next = readStoredAuth(scopedRole);
    if (!next.role) {
      localStorage.removeItem(ACTIVE_ROLE_KEY);
    } else {
      localStorage.setItem(ACTIVE_ROLE_KEY, next.role);
    }
    setState(next);
  }, [scopedRole, state.role]);

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

export const clearStoredAuth = (role?: AuthRole | null) => {
  if (typeof window === 'undefined') return;
  const resolved = resolveRole(role);
  if (resolved) {
    localStorage.removeItem(TOKEN_KEYS[resolved]);
    localStorage.removeItem(EMAIL_KEYS[resolved]);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ROLE_KEY);
};

export const getStoredToken = (role?: AuthRole | null): string | null => {
  if (typeof window === 'undefined') return null;
  migrateLegacyAuthIfNeeded();
  const resolved = resolveRole(role || getRoleFromPath(window.location.pathname));
  if (!resolved) return null;
  return localStorage.getItem(TOKEN_KEYS[resolved]);
};

