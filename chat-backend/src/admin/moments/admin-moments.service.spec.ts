/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminMomentsService } from './admin-moments.service';
import { Post } from '../../moments/schemas/post.schema';
import { AudienceList } from '../../moments/schemas/audience-list.schema';
import { Report } from '../schemas/report.schema';
import { User } from '../../users/user.schema';
import { ModerationMediaService } from '../moderation-media.service';
import { AdminAuditService } from '../admin-audit.service';
import { ChatGateway } from '../../gateway/chat.gateway';

const POST_ID = '507f1f77bcf86cd799439030';
const POST_ID2 = '507f1f77bcf86cd799439031';
const AUTHOR = '507f1f77bcf86cd799439001';

function leanChain(result: unknown) {
  const chain: any = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn().mockResolvedValue(result),
  };
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

function makePostModel(overrides: Record<string, unknown> = {}) {
  return {
    find: jest.fn().mockReturnValue(leanChain([])),
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    findByIdAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const reportModel = {
  aggregate: jest.fn().mockResolvedValue([]),
  distinct: jest.fn().mockResolvedValue([]),
};
const userModel = { find: jest.fn().mockReturnValue(leanChain([])) };
const audienceListModel = { find: jest.fn().mockReturnValue(leanChain([])) };
const media = { presignMany: jest.fn().mockResolvedValue(new Map()) };
const audit = { log: jest.fn() };
const emitMock = jest.fn();
const gateway = { io: { to: jest.fn(() => ({ emit: emitMock })) } };

async function build(postModel: ReturnType<typeof makePostModel>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminMomentsService,
      { provide: getModelToken(Post.name), useValue: postModel },
      { provide: getModelToken(Report.name), useValue: reportModel },
      { provide: getModelToken(User.name), useValue: userModel },
      { provide: getModelToken(AudienceList.name), useValue: audienceListModel },
      { provide: ModerationMediaService, useValue: media },
      { provide: AdminAuditService, useValue: audit },
      { provide: ChatGateway, useValue: gateway },
    ],
  }).compile();
  return moduleRef.get(AdminMomentsService);
}

beforeEach(() => {
  jest.clearAllMocks();
  reportModel.aggregate.mockResolvedValue([]);
  userModel.find.mockReturnValue(leanChain([]));
  media.presignMany.mockResolvedValue(new Map());
  emitMock.mockClear();
});

