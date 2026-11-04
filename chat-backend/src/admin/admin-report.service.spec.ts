import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminReportService } from './admin-report.service';
import { Report } from './schemas/report.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { Post } from '../moments/schemas/post.schema';
import { ConversationDoc } from '../conversations/conversation.schema';
import { ModerationMediaService } from './moderation-media.service';

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
const postModel = { find: jest.fn() };
const convModel = { find: jest.fn() };
const mockMedia = { presignMany: jest.fn() };

function signedMap(entries: Record<string, string | null>) {
  return new Map(Object.entries(entries));
}

describe('AdminReportService', () => {
  let service: AdminReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userModel.find.mockReturnValue(leanQuery([]));
    msgModel.find.mockReturnValue(leanQuery([]));
    storyModel.find.mockReturnValue(leanQuery([]));
    postModel.find.mockReturnValue(leanQuery([]));
    convModel.find.mockReturnValue(leanQuery([]));
    // Mặc định: không ký được gì (map rỗng) để test cũ không phải khai báo.
    mockMedia.presignMany.mockResolvedValue(new Map());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminReportService,
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: getModelToken(Post.name), useValue: postModel },
        { provide: getModelToken(ConversationDoc.name), useValue: convModel },
        { provide: ModerationMediaService, useValue: mockMedia },
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

  // Trước đây moderator chỉ thấy tiêu đề text — phải quyết định "mù" với media.
  it('ký media của tin nhắn bị báo để moderator xem trước khi gỡ', async () => {
    mockMedia.presignMany.mockResolvedValue(
      signedMap({ 'key/photo.jpg': 'https://signed/photo.jpg' }),
    );
    reportModel.find.mockReturnValue(
      leanQuery([{ _id: 'r1', reporterId: REPORTER, targetType: 'message', targetId: MSG, status: 'pending', reason: 'x' }]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    msgModel.find.mockReturnValue(
      leanQuery([
        { _id: MSG, senderId: SELLER, content: '', type: 'image', mediaUrl: 'key/photo.jpg' },
      ]),
    );

    const res = await service.list({ page: 1, limit: 20 });

    expect(mockMedia.presignMany).toHaveBeenCalledWith(['key/photo.jpg']);
    expect(res.data[0].targetMediaUrl).toBe('https://signed/photo.jpg');
    expect(res.data[0].targetMediaType).toBe('image');
  });

  it('ký mediaKey + thumbnailKey của story bị báo', async () => {
    mockMedia.presignMany.mockResolvedValue(
      signedMap({
        'story/v.mp4': 'https://signed/v.mp4',
        'story/v-thumb.jpg': 'https://signed/v-thumb.jpg',
      }),
    );
    const STORY = '507f1f77bcf86cd799439030';
    reportModel.find.mockReturnValue(
      leanQuery([{ _id: 'r1', reporterId: REPORTER, targetType: 'story', targetId: STORY, status: 'pending', reason: 'x' }]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    storyModel.find.mockReturnValue(
      leanQuery([
        {
          _id: STORY,
          authorId: SELLER,
          caption: '',
          mediaKey: 'story/v.mp4',
          thumbnailKey: 'story/v-thumb.jpg',
          mediaType: 'video',
        },
      ]),
    );

    const res = await service.list({ page: 1, limit: 20 });

    expect(res.data[0].targetMediaUrl).toBe('https://signed/v.mp4');
    expect(res.data[0].targetThumbnailUrl).toBe('https://signed/v-thumb.jpg');
    expect(res.data[0].targetMediaType).toBe('video');
  });

  it('không có media thì để null, không ký gì', async () => {
    mockMedia.presignMany.mockResolvedValue(new Map());
    reportModel.find.mockReturnValue(
      leanQuery([{ _id: 'r1', reporterId: REPORTER, targetType: 'message', targetId: MSG, status: 'pending', reason: 'x' }]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    msgModel.find.mockReturnValue(
      leanQuery([{ _id: MSG, senderId: SELLER, content: 'chữ', type: 'text', mediaUrl: '' }]),
    );

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].targetMediaUrl).toBeUndefined();
  });

  it('bài đăng: caption làm tên, media đầu tiên được ký, tên tác giả ở dòng phụ', async () => {
    const POST = '507f1f77bcf86cd799439040';
    mockMedia.presignMany.mockResolvedValue(
      signedMap({
        'post/a.jpg': 'https://signed/a.jpg',
        'post/a-thumb.jpg': 'https://signed/a-thumb.jpg',
        'post/b.jpg': 'https://signed/b.jpg',
      }),
    );
    reportModel.find.mockReturnValue(
      leanQuery([
        { _id: 'r1', reporterId: REPORTER, targetType: 'post', targetId: POST, status: 'pending', reason: 'x' },
      ]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    postModel.find.mockReturnValue(
      leanQuery([
        {
          _id: POST,
          authorId: SELLER,
          caption: 'Bán hàng rẻ',
          media: [
            { mediaKey: 'post/a.jpg', mediaType: 'image', thumbnailKey: 'post/a-thumb.jpg' },
            { mediaKey: 'post/b.jpg', mediaType: 'image' },
          ],
        },
      ]),
    );
    userModel.find.mockReturnValue(
      leanQuery([{ _id: SELLER, displayName: 'Người đăng' }]),
    );

    const res = await service.list({ page: 1, limit: 20 });

    expect(res.data[0].targetName).toBe('Bán hàng rẻ');
    expect(res.data[0].targetDetail).toBe('Bài đăng của Người đăng');
    // Chỉ media đầu — khung báo cáo chỉ render một.
    expect(res.data[0].targetMediaUrl).toBe('https://signed/a.jpg');
    expect(res.data[0].targetThumbnailUrl).toBe('https://signed/a-thumb.jpg');
    expect(res.data[0].targetMediaType).toBe('image');
    // Cả hai key của bài được đưa vào batch ký, không chỉ ảnh đầu.
    expect(mockMedia.presignMany).toHaveBeenCalledWith([
      'post/a.jpg',
      'post/a-thumb.jpg',
      'post/b.jpg',
      undefined,
    ]);
  });

  it('bài đăng không có chữ → nhãn [Bài đăng], không phải chuỗi rỗng', async () => {
    const POST = '507f1f77bcf86cd799439041';
    reportModel.find.mockReturnValue(
      leanQuery([
        { _id: 'r1', reporterId: REPORTER, targetType: 'post', targetId: POST, status: 'pending', reason: 'x' },
      ]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    postModel.find.mockReturnValue(
      leanQuery([{ _id: POST, authorId: SELLER, caption: '   ', media: [] }]),
    );

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].targetName).toBe('[Bài đăng]');
  });

  it('bài đăng không còn tồn tại → không nổ, chỉ thiếu tên', async () => {
    reportModel.find.mockReturnValue(
      leanQuery([
        {
          _id: 'r1', reporterId: REPORTER, targetType: 'post',
          targetId: '507f1f77bcf86cd7994390ff', status: 'pending', reason: 'x',
        },
      ]),
    );
    reportModel.countDocuments.mockResolvedValue(1);
    postModel.find.mockReturnValue(leanQuery([]));

    const res = await service.list({ page: 1, limit: 20 });
    expect(res.data[0].targetName).toBeUndefined();
    expect(res.data[0].reporterName).toBeUndefined();
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
