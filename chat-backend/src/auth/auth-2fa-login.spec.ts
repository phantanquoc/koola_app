import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { User } from '../users/user.schema';
import { RefreshToken } from './refresh-token.schema';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';
import { EmailService } from './email.service';
import { AdminAuditLog } from '../admin/schemas/admin-audit-log.schema';

/**
 * Chỉ test cổng 2FA ở login + nhật ký đăng nhập — phần TOTP thuần đã có
 * two-factor.service.spec.ts.
 */
const mockUserModel = {
  findOne: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({}),
};

const mockRefreshTokenModel = { create: jest.fn().mockResolvedValue({}) };

const twoFactor = new TwoFactorService();

describe('AuthService login — 2FA & login trail', () => {
  let service: AuthService;
  let passwordHash: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    passwordHash = await bcrypt.hash('correct-password', 4);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: mockRefreshTokenModel,
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token') },
        },
        { provide: UsersService, useValue: { clearFcmTokens: jest.fn() } },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue({ set: jest.fn() }) },
        },
        {
          provide: EmailService,
          useValue: { generateOtp: jest.fn(), sendOtp: jest.fn() },
        },
        // Audit admin_login ghi qua model trực tiếp (tránh vòng module).
        {
          provide: getModelToken(AdminAuditLog.name),
          useValue: { create: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.useRealTimers());

  function user(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => 'user-id' },
      email: 'admin@koola.vn',
      passwordHash,
      isBanned: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
      ...overrides,
    };
  }

  it('ghi lastLoginAt + lastLoginIp khi đăng nhập thành công', async () => {
    mockUserModel.findOne.mockResolvedValue(user());

    await service.login(
      { email: 'admin@koola.vn', password: 'correct-password' },
      '203.0.113.7',
    );

    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: { toString: expect.any(Function) } },
      {
        $set: {
          lastLoginAt: expect.any(Date) as Date,
          lastLoginIp: '203.0.113.7',
        },
      },
    );
  });

  it('lastLoginIp = null khi không truyền ip', async () => {
    mockUserModel.findOne.mockResolvedValue(user());

    await service.login({
      email: 'admin@koola.vn',
      password: 'correct-password',
    });

    expect(mockUserModel.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $set: { lastLoginAt: expect.any(Date) as Date, lastLoginIp: null },
    });
  });

  it('401 khi bật 2FA mà thiếu mã', async () => {
    mockUserModel.findOne.mockResolvedValue(
      user({ twoFactorEnabled: true, twoFactorSecret: twoFactor.generateSecret() }),
    );

    await expect(
      service.login({ email: 'admin@koola.vn', password: 'correct-password' }),
    ).rejects.toThrow(new UnauthorizedException('2FA code required'));
  });

  it('401 khi mã TOTP sai', async () => {
    mockUserModel.findOne.mockResolvedValue(
      user({ twoFactorEnabled: true, twoFactorSecret: twoFactor.generateSecret() }),
    );

    await expect(
      service.login({
        email: 'admin@koola.vn',
        password: 'correct-password',
        twoFactorCode: '000000',
      }),
    ).rejects.toThrow(new UnauthorizedException('2FA code invalid'));
  });

  it('qua khi mã TOTP đúng', async () => {
    const secret = twoFactor.generateSecret();
    mockUserModel.findOne.mockResolvedValue(
      user({ twoFactorEnabled: true, twoFactorSecret: secret }),
    );

    const result = await service.login({
      email: 'admin@koola.vn',
      password: 'correct-password',
      twoFactorCode: twoFactor.generateToken(secret),
    });

    expect(result).toHaveProperty('accessToken');
  });

  it('recovery code dùng được 1 lần: lần đầu qua, lần hai 401', async () => {
    const code = 'a1b2c3d4e5';
    const hashes = [twoFactor.hashRecoveryCode(code)];
    mockUserModel.findOne.mockResolvedValue(
      user({
        twoFactorEnabled: true,
        twoFactorSecret: twoFactor.generateSecret(),
        twoFactorRecoveryCodes: hashes,
      }),
    );

    await service.login({
      email: 'admin@koola.vn',
      password: 'correct-password',
      twoFactorCode: code,
    });

    // Mã đã bị xoá khỏi mảng hash trong DB
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $set: { twoFactorRecoveryCodes: [] } },
    );

    // Lần hai DB không còn hash → 401
    mockUserModel.findOne.mockResolvedValue(
      user({
        twoFactorEnabled: true,
        twoFactorSecret: twoFactor.generateSecret(),
        twoFactorRecoveryCodes: [],
      }),
    );
    await expect(
      service.login({
        email: 'admin@koola.vn',
        password: 'correct-password',
        twoFactorCode: code,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
