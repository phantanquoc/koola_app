import { Test, TestingModule } from '@nestjs/testing';
import { PublicConfigController } from './public-config.controller';
import { ConfigService } from './config.service';

const fullConfig = {
  maintenanceMode: true,
  maintenanceMessage: 'Bảo trì 30 phút',
  forceUpdate: {
    android: { minVersion: '2.0.0', message: 'Cập nhật Android' },
    ios: { minVersion: '2.0.0', message: 'Cập nhật iOS' },
  },
  featureFlags: { newCheckout: true },
  announcement: {
    title: 'Thông báo',
    body: 'Nội dung',
    active: true,
    at: new Date('2026-10-01T00:00:00.000Z'),
  },
  // Field nội bộ — KHÔNG được ra endpoint public.
  updatedBy: 'admin-secret-id',
};

describe('PublicConfigController', () => {
  let controller: PublicConfigController;
  const configService = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    configService.get.mockResolvedValue(fullConfig);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicConfigController],
      providers: [{ provide: ConfigService, useValue: configService }],
    }).compile();
    controller = module.get(PublicConfigController);
  });

  it('trả các field client cần', async () => {
    const res = await controller.getPublic();

    expect(res).toMatchObject({
      maintenanceMode: true,
      maintenanceMessage: 'Bảo trì 30 phút',
      featureFlags: { newCheckout: true },
    });
    expect(res.forceUpdate.android.minVersion).toBe('2.0.0');
    expect(res.announcement.active).toBe(true);
  });

  // Endpoint không cần đăng nhập — lộ id admin sửa cấu hình là rò rỉ nội bộ.
  it('không lộ updatedBy (field nội bộ của admin)', async () => {
    const res = await controller.getPublic();
    expect(res).not.toHaveProperty('updatedBy');
  });
});
