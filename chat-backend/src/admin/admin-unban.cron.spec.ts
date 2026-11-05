import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../users/user.schema';
import { RedisService } from '../common/redis/redis.service';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminUnbanCron } from './admin-unban.cron';

function leanChain(rows: unknown[]) {
  return {
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
}

describe('AdminUnbanCron', () => {
  let cron: AdminUnbanCron;
  const userModel = { find: jest.fn() };
  const adminService = { unbanUser: jest.fn() };
  const audit = { log: jest.fn() };
  const redis = { tryAcquireLock: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    redis.tryAcquireLock.mockResolvedValue(true);
    adminService.unbanUser.mockResolvedValue({});
    audit.log.mockResolvedValue(undefined);
    const mod = await Test.createTestingModule({
      providers: [
        AdminUnbanCron,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: AdminService, useValue: adminService },
        { provide: AdminAuditService, useValue: audit },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    cron = mod.get(AdminUnbanCron);
    // Log tổng kết không cần ồn trong test.
    jest.spyOn((cron as unknown as { logger: { log: () => void } }).logger, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn((cron as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  it('bỏ tick khi instance khác đang giữ khoá', async () => {
    redis.tryAcquireLock.mockResolvedValue(false);

    await cron.handleUnbanTick();

    expect(redis.tryAcquireLock).toHaveBeenCalledWith('cron:admin-unban', 600);
    expect(userModel.find).not.toHaveBeenCalled();
    expect(adminService.unbanUser).not.toHaveBeenCalled();
  });

  it('chỉ gỡ ban user có bannedUntil đã qua, tối đa 200 mỗi tick', async () => {
    const chain = leanChain([
      { _id: 'u1', accountType: 'personal' },
      { _id: 'u2', accountType: 'business' },
    ]);
    userModel.find.mockReturnValue(chain);

    await cron.handleUnbanTick();

    const filter = userModel.find.mock.calls[0][0];
    expect(filter).toEqual({ isBanned: true, bannedUntil: { $lte: expect.any(Date) } });
    expect(chain.limit).toHaveBeenCalledWith(200);
    expect(adminService.unbanUser).toHaveBeenCalledTimes(2);
    expect(adminService.unbanUser).toHaveBeenNthCalledWith(1, 'u1');
    expect(adminService.unbanUser).toHaveBeenNthCalledWith(2, 'u2');
    // Audit ghi đúng nguồn 'system' và targetType theo accountType.
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'system',
        action: 'unban_user',
        targetType: 'business',
        targetId: 'u2',
      }),
    );
  });

  it('một user lỗi không chặn các user còn lại', async () => {
    userModel.find.mockReturnValue(
      leanChain([{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }]),
    );
    adminService.unbanUser
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({});

    await expect(cron.handleUnbanTick()).resolves.toBeUndefined();

    expect(adminService.unbanUser).toHaveBeenCalledTimes(3);
    expect(adminService.unbanUser).toHaveBeenNthCalledWith(3, 'u3');
    // Chỉ user gỡ thành công mới có dòng audit.
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('không gọi unbanUser khi không có ai hết hạn', async () => {
    userModel.find.mockReturnValue(leanChain([]));

    await cron.handleUnbanTick();

    expect(adminService.unbanUser).not.toHaveBeenCalled();
  });
});
