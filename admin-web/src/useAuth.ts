import { useContext } from 'react';
import { AuthContext, type AdminIdentity } from './AuthContext';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  identity: AdminIdentity | null;
  identityLoading: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  refreshIdentity: () => Promise<void>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * Làm mới identity sau một mutation — không ném khi thiếu provider.
 *
 * `TwoFactorPanel` render được trong test component đơn lẻ (không có
 * AuthProvider), và ở đó chỉ cần "không có gì để làm mới" chứ không phải lỗi.
 */
export function useRefreshIdentity(): () => Promise<void> {
  const ctx = useContext(AuthContext);
  return ctx?.refreshIdentity ?? (() => Promise.resolve());
}

/**
 * Vai trò của admin đang đăng nhập, dùng cho việc ẩn/hiện nút chỉ-super.
 *
 * Không ném lỗi khi thiếu provider (khác `useAuth`) vì đây chỉ là gợi ý UI —
 * quyền thật do backend chặn. Thiếu context (test component đơn lẻ, hoặc
 * trang render ngoài shell) thì coi là super, giống backend coi `adminRole`
 * null là super.
 */
export function useAdminRole(): 'super' | 'moderator' | 'support' {
  const ctx = useContext(AuthContext);
  return ctx?.identity?.adminRole ?? 'super';
}
