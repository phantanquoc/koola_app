import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigService } from './config.service';
import { AppConfig } from './config.schema';
import { AdminAuditLog } from '../admin/schemas/admin-audit-log.schema';
import { UpdateConfigDto } from './dto/update-config.dto';

const ACTOR = '507f1f77bcf86cd799439001';

function leanable(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  q.lean = jest.fn().mockResolvedValue(result);
  q.select = jest.fn().mockReturnValue(q);
  return q;
}

const configModel = {
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
};
const auditModel = { create: jest.fn() };

interface UpdatePayload {
  $set: {
    maintenanceMode: boolean;
    maintenanceMessage: string;
    forceUpdate: {
      android: { minVersion: string; message: string };
      ios: { minVersion: string; message: string };
    };
    featureFlags: Record<string, boolean>;
    announcement: { at: Date | null; active: boolean };
    updatedBy: string;
  };
}

type UpsertCall = [
  Record<string, unknown>,
  UpdatePayload,
  Record<string, unknown>,
];

function lastUpsert(): UpsertCall {
  const calls = configModel.findOneAndUpdate.mock
    .calls as unknown as UpsertCall[];
  return calls[0];
}

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    configModel.findById.mockReturnValue(leanable(null));
    configModel.findOneAndUpdate.mockReturnValue(leanable(null));
    auditModel.create.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: getModelToken(AppConfig.name), useValue: configModel },
        { provide: getModelToken(AdminAuditLog.name), useValue: auditModel },
      ],
    }).compile();
    service = module.get(ConfigService);
  });

  it('trả default khi chưa có document cấu hình', async () => {
    const cfg = await service.get();
    expect(cfg).toEqual({
      maintenanceMode: false,
      maintenanceMessage: '',
      forceUpdate: {
        android: { minVersion: '', message: '' },
        ios: { minVersion: '', message: '' },
      },
      featureFlags: {},
      announcement: { title: '', body: '', active: false, at: null },
    });
  });

  it('cache 30s: lần đọc thứ hai không query lại DB', async () => {
    await service.get();
    await service.get();
    expect(configModel.findById).toHaveBeenCalledTimes(1);
  });

  it('patch merge sâu: đổi iOS không làm mất Android, thêm cờ không xoá cờ cũ', async () => {
    configModel.findById.mockReturnValue(
      leanable({
        maintenanceMode: false,
        maintenanceMessage: '',
        forceUpdate: {
          android: { minVersion: '1.0.0', message: 'android cũ' },
          ios: { minVersion: '1.0.0', message: 'ios cũ' },
        },
        featureFlags: { chat: true, stories: false },
        announcement: { title: '', body: '', active: false, at: null },
      }),
    );

    await service.patch(
      {
        forceUpdate: { ios: { minVersion: '2.0.0' } },
        featureFlags: { stories: true, newFlag: true },
      },
      ACTOR,
    );

    const [, update] = lastUpsert();
    expect(update.$set.forceUpdate.android).toEqual({
      minVersion: '1.0.0',
      message: 'android cũ',
    });
    expect(update.$set.forceUpdate.ios).toEqual({
      minVersion: '2.0.0',
      message: 'ios cũ',
    });
    expect(update.$set.featureFlags).toEqual({
      chat: true,
      stories: true,
      newFlag: true,
    });
    expect(update.$set.updatedBy).toBe(ACTOR);
  });

  it('patch làm mất cache — lần get sau đọc lại DB và thấy giá trị mới', async () => {
    await service.get(); // nạp cache rỗng
    configModel.findById.mockReturnValue(
      leanable({ maintenanceMode: true, maintenanceMessage: 'Bảo trì' }),
    );
    configModel.findOneAndUpdate.mockReturnValue(
      leanable({
        maintenanceMode: true,
        maintenanceMessage: 'Bảo trì',
        forceUpdate: {
          android: { minVersion: '', message: '' },
          ios: { minVersion: '', message: '' },
        },
        featureFlags: {},
        announcement: { title: '', body: '', active: false, at: null },
      }),
    );

    await service.patch({ maintenanceMode: true }, ACTOR);
    const cfg = await service.get();

    expect(cfg.maintenanceMode).toBe(true);
    // get() gọi lần 1 trước patch, lần 2 sau khi cache bị xoá.
    expect(configModel.findById).toHaveBeenCalledTimes(2);
  });

  it('bật/sửa thông báo thì gắn mốc at mới', async () => {
    await service.patch(
      { announcement: { title: 'Bảo trì', body: 'Tối nay', active: true } },
      ACTOR,
    );
    const [, update] = lastUpsert();
    expect(update.$set.announcement.at).toBeInstanceOf(Date);
    expect(update.$set.announcement.active).toBe(true);
  });

  it('upsert document singleton để không sinh bản ghi thứ hai', async () => {
    await service.patch({ maintenanceMode: true }, ACTOR, '1.2.3.4');
    const [filter, , options] = lastUpsert();
    expect(filter).toEqual({ _id: 'singleton' });
    expect(options).toMatchObject({ upsert: true, new: true });
  });

  it('ghi audit kèm actor + ip, không chặn thao tác đã lưu', async () => {
    await service.patch({ maintenanceMode: true }, ACTOR, '1.2.3.4');
    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR,
        action: 'update_config',
        targetType: 'config',
        ip: '1.2.3.4',
      }),
    );
  });

  it('audit lỗi vẫn trả cấu hình đã lưu', async () => {
    auditModel.create.mockRejectedValue(new Error('mongo down'));
    const cfg = await service.patch({ maintenanceMode: true }, ACTOR);
    expect(cfg.maintenanceMode).toBe(true);
  });
});

describe('UpdateConfigDto validation', () => {
  async function validatePayload(payload: Record<string, unknown>) {
    const dto = plainToInstance(UpdateConfigDto, payload);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  }

  it('chấp nhận payload hợp lệ', async () => {
    const errors = await validatePayload({
      maintenanceMode: true,
      maintenanceMessage: 'Bảo trì 30 phút',
      forceUpdate: { android: { minVersion: '2.1.0', message: 'Cập nhật' } },
      featureFlags: { chat: true, stories_enabled: false },
      announcement: { title: 'Tin', body: 'Nội dung', active: true },
    });
    expect(errors).toHaveLength(0);
  });

  it('chặn minVersion sai định dạng', async () => {
    const errors = await validatePayload({
      forceUpdate: { android: { minVersion: 'mới nhất' } },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('forceUpdate');
  });

  it('chặn featureFlags giá trị không phải boolean', async () => {
    const errors = await validatePayload({
      featureFlags: { chat: 'yes' },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('featureFlags');
  });

  it('chặn featureFlags là mảng', async () => {
    const errors = await validatePayload({ featureFlags: [] });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('featureFlags');
  });

  it('chặn vượt trần số cờ', async () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [`f${i}`, true]),
    );
    const errors = await validatePayload({ featureFlags: tooMany });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('featureFlags');
  });

  it('chặn key lạ trong payload', async () => {
    const errors = await validatePayload({ hacked: true });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('hacked');
  });
});
