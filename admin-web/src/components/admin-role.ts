/**
 * Vai trò quản trị nền tảng — một nguồn nhãn cho list và trang chi tiết.
 *
 * Backend để `adminRole` null với admin cũ (AdminRoleGuard coi là super), nên
 * UI phải quy đổi trước khi hiện: ô trống trên bảng đọc thành "chưa phân quyền"
 * là sai nghĩa.
 */

export type AdminRole = 'super' | 'moderator' | 'support';

export const ADMIN_ROLES: readonly AdminRole[] = ['super', 'moderator', 'support'];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super: 'Quản trị cấp cao',
  moderator: 'Kiểm duyệt viên',
  support: 'Hỗ trợ',
};

/** Vai trò hiển thị: null khi không phải quản trị; admin cũ chưa gán role = super. */
export function resolveAdminRole(user: {
  isPlatformAdmin?: boolean;
  adminRole?: AdminRole | null;
}): AdminRole | null {
  if (!user.isPlatformAdmin) return null;
  return user.adminRole ?? 'super';
}

/** Màu badge theo mức quyền: super nổi nhất, support trung tính. */
export function adminRoleTone(role: AdminRole): 'primary' | 'warning' | 'muted' {
  if (role === 'super') return 'primary';
  return role === 'moderator' ? 'warning' : 'muted';
}
