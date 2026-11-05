import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import apiClient from './apiClient';
import { tokenStorage } from './tokenStorage';

export interface AdminIdentity {
  /** Display name shown in the header chip. */
  name: string;
  email?: string;
  id?: string;
  /**
   * Vai trò quản trị của chính admin đang đăng nhập. Backend trả null cho
   * admin cũ chưa phân vai trò — coi là `super` (AdminRoleGuard cũng vậy).
   * Trang nào chỉ super được thao tác (đổi vai trò, sửa cấu hình) dùng field
   * này để ẩn nút thay vì để người dùng bấm rồi ăn 403.
   */
  adminRole?: 'super' | 'moderator' | 'support';
}

/**
 * Auth state. Identity comes from GET /api/admin/me (fresh DB read) —
 * never from decoding the JWT client-side (AGENTS.md rule 3).
 */
interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  identity: AdminIdentity | null;
  identityLoading: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

interface MeResponse {
  displayName?: string;
  name?: string;
  email?: string;
  _id?: string;
  id?: string;
  isPlatformAdmin?: boolean;
  adminRole?: 'super' | 'moderator' | 'support' | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStorage.getAccess());
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);

  // Fetch /me whenever a token exists (login or page reload with session).
  useEffect(() => {
    if (!token) {
      setIdentity(null);
      return;
    }
    let cancelled = false;
    setIdentityLoading(true);
    apiClient
      .get<MeResponse>('/admin/me')
      .then((res) => {
        if (cancelled) return;
        const me = res.data;
        setIdentity({
          name: me.displayName ?? me.name ?? me.email ?? 'Admin',
          email: me.email,
          id: me._id ?? me.id,
          adminRole: me.adminRole ?? 'super',
        });
      })
      .catch(() => {
        // 401/403 are handled by the apiClient interceptor (logout/forbidden).
        // Other failures (network) just leave identity null; pages still work.
        if (!cancelled) setIdentity(null);
      })
      .finally(() => {
        if (!cancelled) setIdentityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback((accessToken: string, refreshToken: string) => {
    tokenStorage.setAccess(accessToken);
    tokenStorage.setRefresh(refreshToken);
    setToken(accessToken);
  }, []);

  const logout = useCallback(() => {
    const refreshToken = tokenStorage.getRefresh();
    tokenStorage.clear();
    setToken(null);
    setIdentity(null);
    // Best-effort server-side revocation; ignore failure (token already cleared locally).
    if (refreshToken) {
      axios
        .post(`${apiClient.defaults.baseURL}/auth/logout`, { refreshToken })
        .catch(() => undefined);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      isAuthenticated: token !== null,
      identity,
      identityLoading,
      login,
      logout,
    }),
    [token, identity, identityLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
