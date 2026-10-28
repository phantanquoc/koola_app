import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminRole, User, UserDocument } from '../../users/user.schema';

/** Chỉ các method này được phép với vai trò `support`. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
 * Apply at controller level alongside JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * Never mark any /admin/* route @Public() — JWT must still validate first.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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
      .select('isPlatformAdmin adminRole')
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

    return true;
  }
}
