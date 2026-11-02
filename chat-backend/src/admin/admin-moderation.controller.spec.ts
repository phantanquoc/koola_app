import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getModelToken } from '@nestjs/mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AdminModerationController } from './admin-moderation.controller';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AdminOpsController } from './admin-ops.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportService } from './admin-report.service';
import { ModerationMediaService } from './moderation-media.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ConversationDoc } from '../conversations/conversation.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { Report } from './schemas/report.schema';
import { MusicTrack } from '../moments/schemas/music-track.schema';
import { AudienceList } from '../moments/schemas/audience-list.schema';

const AUTHOR = '507f1f77bcf86cd799439001';
const SENDER = '507f1f77bcf86cd799439002';
const CONV = '507f1f77bcf86cd799439020';

function leanQuery(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

const userModel = { find: jest.fn(), countDocuments: jest.fn() };
const convModel = {
  find: jest.fn(),
  findById: jest.fn(),
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
  distinct: jest.fn(),
};
const msgModel = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  distinct: jest.fn(),
};
const storyModel = { find: jest.fn(), countDocuments: jest.fn() };
const reportModel = { find: jest.fn(), aggregate: jest.fn() };
const musicTrackModel = {};
const audienceListModel = {};
const audit = { log: jest.fn() };
const chatGateway = { io: { emit: jest.fn(), sockets: new Map([['s1', {}]]) } };

describe('AdminModerationController — enrich + filter', () => {
  let controller: AdminModerationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminModerationController,
        { provide: getModelToken(ConversationDoc.name), useValue: convModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(MusicTrack.name), useValue: musicTrackModel },
        {
          provide: getModelToken(AudienceList.name),
          useValue: audienceListModel,
        },
        { provide: AdminAuditService, useValue: audit },
        { provide: AdminReportService, useValue: {} },
        {
          provide: ModerationMediaService,
          useValue: { presignMany: jest.fn().mockResolvedValue(new Map()) },
        },
        { provide: ChatGateway, useValue: chatGateway },
      ],
    }).compile();
    controller = moduleRef.get(AdminModerationController);
  });

  it('stories: lọc isActive và gắn authorName/authorAvatar, bỏ qua authorId không phải ObjectId', async () => {
    storyModel.find.mockReturnValue(
      leanQuery([
        { _id: 's1', authorId: AUTHOR, caption: 'a' },
        { _id: 's2', authorId: 'not-an-object-id' },
      ]),
    );
    storyModel.countDocuments.mockResolvedValue(2);
    userModel.find.mockReturnValue(
      leanQuery([{ _id: AUTHOR, displayName: 'Lan', avatar: 'lan.png' }]),
    );

    const res = await controller.listStories({
      page: 1,
      limit: 20,
      active: 'false',
    });

    expect(storyModel.find).toHaveBeenCalledWith({ isActive: false });
    // Chỉ id hợp lệ mới vào $in.
    expect(userModel.find).toHaveBeenCalledWith({ _id: { $in: [AUTHOR] } });
    expect(res.data[0]).toMatchObject({
      authorName: 'Lan',
      authorAvatar: 'lan.png',
    });
    expect(res.data[1]).toMatchObject({ authorName: null, authorAvatar: null });
    expect(res).toMatchObject({ total: 2, page: 1, limit: 20 });
  });

  it('messages/search: mặc định bỏ message deleted, resolve senderName + conversationName', async () => {
    msgModel.find.mockReturnValue(
      leanQuery([
        { _id: 'm1', senderId: SENDER, conversationId: CONV, content: 'hi' },
      ]),
    );
    msgModel.countDocuments.mockResolvedValue(1);
    userModel.find
      .mockReturnValueOnce(leanQuery([{ _id: SENDER, displayName: 'Minh' }]))
      .mockReturnValueOnce(
        leanQuery([
          { _id: SENDER, displayName: 'Minh' },
          { _id: AUTHOR, displayName: 'Lan' },
        ]),
      );
    convModel.find.mockReturnValue(
      leanQuery([
        {
          _id: CONV,
          type: 'direct',
          name: null,
          members: [{ userId: SENDER }, { userId: AUTHOR }],
        },
      ]),
    );

    const res = await controller.searchMessages({
      q: 'hi',
      page: 1,
      limit: 20,
    });

    expect(msgModel.find).toHaveBeenCalledWith({
      content: expect.any(RegExp),
      deleted: { $ne: true },
    });
    expect(res.data[0].senderName).toBe('Minh');
    expect(res.data[0].conversationName).toBe('Minh - Lan');
  });

  it('messages/search: includeDeleted=true giữ message đã gỡ', async () => {
    msgModel.find.mockReturnValue(leanQuery([]));
    msgModel.countDocuments.mockResolvedValue(0);

    await controller.searchMessages({
      q: 'hi',
      page: 1,
      limit: 20,
      includeDeleted: 'true',
    });

    expect(msgModel.find).toHaveBeenCalledWith({ content: expect.any(RegExp) });
  });
});

