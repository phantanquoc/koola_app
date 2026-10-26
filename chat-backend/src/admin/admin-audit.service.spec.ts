import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLog } from './schemas/admin-audit-log.schema';
import { User } from '../users/user.schema';

const mockAuditModel = {
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
};

// Kiểu chuỗi query thay đổi theo nhánh (select→lean hoặc select→limit→lean),
// nên khai báo lỏng: mỗi test tự dựng chain nó cần.
const mockUserModel = {
  find: jest.fn() as jest.Mock,
};

function makeListQuery(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('AdminAuditService filters', () => {
  let service: AdminAuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        { provide: getModelToken(AdminAuditLog.name), useValue: mockAuditModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
      ],
    }).compile();
    service = module.get<AdminAuditService>(AdminAuditService);
  });

  it('lists without filter when no targetType/targetId given', async () => {
    mockAuditModel.find.mockReturnValue(makeListQuery([]));
    mockAuditModel.countDocuments.mockResolvedValue(0);
    await service.list({ page: 1, limit: 20 });
    expect(mockAuditModel.find).toHaveBeenCalledWith({});
    expect(mockAuditModel.countDocuments).toHaveBeenCalledWith({});
  });

  it('filters by targetType and targetId', async () => {
    mockAuditModel.find.mockReturnValue(makeListQuery([]));
    mockAuditModel.countDocuments.mockResolvedValue(0);
    await service.list({
      page: 1,
      limit: 20,
      targetType: 'business',
      targetId: 'biz-1',
    });
    expect(mockAuditModel.find).toHaveBeenCalledWith({
      targetType: 'business',
      targetId: 'biz-1',
    });
    expect(mockAuditModel.countDocuments).toHaveBeenCalledWith({
      targetType: 'business',
      targetId: 'biz-1',
    });
  });

  it('resolves actorName in one batch query', async () => {
    const actorId = '507f1f77bcf86cd799439011';
    mockAuditModel.find.mockReturnValue(
      makeListQuery([
        { _id: 'a1', actorId, action: 'approve_business' },
        { _id: 'a2', actorId, action: 'reject_business' },
      ]),
    );
    mockAuditModel.countDocuments.mockResolvedValue(2);
    mockUserModel.find.mockReturnValueOnce({
      select: () => ({
        lean: jest.fn().mockResolvedValue([
          { _id: actorId, displayName: 'Nguyễn Văn A' },
        ]),
      }),
    });

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].actorName).toBe('Nguyễn Văn A');
    expect(res.data[1].actorName).toBe('Nguyễn Văn A');
    // một query cho cả trang, không phải N+1
    expect(mockUserModel.find).toHaveBeenCalledTimes(1);
  });

  it('filters by action', async () => {
    mockAuditModel.find.mockReturnValue(makeListQuery([]));
    mockAuditModel.countDocuments.mockResolvedValue(0);
    await service.list({ page: 1, limit: 20, action: 'bulk_approve_business' });
    expect(mockAuditModel.find).toHaveBeenCalledWith({ action: 'bulk_approve_business' });
  });

  it('resolves actor name/email to actorId list before querying', async () => {
    const actorId = '507f1f77bcf86cd799439011';
    mockAuditModel.find.mockReturnValue(
      makeListQuery([{ _id: 'a1', actorId, action: 'approve_business' }]),
    );
    mockAuditModel.countDocuments.mockResolvedValue(1);
    // Lần 1: resolve tên → id. Lần 2: lấy displayName cho dòng trả về.
    mockUserModel.find
      .mockReturnValueOnce({
        select: () => ({
          limit: () => ({ lean: jest.fn().mockResolvedValue([{ _id: actorId }]) }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          lean: jest.fn().mockResolvedValue([{ _id: actorId, displayName: 'Nguyễn Văn A' }]),
        }),
      });

    const res = await service.list({ page: 1, limit: 20, actor: 'nguyễn' });

    expect(mockAuditModel.find).toHaveBeenCalledWith({
      actorId: { $in: [actorId] },
    });
    expect(res.data[0].actorName).toBe('Nguyễn Văn A');
    expect(mockUserModel.find).toHaveBeenCalledTimes(2);
  });

  it('returns empty page without scanning audit logs when actor matches nobody', async () => {
    mockUserModel.find.mockReturnValueOnce({
      select: () => ({
        limit: () => ({ lean: jest.fn().mockResolvedValue([]) }),
      }),
    });

    const res = await service.list({ page: 1, limit: 20, actor: 'không tồn tại' });

    expect(res).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(mockAuditModel.find).not.toHaveBeenCalled();
  });

  it('builds inclusive date range only for the bounds provided', async () => {
    mockAuditModel.find.mockReturnValue(makeListQuery([]));
    mockAuditModel.countDocuments.mockResolvedValue(0);

    await service.list({ page: 1, limit: 20, from: '2026-10-01T00:00:00.000Z' });

    const arg = mockAuditModel.find.mock.calls[0][0] as {
      createdAt: Record<string, Date>;
    };
    expect(arg.createdAt.$gte).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    // `to` không truyền → không được thêm $lte: undefined sẽ làm Mongo bỏ điều kiện
    expect(arg.createdAt.$lte).toBeUndefined();
  });

  it('matches targetId partially so bulk rows are findable', async () => {
    mockAuditModel.find.mockReturnValue(makeListQuery([]));
    mockAuditModel.countDocuments.mockResolvedValue(0);

    await service.list({ page: 1, limit: 20, search: 'b9' });

    const arg = mockAuditModel.find.mock.calls[0][0] as { targetId: RegExp };
    expect(arg.targetId).toBeInstanceOf(RegExp);
    expect(arg.targetId.test('b1,b9,b12')).toBe(true);
  });

  // Điều tra sự cố đọc tên, không đọc ObjectId. Business dùng chung collection
  // User nên một lượt query phủ cả actor lẫn target.
  it('resolves targetName in the same batch query as actorName', async () => {
    const actorId = '507f1f77bcf86cd799439011';
    const bizId = '507f1f77bcf86cd799439012';
    mockAuditModel.find.mockReturnValue(
      makeListQuery([
        { _id: 'a1', actorId, action: 'bulk_approve_business', targetType: 'business', targetId: `${bizId},deadbeef` },
      ]),
    );
    mockAuditModel.countDocuments.mockResolvedValue(1);
    mockUserModel.find.mockReturnValueOnce({
      select: () => ({
        lean: jest.fn().mockResolvedValue([
          { _id: actorId, displayName: 'Admin A' },
          { _id: bizId, displayName: 'Công ty B' },
        ]),
      }),
    });

    const res = await service.list({ page: 1, limit: 20 });

    expect(res.data[0].actorName).toBe('Admin A');
    // id không resolve được thì bỏ, không để "undefined" trong chuỗi
    expect(res.data[0].targetName).toBe('Công ty B');
    expect(mockUserModel.find).toHaveBeenCalledTimes(1);
  });

  it('truncates long bulk target names', async () => {
    const ids = ['507f1f77bcf86cd7994390a1', '507f1f77bcf86cd7994390a2', '507f1f77bcf86cd7994390a3', '507f1f77bcf86cd7994390a4'];
    mockAuditModel.find.mockReturnValue(
      makeListQuery([
        { _id: 'a1', actorId: 'x', action: 'bulk_approve_business', targetType: 'business', targetId: ids.join(',') },
      ]),
    );
    mockAuditModel.countDocuments.mockResolvedValue(1);
    mockUserModel.find.mockReturnValueOnce({
      select: () => ({
        lean: jest.fn().mockResolvedValue(ids.map((_id, i) => ({ _id, displayName: `DN ${i + 1}` }))),
      }),
    });

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].targetName).toBe('DN 1, DN 2, DN 3 (+1)');
  });
});
