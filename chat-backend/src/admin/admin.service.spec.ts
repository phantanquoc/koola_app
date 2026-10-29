/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { User } from '../users/user.schema';
import { RefreshToken } from '../auth/refresh-token.schema';
import { Report } from './schemas/report.schema';
import { CommerceOrder } from '../commerce/orders/schemas/commerce-order.schema';
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

// getUserById đọc tín hiệu mua/bán + số báo cáo. Mặc định trả rỗng để các test
// cũ không phải quan tâm tới hai model này.
const orderAggregate = jest.fn().mockResolvedValue([]);
const mockOrderModel = { aggregate: orderAggregate };
const reportAggregate = jest.fn().mockResolvedValue([]);
const mockReportModel = { aggregate: reportAggregate };

const mockSellerVisibility = {
  syncSellers: jest.fn().mockResolvedValue({ modified: 0 }),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks chỉ xoá call history, không khôi phục implementation —
    // test nào override aggregate phải trả về mặc định ở test kế tiếp.
    orderAggregate.mockResolvedValue([]);
    reportAggregate.mockResolvedValue([]);
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
        { provide: getModelToken(CommerceOrder.name), useValue: mockOrderModel },
        { provide: getModelToken(Report.name), useValue: mockReportModel },
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

    // Topbar cần boolean thật: doc cũ chưa có field → lean() trả undefined và
    // field biến mất khỏi JSON, làm UI không biết có phải cảnh báo hay không.
    it('luôn trả twoFactorEnabled dạng boolean', async () => {
      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({ _id: 'admin-id', isPlatformAdmin: true }),
      );
      const result = await service.getMe('admin-id');
      expect(result.twoFactorEnabled).toBe(false);

      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({
          _id: 'admin-id',
          isPlatformAdmin: true,
          twoFactorEnabled: true,
        }),
      );
      const on = await service.getMe('admin-id');
      expect(on.twoFactorEnabled).toBe(true);
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
        .mockResolvedValueOnce(3) // platformAdmins
        .mockResolvedValueOnce(7) // archivedUsers
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
        platformAdmins: 3,
        archivedUsers: 7,
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
      // Tab "Bị cấm" của trang Người dùng lọc deletedAt: null → count cũng phải vậy
      expect(calls[5]).toMatchObject({ isBanned: true, deletedAt: null });
      // Tab "Quản trị viên"
      expect(calls[6]).toMatchObject({ isPlatformAdmin: true, deletedAt: null });
      // Tab "Lưu trữ" của trang Người dùng — đếm đúng tập mà list sẽ trả
      expect(calls[7]).toMatchObject({ deletedAt: { $ne: null } });
      // Tổng cá nhân cũng không được tính tài khoản đã xoá mềm
      expect(calls[0]).toMatchObject({ accountType: 'personal', deletedAt: null });
    });
  });

  // ─── listPendingBusinesses ────────────────────────────────────────────────

  describe('listPendingBusinesses', () => {
    it('returns only pending businesses — không presign từng dòng', async () => {
      const business = {
        _id: 'biz-1',
        accountType: 'business',
        verificationStatus: 'pending',
        licenseImageKey: 'key/license.jpg',
      };
      mockUserModel.find.mockReturnValue(makeLeanQuery([business]));
      mockUserModel.countDocuments.mockResolvedValue(1);

      const result = await service.listPendingBusinesses({
        page: 1,
        limit: 20,
      });
      expect(result.data).toHaveLength(1);
      // Bảng danh sách không render ảnh giấy phép; ký URL từng dòng là N HMAC
      // mỗi trang vô ích. Drawer detail tự presign qua getBusiness.
      expect(mockMediaService.generatePresignedGetUrl).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
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

    // Tab Lưu trữ hiện cột "Xoá lúc" và cho bấm sort cột đó — thiếu field trong
    // whitelist thì header đổi mũi tên mà dữ liệu đứng yên.
    it('sorts archived rows by deletedAt', async () => {
      const q = makeLeanQuery([]);
      mockUserModel.find.mockReturnValue(q);
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listPendingBusinesses({ page: 1, limit: 20, status: 'archived', sort: 'deletedAt:desc' });

      expect(q.sort).toHaveBeenCalledWith({ deletedAt: -1 });
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

    // Link "doanh nghiệp sở hữu" ở hồ sơ người dùng dán id của chủ vào ô tìm
    // kiếm; chỉ match _id thì owner không bao giờ ra kết quả.
    it('search with ObjectId cũng khớp chủ sở hữu (ownerUserId)', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);
      const ownerId = '507f1f77bcf86cd799439012';

      await service.listPendingBusinesses({ page: 1, limit: 20, search: ownerId, status: 'all' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      const ownerBranch = findFilter.$or.find((b: object) => 'ownerUserId' in b);
      expect(ownerBranch.ownerUserId.toString()).toBe(ownerId);
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

    it('tra them commerceStats + reportStats', async () => {
      mockUserModel.findOne.mockReturnValue(
        makeLeanQuery({ _id: 'biz-1', accountType: 'business' }),
      );
      orderAggregate.mockResolvedValue([
        { ordersAsBuyer: 0, ordersAsSeller: 4, gmvAsSeller: 800000 },
      ]);
      reportAggregate.mockResolvedValue([{ pending: 1, total: 3 }]);

      const res = await service.getBusiness('biz-1');

      expect(res.commerceStats).toEqual({
        ordersAsBuyer: 0,
        ordersAsSeller: 4,
        gmvAsSeller: 800000,
      });
      expect(res.reportStats).toEqual({ pending: 1, total: 3 });
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

    // Tab trạng thái trên UI: mỗi tab phải thành đúng điều kiện, không phải lọc client.
    it('maps status=banned and status=admin to server filters', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listUsers({ status: 'banned', page: 1, limit: 20 });
      expect(mockUserModel.find.mock.calls[0][0]).toMatchObject({ isBanned: true });

      await service.listUsers({ status: 'admin', page: 1, limit: 20 });
      expect(mockUserModel.find.mock.calls[1][0]).toMatchObject({ isPlatformAdmin: true });

      // all / không truyền → không thêm điều kiện trạng thái nào
      await service.listUsers({ status: 'all', page: 1, limit: 20 });
      const allFilter = mockUserModel.find.mock.calls[2][0];
      expect(allFilter.isBanned).toBeUndefined();
      expect(allFilter.isPlatformAdmin).toBeUndefined();
    });

    // Tài khoản doanh nghiệp để liên hệ ở contactEmail/contactPhone — tra trên
    // bảng Người dùng phải ra, nếu không moderator phải sang trang Doanh nghiệp.
    it('searches contact email/phone/username as well', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listUsers({ search: 'alpha', page: 1, limit: 20 });

      const or = mockUserModel.find.mock.calls[0][0].$or as Record<string, unknown>[];
      const keys = or.flatMap((branch) => Object.keys(branch));
      expect(keys).toEqual(expect.arrayContaining(['contactEmail', 'contactPhone', 'username']));
    });

    it('excludes soft-deleted accounts from list and count', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listUsers({ page: 1, limit: 20 });

      expect(mockUserModel.find.mock.calls[0][0]).toMatchObject({ deletedAt: null });
      expect(mockUserModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: null }),
      );
    });

    it('whitelists sort fields — field lạ bị bỏ qua', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.listUsers({ page: 1, limit: 20, sort: 'displayName:asc' });
      expect(mockUserModel.find.mock.results[0].value.sort).toHaveBeenCalledWith({ displayName: 1 });

      await service.listUsers({ page: 1, limit: 20, sort: 'passwordHash:desc' });
      expect(mockUserModel.find.mock.results[1].value.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    // Export phải dùng CÙNG filter với list — lệch là CSV chứa tập khác với
    // những gì moderator đang nhìn thấy trên màn hình.
    it('exportUsers dùng chung filter/bộ lọc với list', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([]));
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.exportUsers({ status: 'banned', accountType: 'business', search: 'alpha' });

      const listFilter = mockUserModel.find.mock.calls[0][0];
      expect(listFilter).toMatchObject({
        deletedAt: null,
        isBanned: true,
        accountType: 'business',
      });
      expect(listFilter.$or).toBeDefined();
    });

    it('exportUsers caps at 500 và báo truncated khi còn dòng chưa xuất', async () => {
      mockUserModel.find.mockReturnValue(makeLeanQuery([{ _id: 'u1' }]));
      mockUserModel.countDocuments.mockResolvedValue(900);

      const res = await service.exportUsers({});

      expect(res.limit).toBe(500);
      expect(res.truncated).toBe(true);
      expect(mockUserModel.find.mock.results[0].value.limit).toHaveBeenCalledWith(500);
    });
  });

  // ─── getUserById ─────────────────────────────────────────────────────────

  describe('getUserById', () => {
    const uid = '507f1f77bcf86cd799439011';
    const ownerId = '507f1f77bcf86cd799439012';

    // getUserById giờ enrich 2 quan hệ; mock mặc định trả rỗng cho cả hai để
    // các test cũ không phải quan tâm.
    function mockOwned(rows: unknown[]) {
      mockUserModel.find.mockReturnValue(makeLeanQuery(rows));
    }

    beforeEach(() => {
      mockOwned([]);
    });

    it('returns a user with safe projection', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery({ _id: uid }));
      const result = await service.getUserById(uid);
      expect(result).toBeDefined();
    });

    it('throws 404 when user not found', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery(null));
      await expect(service.getUserById(uid)).rejects.toThrow(
        NotFoundException,
      );
    });

    // Id sai định dạng phải là 404, không phải CastError 500 lộ stack ra UI.
    it('throws 404 for a malformed id without hitting the DB', async () => {
      await expect(service.getUserById('ghost')).rejects.toThrow(NotFoundException);
      expect(mockUserModel.findById).not.toHaveBeenCalled();
    });

    it('trả danh sách doanh nghiệp sở hữu của tài khoản cá nhân', async () => {
      mockUserModel.findById
        .mockReturnValueOnce(makeLeanQuery({ _id: uid, accountType: 'personal' }))
        .mockReturnValue(makeLeanQuery(null));
      mockOwned([
        { _id: 'b1', displayName: 'Công ty A', verificationStatus: 'verified' },
        { _id: 'b2', displayName: 'Công ty B', verificationStatus: 'pending', isBanned: true },
      ]);

      const res = await service.getUserById(uid);

      expect(res.ownedBusinesses).toHaveLength(2);
      expect(res.ownedBusinesses[1]).toMatchObject({ _id: 'b2', isBanned: true });
      // Lọc đúng chủ sở hữu + chỉ tài khoản doanh nghiệp.
      const query = mockUserModel.find.mock.calls[0][0] as Record<string, unknown>;
      expect(query.accountType).toBe('business');
      expect(String(query.ownerUserId)).toBe(uid);
    });

    it('resolve chủ sở hữu thành tên thay vì trả ObjectId thô', async () => {
      const bizId = '507f1f77bcf86cd799439013';
      mockUserModel.findById
        .mockReturnValueOnce(
          makeLeanQuery({ _id: bizId, accountType: 'business', ownerUserId: ownerId }),
        )
        .mockReturnValueOnce(
          makeLeanQuery({ _id: ownerId, displayName: 'Chủ Sở Hữu', email: 'owner@example.com' }),
        );
      mockOwned([]);

      const res = await service.getUserById(bizId);

      expect(res.owner).toEqual({
        _id: ownerId,
        displayName: 'Chủ Sở Hữu',
        email: 'owner@example.com',
      });
    });

    it('owner = null khi hồ sơ doanh nghiệp do admin tạo tay', async () => {
      const bizId = '507f1f77bcf86cd799439014';
      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({ _id: bizId, accountType: 'business' }),
      );
      mockOwned([]);

      const res = await service.getUserById(bizId);

      expect(res.owner).toBeNull();
      // Không có ownerUserId thì không được query thêm lần nào.
      expect(mockUserModel.findById).toHaveBeenCalledTimes(1);
    });

    // Không có đơn / báo cáo nào là trạng thái bình thường của phần lớn tài
    // khoản — phải trả số 0, không phải undefined (UI hiện "undefined đơn").
    it('trả 0 cho tín hiệu mua/bán và báo cáo khi chưa có dữ liệu', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery({ _id: uid }));
      mockOwned([]);

      const res = await service.getUserById(uid);

      expect(res.commerceStats).toEqual({
        ordersAsBuyer: 0,
        ordersAsSeller: 0,
        gmvAsSeller: 0,
      });
      expect(res.reportStats).toEqual({ pending: 0, total: 0 });
      expect(res.avatarUrl).toBeNull();
    });

    it('GMV chỉ cộng đơn DELIVERED mà user là người bán', async () => {
      mockUserModel.findById.mockReturnValue(makeLeanQuery({ _id: uid }));
      mockOwned([]);
      orderAggregate.mockResolvedValue([
        { ordersAsBuyer: 3, ordersAsSeller: 7, gmvAsSeller: 1_250_000 },
      ]);
      reportAggregate.mockResolvedValue([{ pending: 2, total: 9 }]);

      const res = await service.getUserById(uid);

      expect(res.commerceStats).toEqual({
        ordersAsBuyer: 3,
        ordersAsSeller: 7,
        gmvAsSeller: 1_250_000,
      });
      expect(res.reportStats).toEqual({ pending: 2, total: 9 });

      // Pipeline phải lọc DELIVERED ở nhánh GMV — nếu chỉ đếm sellerId, doanh
      // thu sẽ gồm cả đơn đang chờ và đơn huỷ.
      const pipeline = orderAggregate.mock.calls[0][0] as Record<string, unknown>[];
      expect(JSON.stringify(pipeline)).toContain('DELIVERED');
    });

    it('presign avatar khi là media key, giữ nguyên khi đã là URL', async () => {
      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({ _id: uid, avatar: 'avatars/u1.jpg' }),
      );
      mockOwned([]);
      mockMediaService.generatePresignedGetUrl.mockResolvedValue('https://cdn/signed');

      const keyRes = await service.getUserById(uid);
      expect(keyRes.avatarUrl).toBe('https://cdn/signed');

      jest.clearAllMocks();
      orderAggregate.mockResolvedValue([]);
      reportAggregate.mockResolvedValue([]);
      mockUserModel.findById.mockReturnValue(
        makeLeanQuery({ _id: uid, avatar: 'https://cdn/already.jpg' }),
      );
      mockOwned([]);

      const urlRes = await service.getUserById(uid);
      expect(urlRes.avatarUrl).toBe('https://cdn/already.jpg');
      expect(mockMediaService.generatePresignedGetUrl).not.toHaveBeenCalled();
    });
  });

  // ─── updateUser ──────────────────────────────────────────────────────────

  describe('updateUser', () => {
    const uid = '507f1f77bcf86cd799439011';

    it('sets whitelisted fields, lowercases email/username, and reports conflicts', async () => {
      mockUserModel.findOne.mockReturnValue(
        makeLeanQuery({ _id: uid, email: 'old@example.com', username: 'old', phone: '0901111111' }),
      );
      mockUserModel.exists.mockResolvedValue(null);
      mockUserModel.findOneAndUpdate.mockReturnValue(
        makeLeanQuery({ _id: uid, displayName: 'Tên Mới', email: 'new@example.com' }),
      );
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

      const res = await service.updateUser(uid, {
        displayName: '  Tên Mới  ',
        email: 'New@Example.com',
        username: 'NewName',
      });

      expect(res.displayName).toBe('Tên Mới');
      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$set.displayName).toBe('Tên Mới');
      // Email/username phải lowercase: schema unique + lowercase, gửi bản có hoa
      // là hai bản ghi khác nhau với index.
      expect(update.$set.email).toBe('new@example.com');
      expect(update.$set.username).toBe('newname');
      // Đổi email = đổi danh tính đăng nhập → thu hồi phiên cũ.
      expect(mockRefreshTokenModel.updateMany).toHaveBeenCalled();
    });

    it('unsets cleared username instead of writing an empty string into a unique index', async () => {
      mockUserModel.findOne.mockReturnValue(makeLeanQuery({ _id: uid, username: 'old' }));
      mockUserModel.findOneAndUpdate.mockReturnValue(makeLeanQuery({ _id: uid }));

      await service.updateUser(uid, { username: '' });

      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$unset).toEqual({ username: '' });
      expect(update.$set).toBeUndefined();
    });

    it('throws 409 when the new email belongs to another account', async () => {
      mockUserModel.findOne.mockReturnValue(makeLeanQuery({ _id: uid }));
      mockUserModel.exists.mockResolvedValue({ _id: 'other' });

      await expect(
        service.updateUser(uid, { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
      expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects an empty patch so a save with no changes is a no-op error', async () => {
      mockUserModel.findOne.mockReturnValue(makeLeanQuery({ _id: uid }));
      await expect(service.updateUser(uid, {})).rejects.toThrow(BadRequestException);
    });

    // Hồ sơ đã xoá mềm chỉ đọc: phải khôi phục trước rồi mới sửa.
    it('throws 404 for a deleted account so soft-deleted records stay read-only', async () => {
      mockUserModel.findOne.mockReturnValue(makeLeanQuery(null));
      await expect(service.updateUser(uid, { displayName: 'X' })).rejects.toThrow(NotFoundException);
      expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── softDeleteUser / restoreUser / revokeSessions ───────────────────────

  describe('softDeleteUser', () => {
    const uid = '507f1f77bcf86cd799439011';

    it('marks deletedAt, revokes sessions and hides the seller', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: uid, accountType: 'business' }) }),
      });
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      await service.softDeleteUser(uid);

      const update = mockUserModel.findOneAndUpdate.mock.calls[0][1];
      expect(update.$set.deletedAt).toBeInstanceOf(Date);
      expect(mockRefreshTokenModel.updateMany).toHaveBeenCalledWith(
        { userId: uid, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } },
      );
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith([uid]);
    });

    it('throws 404 when already deleted', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });
      mockUserModel.exists.mockResolvedValue({ _id: uid });

      await expect(service.softDeleteUser(uid)).rejects.toThrow('đã bị xoá trước đó');
    });

    it('restore clears deletedAt and re-syncs seller visibility', async () => {
      mockUserModel.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: uid, accountType: 'business' }) }),
      });

      await service.restoreUser(uid);

      expect(mockUserModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { deletedAt: null } });
      expect(mockSellerVisibility.syncSellers).toHaveBeenCalledWith([uid]);
    });
  });

  describe('revokeSessions', () => {
    const uid = '507f1f77bcf86cd799439011';

    it('returns the number of revoked tokens', async () => {
      mockUserModel.exists.mockResolvedValue({ _id: uid });
      mockRefreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 4 });

      const res = await service.revokeSessions(uid);

      expect(res).toEqual({ revoked: 4 });
      expect(mockRefreshTokenModel.updateMany).toHaveBeenCalledWith(
        { userId: uid, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } },
      );
    });

    it('throws 404 for an unknown user', async () => {
      mockUserModel.exists.mockResolvedValue(null);
      await expect(service.revokeSessions(uid)).rejects.toThrow(NotFoundException);
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
