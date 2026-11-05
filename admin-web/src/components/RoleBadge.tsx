import { StatusBadge } from './StatusBadge';
import { ADMIN_ROLE_LABELS, adminRoleTone, type AdminRole } from './admin-role';

/**
 * Badge vai trò quản trị dùng chung cho bảng Người dùng, trang chi tiết và bar xem-thay.
 *
 * `null` nghĩa là tài khoản thường (không phải admin chưa phân quyền), nên không
 * render badge — ô trống trên bảng tự mang nghĩa "không có quyền quản trị".
 */
export function RoleBadge({ role }: { role?: AdminRole | null }) {
  if (!role) return null;
  return <StatusBadge tone={adminRoleTone(role)} label={ADMIN_ROLE_LABELS[role]} />;
}