/**
 * Danh sách hội thoại dùng chung một filter builder cho list/stats/export.
 * Các test dưới đây chốt hợp đồng: row list gọn (`memberCount`, không `members`),
 * có tuổi báo cáo, sort có allow-list, và export không bị `:id` nuốt route.
 */
describe('AdminModerationController — conversation list/stats/export', () => {
  let controller: AdminModerationController;

  const ROW_GROUP = '507f1f77bcf86cd799439030';
  const ROW_DIRECT = '507f1f77bcf86cd799439031';
  const OLDEST_REPORT = new Date('2026-10-01T02:00:00.000Z');

  const groupRow = () => ({
    _id: ROW_GROUP,
    type: 'group',
    name: 'Nhóm Koola',
    members: [
      { userId: SENDER, role: 'admin' },
      { userId: AUTHOR, role: 'member' },
    ],
    lastMessageAt: new Date('2026-10-20T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  const directRow = () => ({
    _id: ROW_DIRECT,
    type: 'direct',
    name: null,
    members: [{ userId: SENDER }, { userId: AUTHOR }],
    lastMessageAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks giữ implementation cũ — reset để mockResolvedValueOnce của
    // test trước không rò sang test sau.
    convModel.aggregate.mockReset();
    convModel.countDocuments.mockReset();
    convModel.distinct.mockReset();
    msgModel.distinct.mockReset();
    reportModel.aggregate.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminModerationController,
        { provide: getModelToken(ConversationDoc.name), useValue: convModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(MusicTrack.name), useValue: musicTrackModel },
        {
          provide: getModelToken(AudienceList.name),
          useValue: audienceListModel,
        },
        { provide: AdminAuditService, useValue: audit },
        { provide: AdminReportService, useValue: {} },
        {
          provide: ModerationMediaService,
          useValue: { presignMany: jest.fn().mockResolvedValue(new Map()) },
        },
        { provide: ChatGateway, useValue: chatGateway },
      ],
    }).compile();
    controller = moduleRef.get(AdminModerationController);

    // Mặc định: user lookup trả tên, aggregate báo cáo trả rỗng, media trả rỗng.
    userModel.find.mockReturnValue(
      leanQuery([
        { _id: SENDER, displayName: 'Minh' },
        { _id: AUTHOR, displayName: 'Lan' },
      ]),
    );
    reportModel.aggregate.mockResolvedValue([]);
    msgModel.distinct.mockResolvedValue([]);
  });

  /** Cấu hình list trả về đúng các row cho trước. */
  function mockList(rows: unknown[], total = rows.length) {
    convModel.aggregate.mockResolvedValue(rows);
    convModel.countDocuments.mockResolvedValue(total);
  }

  it('1.2 createdAt range vào $match, tính cả hai biên', async () => {
    mockList([groupRow()]);

    await controller.listConversations({
      page: 1,
      limit: 20,
      createdFrom: '2026-10-01',
      createdTo: '2026-10-31',
    });

    const [pipeline] = convModel.aggregate.mock.calls[0] as [{ $match: any }[]];
    expect(pipeline[0].$match.createdAt).toEqual({
      $gte: new Date('2026-10-01'),
      $lte: new Date('2026-10-31'),
    });
  });

  it('1.2 activeFrom/activeTo lọc trên lastMessageAt (kèm activeAfter)', async () => {
    mockList([groupRow()]);

    await controller.listConversations({
      page: 1,
      limit: 20,
      activeAfter: '2026-09-01',
      activeFrom: '2026-10-01',
      activeTo: '2026-10-31',
    });

    const [pipeline] = convModel.aggregate.mock.calls[0] as [{ $match: any }[]];
    expect(pipeline[0].$match.lastMessageAt).toEqual({
      $gte: new Date('2026-10-01'),
      $lte: new Date('2026-10-31'),
    });
  });

  it('1.3 sort=members sắp theo memberCount rồi _id để phân trang ổn định', async () => {
    mockList([groupRow()]);

    await controller.listConversations({ page: 1, limit: 20, sort: 'members' });

    const [pipeline] = convModel.aggregate.mock.calls[0] as any[];
    const sortStage = pipeline.find((s: any) => s.$sort);
    expect(sortStage.$sort).toEqual({
      __memberCount: -1,
      lastMessageAt: -1,
      _id: -1,
    });
  });

  it('1.3 sort ngoài allow-list bị DTO từ chối (400 qua ValidationPipe)', async () => {
    const bad = await validate(
      plainToInstance(ListConversationsDto, { sort: 'password' }),
    );
    expect(bad.some((e) => e.property === 'sort')).toBe(true);

    const ok = await validate(
      plainToInstance(ListConversationsDto, { sort: 'members' }),
    );
    expect(ok).toHaveLength(0);
  });

  it('1.4 list row có memberCount và KHÔNG có members; detail vẫn có members', async () => {
    mockList([groupRow()]);

    const list = await controller.listConversations({ page: 1, limit: 20 });

    expect(list.data[0]).toHaveProperty('memberCount', 2);
    expect(list.data[0]).not.toHaveProperty('members');

    convModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(groupRow()),
    });
    msgModel.find.mockReturnValue(leanQuery([]));

    const detail = await controller.getConversation(ROW_GROUP, {});
    expect(detail.members).toHaveLength(2);
    expect((detail.conversation as any).members).toHaveLength(2);
  });

  it('1.5 row có báo cáo mang cả count lẫn tuổi; row không có thì bỏ trường tuổi', async () => {
    mockList([groupRow(), directRow()]);
    reportModel.aggregate.mockResolvedValue([
      { _id: ROW_GROUP, n: 3, oldest: OLDEST_REPORT },
    ]);

    const res = await controller.listConversations({ page: 1, limit: 20 });

    const reported = res.data.find((r) => String(r._id) === ROW_GROUP) as any;
    const clean = res.data.find((r) => String(r._id) === ROW_DIRECT) as any;
    expect(reported.pendingReportCount).toBe(3);
    expect(new Date(reported.oldestPendingReportAt).toISOString()).toBe(
      OLDEST_REPORT.toISOString(),
    );
    expect(clean.pendingReportCount).toBe(0);
    expect(clean).not.toHaveProperty('oldestPendingReportAt');
  });

  it('1.6 row có cột hasMedia — distinct scoped theo id của trang hiện tại', async () => {
    mockList([groupRow(), directRow()]);
    // Chỉ hội thoại nhóm có media (mock trả về đúng tập id trang).
    msgModel.distinct.mockResolvedValue([ROW_GROUP]);

    const res = await controller.listConversations({ page: 1, limit: 20 });

    // Thứ tự data theo thứ tự mockList: [nhóm, trực tiếp].
    expect(res.data[0]).toMatchObject({ _id: ROW_GROUP, hasMedia: true });
    expect(res.data[1]).toMatchObject({ _id: ROW_DIRECT, hasMedia: false });
    expect(msgModel.distinct).toHaveBeenCalledWith(
      'conversationId',
      expect.objectContaining({
        conversationId: { $in: [expect.anything(), expect.anything()] },
      }),
    );
  });

  it('2.1 stats: all bằng total của list dưới cùng filter, sáu count', async () => {
    mockList([groupRow()], 7);
    // Thứ tự count: all, pendingReport, group, direct, hasMedia, active24h.
    convModel.countDocuments
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5);

    const stats = await controller.conversationStats({ type: 'group' });
    const list = await controller.listConversations({ type: 'group' });

    expect(stats).toEqual({
      all: 7,
      pendingReport: 2,
      group: 4,
      direct: 3,
      hasMedia: 1,
      active24h: 5,
    });
    expect(stats.all).toBe(list.total);
    expect(convModel.countDocuments).toHaveBeenCalledTimes(7); // 6 stats + 1 list
    // Mọi count dùng chung filter của list.
    for (const [filter] of convModel.countDocuments.mock.calls.slice(0, 6)) {
      expect(JSON.stringify(filter)).toContain('"type":"group"');
    }
  });

  it('2.2 export cap 500 dòng, báo truncated, và tôn trọng type=group', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      ...groupRow(),
      _id: `507f1f77bcf86cd79${String(439100 + i).padStart(6, '0')}`,
    }));
    mockList(rows, 1200);

    const res = await controller.exportConversations({ type: 'group' });

    expect(res.data).toHaveLength(500);
    expect(res.total).toBe(1200);
    expect(res.truncated).toBe(true);
    const [pipeline] = convModel.aggregate.mock.calls[0] as any[];
    expect(pipeline[0].$match.type).toBe('group');
    expect(pipeline.find((s: any) => s.$limit).$limit).toBe(500);
  });

  it('2.2 export/stats đứng trước conversations/:id trong thân controller', () => {
    // Express khớp theo thứ tự đăng ký: nếu `:id` đứng trước, /conversations/export
    // bị bắt với id='export' (sự cố đã ghi ở admin.module.ts cho reports).
    const src = readFileSync(
      join(__dirname, 'admin-moderation.controller.ts'),
      'utf8',
    );
    const exportAt = src.indexOf("@Get('conversations/export')");
    const statsAt = src.indexOf("@Get('conversations/stats')");
    const idAt = src.indexOf("@Get('conversations/:id')");
    expect(exportAt).toBeGreaterThan(-1);
    expect(statsAt).toBeGreaterThan(-1);
    expect(exportAt).toBeLessThan(idAt);
    expect(statsAt).toBeLessThan(idAt);
  });

  it('2.1/2.2 chỉ admin vào được — controller gắn JwtAuthGuard + AdminGuard', () => {
    const guards: unknown[] =
      Reflect.getMetadata('__guards__', AdminModerationController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, AdminGuard]));
  });
});

