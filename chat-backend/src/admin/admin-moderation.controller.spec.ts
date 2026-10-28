import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminOpsController } from './admin-ops.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportService } from './admin-report.service';
import { ModerationMediaService } from './moderation-media.service';
import { ChatGateway } from '../gateway/chat.gateway';
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
const convModel = { find: jest.fn() };
const msgModel = { find: jest.fn(), countDocuments: jest.fn() };
const storyModel = { find: jest.fn(), countDocuments: jest.fn() };
const reportModel = { find: jest.fn() };
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
        { provide: getModelToken(AudienceList.name), useValue: audienceListModel },
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

    const res = await controller.listStories({ page: 1, limit: 20, active: 'false' });

    expect(storyModel.find).toHaveBeenCalledWith({ isActive: false });
    // Chỉ id hợp lệ mới vào $in.
    expect(userModel.find).toHaveBeenCalledWith({ _id: { $in: [AUTHOR] } });
    expect(res.data[0]).toMatchObject({ authorName: 'Lan', authorAvatar: 'lan.png' });
    expect(res.data[1]).toMatchObject({ authorName: null, authorAvatar: null });
    expect(res).toMatchObject({ total: 2, page: 1, limit: 20 });
  });

  it('messages/search: mặc định bỏ message deleted, resolve senderName + conversationName', async () => {
    msgModel.find.mockReturnValue(
      leanQuery([{ _id: 'm1', senderId: SENDER, conversationId: CONV, content: 'hi' }]),
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

    const res = await controller.searchMessages({ q: 'hi', page: 1, limit: 20 });

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
