import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRoleGuard } from './admin-role.guard';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';

function makeContext(adminRole?: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ adminRole }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(required?: string): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) =>
      key === REQUIRE_ROLE_KEY ? required : undefined,
    ),
  } as unknown as Reflector;
}

describe('AdminRoleGuard', () => {
  it('cho qua route không gắn @RequireRole', () => {
    const guard = new AdminRoleGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext('support'))).toBe(true);
  });

  it('moderator qua route @RequireRole("super")? → không', () => {
    const guard = new AdminRoleGuard(makeReflector('super'));
    expect(() => guard.canActivate(makeContext('moderator'))).toThrow(
      ForbiddenException,
    );
  });

  it('support bị chặn ở route moderator', () => {
    const guard = new AdminRoleGuard(makeReflector('moderator'));
    expect(() => guard.canActivate(makeContext('support'))).toThrow(
      ForbiddenException,
    );
  });

  it('super qua mọi route', () => {
    const guard = new AdminRoleGuard(makeReflector('super'));
    expect(guard.canActivate(makeContext('super'))).toBe(true);
  });

  it('thiếu request.adminRole (sai thứ tự guard) → fail-closed', () => {
    const guard = new AdminRoleGuard(makeReflector('super'));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
