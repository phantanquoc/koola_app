import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminGuard } from './admin.guard';
import { User } from '../../users/user.schema';

const mockUserModel = {
  findById: jest.fn(),
};

function makeContext(actorId: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
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
});
