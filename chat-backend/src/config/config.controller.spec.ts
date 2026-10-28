import { ForbiddenException } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

/**
 * Sửa cấu hình toàn hệ thống (maintenance/force update) là quyền của super.
 * Moderator chỉ đọc — nếu PATCH lọt, một tài khoản support bị lộ có thể đẩy
 * cả app vào bảo trì.
 */
describe('ConfigController.update — chỉ super', () => {
  const configService = { patch: jest.fn() };
  const controller = new ConfigController(
    configService as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  const req = (adminRole?: string) =>
    ({ ip: '127.0.0.1', adminRole } as never);

  it('moderator bị chặn 403', async () => {
    await expect(
      controller.update(
        { maintenanceMode: true } as never,
        { actorId: 'a1' },
        req('moderator'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(configService.patch).not.toHaveBeenCalled();
  });

  it('thiếu adminRole thì từ chối', async () => {
    await expect(
      controller.update({ maintenanceMode: true } as never, { actorId: 'a1' }, req()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('super được phép', async () => {
    configService.patch.mockResolvedValue({ maintenanceMode: true });
    await controller.update(
      { maintenanceMode: true } as never,
      { actorId: 'a1' },
      req('super'),
    );
    expect(configService.patch).toHaveBeenCalledWith(
      { maintenanceMode: true },
      'a1',
      '127.0.0.1',
    );
  });
});
