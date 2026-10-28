import { useContext } from 'react';
import { AuthContext, type AdminIdentity } from './AuthContext';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  identity: AdminIdentity | null;
  identityLoading: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
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
