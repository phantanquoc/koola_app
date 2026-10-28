import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminRole, User, UserDocument } from '../../users/user.schema';
import { MFA_EXEMPT_KEY } from '../decorators/mfa-exempt.decorator';

/** Chỉ các method này được phép với vai trò `support`. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Mã lỗi riêng cho "cần bật 2FA". Client phải phân biệt được với 403 hạ quyền:
 * `apiClient` của admin-web chuyển mọi 403 sang `/forbidden`, nên nếu dùng
 * chung một mã thì admin chưa bật 2FA sẽ thấy màn hình "đã bị hạ quyền" — sai
 * thông điệp và không có đường bật.
 */
export const MFA_REQUIRED_CODE = 'mfa_required';

/**
 * AdminGuard — runs AFTER JwtAuthGuard.
 *
 * Resolves the human actor from request.user.actorId (set by JwtStrategy.validate
 * as `act ?? sub`), loads that user FRESH from the database, and allows the
 * request only when `isPlatformAdmin === true`.
 *
 * Fresh DB read is intentional: a demoted admin loses access immediately,
 * without waiting for token expiry.
 *
 * On success sets request.adminRole. Admin cũ chưa có adminRole → coi là "super".
 *
 * Vai trò `support` chỉ đọc: chặn mọi method ghi ngay tại đây thay vì gắn
 * @RequireRole cho từng route. Guard này đã phủ mọi controller admin nên route
 * thêm mới không thể lọt lưới. @RequireRole vẫn dùng để siết thêm (ví dụ
 * moderator cũng không được xoá user).
 *
 * **Bắt buộc 2FA** (`ADMIN_MFA_REQUIRED=true`): admin chưa bật 2FA bị chặn với
 * `code: 'mfa_required'`, trừ route gắn `@MfaExempt()`.
 *
 * Vì sao đặt ở đây chứ không ở `AuthService.login`: bật 2FA cần access token
 * (gọi `/auth/2fa/setup` → `/auth/2fa/enable`). Chặn ngay ở login là khoá luôn
 * đường tự bật — admin không có token nào để dùng. Chặn ở tầng quyền admin vẫn
 * đạt mục tiêu: không đọc/ghi được dữ liệu nào của admin khi chưa bật 2FA, mà
 * vẫn còn đúng một cửa để tự sửa.
 *
 * Apply at controller level alongside JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * Never mark any /admin/* route @Public() — JWT must still validate first.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      user?: { actorId?: string };
      adminRole?: AdminRole;
    }>();

    const actorId = request.user?.actorId;
    if (!actorId) {
      throw new ForbiddenException('Admin access required');
    }

    // Load actor fresh — do NOT trust the token claim for admin decision
    const actor = await this.userModel
      .findById(actorId)
      .select('isPlatformAdmin adminRole twoFactorEnabled')
      .lean();

    if (!actor || !actor.isPlatformAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    const role: AdminRole = actor.adminRole ?? 'super';
    request.adminRole = role;

    // support: đọc để trả lời người dùng, không được sửa dữ liệu.
    if (
      role === 'support' &&
      !READ_ONLY_METHODS.has((request.method ?? 'GET').toUpperCase())
    ) {
      throw new ForbiddenException('Vai trò hỗ trợ chỉ được đọc');
    }

    if (!actor.twoFactorEnabled && this.mfaRequired()) {
      const exempt = this.reflector.getAllAndOverride<boolean>(MFA_EXEMPT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!exempt) {
        throw new ForbiddenException({
          statusCode: 403,
          code: MFA_REQUIRED_CODE,
          message: 'Bật xác thực hai lớp trước khi dùng trang quản trị',
        });
      }
    }

    return true;
  }

  /**
   * Đọc `process.env` mỗi request thay vì qua ConfigService: guard này được
   * khai báo ở 4 module (admin, config, ops-log, commerce spec) — thêm một
   * provider nữa là thêm 4 chỗ phải sửa và 3 spec phải mock, trong khi cờ chỉ
   * là một chuỗi môi trường đọc thẳng được. Test bật/tắt cờ ngay trong phiên
   * chạy cũng dễ hơn.
   */
  private mfaRequired(): boolean {
    return process.env.ADMIN_MFA_REQUIRED === 'true';
  }
}
