import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_BANNED_KEY } from '../../auth/decorators/allow-banned.decorator';

/** Chỉ các method này được phép với token xem-thay-người-dùng. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const ok = await super.canActivate(context);
    if (!ok) return false;

    // Chốt an toàn chính của xem-thay-người-dùng: chặn MỌI thao tác ghi, không
    // phụ thuộc từng controller có nhớ tự kiểm hay không.
    const request = context.switchToHttp().getRequest<{
      method?: string;
      user?: { imp?: boolean; isBanned?: boolean; appealOnly?: boolean };
    }>();
    if (
      request.user?.imp === true &&
      !READ_ONLY_METHODS.has((request.method ?? 'GET').toUpperCase())
    ) {
      throw new ForbiddenException('Chế độ xem thay người dùng chỉ đọc');
    }

    // Ban phải có hiệu lực NGAY. Trước đây ban chỉ revoke refresh token, nên
    // access token còn hạn (1h) vẫn gọi được mọi API — kẻ bị cấm vẫn chat, vẫn
    // đọc dữ liệu. Chặn ở đây thay vì từng service để không route nào lọt.
    const allowBanned = this.reflector.getAllAndOverride<boolean>(
      ALLOW_BANNED_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Vé nộp kháng nghị: JWT riêng (claim `appeal`), TTL 10 phút, KHÔNG phải
    // phiên đăng nhập. Chỉ đi được vào route @AllowBanned(), không mang quyền
    // đọc dữ liệu nào khác.
    if (request.user?.appealOnly === true && !allowBanned) {
      throw new ForbiddenException(
        'Token này chỉ dùng để nộp kháng nghị',
      );
    }

    if (request.user?.isBanned === true && !allowBanned) {
      throw new ForbiddenException('Tài khoản đã bị cấm');
    }

    return true;
  }
}
