import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminReportService } from './admin-report.service';
import { Report } from './schemas/report.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { ConversationDoc } from '../conversations/conversation.schema';

const ACTOR = '507f1f77bcf86cd799439001';
const REPORTER = '507f1f77bcf86cd799439002';
const SELLER = '507f1f77bcf86cd799439003';
const MSG = '507f1f77bcf86cd799439010';
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

const reportModel = {
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
  collection: { findOne: jest.fn() },
};
const userModel = { find: jest.fn() };
const msgModel = { find: jest.fn() };
const storyModel = { find: jest.fn() };
const convModel = { find: jest.fn() };

describe('AdminReportService', () => {
  let service: AdminReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userModel.find.mockReturnValue(leanQuery([]));
    msgModel.find.mockReturnValue(leanQuery([]));
    storyModel.find.mockReturnValue(leanQuery([]));
    convModel.find.mockReturnValue(leanQuery([]));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminReportService,
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: getModelToken(ConversationDoc.name), useValue: convModel },
      ],
    }).compile();
    service = module.get(AdminReportService);
  });

  it('resolve tên người báo cáo và nội dung tin nhắn thay vì ObjectId', async () => {
    reportModel.find.mockReturnValue(
      leanQuery([
        { _id: 'r1', reporterId: REPORTER, targetType: 'message', targetId: MSG, status: 'pending', reason: 'spam' },
      ]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    msgModel.find.mockReturnValue(
      leanQuery([{ _id: MSG, senderId: SELLER, content: 'Mua hàng giá rẻ', type: 'text' }]),
    );
    userModel.find.mockReturnValue(
      leanQuery([
        { _id: REPORTER, displayName: 'Người báo cáo' },
        { _id: SELLER, displayName: 'Người bán' },
      ]),
    );

    const res = await service.list({ page: 1, limit: 20 });

    expect(res.data[0].reporterName).toBe('Người báo cáo');
    expect(res.data[0].targetName).toBe('Mua hàng giá rẻ');
    expect(res.data[0].targetDetail).toBe('Tin nhắn của Người bán');
  });

  // Tin nhắn ảnh không có chữ — ô trống khiến moderator tưởng báo cáo lỗi.
  it('mô tả tin nhắn media bằng loại thay vì chuỗi rỗng', async () => {
    reportModel.find.mockReturnValue(
      leanQuery([{ _id: 'r1', reporterId: REPORTER, targetType: 'message', targetId: MSG, status: 'pending', reason: 'x' }]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    msgModel.find.mockReturnValue(
      leanQuery([{ _id: MSG, senderId: SELLER, content: '', type: 'image' }]),
    );

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].targetName).toBe('[Ảnh]');
  });

  it('hội thoại direct ghép tên thành viên khi không có tên nhóm', async () => {
    reportModel.find.mockReturnValue(
      leanQuery([
        { _id: 'r1', reporterId: REPORTER, targetType: 'conversation', targetId: CONV, status: 'pending', reason: 'x' },
      ]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    convModel.find.mockReturnValue(
      leanQuery([
        { _id: CONV, name: null, type: 'direct', members: [{ userId: REPORTER }, { userId: SELLER }] },
      ]),
    );
    userModel.find.mockReturnValue(
      leanQuery([
        { _id: REPORTER, displayName: 'An' },
        { _id: SELLER, displayName: 'Bình' },
      ]),
    );

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].targetName).toBe('An - Bình');
    expect(res.data[0].targetDetail).toBe('2 thành viên');
  });

  it('findOne fallback đọc collection khi id không phải ObjectId (seed data)', async () => {
    reportModel.findById.mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('Cast to ObjectId failed')),
    });
    reportModel.collection.findOne.mockResolvedValue({
      _id: 'seed-report-1', reporterId: REPORTER, targetType: 'user', targetId: REPORTER, status: 'pending', reason: 'x',
    });
    userModel.find.mockReturnValue(leanQuery([{ _id: REPORTER, displayName: 'An' }]));

    const res = await service.findOne('seed-report-1');
    expect(res._id).toBe('seed-report-1');
    expect(res.targetName).toBe('An');
  });

  it('findOne trả 404 khi id rác và collection cũng không có', async () => {
    reportModel.findById.mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('Cast to ObjectId failed')),
    });
    reportModel.collection.findOne.mockResolvedValue(null);

    await expect(service.findOne('not-an-id')).rejects.toThrow('Report not found');
  });

  it('findOne trả 404 khi không tồn tại', async () => {
    reportModel.findById.mockReturnValue(leanQuery(null));
    await expect(service.findOne('507f1f77bcf86cd7994390ff')).rejects.toThrow(
      'Report not found',
    );
  });

  it('không crash khi gặp targetId dạng chuỗi (seed/dev data)', async () => {
    reportModel.find.mockReturnValue(
      leanQuery([
        { _id: 'seed-report-1', reporterId: 'seed-reporter-1', targetType: 'message', targetId: 'seed-msg-1', status: 'pending', reason: 'x' },
        { _id: 'seed-report-4', reporterId: 'seed-reporter-4', targetType: 'conversation', targetId: 'seed-conv-1', status: 'pending', reason: 'y' },
      ]),
    );
    reportModel.countDocuments.mockResolvedValue(2);

    const res = await service.list({ page: 1, limit: 20 });

    // Không query $in với id không hợp lệ (Mongoose sẽ ném CastError → 500)
    expect(msgModel.find).not.toHaveBeenCalled();
    expect(convModel.find).not.toHaveBeenCalled();
    expect(res.data).toHaveLength(2);
    expect(res.data[0].targetName).toBeUndefined();
  });

  // Trang Hội thoại dùng chung endpoint này để lấy báo cáo cũ của target;
  // filter phải đi thẳng xuống query, không lọc ở client.
  it('giữ filter status/targetType/targetId trong query', async () => {
    reportModel.find.mockReturnValue(leanQuery([]));
    reportModel.countDocuments.mockResolvedValue(0);

    await service.list({
      page: 1,
      limit: 5,
      status: 'pending',
      targetType: 'message',
      targetId: MSG,
    });

    expect(reportModel.find).toHaveBeenCalledWith({
      status: 'pending',
      targetType: 'message',
      targetId: MSG,
    });
  });
});
