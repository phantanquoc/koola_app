import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminExportService, REPORT_EXPORT_MAX } from './admin-export.service';
import { Report } from './schemas/report.schema';

function leanQuery(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

const reportModel = { find: jest.fn(), countDocuments: jest.fn() };

describe('AdminExportService', () => {
  let service: AdminExportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminExportService,
        { provide: getModelToken(Report.name), useValue: reportModel },
      ],
    }).compile();
    service = moduleRef.get(AdminExportService);
  });

  it('cap limit ở 500 kể cả khi client xin nhiều hơn', async () => {
    const query = leanQuery([]);
    reportModel.find.mockReturnValue(query);
    reportModel.countDocuments.mockResolvedValue(0);

    await service.exportReports({ limit: 10_000 });

    expect(query.limit).toHaveBeenCalledWith(REPORT_EXPORT_MAX);
  });

  it('dựng filter status/targetType và khoảng ngày tính cả biên', async () => {
    reportModel.find.mockReturnValue(leanQuery([]));
    reportModel.countDocuments.mockResolvedValue(0);

    await service.exportReports({
      status: 'pending',
      targetType: 'message',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
    });

    expect(reportModel.find).toHaveBeenCalledWith({
      status: 'pending',
      targetType: 'message',
      createdAt: {
        $gte: new Date('2026-10-01T00:00:00.000Z'),
        $lte: new Date('2026-10-31T23:59:59.999Z'),
      },
    });
  });

  it('chỉ select cột của Report — không kéo email/SĐT người báo cáo', async () => {
    const query = leanQuery([]);
    reportModel.find.mockReturnValue(query);
    reportModel.countDocuments.mockResolvedValue(0);

    await service.exportReports({});

    const projection = (query.select.mock.calls as unknown as string[][])[0][0];
    expect(projection).not.toMatch(/email|phone|passwordHash|fcmTokens/);
    expect(projection).toContain('reporterId');
  });

  it('total > số dòng trả về → truncated=true', async () => {
    reportModel.find.mockReturnValue(leanQuery([{ _id: 'r1' }]));
    reportModel.countDocuments.mockResolvedValue(1_200);

    const res = await service.exportReports({});
    expect(res.total).toBe(1_200);
    expect(res.truncated).toBe(true);
  });

  it('không gửi from/to → không có điều kiện createdAt', async () => {
    reportModel.find.mockReturnValue(leanQuery([]));
    reportModel.countDocuments.mockResolvedValue(0);

    await service.exportReports({ status: 'resolved' });
    expect(reportModel.find).toHaveBeenCalledWith({ status: 'resolved' });
  });
});
