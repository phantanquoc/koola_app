/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminPostCommentsService } from './admin-post-comments.service';
import { Post } from '../../moments/schemas/post.schema';
import { PostComment } from '../../moments/schemas/post-comment.schema';
import { User } from '../../users/user.schema';
import { AdminAuditService } from '../admin-audit.service';

const POST_ID = '507f1f77bcf86cd799439030';
const ROOT_ID = '507f1f77bcf86cd799439040';
const REPLY_ID = '507f1f77bcf86cd799439041';
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

const audit = { log: jest.fn() };
const userModel = { find: jest.fn().mockReturnValue(leanChain([])) };

function makeModels() {
  return {
    commentModel: {
      find: jest.fn().mockReturnValue(leanChain([])),
      findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      countDocuments: jest.fn().mockResolvedValue(0),
    },
    postModel: {
      findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    },
  };
}

async function build(commentModel: any, postModel: any) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminPostCommentsService,
      { provide: getModelToken(PostComment.name), useValue: commentModel },
      { provide: getModelToken(Post.name), useValue: postModel },
      { provide: getModelToken(User.name), useValue: userModel },
      { provide: AdminAuditService, useValue: audit },
    ],
  }).compile();
  return moduleRef.get(AdminPostCommentsService);
}

beforeEach(() => {
  jest.clearAllMocks();
  userModel.find.mockReturnValue(leanChain([]));
});

describe('AdminPostCommentsService.listComments', () => {
  it('trả cả bình luận đã gỡ — moderator cần thấy để khôi phục', async () => {
    const { commentModel, postModel } = makeModels();
    postModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: POST_ID }),
    });
    // Không có điều kiện isActive trong filter: bình luận đã gỡ vẫn trả về.
    commentModel.find.mockImplementation((filter: any) =>
      leanChain(
        filter.parentId === null || filter.parentId === undefined
          ? [{ _id: ROOT_ID, postId: POST_ID, authorId: AUTHOR, content: 'hi', isActive: false, parentId: null }]
          : [],
      ),
    );
    commentModel.countDocuments.mockResolvedValue(1);
    const svc = await build(commentModel, postModel);

    const res = await svc.listComments(POST_ID, {});

    const rootFilter = commentModel.find.mock.calls[0][0];
    expect(rootFilter.isActive).toBeUndefined();
    expect(res.comments[0]).toMatchObject({ _id: ROOT_ID, isActive: false });
  });

  it('lồng reply vào bình luận gốc, kể cả reply đã gỡ', async () => {
    const { commentModel, postModel } = makeModels();
    postModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: POST_ID }),
    });
    commentModel.find.mockImplementation((filter: any) => {
      if (filter.parentId === null) {
        return leanChain([
          { _id: ROOT_ID, postId: POST_ID, authorId: AUTHOR, content: 'root', isActive: true, parentId: null },
        ]);
      }
      if (filter.parentId && filter.parentId.$in) {
        return leanChain([
          { _id: REPLY_ID, postId: POST_ID, authorId: AUTHOR, content: 'reply', isActive: false, parentId: ROOT_ID },
        ]);
      }
      return leanChain([]);
    });
    commentModel.countDocuments.mockResolvedValue(2);
    const svc = await build(commentModel, postModel);

    const res = await svc.listComments(POST_ID, {});

    expect(res.comments[0].replies).toHaveLength(1);
    expect(res.comments[0].replies[0]).toMatchObject({ _id: REPLY_ID, isActive: false });
  });

  it('404 khi bài không tồn tại', async () => {
    const { commentModel, postModel } = makeModels();
    const svc = await build(commentModel, postModel);
    await expect(svc.listComments(POST_ID, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 với id không phải ObjectId', async () => {
    const { commentModel, postModel } = makeModels();
    const svc = await build(commentModel, postModel);
    await expect(svc.listComments('khong-phai-id', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminPostCommentsService.takedownComment', () => {
  it('gỡ bình luận gốc thì cascade reply và đếm lại counter trên bài', async () => {
    const { commentModel, postModel } = makeModels();
    commentModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: ROOT_ID, postId: POST_ID, parentId: null, isActive: true,
      }),
    });
    commentModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
    commentModel.countDocuments
      .mockResolvedValueOnce(1) // còn 1 bình luận active sau khi gỡ cả cụm
      .mockResolvedValueOnce(0);
    const svc = await build(commentModel, postModel);

    const res = await svc.takedownComment(ROOT_ID, 'admin', null);

    expect(res).toMatchObject({ changed: true, cascaded: 2 });
    expect(commentModel.updateMany).toHaveBeenCalledWith(
      { parentId: ROOT_ID, isActive: true },
      { $set: { isActive: false } },
    );
    // Counter ghi lại từ số đếm thật, không đoán.
    expect(postModel.updateOne).toHaveBeenCalledWith(
      { _id: POST_ID },
      { $set: { commentCount: 1, topLevelCommentCount: 0 } },
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'takedown_post_comment',
        targetType: 'post_comment',
        targetId: ROOT_ID,
      }),
    );
  });

  it('gỡ một reply không cascade ai', async () => {
    const { commentModel, postModel } = makeModels();
    commentModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: REPLY_ID, postId: POST_ID, parentId: ROOT_ID, isActive: true,
      }),
    });
    const svc = await build(commentModel, postModel);

    const res = await svc.takedownComment(REPLY_ID, 'admin', null);

    expect(res.cascaded).toBe(0);
    expect(commentModel.updateMany).not.toHaveBeenCalled();
    expect(postModel.updateOne).toHaveBeenCalled();
  });

  it('gỡ lần hai là no-op — không audit, không đếm lại', async () => {
    const { commentModel, postModel } = makeModels();
    commentModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: ROOT_ID, postId: POST_ID, parentId: null, isActive: false,
      }),
    });
    const svc = await build(commentModel, postModel);

    const res = await svc.takedownComment(ROOT_ID, 'admin', null);

    expect(res.changed).toBe(false);
    expect(audit.log).not.toHaveBeenCalled();
    expect(postModel.updateOne).not.toHaveBeenCalled();
  });

  it('404 id rác / không tồn tại', async () => {
    const { commentModel, postModel } = makeModels();
    const svc = await build(commentModel, postModel);
    await expect(svc.takedownComment('rac', 'a', null)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.takedownComment(ROOT_ID, 'a', null)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminPostCommentsService.restoreComment', () => {
  it('bật lại chính nó, KHÔNG hồi sinh reply bị cascade', async () => {
    const { commentModel, postModel } = makeModels();
    commentModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: ROOT_ID, postId: POST_ID, parentId: null, isActive: false,
      }),
    });
    const svc = await build(commentModel, postModel);

    const res = await svc.restoreComment(ROOT_ID, 'admin', null);

    expect(res.changed).toBe(true);
    expect(commentModel.updateMany).not.toHaveBeenCalled();
    expect(commentModel.updateOne).toHaveBeenCalledWith(
      { _id: ROOT_ID },
      { $set: { isActive: true } },
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'restore_post_comment',
        targetType: 'post_comment',
      }),
    );
  });

  it('khôi phục bình luận đang hiển thị là no-op', async () => {
    const { commentModel, postModel } = makeModels();
    commentModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: ROOT_ID, postId: POST_ID, parentId: null, isActive: true,
      }),
    });
    const svc = await build(commentModel, postModel);

    const res = await svc.restoreComment(ROOT_ID, 'admin', null);

    expect(res.changed).toBe(false);
    expect(commentModel.updateOne).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
