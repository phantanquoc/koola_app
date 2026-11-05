import { ForbiddenException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';

/**
 * Chỉ super được đổi adminRole. Route dùng chung PATCH /admin/users/:id nên
 * nếu không chặn riêng field này, moderator tự nâng mình lên super sau một
 * request sửa hồ sơ bất kỳ.
 */
describe('AdminController.updateUser — adminRole chỉ super', () => {
  const audit = { log: jest.fn() };
  const makeController = (updateUser: jest.Mock) =>
    new AdminController(
      { updateUser } as unknown as AdminService,
      audit as unknown as AdminAuditService,
    );

  beforeEach(() => jest.clearAllMocks());

  const req = (adminRole?: string) =>
    ({ ip: '127.0.0.1', adminRole } as never);

  it('moderator gửi adminRole → 403, service không được gọi', async () => {
    const updateUser = jest.fn();
    const controller = makeController(updateUser);

    await expect(
      controller.updateUser(
        'u1',
        { adminRole: 'super' },
        { actorId: 'a1' },
        req('moderator'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('thiếu request.adminRole (guard chưa chạy) → fail-closed', async () => {
    const updateUser = jest.fn();
    const controller = makeController(updateUser);

    await expect(
      controller.updateUser('u1', { adminRole: 'super' }, { actorId: 'a1' }, req()),
    ).rejects.toThrow(ForbiddenException);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('super đổi được adminRole', async () => {
    const updateUser = jest.fn().mockResolvedValue({ accountType: 'personal' });
    const controller = makeController(updateUser);

    await controller.updateUser(
      'u1',
      { adminRole: 'moderator' },
      { actorId: 'a1' },
      req('super'),
    );
    expect(updateUser).toHaveBeenCalledWith('u1', { adminRole: 'moderator' });
  });

  it('moderator vẫn sửa được field hồ sơ thường', async () => {
    const updateUser = jest.fn().mockResolvedValue({ accountType: 'personal' });
    const controller = makeController(updateUser);

    await controller.updateUser(
      'u1',
      { displayName: 'An' },
      { actorId: 'a1' },
      req('moderator'),
    );
    expect(updateUser).toHaveBeenCalledWith('u1', { displayName: 'An' });
  });
});