describe('AdminOpsController.broadcast', () => {
  it('trả recipients = số socket đang kết nối', async () => {
    // Controller chỉ uỷ quyền cho BroadcastService; stub bắt chước đúng
    // phần emit + đếm socket để test không phụ thuộc model log.
    const broadcastService = {
      send: jest.fn(
        async (
          input: { title: string; body: string },
          _actorId: string,
          _ip: string | null,
        ) => {
          const payload = {
            title: input.title,
            body: input.body,
            at: new Date().toISOString(),
          };
          chatGateway.io.emit('system_broadcast', payload);
          return {
            message: 'broadcast sent',
            payload,
            recipients: chatGateway.io.sockets.size,
            audience: 'all',
            audienceIds: [],
            logId: null,
          };
        },
      ),
    };

    // Khởi tạo trực tiếp — controller chỉ giữ tham chiếu, không cần DI.
    const controller = new AdminOpsController(
      userModel as never,
      msgModel as never,
      convModel as never,
      storyModel as never,
      {} as never,
      {} as never,
      { readyState: 1 } as never,
      broadcastService as never,
      {} as never,
      { sendAdminTestPush: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    const res = await controller.broadcast(
      { title: 't', body: 'b' },
      { actorId: 'a1' },
      { ip: '127.0.0.1' } as never,
    );

    expect(res).toMatchObject({ message: 'broadcast sent', recipients: 1 });
    expect(broadcastService.send).toHaveBeenCalledWith(
      expect.objectContaining({ title: 't', body: 'b' }),
      'a1',
      '127.0.0.1',
    );
    expect(chatGateway.io.emit).toHaveBeenCalledWith(
      'system_broadcast',
      expect.objectContaining({ title: 't', body: 'b' }),
    );
  });

  it('audience=ids không có id → 400, không gọi service', async () => {
    const broadcastService = { send: jest.fn() };
    const controller = new AdminOpsController(
      userModel as never,
      msgModel as never,
      convModel as never,
      storyModel as never,
      {} as never,
      {} as never,
      { readyState: 1 } as never,
      broadcastService as never,
      {} as never,
      { sendAdminTestPush: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    await expect(
      controller.broadcast(
        { title: 't', body: 'b', audience: 'ids', audienceIds: [] },
        { actorId: 'a1' },
        { ip: null } as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(broadcastService.send).not.toHaveBeenCalled();
  });
});
