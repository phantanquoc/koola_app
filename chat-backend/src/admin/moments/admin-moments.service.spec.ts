/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminMomentsService } from './admin-moments.service';
import { Post } from '../../moments/schemas/post.schema';
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
    ...overrides,
  };
}

const reportModel = { aggregate: jest.fn().mockResolvedValue([]) };
const userModel = { find: jest.fn().mockReturnValue(leanChain([])) };
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
