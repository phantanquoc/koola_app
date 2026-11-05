import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

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
      user?: { imp?: boolean };
    }>();
    if (
      request.user?.imp === true &&
      !READ_ONLY_METHODS.has((request.method ?? 'GET').toUpperCase())
    ) {
      throw new ForbiddenException('Chế độ xem thay người dùng chỉ đọc');
    }
    return true;
  }
}
