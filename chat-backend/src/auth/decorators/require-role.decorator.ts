import { SetMetadata, CustomDecorator } from '@nestjs/common';
import type { AdminRole } from '../../users/user.schema';

export const REQUIRE_ROLE_KEY = 'requireAdminRole';

/**
 * Đánh dấu route chỉ dành cho một vai trò admin cụ thể.
 * Chạy cùng AdminGuard (AdminRoleGuard đọc metadata này sau AdminGuard).
 * Admin mặc định (adminRole null) được xem là "super" để không khoá admin cũ.
 */
export const RequireRole = (role: AdminRole): CustomDecorator<string> =>
  SetMetadata(REQUIRE_ROLE_KEY, role);
