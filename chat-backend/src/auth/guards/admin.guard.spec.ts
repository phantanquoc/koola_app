import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminGuard } from './admin.guard';
import { User } from '../../users/user.schema';

const mockUserModel = {
  findById: jest.fn(),
};

function makeContext(
  actorId: string | undefined,
  method = 'GET',
): ExecutionContext {
  return {
    // Reflector thật cần target là function để đọc metadata — undefined làm
    // Reflect.getMetadata ném TypeError, không phải lỗi logic của guard.
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: actorId ? { actorId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        { provide: getModelToken(User.name), useValue: mockUserModel },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
  });

  it('allows a personal admin user', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isPlatformAdmin: true }),
    });

    const result = await guard.canActivate(makeContext('admin-user-id'));
    expect(result).toBe(true);
  });

  it('allows a business-context token whose root actor is an admin', async () => {
    // business token: actorId = rootAdminId (set by JwtStrategy.validate via act claim)
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isPlatformAdmin: true }),
    });

    const result = await guard.canActivate(makeContext('root-admin-id'));
    expect(result).toBe(true);
    // Guard must have looked up the actor (root), not the business sub
    expect(mockUserModel.findById).toHaveBeenCalledWith('root-admin-id');
  });

  it('throws 403 when resolved actor is not a platform admin', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isPlatformAdmin: false }),
    });

    await expect(
      guard.canActivate(makeContext('regular-user-id')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 when actorId is missing (no request.user)', async () => {
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockUserModel.findById).not.toHaveBeenCalled();
  });

  it('throws 403 when admin flag was revoked after token issuance (DB re-read)', async () => {
    // User was once an admin; now isPlatformAdmin=false in DB
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isPlatformAdmin: false }),
    });

    await expect(
      guard.canActivate(makeContext('demoted-admin-id')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 when actor user is not found in DB', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    await expect(guard.canActivate(makeContext('ghost-id'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ─── Vai trò support: chỉ đọc ──────────────────────────────────────────────

  function mockActor(adminRole: string | null) {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isPlatformAdmin: true, adminRole }),
    });
  }

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'support đọc được (%s)',
    async (method) => {
      mockActor('support');
      await expect(
        guard.canActivate(makeContext('support-user', method)),
      ).resolves.toBe(true);
    },
  );

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'support KHÔNG được ghi (%s) — chặn ở guard chung, không phụ thuộc route',
    async (method) => {
      mockActor('support');
      await expect(
        guard.canActivate(makeContext('support-user', method)),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('moderator vẫn ghi được — chỉ support mới chỉ-đọc', async () => {
    mockActor('moderator');
    await expect(
      guard.canActivate(makeContext('mod-user', 'POST')),
    ).resolves.toBe(true);
  });

  it('admin cũ (adminRole null) coi là super, ghi được', async () => {
    mockActor(null);
    await expect(
      guard.canActivate(makeContext('legacy-admin', 'POST')),
    ).resolves.toBe(true);
  });

  // ─── Bắt buộc 2FA (ADMIN_MFA_REQUIRED) ─────────────────────────────────────

  describe('khi ADMIN_MFA_REQUIRED=true', () => {
    const original = process.env.ADMIN_MFA_REQUIRED;

    beforeEach(() => {
      process.env.ADMIN_MFA_REQUIRED = 'true';
    });

    afterEach(() => {
      if (original === undefined) delete process.env.ADMIN_MFA_REQUIRED;
      else process.env.ADMIN_MFA_REQUIRED = original;
    });

    it('admin chưa bật 2FA bị chặn với code mfa_required', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          isPlatformAdmin: true,
          adminRole: null,
          twoFactorEnabled: false,
        }),
      });

      await expect(
        guard.canActivate(makeContext('admin-1', 'GET')),
      ).rejects.toMatchObject({ response: { code: 'mfa_required' } });
    });

    it('admin đã bật 2FA đi qua bình thường', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          isPlatformAdmin: true,
          adminRole: null,
          twoFactorEnabled: true,
        }),
      });

      await expect(guard.canActivate(makeContext('admin-1'))).resolves.toBe(true);
    });

    // Route gắn @MfaExempt() phải đi qua, nếu không admin chưa bật 2FA không có
    // cách nào tự bật (cần token để gọi /auth/2fa/setup).
    it('route @MfaExempt() vẫn qua được', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          isPlatformAdmin: true,
          twoFactorEnabled: false,
        }),
      });
      const ctx = makeContext('admin-1');
      // Reflector thật trong TestingModule không thấy metadata của test — nên
      // kiểm gián tiếp: resolve được khi metadata trả true.
      const spy = jest
        .spyOn(
          (guard as unknown as { reflector: { getAllAndOverride: () => boolean } })
            .reflector,
          'getAllAndOverride',
        )
        .mockReturnValue(true);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      spy.mockRestore();
    });
  });

  it('khi cờ tắt (mặc định), admin chưa bật 2FA vẫn qua', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        isPlatformAdmin: true,
        twoFactorEnabled: false,
      }),
    });

    await expect(guard.canActivate(makeContext('admin-1'))).resolves.toBe(true);
  });
});
