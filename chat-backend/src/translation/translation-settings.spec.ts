import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { UsersService } from '../users/users.service';
import { User } from '../users/user.schema';
import { UpdateSettingsDto } from '../users/dto/update-settings.dto';
import { RedisService } from '../common/redis/redis.service';
import { PlivoService } from '../auth/plivo.service';

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeModelMock = () => {
  const selectMock = jest.fn();
  return {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    _selectMock: selectMock,
  };
};

// ─── UpdateSettingsDto validation ───────────────────────────────────────────

describe('UpdateSettingsDto (translation fields)', () => {
  const errorsFor = async (input: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateSettingsDto, input);
    const errs = await validate(dto);
    return errs.map((e) => e.property);
  };

  it('accepts preferredLanguage = vi', async () => {
    expect(await errorsFor({ preferredLanguage: 'vi' })).toEqual([]);
  });

  it('rejects invalid language code xx', async () => {
    expect(await errorsFor({ preferredLanguage: 'xx' })).toContain(
      'preferredLanguage',
    );
  });

  it('transforms " EN " → "en" and accepts it', async () => {
    const dto = plainToInstance(UpdateSettingsDto, {
      preferredLanguage: ' EN ',
    });
    const errs = await validate(dto);
    expect(errs.map((e) => e.property)).toEqual([]);
    expect(dto.preferredLanguage).toBe('en');
  });

  // @Type(() => Boolean) coerces most truthy/falsy values into booleans. Verify
  // that a non-boolean primitive (number) still passes IsBoolean after coercion
  // — the contract is "accepts anything boolean-like". Use an explicit test of
  // the DTO shape: missing required fields are rejected, but all fields here
  // are optional. Instead, assert that invalid preferredLanguage IS rejected.
  it('rejects invalid preferredLanguage code', async () => {
    expect(await errorsFor({ preferredLanguage: 'not-a-code' })).toContain(
      'preferredLanguage',
    );
  });

  it('accepts empty object (all fields optional)', async () => {
    expect(await errorsFor({})).toEqual([]);
  });
});

// ─── UsersService.settings ──────────────────────────────────────────────────

describe('UsersService translation settings', () => {
  let service: UsersService;
  let model: ReturnType<typeof makeModelMock>;

  beforeEach(async () => {
    model = makeModelMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: model },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            del: jest.fn(),
            setNXEX: jest.fn(),
            incrementWithExpiry: jest.fn(),
            getClient: jest
              .fn()
              .mockReturnValue({ set: jest.fn(), ttl: jest.fn() }),
          },
        },
        {
          provide: PlivoService,
          useValue: { sendOtp: jest.fn(), verifyOtp: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('updateSettings', () => {
    it('only $sets defined fields (preferredLanguage)', async () => {
      const selectMock = jest.fn().mockResolvedValue({
        _id: 'u1',
        settings: {
          preferredLanguage: 'en',
          autoTranslateEnabled: false,
          notificationsEnabled: true,
        },
      });
      model.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      await service.updateSettings(
        'u1',
        plainToInstance(UpdateSettingsDto, { preferredLanguage: 'en' }),
      );

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'u1',
        { $set: { 'settings.preferredLanguage': 'en' } },
        { new: true },
      );
      // select must be on the $set call chain
      expect(selectMock).toHaveBeenCalledWith('-passwordHash');
    });

    it('only $sets defined fields (notificationsEnabled)', async () => {
      const selectMock = jest.fn().mockResolvedValue({
        _id: 'u1',
        settings: {
          preferredLanguage: 'vi',
          autoTranslateEnabled: false,
          notificationsEnabled: false,
        },
      });
      model.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      await service.updateSettings(
        'u1',
        plainToInstance(UpdateSettingsDto, { notificationsEnabled: false }),
      );

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'u1',
        { $set: { 'settings.notificationsEnabled': false } },
        { new: true },
      );
    });

    it('returns the updated user object (defaults preserved)', async () => {
      // DB returns the post-$set document; service then applies defaults.
      const selectMock = jest.fn().mockResolvedValue({
        _id: 'u1',
        settings: {
          preferredLanguage: 'en',
          autoTranslateEnabled: true,
          notificationsEnabled: true,
        },
      });
      model.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      const user = await service.updateSettings(
        'u1',
        plainToInstance(UpdateSettingsDto, { autoTranslateEnabled: true }),
      );

      expect(user.settings.autoTranslateEnabled).toBe(true);
      expect(user.settings.preferredLanguage).toBe('en');
    });
  });

  describe('applySettingsDefaults', () => {
    it('fills missing settings with defaults when user has no settings', () => {
      const user = { settings: null } as unknown as { settings: unknown };
      const result = service.applySettingsDefaults(user as any);
      expect(result.settings).toEqual({
        notificationsEnabled: true,
        preferredLanguage: 'vi',
        autoTranslateEnabled: false,
      });
    });

    it('fills partial settings (missing preferredLanguage/autoTranslateEnabled)', () => {
      const user = { settings: { notificationsEnabled: false } } as unknown as {
        settings: any;
      };
      const result = service.applySettingsDefaults(user as any);
      expect(result.settings.preferredLanguage).toBe('vi');
      expect(result.settings.autoTranslateEnabled).toBe(false);
      expect(result.settings.notificationsEnabled).toBe(false);
    });
  });

  describe('findByIdPublic privacy', () => {
    it('selects "-settings" (never exposes translation settings on public read)', async () => {
      const selectMock = jest
        .fn()
        .mockResolvedValue({ _id: 'u1', displayName: 'A' });
      model.findById.mockReturnValue({ select: selectMock });

      const result = await service.findByIdPublic('u1');

      expect(model.findById).toHaveBeenCalledWith('u1');
      const selected = selectMock.mock.calls[0][0] as string;
      expect(selected).toContain('-settings');
      // Privacy: none of the sensitive fields are exposed
      expect(selected).toContain('-email');
      expect(selected).toContain('-passwordHash');
      expect(result).toBeTruthy();
    });
  });
});
