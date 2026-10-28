import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '../../users/user.schema';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';

/**
 * AdminRoleGuard — chạy SAU AdminGuard, đọc request.adminRole do AdminGuard gán.
 *
 * Route không gắn @RequireRole thì mọi admin đều qua (moderator mặc định đủ quyền).
 * Route gắn @RequireRole("super") thì chỉ super qua.
 * Thiếu request.adminRole (guard bị dùng sai thứ tự) → từ chối, fail-closed.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole | undefined>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ adminRole?: AdminRole }>();
    const role = request.adminRole;

    // super thoả mọi yêu cầu; vai trò khác phải khớp chính xác
    if (role === 'super' || role === required) {
      return true;
    }

    throw new ForbiddenException('Insufficient admin role');
  }
}
