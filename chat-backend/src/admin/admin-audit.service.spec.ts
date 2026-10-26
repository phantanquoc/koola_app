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

const mockUserModel = {
  find: jest.fn(() => ({
    select: () => ({ lean: jest.fn().mockResolvedValue([]) }),
  })),
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
});