describe('AdminMomentsService.listPosts', () => {
  it('lọc active dạng string, không phải boolean', async () => {
    const postModel = makePostModel();
    const svc = await build(postModel);

    // `?active=false` đến từ HTTP dưới dạng string. Nếu lọc bằng boolean thì
    // `Boolean('false') === true` sẽ lọc ngược.
    await svc.listPosts({ active: 'false' });

    expect(postModel.find).toHaveBeenCalledWith({ isActive: false });
  });

  it('không gửi điều kiện isActive khi tab là Tất cả', async () => {
    const postModel = makePostModel();
    const svc = await build(postModel);

    await svc.listPosts({ active: '' });

    expect(postModel.find).toHaveBeenCalledWith({});
  });

  it('lọc theo tác giả cùng lúc với trạng thái', async () => {
    const postModel = makePostModel();
    const svc = await build(postModel);

    await svc.listPosts({ authorId: AUTHOR, active: 'true' });

    expect(postModel.find).toHaveBeenCalledWith({
      authorId: AUTHOR,
      isActive: true,
    });
  });

  it('ký mọi media của một bài, không chỉ ảnh đầu', async () => {
    const postModel = makePostModel({
      find: jest.fn().mockReturnValue(
        leanChain([
          {
            _id: POST_ID,
            authorId: AUTHOR,
            caption: 'Hai ảnh',
            media: [
              { mediaKey: 'post/a.jpg', mediaType: 'image', thumbnailKey: null },
              { mediaKey: 'post/b.jpg', mediaType: 'image', thumbnailKey: 'post/b-thumb.jpg' },
            ],
            isActive: true,
          },
        ]),
      ),
    });
    const svc = await build(postModel);

    const res = await svc.listPosts({});

    expect(media.presignMany).toHaveBeenCalledWith([
      'post/a.jpg',
      null,
      'post/b.jpg',
      'post/b-thumb.jpg',
    ]);
    expect(res.data[0].media).toHaveLength(2);
  });

  it('đếm báo cáo chờ một aggregate cho cả trang', async () => {
    const postModel = makePostModel({
      find: jest.fn().mockReturnValue(
        leanChain([{ _id: POST_ID, authorId: AUTHOR, caption: 'x', media: [], isActive: true }]),
      ),
    });
    reportModel.aggregate.mockResolvedValue([{ _id: POST_ID, count: 3 }]);
    const svc = await build(postModel);

    const res = await svc.listPosts({});

    expect(reportModel.aggregate).toHaveBeenCalledTimes(1);
    expect(res.data[0].pendingReportCount).toBe(3);
  });

  it('tìm theo tên tác giả: resolve user trước rồi mới dựng $or', async () => {
    const postModel = makePostModel();
    userModel.find.mockReturnValue(leanChain([{ _id: AUTHOR }]));
    const svc = await build(postModel);

    await svc.listPosts({ q: 'Lan' });

    // Bước 1: tra displayName; bước 2: filter post theo id tìm được.
    expect(userModel.find).toHaveBeenCalledWith({ displayName: expect.any(RegExp) });
    const filter = postModel.find.mock.calls[0][0];
    expect(filter.$or).toEqual([
      { caption: expect.any(RegExp) },
      { authorId: { $in: [AUTHOR] } },
    ]);
  });

  it('q chứa ký tự regex thì được escape, không đổi nghĩa query', async () => {
    const postModel = makePostModel();
    const svc = await build(postModel);

    await svc.listPosts({ q: 'a.*b' });

    const filter = postModel.find.mock.calls[0][0];
    expect((filter.$or[0].caption as RegExp).source).toBe('a\\.\\*b');
  });

  it('lọc theo phạm vi hiển thị', async () => {
    const postModel = makePostModel();
    const svc = await build(postModel);

    await svc.listPosts({ scope: 'custom' });

    expect(postModel.find).toHaveBeenCalledWith({ audienceScope: 'custom' });
  });

  it('sort hợp lệ đổi thứ tự; field lạ và dir sai đều 400', async () => {
    const postModel = makePostModel();
    const svc = await build(postModel);

    await svc.listPosts({ sort: 'likeCount:asc' });
    expect(postModel.find.mock.calls[0][0]).toEqual({});
    const chain = postModel.find.mock.results[0].value;
    expect(chain.sort).toHaveBeenCalledWith({ likeCount: 1 });

    await expect(svc.listPosts({ sort: 'hack:desc' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.listPosts({ sort: 'likeCount:sideways' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('enrich: tên danh sách riêng + tên người được gắn thẻ, không trả id thô', async () => {
    const LIST_ID = '507f1f77bcf86cd799439050';
    const MENTION_A = '507f1f77bcf86cd799439051';
    const postModel = makePostModel({
      find: jest.fn().mockReturnValue(
        leanChain([
          {
            _id: POST_ID,
            authorId: AUTHOR,
            caption: 'x',
            media: [],
            isActive: true,
            audienceScope: 'custom',
            audienceListId: LIST_ID,
            mentions: [
              { userId: MENTION_A, username: 'a', offset: 0, length: 2 },
              { userId: 'not-an-id', username: 'b', offset: 3, length: 2 },
            ],
          },
        ]),
      ),
    });
    userModel.find.mockImplementation((filter: any) => {
      if (filter.displayName) return leanChain([]);
      // Tác giả và người được nhắc tới là hai query riêng — phân biệt bằng id.
      const ids: string[] = filter._id?.$in ?? [];
      if (ids.includes(AUTHOR)) return leanChain([{ _id: AUTHOR, displayName: 'Tác giả' }]);
      return leanChain([{ _id: MENTION_A, displayName: 'Người được thẻ' }]);
    });
    audienceListModel.find.mockReturnValue(leanChain([{ _id: LIST_ID, name: 'Gia đình' }]));
    const svc = await build(postModel);

    const res = await svc.listPosts({});

    expect(res.data[0].audienceListName).toBe('Gia đình');
    expect(res.data[0].mentionUserNames).toEqual(['Người được thẻ']);
  });
});

describe('AdminMomentsService.stats', () => {
  it('đếm cả ba trạng thái + phạm vi + số bài có báo cáo chờ', async () => {
    const postModel = makePostModel();
    postModel.countDocuments
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3);
    postModel.aggregate.mockResolvedValue([
      { _id: 'public', count: 6 },
      { _id: 'connections', count: 3 },
      { _id: 'custom', count: 1 },
    ]);
    reportModel.distinct.mockResolvedValue([POST_ID, POST_ID2]);
    const svc = await build(postModel);

    const res = await svc.stats();

    expect(res).toEqual({
      all: 10,
      active: 7,
      inactive: 3,
      reported: 2,
      byScope: { public: 6, connections: 3, custom: 1 },
    });
    // Tab count phải đếm toàn bộ, không áp tab đang chọn.
    expect(postModel.countDocuments.mock.calls[0][0]).toEqual({});
  });
});

describe('AdminMomentsService.findOnePost', () => {
  it('trả bài đã gỡ — moderator cần xem lại nội dung trước khi khôi phục', async () => {
    const postModel = makePostModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: false }),
      }),
    });
    const svc = await build(postModel);

    const res = await svc.findOnePost(POST_ID);
    expect(res.isActive).toBe(false);
  });

  it('404 với id không phải ObjectId, không để Mongoose ném CastError', async () => {
    const svc = await build(makePostModel());
    await expect(svc.findOnePost('khong-phai-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 khi không tìm thấy', async () => {
    const svc = await build(makePostModel());
    await expect(svc.findOnePost(POST_ID2)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminMomentsService.takedownPost / restorePost', () => {
  it('gỡ, phát post.deleted cho tác giả, ghi audit', async () => {
    const postModel = makePostModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: true }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: false }),
      }),
    });
    const svc = await build(postModel);

    const res = await svc.takedownPost(POST_ID, 'admin', '1.2.3.4');

    expect(res.changed).toBe(true);
    expect(postModel.findByIdAndUpdate).toHaveBeenCalledWith(
      POST_ID,
      { $set: { isActive: false } },
      { new: true },
    );
    expect(gateway.io.to).toHaveBeenCalledWith(`user:${AUTHOR}`);
    expect(emitMock).toHaveBeenCalledWith('post.deleted', {
      postId: POST_ID,
      authorId: AUTHOR,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'takedown_post',
        targetType: 'post',
        targetId: POST_ID,
      }),
    );
  });

  it('gỡ lần hai là no-op — không audit, không emit', async () => {
    const postModel = makePostModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: false }),
      }),
    });
    const svc = await build(postModel);

    const res = await svc.takedownPost(POST_ID, 'admin', null);

    expect(res.changed).toBe(false);
    expect(postModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('khôi phục ghi audit nhưng không emit (không có payload đầy đủ)', async () => {
    const postModel = makePostModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: false }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: true }),
      }),
    });
    const svc = await build(postModel);

    const res = await svc.restorePost(POST_ID, 'admin', null);

    expect(res.changed).toBe(true);
    expect(emitMock).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'restore_post', targetType: 'post' }),
    );
  });

  it('khôi phục bài đang hiển thị là no-op', async () => {
    const postModel = makePostModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: POST_ID, authorId: AUTHOR, isActive: true }),
      }),
    });
    const svc = await build(postModel);

    const res = await svc.restorePost(POST_ID, 'admin', null);

    expect(res.changed).toBe(false);
    expect(postModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('404 ở cả hai chiều với id không tồn tại', async () => {
    const svc = await build(makePostModel());
    await expect(svc.takedownPost(POST_ID2, 'a', null)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.restorePost(POST_ID2, 'a', null)).rejects.toBeInstanceOf(NotFoundException);
  });
});
