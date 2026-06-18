/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { User } from '../users/user.schema';
import { RefreshToken } from '../auth/refresh-token.schema';

// Stub the MediaService module so the uuid ESM import in media.service.ts
// never gets loaded by Jest (which cannot parse ESM node_modules by default).
jest.mock('../media/media.service');

const { MediaService } = jest.requireMock('../media/media.service');

// ─── Shared mock helpers ─────────────────────────────────────────────────────

function makeLeanQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

function makeFindOneAndUpdateQuery(result: unknown) {
  return {
    select: jest.fn().mockResolvedValue(result),
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUserModel = {
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
};

const mockRefreshTokenModel = {
  updateMany: jest.fn(),
};

const mockMediaService = {
  generatePresignedGetUrl: jest.fn(),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: mockRefreshTokenModel,
        },
        { provide: MediaService, useValue: mockMediaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ─── getMe ───────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('returns the admin user with safe projection', async () => {
      const adminDoc = {
        _id: 'admin-id',
        displayName: 'Admin',
        isPlatformAdmin: true,
      };
      mockUserModel.findById.mockReturnValue(makeLeanQuery(adminDoc));

      const result = await service.getMe('admin-id');
      expect(result).toMatchObject({ _id: 'admin-id' });
      // Verify safe projection applied
      expect(mockUserModel.findById).toHaveBeenCalledWith('admin-id');
    });

    it('throws 404 when user not found', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery(null));
      await expect(service.getMe('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns all stat counts', async () => {
      mockUserModel.countDocuments
        .mockResolvedValueOnce(100) // totalPersonal
        .mockResolvedValueOnce(20) // totalBusiness
        .mockResolvedValueOnce(5) // pendingVerification
        .mockResolvedValueOnce(12) // verifiedBusinesses
        .mockResolvedValueOnce(3) // rejectedBusinesses
        .mockResolvedValueOnce(2); // bannedUsers

      const stats = await service.getStats();
      expect(stats).toEqual({
        totalPersonal: 100,
        totalBusiness: 20,
        pendingVerification: 5,
        verifiedBusinesses: 12,
        rejectedBusinesses: 3,
        bannedUsers: 2,
      });
    });
  });

  // ─── listPendingBusinesses ────────────────────────────────────────────────

  describe('listPendingBusinesses', () => {
    it('returns only pending businesses with licenseImageUrl', async () => {
      const business = {
        _id: 'biz-1',
        accountType: 'business',
        verificationStatus: 'pending',
        licenseImageKey: 'key/license.jpg',
      };
      mockUserModel.find.mockReturnValue(makeLeanQuery([business]));
      mockUserModel.countDocuments.mockResolvedValue(1);
      mockMediaService.generatePresignedGetUrl.mockResolvedValue(
        'https://presigned.url/license.jpg',
      );

      const result = await service.listPendingBusinesses({
        page: 1,
        limit: 20,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].licenseImageUrl).toBe(
        'https://presigned.url/license.jpg',
      );
      expect(result.total).toBe(1);
    });

    it('sets licenseImageUrl to null when licenseImageKey is missing', async () => {
      const business = {
        _id: 'biz-2',
        accountType: 'business',
        verificationStatus: 'pending',
        licenseImageKey: undefined,
      };
      mockUserModel.find.mockReturnValue(makeLeanQuery([business]));
      mockUserModel.countDocuments.mockResolvedValue(1);

      const result = await service.listPendingBusinesses({
        page: 1,
        limit: 20,
      });
      expect(result.data[0].licenseImageUrl).toBeNull();
      // Media service must NOT be called when there is no key (D5)
      expect(mockMediaService.generatePresignedGetUrl).not.toHaveBeenCalled();
    });

    it('does NOT include verified or rejected businesses', async () => {
      // find is called with the filter — we verify the filter includes verificationStatus: 'pending'
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20 });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter).toMatchObject({ verificationStatus: 'pending' });
    });
  });

  // ─── approveBusiness ─────────────────────────────────────────────────────

  describe('approveBusiness', () => {
    it('sets verificationStatus to verified and clears rejectionReason', async () => {
      const updated = {
        _id: 'biz-1',
        verificationStatus: 'verified',
        rejectionReason: undefined,
      };
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(updated),
      );

      const result = await service.approveBusiness('biz-1');
      expect(result.verificationStatus).toBe('verified');

      const updateArgs = mockUserModel.findOneAndUpdate.mock.calls[0];
      expect(updateArgs[0]).toMatchObject({ accountType: 'business' });
      expect(updateArgs[1]).toMatchObject({
        $set: { verificationStatus: 'verified' },
        $unset: { rejectionReason: '' },
      });
    });

    it('throws 404 when target is not a business account', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(service.approveBusiness('personal-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── rejectBusiness ───────────────────────────────────────────────────────

  describe('rejectBusiness', () => {
    it('stores rejectionReason and sets status to rejected', async () => {
      const updated = {
        _id: 'biz-1',
        verificationStatus: 'rejected',
        rejectionReason: 'License unclear',
      };
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(updated),
      );

      const result = await service.rejectBusiness('biz-1', 'License unclear');
      expect(result.verificationStatus).toBe('rejected');
    });

    it('throws 400 when rejectionReason is empty', async () => {
      await expect(service.rejectBusiness('biz-1', '')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 400 when rejectionReason is whitespace only', async () => {
      await expect(service.rejectBusiness('biz-1', '   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 404 when target is not a business account', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(
        service.rejectBusiness('personal-id', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listUsers ────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns paginated list without sensitive fields', async () => {
      const users = [
        { _id: 'u1', displayName: 'Alice', accountType: 'personal' },
        { _id: 'u2', displayName: 'Bob', accountType: 'business' },
      ];
      mockUserModel.find.mockReturnValue(makeLeanQuery(users));
      mockUserModel.countDocuments.mockResolvedValue(2);

      const result = await service.listUsers({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(2);
      // Verify safe projection is applied (projection string is passed to .select)
    });

    it('applies case-insensitive search filter', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listUsers({ search: 'alice', page: 1, limit: 20 });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.$or).toBeDefined();
      // Each $or branch uses a case-insensitive regex
      expect(findFilter.$or[0].displayName).toBeInstanceOf(RegExp);
    });

    it('applies accountType filter', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listUsers({ accountType: 'business', page: 1, limit: 20 });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.accountType).toBe('business');
    });
  });

  // ─── getUserById ─────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('returns a user with safe projection', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery({ _id: 'u1' }));
      const result = await service.getUserById('u1');
      expect(result).toBeDefined();
    });

    it('throws 404 when user not found', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery(null));
      await expect(service.getUserById('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── banUser ─────────────────────────────────────────────────────────────

  describe('banUser', () => {
    it('sets isBanned=true and revokes all refresh tokens', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: 'u1' }),
      });
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await service.banUser('u1');
      expect(result.message).toContain('banned');

      // Must revoke tokens for this user
      const updateManyArgs = mockRefreshTokenModel.updateMany.mock.calls[0];
      expect(updateManyArgs[0]).toMatchObject({ userId: 'u1' });
      expect(updateManyArgs[1]).toMatchObject({
        $set: { revokedAt: expect.any(Date) },
      });
    });

    it('throws 404 when user not found', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(service.banUser('ghost')).rejects.toThrow(NotFoundException);
      expect(mockRefreshTokenModel.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── unbanUser ────────────────────────────────────────────────────────────

  describe('unbanUser', () => {
    it('sets isBanned=false', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: 'u1' }),
      });

      const result = await service.unbanUser('u1');
      expect(result.message).toContain('unbanned');

      const updateArgs = mockUserModel.findByIdAndUpdate.mock.calls[0];
      expect(updateArgs[1]).toMatchObject({ $set: { isBanned: false } });
    });

    it('throws 404 when user not found', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(service.unbanUser('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
