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
  /**
   * Admin đã bật xác thực hai lớp chưa. `GET /admin/me` dùng SAFE_PROJECTION
   * (ẩn secret + recovery codes) nhưng vẫn giữ `twoFactorEnabled`, nên field
   * này có mặt thật. Topbar cảnh báo khi `false`.
   */
  twoFactorEnabled?: boolean;
  /**
   * Server đang BẮT BUỘC 2FA (`ADMIN_MFA_REQUIRED=true`) hay không. Do server
   * trả trong `/admin/me` — client không đọc env, và bật cờ không cần build lại.
   */
  mfaRequired?: boolean;
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
  /**
   * Đọc lại `/admin/me` và cập nhật identity.
   *
   * Dùng khi trạng thái tài khoản vừa đổi ở phía server mà không có token mới —
   * ví dụ admin vừa bật 2FA trên wall: không có nó thì wall đứng nguyên và cách
   * duy nhất để thoát là F5, đúng kiểu "nút giả" §0.7 cấm.
   */
  refreshIdentity: () => Promise<void>;
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
  twoFactorEnabled?: boolean;
  mfaRequired?: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStorage.getAccess());
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);

  /** Dùng chung cho effect khởi động và cho `refreshIdentity` (gọi sau mutation). */
  const loadIdentity = useCallback(async (): Promise<void> => {
    setIdentityLoading(true);
    try {
      const res = await apiClient.get<MeResponse>('/admin/me');
      const me = res.data;
      setIdentity({
        name: me.displayName ?? me.name ?? me.email ?? 'Admin',
        email: me.email,
        id: me._id ?? me.id,
        adminRole: me.adminRole ?? 'super',
        twoFactorEnabled: Boolean(me.twoFactorEnabled),
        mfaRequired: Boolean(me.mfaRequired),
      });
    } catch {
      // 401/403 do apiClient interceptor lo (logout/forbidden). Lỗi mạng thì để
      // identity null — trang vẫn render, chỉ thiếu chip tên.
      setIdentity(null);
    } finally {
      setIdentityLoading(false);
    }
  }, []);

  // Fetch /me whenever a token exists (login or page reload with session).
  useEffect(() => {
    if (!token) {
      setIdentity(null);
      return;
    }
    // React 18 không cảnh báo setState sau unmount, và `loadIdentity` tự nuốt lỗi
    // — không cần cờ `cancelled` (bản trước có nhưng không chặn được gì vì
    // setState nằm bên trong callback, ngoài phạm vi effect).
    void loadIdentity();
  }, [token, loadIdentity]);

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
      refreshIdentity: loadIdentity,
    }),
    [token, identity, identityLoading, login, logout, loadIdentity],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
