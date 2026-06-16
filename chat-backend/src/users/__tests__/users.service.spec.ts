import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersService } from '../users.service';
import { User } from '../user.schema';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { RedisService } from '../../common/redis/redis.service';
import { PlivoService } from '../../auth/plivo.service';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: any;
  let redisService: any;
  let plivoService: any;

  const mockUserModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  };

  const mockRedisClient = {
    set: jest.fn(),
    ttl: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    del: jest.fn(),
    setNXEX: jest.fn(),
    incrementWithExpiry: jest.fn(),
    getClient: jest.fn().mockReturnValue(mockRedisClient),
  };

  const mockPlivoService = {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: RedisService, useValue: mockRedisService },
        { provide: PlivoService, useValue: mockPlivoService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userModel = mockUserModel;
    redisService = mockRedisService;
    plivoService = mockPlivoService;
  });

  // ─── Username Availability Tests ───

  describe('checkUsernameAvailability', () => {
    it('returns available: true when username is free', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      const result = await service.checkUsernameAvailability(
        'user1',
        'quoc_dev',
      );
      expect(result).toEqual({ available: true });
    });

    it('returns reason "taken" when another user holds the username', async () => {
      mockUserModel.findOne.mockResolvedValue({ _id: 'otherUser' });
      const result = await service.checkUsernameAvailability(
        'user1',
        'quoc_dev',
      );
      expect(result).toEqual({ available: false, reason: 'taken' });
    });

    it('returns reason "reserved" for reserved usernames', async () => {
      const result = await service.checkUsernameAvailability('user1', 'admin');
      expect(result).toEqual({ available: false, reason: 'reserved' });
      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });

    it('returns reason "invalid" for invalid format', async () => {
      const result = await service.checkUsernameAvailability('user1', 'A B C');
      expect(result).toEqual({ available: false, reason: 'invalid' });
    });

    it('returns reason "invalid" for too short username', async () => {
      const result = await service.checkUsernameAvailability('user1', 'ab');
      expect(result).toEqual({ available: false, reason: 'invalid' });
    });

    it('returns reason "invalid" for too long username', async () => {
      const result = await service.checkUsernameAvailability(
        'user1',
        'a'.repeat(31),
      );
      expect(result).toEqual({ available: false, reason: 'invalid' });
    });

    it('treats caller own username as available (idempotent)', async () => {
      // findOne excludes caller via $ne so returns null
      mockUserModel.findOne.mockResolvedValue(null);
      const result = await service.checkUsernameAvailability(
        'user1',
        'my_name',
      );
      expect(result).toEqual({ available: true });
      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        username: 'my_name',
        _id: { $ne: 'user1' },
      });
    });

    it('lowercases input before checking', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      const result = await service.checkUsernameAvailability('user1', 'ADMIN');
      // 'admin' is reserved
      expect(result).toEqual({ available: false, reason: 'reserved' });
    });
  });

  // ─── Update Profile — Username Tests ───

  describe('updateProfile - username', () => {
    const chainMock = () => {
      const obj = {
        select: jest
          .fn()
          .mockResolvedValue({ _id: 'user1', username: 'quoc_dev' }),
      };
      return obj;
    };

    it('coerces username to lowercase before persisting', async () => {
      mockUserModel.findOne.mockResolvedValue(null); // not taken
      const selectMock = jest
        .fn()
        .mockResolvedValue({ _id: 'user1', username: 'quoc_dev' });
      mockUserModel.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      await service.updateProfile('user1', { username: 'Quoc_Dev' } as any);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $set: { username: 'quoc_dev' } },
        { new: true },
      );
    });

    it('throws ConflictException when username taken by another user', async () => {
      mockUserModel.findOne.mockResolvedValue({ _id: 'otherUser' });

      await expect(
        service.updateProfile('user1', { username: 'taken_name' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for reserved username', async () => {
      await expect(
        service.updateProfile('user1', { username: 'admin' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Username case coercion (DTO + Service pipeline) ───

  describe('updateProfile - username case coercion', () => {
    it('DTO accepts mixed-case username (e.g. Quoc_Dev)', async () => {
      const dto = plainToInstance(UpdateProfileDto, { username: 'Quoc_Dev' });
      const errors = await validate(dto);
      const usernameErrors = errors.filter((e) => e.property === 'username');
      expect(usernameErrors).toHaveLength(0);
    });

    it('DTO rejects username with space', async () => {
      const dto = plainToInstance(UpdateProfileDto, { username: 'Quoc Dev' });
      const errors = await validate(dto);
      const usernameErrors = errors.filter((e) => e.property === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
    });

    it('DTO rejects too short username', async () => {
      const dto = plainToInstance(UpdateProfileDto, { username: 'qu' });
      const errors = await validate(dto);
      const usernameErrors = errors.filter((e) => e.property === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
    });

    it('service coerces Quoc_Dev to quoc_dev before persistence', async () => {
      mockUserModel.findOne.mockResolvedValue(null); // not taken
      const selectMock = jest
        .fn()
        .mockResolvedValue({ _id: 'user1', username: 'quoc_dev' });
      mockUserModel.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      await service.updateProfile('user1', { username: 'Quoc_Dev' } as any);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $set: { username: 'quoc_dev' } },
        { new: true },
      );
    });
  });

  // ─── Update Profile — dateOfBirth Tests ───

  describe('updateProfile - dateOfBirth', () => {
    const selectMock = jest.fn().mockResolvedValue({ _id: 'user1' });

    beforeEach(() => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({ select: selectMock });
    });

    it('rejects future date', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      const isoStr = tomorrow.toISOString().split('T')[0];

      await expect(
        service.updateProfile('user1', { dateOfBirth: isoStr } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects pre-1900 date', async () => {
      await expect(
        service.updateProfile('user1', { dateOfBirth: '1899-12-31' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts null to clear dateOfBirth', async () => {
      await service.updateProfile('user1', { dateOfBirth: null } as any);
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $unset: { dateOfBirth: 1 } },
        { new: true },
      );
    });

    it('accepts a valid date', async () => {
      await service.updateProfile('user1', {
        dateOfBirth: '1995-08-12',
      } as any);
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $set: { dateOfBirth: expect.any(Date) } },
        { new: true },
      );
    });
  });

  // ─── Phone Change OTP Flow Tests ───

  describe('requestPhoneChangeOtp', () => {
    beforeEach(() => {
      mockUserModel.findById.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ _id: 'user1', phone: '+84900000000' }),
      });
    });

    it('sends OTP and stores pending state', async () => {
      mockUserModel.findOne.mockResolvedValue(null); // no cross-user collision
      mockRedisService.incrementWithExpiry.mockResolvedValue(1);
      mockPlivoService.sendOtp.mockResolvedValue('session-uuid-123');
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.requestPhoneChangeOtp(
        'user1',
        '+84901234567',
      );

      expect(result).toEqual({ message: 'OTP sent', expiresIn: 300 });
      expect(mockPlivoService.sendOtp).toHaveBeenCalledWith('+84901234567');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'phone-change:user1:+84901234567',
        expect.any(String),
        'EX',
        300,
      );
      // History key set with longer TTL for expired-vs-never-existed detection
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'phone-change-history:user1:+84901234567',
        '1',
        'EX',
        900,
      );
    });

    it('throws 409 when phone belongs to another user', async () => {
      mockUserModel.findOne.mockResolvedValue({ _id: 'other' });
      mockRedisService.incrementWithExpiry.mockResolvedValue(1);

      await expect(
        service.requestPhoneChangeOtp('user1', '+84901234567'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 400 when phone matches caller current phone', async () => {
      await expect(
        service.requestPhoneChangeOtp('user1', '+84900000000'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 429 when rate limit exceeded (>3 requests in 10min)', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockRedisService.incrementWithExpiry.mockResolvedValue(4);

      await expect(
        service.requestPhoneChangeOtp('user1', '+84901234567'),
      ).rejects.toThrow(HttpException);

      try {
        await service.requestPhoneChangeOtp('user1', '+84901234567');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('throws 503 when Plivo sendOtp fails', async () => {
      mockUserModel.findOne.mockResolvedValue(null); // phone unique
      mockRedisService.incrementWithExpiry.mockResolvedValue(1); // rate limit passes
      mockPlivoService.sendOtp.mockRejectedValue(new Error('Plivo timeout'));

      try {
        await service.requestPhoneChangeOtp('user1', '+84901234567');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(e.message).toContain('Không thể gửi mã xác thực');
      }
    });
  });

  describe('verifyPhoneChangeOtp', () => {
    it('updates phone on successful verification', async () => {
      const pending = JSON.stringify({
        sessionUuid: 'sess1',
        attempts: 0,
        createdAt: Date.now(),
      });
      mockRedisService.get.mockResolvedValue(pending);
      mockPlivoService.verifyOtp.mockResolvedValue(true);
      mockRedisService.del.mockResolvedValue(undefined);
      const selectMock = jest
        .fn()
        .mockResolvedValue({ _id: 'user1', phone: '+84901234567' });
      mockUserModel.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      const result = await service.verifyPhoneChangeOtp(
        'user1',
        '+84901234567',
        '123456',
      );
      expect(result.phone).toBe('+84901234567');
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'phone-change:user1:+84901234567',
      );
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'phone-change-history:user1:+84901234567',
      );
    });

    it('throws 400 with remaining attempts on wrong code', async () => {
      const pending = JSON.stringify({
        sessionUuid: 'sess1',
        attempts: 2,
        createdAt: Date.now(),
      });
      mockRedisService.get.mockResolvedValue(pending);
      mockPlivoService.verifyOtp.mockResolvedValue(false);
      mockRedisClient.ttl.mockResolvedValue(200);
      mockRedisClient.set.mockResolvedValue('OK');

      await expect(
        service.verifyPhoneChangeOtp('user1', '+84901234567', '000000'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 429 when attempt limit exceeded (5 failures)', async () => {
      const pending = JSON.stringify({
        sessionUuid: 'sess1',
        attempts: 4,
        createdAt: Date.now(),
      });
      mockRedisService.get.mockResolvedValue(pending);
      mockPlivoService.verifyOtp.mockResolvedValue(false);

      try {
        await service.verifyPhoneChangeOtp('user1', '+84901234567', '000000');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('throws 404 when no pending change exists and no history', async () => {
      // Both pendingKey and historyKey return null — never existed
      mockRedisService.get.mockResolvedValue(null);

      try {
        await service.verifyPhoneChangeOtp('user1', '+84901234567', '123456');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(e.message).toContain('Không có yêu cầu thay đổi đang chờ');
      }
    });

    it('throws 410 when OTP expired (history key exists)', async () => {
      // First call (pendingKey) returns null, second call (historyKey) returns '1'
      mockRedisService.get
        .mockResolvedValueOnce(null) // pendingKey
        .mockResolvedValueOnce('1'); // historyKey

      try {
        await service.verifyPhoneChangeOtp('user1', '+84901234567', '123456');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.GONE);
        expect(e.message).toContain('Mã xác thực đã hết hạn');
      }
    });

    it('throws 404 when no history key exists (never requested)', async () => {
      // Both pendingKey and historyKey return null
      mockRedisService.get
        .mockResolvedValueOnce(null) // pendingKey
        .mockResolvedValueOnce(null); // historyKey

      try {
        await service.verifyPhoneChangeOtp('user1', '+84901234567', '123456');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(e.message).toContain('Không có yêu cầu thay đổi đang chờ');
      }
    });
  });

  describe('removePhone', () => {
    it('clears the phone field idempotently', async () => {
      const selectMock = jest
        .fn()
        .mockResolvedValue({ _id: 'user1', phone: undefined });
      mockUserModel.findByIdAndUpdate.mockReturnValue({ select: selectMock });

      const result = await service.removePhone('user1');
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $unset: { phone: 1 } },
        { new: true },
      );
      expect(result).toBeDefined();
    });
  });
});
