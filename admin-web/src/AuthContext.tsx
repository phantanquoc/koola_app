import React, { createContext, useState, useCallback, useMemo } from 'react';
import { tokenStorage } from './tokenStorage';

export interface AdminIdentity {
  name: string;
  email?: string;
  role?: string;
  sub?: string;
}

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  identity: AdminIdentity | null;
  login: (token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

/**
 * Decode a JWT payload without external dependencies.
 * Returns null on any failure (malformed token, etc.).
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64url -> Base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractIdentity(token: string | null): AdminIdentity | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  // Try common JWT claim names for name/email/role
  const name =
    (payload.displayName as string) ||
    (payload.name as string) ||
    (payload.email as string) ||
    'Admin';
  const email = (payload.email as string) || undefined;
  const role = (payload.role as string) || (payload.accountType as string) || 'admin';
  const sub = (payload.sub as string) || (payload.userId as string) || undefined;

  return { name, email, role, sub };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStorage.get());

  const login = useCallback((newToken: string) => {
    tokenStorage.set(newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setToken(null);
  }, []);

  const identity = useMemo(() => extractIdentity(token), [token]);

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: token !== null, identity, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
