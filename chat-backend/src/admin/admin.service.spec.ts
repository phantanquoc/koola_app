/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { User } from '../users/user.schema';
import { RefreshToken } from '../auth/refresh-token.schema';
import { SellerVisibilityService } from '../commerce/seller-visibility/seller-visibility.service';

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
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
};

const mockRefreshTokenModel = {
  updateMany: jest.fn(),
};

const mockMediaService = {
  generatePresignedGetUrl: jest.fn(),
};

const mockSellerVisibility = {
  syncSellers: jest.fn().mockResolvedValue({ modified: 0 }),
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
        { provide: SellerVisibilityService, useValue: mockSellerVisibility },
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
        .mockResolvedValueOnce(2) // bannedUsers
        .mockResolvedValueOnce(1) // slaOver72
        .mockResolvedValueOnce(2) // slaDay1_3
        .mockResolvedValueOnce(2) // slaFresh
        .mockResolvedValueOnce(4) // expiringSoon
        .mockResolvedValueOnce(1); // archivedBusinesses

      const stats = await service.getStats();
      expect(stats).toEqual({
        totalPersonal: 100,
        totalBusiness: 20,
        pendingVerification: 5,
        verifiedBusinesses: 12,
        rejectedBusinesses: 3,
        bannedUsers: 2,
        slaOver72: 1,
        slaDay1_3: 2,
        slaFresh: 2,
        expiringSoon: 4,
        archivedBusinesses: 1,
      });
    });

    it('scopes business counts to non-deleted records so tabs match the list', async () => {
      mockUserModel.countDocuments.mockResolvedValue(0);
      await service.getStats();
      const calls = mockUserModel.countDocuments.mock.calls.map((c) => c[0]);
      // 5 count đầu là business theo verificationStatus → phải có deletedAt: null
      expect(calls[1]).toMatchObject({ deletedAt: null });
      expect(calls[2]).toMatchObject({ verificationStatus: 'pending', deletedAt: null });
      expect(calls[3]).toMatchObject({ verificationStatus: 'verified', deletedAt: null });
      expect(calls[4]).toMatchObject({ verificationStatus: 'rejected', deletedAt: null });
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

    it('filters by status when provided', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, status: 'verified' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter).toMatchObject({ verificationStatus: 'verified' });
    });

    it('applies sort from dto', async () => {
      const q = makeLeanQuery([]);
      mockUserModel.find.mockReturnValue(q);
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, sort: 'displayName:desc' });

      expect(q.sort).toHaveBeenCalledWith({ displayName: -1 });
    });

    it('falls back to createdAt:1 for invalid sort field', async () => {
      const q = makeLeanQuery([]);
      mockUserModel.find.mockReturnValue(q);
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, sort: 'nope:desc' });

      expect(q.sort).toHaveBeenCalledWith({ createdAt: 1 });
    });

    it('search matches contactPhone', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, search: '0901' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.$or).toEqual(
        expect.arrayContaining([{ contactPhone: expect.any(RegExp) }]),
      );
    });

    it('search with ObjectId matches _id exactly', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);
      const oid = '507f1f77bcf86cd799439011';

      await service.listPendingBusinesses({ page: 1, limit: 20, search: oid });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      const idBranch = findFilter.$or.find((b: object) => '_id' in b);
      expect(idBranch._id.toString()).toBe(oid);
    });

    it('sla over72 filters createdAt older than 72h', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, sla: 'over72' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.createdAt.$lt).toBeInstanceOf(Date);
    });

    it('sla day1_3 filters createdAt between 72h and 24h', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, sla: 'day1_3' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.createdAt.$gte).toBeInstanceOf(Date);
      expect(findFilter.createdAt.$lt).toBeInstanceOf(Date);
    });

    it('sla fresh filters createdAt within 24h', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, sla: 'fresh' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.createdAt.$gte).toBeInstanceOf(Date);
    });
  });

  // ─── getBusiness ─────────────────────────────────────────────────────────

  describe('getBusiness', () => {
    it('returns full profile with licenseImageUrl', async () => {
      mockUserModel.findOne.mockReturnValue(
        makeLeanQuery({
          _id: 'biz-1',
          accountType: 'business',
          displayName: 'Cong ty Alpha',
          licenseImageKey: 'key/license.jpg',
        }),
      );
      mockMediaService.generatePresignedGetUrl.mockResolvedValue('https://presigned.url/l.jpg');

      const result = await service.getBusiness('biz-1');
      expect(result.displayName).toBe('Cong ty Alpha');
      expect(result.licenseImageUrl).toBe('https://presigned.url/l.jpg');
    });

    it('throws NotFound when not a business account', async () => {
      mockUserModel.findOne.mockReturnValue(makeLeanQuery(null));
      await expect(service.getBusiness('nope')).rejects.toThrow('Business account not found');
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
      mockUserModel.exists.mockResolvedValue(null);
      await expect(service.approveBusiness('personal-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 409 when business was already processed', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      mockUserModel.exists.mockResolvedValue({ _id: 'biz-1' });
      await expect(service.approveBusiness('biz-1')).rejects.toThrow(
        'already processed',
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
      mockUserModel.exists.mockResolvedValue(null);
      await expect(
        service.rejectBusiness('personal-id', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when business was already processed', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      mockUserModel.exists.mockResolvedValue({ _id: 'biz-1' });
      await expect(service.rejectBusiness('biz-1', 'reason')).rejects.toThrow(
        'already processed',
      );
    });
  });

  // ─── bulk + duplicates ────────────────────────────────────────────────────

  describe('bulk operations and duplicates', () => {
    it('bulkApproveBusiness returns per-item results with modified count', async () => {
      mockUserModel.findOneAndUpdate
        .mockReturnValueOnce(makeFindOneAndUpdateQuery({ _id: 'a' }))
        .mockReturnValueOnce(makeFindOneAndUpdateQuery(null));
      mockUserModel.exists.mockResolvedValue(null);

      const res = await service.bulkApproveBusiness(['a', 'b']);

      expect(res.modified).toBe(1);
      expect(res.results).toEqual([
        { id: 'a', ok: true },
        { id: 'b', ok: false, error: expect.any(String) },
      ]);
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['a', 'b']);
    });

    it('bulkRejectBusiness returns per-item results with modified count', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'a' }),
      );

      const res = await service.bulkRejectBusiness(['a', 'b'], 'spam');

      expect(res.modified).toBe(2);
      expect(res.results.every((r) => r.ok)).toBe(true);
    });

    it('findDuplicates matches on taxCode/contactPhone/licenseImageKey, excludes self', async () => {
      const self = {
        _id: 'biz-1',
        taxCode: 'TAX1',
        contactPhone: '0901',
        licenseImageKey: 'key/l.jpg',
      };
      mockUserModel.findOne.mockReturnValue(makeLeanQuery(self));
      mockUserModel.find.mockReturnValue(makeLeanQuery([{ _id: 'biz-2' }]));

      const res = await service.findDuplicates('biz-1');

      expect(res).toHaveLength(1);
      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.$or).toEqual(
        expect.arrayContaining([
          { taxCode: 'TAX1' },
          { contactPhone: '0901' },
          { licenseImageKey: 'key/l.jpg' },
        ]),
      );
      expect(findFilter._id).toEqual({ $ne: 'biz-1' });
    });

    it('findDuplicates returns [] when self has no keys', async () => {
      mockUserModel.findOne.mockReturnValue(makeLeanQuery({ _id: 'biz-1' }));

      const res = await service.findDuplicates('biz-1');

      expect(res).toEqual([]);
      expect(mockUserModel.find).not.toHaveBeenCalled();
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

  // ─── Commerce seller visibility sync (commerce-catalog D1) ────────────────
  // Every mutator that changes verification or ban state MUST re-sync the
  // denormalized CommerceProduct.sellerActive flag, otherwise a rejected or
  // banned business keeps selling publicly until someone edits each product.

  describe('seller visibility sync', () => {
    it('approveBusiness syncs the approved seller', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.approveBusiness('biz-1');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('rejectBusiness syncs the rejected seller', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.rejectBusiness('biz-1', 'bad license');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('does not sync when approve/reject target is missing', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      mockUserModel.exists.mockResolvedValue(null);
      await expect(service.approveBusiness('x')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.rejectBusiness('x', 'r')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSellerVisibility.syncSellers).not.toHaveBeenCalled();
    });

    it('bulkApproveBusiness syncs every id', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'a' }),
      );
      await service.bulkApproveBusiness(['a', 'b']);
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['a', 'b']);
    });

    it('bulkRejectBusiness syncs every id', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'a' }),
      );
      await service.bulkRejectBusiness(['a', 'b'], 'spam');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['a', 'b']);
    });

    it('banUser syncs a business target', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ _id: 'biz-1', accountType: 'business' }),
      });
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
      await service.banUser('biz-1');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('unbanUser syncs a business target', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ _id: 'biz-1', accountType: 'business' }),
      });
      await service.unbanUser('biz-1');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('ban/unban of a personal user does not sync', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ _id: 'u1', accountType: 'personal' }),
      });
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
      await service.banUser('u1');
      await service.unbanUser('u1');
      expect(mockSellerVisibility.syncSellers).not.toHaveBeenCalled();
    });
  });

  // ─── verificationHistory ─────────────────────────────────────────────────

  describe('verificationHistory', () => {
    it('approveBusiness pushes verified entry', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.approveBusiness('biz-1');
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$push.verificationHistory.status).toBe('verified');
      expect(update.$push.verificationHistory.at).toBeInstanceOf(Date);
    });

    it('rejectBusiness pushes rejected entry with reason', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.rejectBusiness('biz-1', 'bad license');
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$push.verificationHistory).toMatchObject({
        status: 'rejected',
        reason: 'bad license',
      });
    });

    it('listPendingBusinesses filters out soft-deleted', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);
      await service.listPendingBusinesses({ page: 1, limit: 20 });
      expect(mockUserModel.find.mock.calls[0][0]).toMatchObject({
        deletedAt: null,
      });
    });
  });

  // ─── updateBusiness ──────────────────────────────────────────────────────

  describe('updateBusiness', () => {
    it('updates whitelisted fields only', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1', taxCode: '123' }),
      );
      await service.updateBusiness('biz-1', {
        taxCode: '123',
        internalNote: 'vip',
      });
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$set).toEqual({ taxCode: '123', internalNote: 'vip' });
    });

    it('updates displayName (was silently dropped before)', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.updateBusiness('biz-1', { displayName: '  Tên mới  ' });
      expect(mockUserModel.findOneAndUpdate.mock.calls[0][1].$set).toEqual({
        displayName: 'Tên mới',
      });
    });

    it('casts licenseExpiresAt to Date', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.updateBusiness('biz-1', { licenseExpiresAt: '2027-12-31' });
      const set = mockUserModel.findOneAndUpdate.mock.calls[0][1].$set;
      expect(set.licenseExpiresAt).toBeInstanceOf(Date);
    });

    it('unsets licenseExpiresAt when empty string (was 500 CastError)', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.updateBusiness('biz-1', { licenseExpiresAt: '' });
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$unset).toEqual({ licenseExpiresAt: '' });
      expect(update.$set).toBeUndefined();
    });

    it('throws 400 for an unparseable date', async () => {
      await expect(
        service.updateBusiness('biz-1', { licenseExpiresAt: 'nope' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when no whitelisted fields provided', async () => {
      await expect(
        service.updateBusiness('biz-1', {}),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 when business not found', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(
        service.updateBusiness('ghost', { taxCode: '1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lowercases contactEmail and rejects one already used by another record', async () => {
      mockUserModel.exists.mockResolvedValue({ _id: 'other' });
      await expect(
        service.updateBusiness('biz-1', { contactEmail: 'Other@Koola.VN' }),
      ).rejects.toThrow(ConflictException);
      // So sánh trên bản lowercase — trước đây "Other@..." lọt qua check trùng
      expect(mockUserModel.exists).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $ne: 'biz-1' },
          $or: [{ contactEmail: 'other@koola.vn' }, { email: 'other@koola.vn' }],
        }),
      );
      expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('lowercases contactEmail before writing when free', async () => {
      mockUserModel.exists.mockResolvedValue(null);
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      await service.updateBusiness('biz-1', { contactEmail: 'New@Koola.VN' });
      expect(mockUserModel.findOneAndUpdate.mock.calls[0][1].$set).toEqual({
        contactEmail: 'new@koola.vn',
      });
    });
  });

  // ─── setSuspended ────────────────────────────────────────────────────────

  describe('setSuspended', () => {
    it('sets suspended=true and syncs sellers', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1', suspended: true }),
      );
      await service.setSuspended('biz-1', true);
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$set).toMatchObject({ suspended: true });
      expect(update.$push.verificationHistory.status).toBe('suspended');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('sets suspended=false with unsuspended history entry', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1', suspended: false }),
      );
      await service.setSuspended('biz-1', false);
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$push.verificationHistory.status).toBe('unsuspended');
    });

    it('throws 404 when business not found', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(service.setSuspended('ghost', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── softDeleteBusiness ──────────────────────────────────────────────────

  describe('softDeleteBusiness', () => {
    it('sets deletedAt + rejected and syncs sellers', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1' }),
      );
      const res = await service.softDeleteBusiness('biz-1');
      expect(res.message).toContain('soft-deleted');
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$set.verificationStatus).toBe('rejected');
      expect(update.$set.deletedAt).toBeInstanceOf(Date);
      expect(update.$push.verificationHistory.status).toBe('deleted');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('throws 404 when already deleted or missing', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(service.softDeleteBusiness('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── reopenBusiness ──────────────────────────────────────────────────────

  describe('reopenBusiness', () => {
    it('resets verified business to pending with history', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1', verificationStatus: 'pending' }),
      );
      const res = await service.reopenBusiness('biz-1');
      expect(res.verificationStatus).toBe('pending');
      const filter = mockUserModel.findOneAndUpdate.mock.calls[0][0];
      expect(filter).toMatchObject({ _id: 'biz-1', accountType: 'business' });
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$push.verificationHistory.status).toBe('reopened');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('throws 404 when business not found', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(service.reopenBusiness('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createBusiness ──────────────────────────────────────────────────────

  describe('restoreBusiness', () => {
    it('clears deletedAt, resets to pending, and syncs sellers', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery({ _id: 'biz-1', verificationStatus: 'pending' }),
      );
      const res = await service.restoreBusiness('biz-1');
      expect(res.verificationStatus).toBe('pending');
      // Chỉ hồ sơ đã xoá mới khôi phục được
      const filter = mockUserModel.findOneAndUpdate.mock.calls[0][0];
      expect(filter.deletedAt).toEqual({ $ne: null });
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$set.deletedAt).toBeNull();
      expect(update.$unset.rejectionReason).toBe('');
      expect(update.$push.verificationHistory.status).toBe('restored');
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith(['biz-1']);
    });

    it('throws 404 when the business is not archived', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeFindOneAndUpdateQuery(null),
      );
      await expect(service.restoreBusiness('live')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkAssignBusiness', () => {
    it('assigns and unassigns in one updateMany scoped to live businesses', async () => {
      mockUserModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      await expect(
        service.bulkAssignBusiness(['a', 'b', 'c'], 'mod@koola.vn'),
      ).resolves.toEqual({ modified: 3 });
      expect(mockUserModel.updateMany.mock.calls[0][0]).toMatchObject({
        _id: { $in: ['a', 'b', 'c'] },
        accountType: 'business',
        deletedAt: null,
      });
      expect(mockUserModel.updateMany.mock.calls[0][1]).toEqual({
        $set: { assignee: 'mod@koola.vn' },
      });

      await service.bulkAssignBusiness(['a'], null);
      expect(mockUserModel.updateMany.mock.calls[1][1]).toEqual({
        $unset: { assignee: '' },
      });
    });
  });

  describe('createBusiness', () => {
    it('creates a pending business account', async () => {
      mockUserModel.create.mockResolvedValue({ _id: 'new-biz' });
      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({ _id: 'new-biz', verificationStatus: 'pending' }),
      );
      const res = await service.createBusiness({ displayName: 'Shop A' });
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountType: 'business',
          displayName: 'Shop A',
          verificationStatus: 'pending',
        }),
      );
      expect(res.verificationStatus).toBe('pending');
    });

    it('throws 400 when displayName is blank', async () => {
      await expect(service.createBusiness({ displayName: '  ' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('normalizes email, seeds verificationHistory, and stores profile fields', async () => {
      mockUserModel.exists.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue({ _id: 'new-biz' });
      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({ _id: 'new-biz', verificationStatus: 'pending' }),
      );

      await service.createBusiness(
        {
          displayName: '  Shop B  ',
          contactEmail: '  Contact@Shop.VN ',
          contactPhone: '0901234567',
          businessCategory: 'retail',
          province: 'Hà Nội',
          address: '1 Tràng Tiền',
          taxCode: '0101234567',
          licenseExpiresAt: '2027-12-31',
          internalNote: 'Ưu tiên',
        },
        'admin-1',
      );

      const payload = mockUserModel.create.mock.calls[0][0];
      expect(payload.displayName).toBe('Shop B');
      expect(payload.contactEmail).toBe('contact@shop.vn');
      expect(payload.address).toBe('1 Tràng Tiền');
      expect(payload.licenseExpiresAt).toBeInstanceOf(Date);
      expect(payload.verificationHistory).toEqual([
        expect.objectContaining({ status: 'pending', actorId: 'admin-1' }),
      ]);
    });

    it('throws 409 when the contact email already belongs to an account', async () => {
      mockUserModel.exists.mockResolvedValue({ _id: 'other' });
      await expect(
        service.createBusiness({ displayName: 'Shop C', contactEmail: 'dup@x.vn' }),
      ).rejects.toThrow(ConflictException);
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });
  });
});
