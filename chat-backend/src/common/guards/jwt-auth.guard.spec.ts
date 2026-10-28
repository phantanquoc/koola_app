import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Ban phải có hiệu lực ngay: trước đây ban chỉ revoke refresh token nên access
 * token còn hạn (1h) vẫn gọi được mọi API.
 *
 * Passport được thay bằng stub: test chỉ quan tâm phần kiểm tra **sau khi**
 * request đã có `user`, không phải việc xác thực JWT.
 */
jest.mock('@nestjs/passport', () => {
  const actual = jest.requireActual<typeof import('@nestjs/passport')>(
    '@nestjs/passport',
  );
  return {
    ...actual,
    AuthGuard: () =>
      class {
        async canActivate(context: ExecutionContext): Promise<boolean> {
          const ctx = context as unknown as { __user: unknown };
          context.switchToHttp().getRequest<{ user?: unknown }>().user =
            ctx.__user;
          return true;
        }
      },
  };
});

// Import sau jest.mock để nhận bản đã thay.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JwtAuthGuard } = require('./jwt-auth.guard') as {
  JwtAuthGuard: new (r: Reflector) => {
    canActivate(c: ExecutionContext): Promise<boolean>;
  };
};

function makeContext(
  user: Record<string, unknown>,
  meta: { allowBanned?: boolean; isPublic?: boolean } = {},
): ExecutionContext {
  // Cùng MỘT object request cho mọi lần gọi: guard đọc request hai lần (trong
  // stub Passport và sau đó) — trả object mới mỗi lần thì `user` biến mất.
  const request: { method: string; user?: unknown } = { method: 'GET' };
  return {
    __user: user,
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeReflector(meta: {
  allowBanned?: boolean;
  isPublic?: boolean;
}): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'allowBannedAccount') return meta.allowBanned;
      if (key === 'isPublic') return meta.isPublic;
      return undefined;
    }),
  } as unknown as Reflector;
}

describe('JwtAuthGuard — chặn tài khoản bị cấm', () => {
  it('user bình thường đi qua', async () => {
    const guard = new JwtAuthGuard(makeReflector({}));
    await expect(
      guard.canActivate(makeContext({ userId: 'u1', isBanned: false })),
    ).resolves.toBe(true);
  });

  // Điểm chính: ban có hiệu lực ngay, không đợi access token hết hạn.
  it('user bị cấm bị chặn ở mọi route thường', async () => {
    const guard = new JwtAuthGuard(makeReflector({}));
    await expect(
      guard.canActivate(makeContext({ userId: 'u1', isBanned: true })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('route @AllowBanned() cho user bị cấm đi qua (nộp kháng nghị)', async () => {
    const guard = new JwtAuthGuard(makeReflector({ allowBanned: true }));
    await expect(
      guard.canActivate(
        makeContext({ userId: 'u1', isBanned: true }, { allowBanned: true }),
      ),
    ).resolves.toBe(true);
  });

  // Vé kháng nghị là JWT riêng, không phải phiên đăng nhập: nó không được mở
  // bất kỳ route nào khác.
  it('token chỉ-để-kháng-nghị bị chặn ở route thường', async () => {
    const guard = new JwtAuthGuard(makeReflector({}));
    await expect(
      guard.canActivate(
        makeContext({ userId: 'u1', isBanned: true, appealOnly: true }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('token chỉ-để-kháng-nghị đi qua route @AllowBanned()', async () => {
    const guard = new JwtAuthGuard(makeReflector({ allowBanned: true }));
    await expect(
      guard.canActivate(
        makeContext(
          { userId: 'u1', isBanned: true, appealOnly: true },
          { allowBanned: true },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('route @Public() bỏ qua cả kiểm tra ban', async () => {
    const guard = new JwtAuthGuard(makeReflector({ isPublic: true }));
    await expect(
      guard.canActivate(makeContext({ userId: 'u1', isBanned: true })),
    ).resolves.toBe(true);
  });
});
