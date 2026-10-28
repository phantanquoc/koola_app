import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ModerationQueueService } from './moderation-queue.service';
import { Report } from './schemas/report.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { AdminReportService } from './admin-report.service';

const STORY_ID = '507f1f77bcf86cd799439020';
const MSG_ID = '507f1f77bcf86cd799439010';
const BIZ_ID = '507f1f77bcf86cd799439099';

function leanQuery(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

const reportModel = { aggregate: jest.fn() };
const userModel = { find: jest.fn() };
const msgModel = { find: jest.fn() };
const storyModel = { find: jest.fn() };
const reportService = { list: jest.fn() };

describe('ModerationQueueService', () => {
  let service: ModerationQueueService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userModel.find.mockReturnValue(leanQuery([]));
    msgModel.find.mockReturnValue(leanQuery([]));
    storyModel.find.mockReturnValue(leanQuery([]));
    reportService.list.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 200,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ModerationQueueService,
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: AdminReportService, useValue: reportService },
      ],
    }).compile();
    service = moduleRef.get(ModerationQueueService);
  });

  it('gom báo cáo theo targetId bằng một aggregate, không N+1', async () => {
    reportModel.aggregate.mockResolvedValue([
      {
        _id: { targetType: 'message', targetId: MSG_ID },
        count: 4,
        firstAt: new Date('2026-10-01'),
      },
    ]);
    msgModel.find.mockReturnValue(
      leanQuery([{ _id: MSG_ID, content: 'Spam', type: 'text' }]),
    );

    const items = await service.getQueue(50);

    expect(reportModel.aggregate).toHaveBeenCalledTimes(1);
    // Một query duy nhất cho tất cả message bị báo — không phải 4 query.
    expect(msgModel.find).toHaveBeenCalledTimes(1);
    expect(items[0]).toMatchObject({
      kind: 'message-reports',
      id: MSG_ID,
      reportedCount: 4,
    });
  });

  it('story active có ≥3 báo cáo → xếp trước báo cáo lẻ; report lẻ cùng target bị loại trùng', async () => {
    reportModel.aggregate.mockResolvedValue([
      {
        _id: { targetType: 'story', targetId: STORY_ID },
        count: 3,
        firstAt: new Date('2026-10-02'),
      },
    ]);
    storyModel.find.mockReturnValue(
      leanQuery([{ _id: STORY_ID, caption: 'Story xấu', isActive: true }]),
    );
    reportService.list.mockResolvedValue({
      data: [
        {
          _id: 'r1',
          targetType: 'story',
          targetId: STORY_ID,
          reason: 'x',
          targetName: 'Story xấu',
          createdAt: '2026-10-02T00:00:00.000Z',
        },
        {
          _id: 'r2',
          targetType: 'user',
          targetId: 'u1',
          reason: 'quấy rối',
          targetName: 'Người dùng A',
          createdAt: '2026-10-03T00:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 200,
    });

    const items = await service.getQueue(50);

    expect(items[0].kind).toBe('story-reports');
    // Report của chính story đã gộp vào cụm → không hiện lần hai.
    expect(
      items.filter((it) => it.kind === 'report').map((it) => it.id),
    ).toEqual(['r2']);
  });

  it('story đã bị gỡ (isActive=false) không vào hàng đợi', async () => {
    reportModel.aggregate.mockResolvedValue([
      {
        _id: { targetType: 'story', targetId: STORY_ID },
        count: 5,
        firstAt: new Date('2026-10-02'),
      },
    ]);
    storyModel.find.mockReturnValue(
      leanQuery([{ _id: STORY_ID, caption: 'cũ', isActive: false }]),
    );

    const items = await service.getQueue(50);
    expect(items.find((it) => it.kind === 'story-reports')).toBeUndefined();
  });

  it('targetId dạng chuỗi seed không đưa vào $in (tránh CastError)', async () => {
    reportModel.aggregate.mockResolvedValue([
      {
        _id: { targetType: 'message', targetId: 'seed-msg-1' },
        count: 10,
        firstAt: new Date(),
      },
    ]);

    const items = await service.getQueue(50);

    expect(msgModel.find).not.toHaveBeenCalled();
    expect(items).toHaveLength(0);
  });

  it('business pending verification vào hàng đợi với priority thấp hơn nội dung bị báo', async () => {
    userModel.find.mockReturnValue(
      leanQuery([
        {
          _id: BIZ_ID,
          displayName: 'Quán A',
          createdAt: new Date('2026-10-01'),
        },
      ]),
    );

    const items = await service.getQueue(50);

    expect(items[0]).toMatchObject({
      kind: 'business-verification',
      id: BIZ_ID,
      title: 'Quán A',
      link: `/businesses/${BIZ_ID}`,
    });
  });

  it('cap tổng 200 và sort priority desc rồi createdAt asc', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      _id: { targetType: 'user', targetId: `u${i}` },
      count: 1,
      firstAt: new Date(2026, 0, 1, 0, i),
    }));
    reportModel.aggregate.mockResolvedValue(many);
    reportService.list.mockResolvedValue({
      data: many.map((m, i) => ({
        _id: `r${i}`,
        targetType: 'user',
        targetId: m._id.targetId,
        reason: 'x',
        targetName: `U${i}`,
        createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
      })),
      total: 250,
      page: 1,
      limit: 200,
    });

    const items = await service.getQueue(50);
    expect(items).toHaveLength(50);

    const capped = await service.getQueue(1000);
    expect(capped).toHaveLength(200);
  });
});
