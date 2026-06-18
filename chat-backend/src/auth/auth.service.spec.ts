import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from '../users/user.schema';
import { RefreshToken } from './refresh-token.schema';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService - login ban-block', () => {
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

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

  it('throws 401 for wrong password regardless of ban status', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    mockUserModel.findOne.mockResolvedValue({
      _id: { toString: () => 'user-id' },
      email: 'user@example.com',
      passwordHash: hash,
      isBanned: false,
    });

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws 403 ForbiddenException for a banned user with correct credentials', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    mockUserModel.findOne.mockResolvedValue({
      _id: { toString: () => 'banned-id' },
      email: 'banned@example.com',
      passwordHash: hash,
      isBanned: true, // ← banned
    });

    await expect(
      service.login({
        email: 'banned@example.com',
        password: 'correct-password',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Must NOT issue tokens
    expect(mockRefreshTokenModel.create).not.toHaveBeenCalled();
  });

  it('throws 401 for a non-existent user', async () => {
    mockUserModel.findOne.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'any' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
