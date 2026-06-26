import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from '../users/user.schema';
import { RefreshToken } from './refresh-token.schema';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';
import { EmailService } from './email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockRefreshTokenModel = {
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateMany: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
};

const mockUsersService = {
  clearFcmTokens: jest.fn(),
};

const mockRedisClient = {
  set: jest.fn().mockResolvedValue('OK'),
};

const mockRedisService = {
  get: jest.fn(),
  getDel: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
  setNXEX: jest.fn(),
  incrementWithExpiry: jest.fn(),
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockEmailService = {
  generateOtp: jest.fn().mockReturnValue('123456'),
  sendOtp: jest.fn().mockResolvedValue(undefined),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: mockRefreshTokenModel,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('issues tokens for a valid non-banned user', async () => {
      const hash = await bcrypt.hash('correct-password', 12);
      mockUserModel.findOne.mockResolvedValue({
        _id: { toString: () => 'user-id' },
        email: 'user@example.com',
        passwordHash: hash,
        isBanned: false,
      });
      mockRefreshTokenModel.create.mockResolvedValue({});

      const result = await service.login({
        email: 'user@example.com',
        password: 'correct-password',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws 401 for wrong password', async () => {
      const hash = await bcrypt.hash('correct-password', 12);
      mockUserModel.findOne.mockResolvedValue({
        _id: { toString: () => 'user-id' },
        email: 'user@example.com',
        passwordHash: hash,
        isBanned: false,
      });

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 403 for a banned user with correct credentials', async () => {
      const hash = await bcrypt.hash('correct-password', 12);
      mockUserModel.findOne.mockResolvedValue({
        _id: { toString: () => 'banned-id' },
        email: 'banned@example.com',
        passwordHash: hash,
        isBanned: true,
      });

      await expect(
        service.login({
          email: 'banned@example.com',
          password: 'correct-password',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockRefreshTokenModel.create).not.toHaveBeenCalled();
    });

    it('throws 401 for a non-existent user', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Register Init ─────────────────────────────────────────────────────────

  describe('registerInit', () => {
    it('stores pending registration and sends OTP', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockRedisService.incrementWithExpiry.mockResolvedValue(1);

      const result = await service.registerInit({
        email: 'new@example.com',
        password: 'password123',
        displayName: 'New User',
      });

      expect(result).toEqual({
        message: expect.any(String) as unknown as string,
        expiresIn: 300,
      });
      expect(mockEmailService.sendOtp).toHaveBeenCalledWith(
        'new@example.com',
        '123456',
      );
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('throws 409 if email already exists', async () => {
      mockUserModel.findOne.mockResolvedValue({
        email: 'existing@example.com',
      });

      await expect(
        service.registerInit({
          email: 'existing@example.com',
          password: 'password123',
          displayName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 429 if rate limit exceeded', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockRedisService.incrementWithExpiry.mockResolvedValue(4);

      await expect(
        service.registerInit({
          email: 'new@example.com',
          password: 'password123',
          displayName: 'User',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── Register Verify ───────────────────────────────────────────────────────

  describe('registerVerify', () => {
    it('creates user and returns tokens on correct OTP', async () => {
      const otpHash = crypto
        .createHash('sha256')
        .update('123456')
        .digest('hex');
      const pending = JSON.stringify({
        emailLower: 'new@example.com',
        passwordHash: 'hashed-pw',
        displayName: 'New User',
        otpHash,
      });
      mockRedisService.get.mockResolvedValue(pending);
      mockRedisService.incrementWithExpiry.mockResolvedValue(1);
      mockUserModel.create.mockResolvedValue({
        _id: { toString: () => 'new-user-id' },
        email: 'new@example.com',
      });
      mockRefreshTokenModel.create.mockResolvedValue({});

      const result = await service.registerVerify({
        email: 'new@example.com',
        otp: '123456',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockUserModel.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        passwordHash: 'hashed-pw',
        displayName: 'New User',
      });
    });

    it('throws 400 if no pending registration', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.registerVerify({ email: 'no@example.com', otp: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 with remaining attempts on wrong OTP', async () => {
      const otpHash = crypto
        .createHash('sha256')
        .update('654321')
        .digest('hex');
      const pending = JSON.stringify({
        emailLower: 'user@example.com',
        passwordHash: 'hashed',
        displayName: 'User',
        otpHash,
      });
      mockRedisService.get.mockResolvedValue(pending);
      mockRedisService.incrementWithExpiry.mockResolvedValue(2);

      await expect(
        service.registerVerify({ email: 'user@example.com', otp: '000000' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Forgot Password ───────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('returns neutral message for existing user and sends OTP', async () => {
      mockUserModel.findOne.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'user@example.com',
      });
      mockRedisService.incrementWithExpiry.mockResolvedValue(1);

      const result = await service.forgotPassword({
        email: 'user@example.com',
      });

      expect(result.message).toBe('Nếu email tồn tại, mã xác thực đã được gửi');
      expect(mockEmailService.sendOtp).toHaveBeenCalled();
    });

    it('returns same neutral message for non-existent email without sending', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'ghost@example.com',
      });

      expect(result.message).toBe('Nếu email tồn tại, mã xác thực đã được gửi');
      expect(mockEmailService.sendOtp).not.toHaveBeenCalled();
    });

    it('returns neutral message when rate limited (no reveal)', async () => {
      mockUserModel.findOne.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'user@example.com',
      });
      mockRedisService.incrementWithExpiry.mockResolvedValue(4);

      const result = await service.forgotPassword({
        email: 'user@example.com',
      });

      expect(result.message).toBe('Nếu email tồn tại, mã xác thực đã được gửi');
      expect(mockEmailService.sendOtp).not.toHaveBeenCalled();
    });
  });

  // ─── Reset Password Verify ─────────────────────────────────────────────────

  describe('resetPasswordVerify', () => {
    it('issues reset ticket on correct OTP', async () => {
      const otpHash = crypto
        .createHash('sha256')
        .update('123456')
        .digest('hex');
      const pending = JSON.stringify({ userId: 'user-id', otpHash });
      mockRedisService.get.mockResolvedValue(pending);
      mockRedisService.incrementWithExpiry.mockResolvedValue(1);

      const result = await service.resetPasswordVerify({
        email: 'user@example.com',
        otp: '123456',
      });

      expect(result).toHaveProperty('resetToken');
      expect(typeof result.resetToken).toBe('string');
      expect(result.resetToken.length).toBe(64); // 32 bytes hex
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('throws 400 if no pending reset', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.resetPasswordVerify({ email: 'no@example.com', otp: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Reset Password ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('resets password and revokes all refresh tokens', async () => {
      const validUserId = '507f1f77bcf86cd799439011';
      mockRedisService.getDel.mockResolvedValue(validUserId);
      mockUserModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await service.resetPassword({
        resetToken: 'a'.repeat(64),
        newPassword: 'newpassword123',
      });

      expect(result).toHaveProperty('message');
      expect(mockUserModel.updateOne).toHaveBeenCalled();
      expect(mockRefreshTokenModel.updateMany).toHaveBeenCalled();
      expect(mockRedisService.getDel).toHaveBeenCalled();
    });

    it('throws 400 for invalid/expired ticket', async () => {
      mockRedisService.getDel.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          resetToken: 'invalid-token',
          newPassword: 'newpassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
