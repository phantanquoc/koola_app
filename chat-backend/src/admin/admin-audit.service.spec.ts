import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLog } from './schemas/admin-audit-log.schema';

const mockAuditModel = {
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
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
});
