/**
 * moments-posts.spec.ts
 *
 * Unit + integration-style tests for the Post backend (moments-posts-feed):
 * create / feed / like / comment / share / delete / report, including
 * idempotency and audience scoping.
 *
 * Dependencies are mocked (no real MongoDB/Redis/MinIO). resolvePostView
 * swallows presigned-URL failures, so no MinIO mock is needed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { MomentsService } from './moments.service';
import { Story } from './schemas/story.schema';
import { StoryView } from './schemas/story-view.schema';
import { Highlight } from './schemas/highlight.schema';
import { AudienceList } from './schemas/audience-list.schema';
import { MusicTrack } from './schemas/music-track.schema';
import { Post } from './schemas/post.schema';
import { PostComment } from './schemas/post-comment.schema';
import { PostLike } from './schemas/post-like.schema';
import { CommentLike } from './schemas/comment-like.schema';
import { Report } from '../admin/schemas/report.schema';
import { RedisService } from '../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import { AudienceScope, MediaType } from './schemas/story.schema';
import { CommentPostDto } from './dto/post.dto';
import { PostMediaItemDto } from './dto/post.dto';
import { validate } from 'class-validator';

function oid(): string {
  return new Types.ObjectId().toString();
}

function makeModelMock(savedData: Record<string, unknown> = {}) {
  const instance = {
    ...savedData,
    save: jest.fn().mockResolvedValue({ ...savedData }),
  };
  const mock = jest.fn().mockImplementation(() => instance);
  (mock as any).create = jest.fn();
  (mock as any).findById = jest.fn();
  (mock as any).findOne = jest.fn();
  (mock as any).findOneAndUpdate = jest.fn();
  (mock as any).find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }),
    lean: jest.fn().mockResolvedValue([]),
  });
  (mock as any).updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  (mock as any).updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  (mock as any).deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  (mock as any).countDocuments = jest.fn().mockResolvedValue(0);
  return mock;
}

function postDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    authorId: 'author-1',
    caption: 'hello',
    media: [],
    mentions: [],
    audienceScope: AudienceScope.PUBLIC,
    audienceListId: null,
    likes: [],
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    clientPostId: null,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('MomentsService — posts', () => {
  let service: MomentsService;
  let postModel: any;
  let postCommentModel: any;
  let postLikeModel: any;
  let commentLikeModel: any;
  let audienceListModel: any;
  let reportModel: any;
  let conversationsMock: any;
  let usersMock: any;
  let notificationsMock: any;
  let redisMock: any;

  beforeEach(async () => {
    postModel = makeModelMock();
    postCommentModel = makeModelMock();
    postLikeModel = makeModelMock();
    commentLikeModel = makeModelMock();
    audienceListModel = makeModelMock();
    reportModel = makeModelMock();
    notificationsMock = {
      sendPushNotification: jest.fn(),
      sendMentionPush: jest.fn().mockResolvedValue(undefined),
      sendPostMentionPush: jest.fn().mockResolvedValue(undefined),
      sendCommentPush: jest.fn().mockResolvedValue(undefined),
    };
    redisMock = {
      getClient: jest.fn().mockReturnValue({
        set: jest.fn(),
        smembers: jest.fn().mockResolvedValue([]),
      }),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      tryAcquireLock: jest.fn().mockResolvedValue(true),
      setNXEX: jest.fn().mockResolvedValue(true),
      setEX: jest.fn().mockResolvedValue(undefined),
    };
    conversationsMock = {
      createDirect: jest.fn(),
      getSharedConversationIds: jest.fn().mockResolvedValue([]),
      getConnectedUserIds: jest.fn().mockResolvedValue([]),
    };
    usersMock = {
      findById: jest.fn().mockResolvedValue({
        _id: 'author-1',
        displayName: 'Author',
        isPrivate: false,
      }),
      findByIds: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MomentsService,
        { provide: getModelToken(Story.name), useValue: makeModelMock() },
        { provide: getModelToken(StoryView.name), useValue: makeModelMock() },
        { provide: getModelToken(Highlight.name), useValue: makeModelMock() },
        {
          provide: getModelToken(AudienceList.name),
          useValue: audienceListModel,
        },
        { provide: getModelToken(MusicTrack.name), useValue: makeModelMock() },
        { provide: getModelToken(Post.name), useValue: postModel },
        {
          provide: getModelToken(PostComment.name),
          useValue: postCommentModel,
        },
        { provide: getModelToken(PostLike.name), useValue: postLikeModel },
        {
          provide: getModelToken(CommentLike.name),
          useValue: commentLikeModel,
        },
        { provide: getModelToken(Report.name), useValue: reportModel },
        {
          provide: RedisService,
          useValue: redisMock,
        },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: ConversationsService, useValue: conversationsMock },
        { provide: MessagesService, useValue: {} },
        { provide: UsersService, useValue: usersMock },
      ],
    }).compile();

    service = module.get<MomentsService>(MomentsService);
  });

  // ─── createPost ─────────────────────────────────────────────────────────

  describe('createPost', () => {
    it('creates a text-only public post', async () => {
      postModel.findOne.mockResolvedValue(null);
      const created = postDoc();
      postModel.create.mockResolvedValue({
        ...created,
        toObject: () => created,
      });

      const result = await service.createPost('author-1', {
        caption: 'hello',
        media: [],
        audienceScope: AudienceScope.PUBLIC,
      });

      expect(postModel.create).toHaveBeenCalled();
      expect(result.likeCount).toBe(0);
      expect(result.isActive).toBe(true);
    });

    it('rejects a post with no content', async () => {
      await expect(
        service.createPost('author-1', {
          caption: '',
          media: [],
          audienceScope: AudienceScope.PUBLIC,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects too many attachments', async () => {
      const media = Array.from({ length: 11 }, (_, i) => ({
        mediaKey: `k${i}`,
        mediaType: MediaType.IMAGE,
      }));
      await expect(
        service.createPost('author-1', {
          caption: '',
          media,
          audienceScope: AudienceScope.PUBLIC,
        }),
      ).rejects.toThrow();
    });

    it('rejects video over 60s', async () => {
      await expect(
        service.createPost('author-1', {
          caption: '',
          media: [
            {
              mediaKey: 'v1',
              mediaType: MediaType.VIDEO,
              duration: 61,
            },
          ],
          audienceScope: AudienceScope.PUBLIC,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns the existing post on clientPostId replay', async () => {
      const existing = postDoc({ clientPostId: 'key-1' });
      postModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      const result = await service.createPost('author-1', {
        caption: 'replay',
        media: [],
        audienceScope: AudienceScope.PUBLIC,
        clientPostId: 'key-1',
      });

      expect(postModel.create).not.toHaveBeenCalled();
      expect(result.clientPostId).toBe('key-1');
    });

    it('returns the winner on 11000 race', async () => {
      postModel.findOne
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        })
        .mockReturnValueOnce({
          exec: jest
            .fn()
            .mockResolvedValue(postDoc({ clientPostId: 'race-1' })),
        });
      const err: any = new Error('duplicate');
      err.code = 11000;
      postModel.create.mockRejectedValue(err);

      const result = await service.createPost('author-1', {
        caption: 'race',
        media: [],
        audienceScope: AudienceScope.PUBLIC,
        clientPostId: 'race-1',
      });

      expect(result.clientPostId).toBe('race-1');
    });

    it('rejects custom scope with unowned list', async () => {
      audienceListModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'list-1', ownerId: 'other' }),
      });
      await expect(
        service.createPost('author-1', {
          caption: 'x',
          media: [],
          audienceScope: AudienceScope.CUSTOM,
          audienceListId: 'list-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unknown mention users', async () => {
      usersMock.findByIds.mockResolvedValue([]);
      await expect(
        service.createPost('author-1', {
          caption: 'hi @ghost',
          media: [],
          audienceScope: AudienceScope.PUBLIC,
          mentions: [
            { userId: oid(), username: 'ghost', offset: 3, length: 6 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getPostsFeed ───────────────────────────────────────────────────────

  describe('getPostsFeed', () => {
    it('returns newest-first items with nextCursor', async () => {
      const p1 = postDoc({ caption: 'new' });
      const p2 = postDoc({ caption: 'old' });
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([p1, p2]) }),
        }),
      });
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        }),
      });

      const result = await service.getPostsFeed('viewer-1', undefined, 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].caption).toBe('new');
      expect(result.nextCursor).toBe(p1._id.toString());
    });

    it('excludes inactive posts via query filter', async () => {
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        }),
      });

      await service.getPostsFeed('viewer-1');

      const filter = postModel.find.mock.calls[0][0];
      expect(filter.isActive).toBe(true);
      expect(JSON.stringify(filter.$or)).toContain('public');
    });
  });

  // ─── getPostById ────────────────────────────────────────────────────────

  describe('getPostById', () => {
    it('throws 404 for invalid id', async () => {
      await expect(service.getPostById('bad', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 403 for out-of-scope connections post', async () => {
      const id = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          postDoc({
            _id: id,
            authorId: 'author-9',
            audienceScope: AudienceScope.CONNECTIONS,
          }),
        ),
      });
      conversationsMock.getConnectedUserIds.mockResolvedValue(['someone-else']);

      await expect(service.getPostById(id, 'viewer-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── togglePostLike ─────────────────────────────────────────────────────

  describe('togglePostLike', () => {
    it('likes then unlikes (toggle semantics)', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(postDoc({ _id: id }));
      postLikeModel.findOne.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ _id: oid() }),
      });
      postLikeModel.create.mockResolvedValue({
        postId: id,
        userId: 'viewer-1',
      });
      postLikeModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
      postLikeModel.countDocuments
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      postModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      postModel.findById.mockResolvedValue(postDoc({ _id: id, likeCount: 1 }));

      const first = await service.togglePostLike(id, 'viewer-1');
      expect(first.likedByMe).toBe(true);
      expect(first.likeCount).toBe(1);
      expect(postLikeModel.create).toHaveBeenCalledWith({
        postId: id,
        userId: 'viewer-1',
      });

      const second = await service.togglePostLike(id, 'viewer-1');
      expect(second.likedByMe).toBe(false);
      expect(second.likeCount).toBe(0);
      expect(postLikeModel.deleteOne).toHaveBeenCalledWith({
        postId: id,
        userId: 'viewer-1',
      });
    });

    it('likeCount equals row count per post after toggle', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(postDoc({ _id: id }));
      postLikeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      postLikeModel.create.mockResolvedValue({
        postId: id,
        userId: 'viewer-1',
      });
      postLikeModel.countDocuments.mockResolvedValue(7);
      postModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.togglePostLike(id, 'viewer-1');
      expect(result.likeCount).toBe(7);
      expect(postModel.updateOne).toHaveBeenCalledWith(
        { _id: id },
        { $set: { likeCount: 7 } },
      );
    });

    it('rejects liking an invisible post', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(
        postDoc({
          _id: id,
          authorId: 'author-9',
          audienceScope: AudienceScope.CONNECTIONS,
        }),
      );
      conversationsMock.getConnectedUserIds.mockResolvedValue([]);

      await expect(service.togglePostLike(id, 'viewer-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('removePostLike', () => {
    it('unliking a never-liked post is a no-op (no write)', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(
        postDoc({ _id: id, likes: [], likeCount: 0 }),
      );
      postLikeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      postLikeModel.countDocuments.mockResolvedValue(0);

      const result = await service.removePostLike(id, 'viewer-1');

      expect(result).toEqual({ likedByMe: false, likeCount: 0 });
      expect(postLikeModel.deleteOne).not.toHaveBeenCalled();
    });

    it('unliking a liked post removes the like', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(postDoc({ _id: id, likeCount: 1 }));
      postLikeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: oid() }),
      });
      postLikeModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
      postLikeModel.countDocuments.mockResolvedValue(0);
      postModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.removePostLike(id, 'viewer-1');

      expect(result).toEqual({ likedByMe: false, likeCount: 0 });
      expect(postLikeModel.deleteOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('comment likes', () => {
    it('likes then unlikes a comment (toggle semantics)', async () => {
      const commentId = oid();
      const postId = oid();
      postCommentModel.findById.mockResolvedValue({
        _id: commentId,
        postId,
        isActive: true,
      });
      postModel.findById.mockResolvedValue(postDoc({ _id: postId }));
      commentLikeModel.findOne.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ _id: oid() }),
      });
      commentLikeModel.create.mockResolvedValue({
        commentId,
        userId: 'viewer-1',
      });
      commentLikeModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
      commentLikeModel.countDocuments
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      postCommentModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const first = await service.toggleCommentLike(commentId, 'viewer-1');
      expect(first).toEqual({ likedByMe: true, likeCount: 1 });
      const second = await service.toggleCommentLike(commentId, 'viewer-1');
      expect(second).toEqual({ likedByMe: false, likeCount: 0 });
    });

    it('rejects liking a comment on an invisible post', async () => {
      const commentId = oid();
      const postId = oid();
      postCommentModel.findById.mockResolvedValue({
        _id: commentId,
        postId,
        isActive: true,
      });
      postModel.findById.mockResolvedValue(
        postDoc({
          _id: postId,
          authorId: 'author-9',
          audienceScope: AudienceScope.CONNECTIONS,
        }),
      );
      conversationsMock.getConnectedUserIds.mockResolvedValue([]);
      await expect(
        service.toggleCommentLike(commentId, 'viewer-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('migration', () => {
    it('migrates embedded likes without loss or duplication', async () => {
      const postId = oid();
      const legacy = {
        _id: postId,
        likes: [{ userId: 'u1' }, { userId: 'u2' }],
      };
      async function* gen() {
        yield legacy;
      }
      postModel.find.mockReturnValue({
        cursor: jest.fn().mockReturnValue(gen()),
      });
      postLikeModel.create
        .mockResolvedValueOnce({ postId, userId: 'u1' })
        .mockRejectedValueOnce(
          Object.assign(new Error('dup'), { code: 11000 }),
        );
      postLikeModel.countDocuments.mockResolvedValue(2);
      postModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      redisMock.get.mockResolvedValue(null);

      const result = await service.migratePostLikes();
      expect(result.migrated).toBe(1);
      expect(result.posts).toBe(1);
      expect(postModel.updateOne).toHaveBeenCalledWith(
        { _id: postId },
        { $set: { likeCount: 2 } },
      );
    });
  });

  // ─── share / update / delete / report ───────────────────────────────────

  describe('share/update/delete/report', () => {
    it('sharePost increments and returns a deep link', async () => {
      const id = oid();
      const doc: any = { ...postDoc({ _id: id }), save: jest.fn() };
      postModel.findById.mockResolvedValue(doc);
      redisMock.setNXEX.mockResolvedValue(true);
      postModel.findOneAndUpdate.mockResolvedValue({ shareCount: 4 });

      const result = await service.sharePost(id, 'viewer-1');

      expect(result.shareCount).toBe(4);
      expect(result.deepLink).toBe(`koola://moments/post/${id}`);
      // Legacy `deepLink` stays pinned for existing consumers; the routable
      // share target is `appLink`.
      expect(result.appLink).toBe(`koola://moments/post/${id}`);
    });

    it('repeat share within 24h does not increment', async () => {
      const id = oid();
      postModel.findById.mockImplementation((_pid: string, proj?: unknown) => {
        if (proj) {
          return {
            lean: jest.fn().mockResolvedValue({ _id: id, shareCount: 5 }),
          };
        }
        return Promise.resolve(postDoc({ _id: id, shareCount: 5 }));
      });
      redisMock.setNXEX.mockResolvedValue(false);

      const result = await service.sharePost(id, 'viewer-1');

      expect(result.shareCount).toBe(5);
      expect(postModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('updatePost edits caption; non-author gets 403', async () => {
      const id = oid();
      const doc: any = {
        ...postDoc({ _id: id, authorId: 'author-1' }),
        save: jest.fn().mockResolvedValue(undefined),
        toObject() {
          return { ...postDoc({ _id: id, caption: 'new' }) };
        },
      };
      postModel.findById.mockResolvedValue(doc);
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        }),
      });

      const result = await service.updatePost(id, 'author-1', {
        caption: 'new',
      });
      expect(result.caption).toBe('new');

      await expect(
        service.updatePost(id, 'intruder', { caption: 'hijack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deletePost soft-deletes; non-author gets 403', async () => {
      const id = oid();
      const doc: any = {
        ...postDoc({ _id: id, authorId: 'author-1' }),
        save: jest.fn().mockResolvedValue(undefined),
      };
      postModel.findById.mockResolvedValue(doc);

      await service.deletePost(id, 'author-1');
      expect(doc.isActive).toBe(false);

      await expect(service.deletePost(id, 'intruder')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('reportPost records a moderation report', async () => {
      const id = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });

      const result = await service.reportPost(id, 'viewer-1', {
        reason: 'spam',
      });

      expect(result.success).toBe(true);
      expect(reportModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reporterId: 'viewer-1',
          targetType: 'post',
          targetId: id,
        }),
      );
    });

    it('duplicate report is deduped without a new row error', async () => {
      const id = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      const dup: any = new Error('duplicate');
      dup.code = 11000;
      reportModel.create.mockRejectedValue(dup);

      const result = await service.reportPost(id, 'viewer-1', {
        reason: 'spam',
      });

      expect(result.success).toBe(true);
    });

    it('reported post is hidden from the reporter feed', async () => {
      const p1 = postDoc({ caption: 'hidden' });
      const p2 = postDoc({ caption: 'visible' });
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([p1, p2]) }),
        }),
      });
      reportModel.find.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([{ targetId: (p1 as any)._id.toString() }]),
      });
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        }),
      });

      const result = await service.getPostsFeed('viewer-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].caption).toBe('visible');
    });

    it('createPost persists validated image dimensions', async () => {
      postModel.findOne.mockResolvedValue(null);
      const created = postDoc();
      postModel.create.mockImplementation((body: any) => {
        expect(body.media[0].width).toBe(1080);
        expect(body.media[0].height).toBe(1350);
        return Promise.resolve({ ...created, toObject: () => created });
      });

      await service.createPost('author-1', {
        caption: 'dims',
        media: [
          {
            mediaKey: 'k',
            mediaType: MediaType.IMAGE,
            width: 1080,
            height: 1350,
          },
        ],
        audienceScope: AudienceScope.PUBLIC,
      });

      expect(postModel.create).toHaveBeenCalled();
    });

    it('rejects absurd image dimensions at DTO level', async () => {
      const dto = new PostMediaItemDto();
      dto.mediaKey = 'k';
      dto.mediaType = MediaType.IMAGE;
      (dto as any).width = 0;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ─── comments ───────────────────────────────────────────────────────────

  describe('comments', () => {
    it('commentOnPost creates a top-level comment and increments', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(postDoc({ _id: id }));
      postModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      const created: any = {
        _id: oid(),
        postId: id,
        parentId: null,
        authorId: 'viewer-1',
        content: 'nice!',
        isActive: true,
        toObject() {
          return {
            _id: this._id,
            postId: id,
            authorId: 'viewer-1',
            content: 'nice!',
          };
        },
      };
      postCommentModel.create.mockResolvedValue(created);

      const result = await service.commentOnPost(id, 'viewer-1', {
        content: 'nice!',
      });

      expect(postCommentModel.create).toHaveBeenCalled();
      expect(result.content).toBe('nice!');
    });

    it('rejects overlong comments at DTO level', async () => {
      // DTO validation is enforced by Nest's ValidationPipe; assert the
      // constraint document: CommentPostDto caps content at 1000 chars.
      const dto = new CommentPostDto();
      dto.content = 'x'.repeat(1001);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('replying to a non-existent parent rejects with 404', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(postDoc({ _id: id }));
      const parentId = oid();
      postCommentModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.commentOnPost(id, 'viewer-1', {
          content: 'reply',
          parentId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('listPostComments returns chronological pages', async () => {
      const id = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      const c1 = {
        _id: oid(),
        postId: id,
        authorId: 'a',
        content: '1',
        createdAt: new Date(),
      };
      const c2 = {
        _id: oid(),
        postId: id,
        authorId: 'b',
        content: '2',
        createdAt: new Date(),
      };
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([c1, c2]) }),
        }),
      });
      postCommentModel.countDocuments.mockResolvedValue(0);

      const result = await service.listPostComments(
        id,
        'viewer-1',
        undefined,
        20,
      );

      expect(result.comments).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('listPostComments does not nest replies (the thread lists them itself)', async () => {
      // Regression: the full thread returned replies inside their parent AND
      // `MomentsScreen` maps them as nested rows, so one reply was counted
      // twice in "Xem tất cả N bình luận".
      const id = oid();
      const parentId = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: parentId,
                postId: id,
                parentId: null,
                authorId: 'a',
                content: 'parent',
                createdAt: new Date(),
              },
            ]),
          }),
        }),
      });
      // A reply exists — the preview would resolve it, the thread must not.
      postCommentModel.countDocuments.mockResolvedValue(1);

      const result = await service.listPostComments(id, 'viewer-1');

      expect(result.comments[0].replies).toEqual([]);
      expect(result.comments[0].replyCount).toBe(0);
      // The only count in the thread is the post-level one; no per-comment
      // reply count may be queried (that would nest the replies).
      expect(postCommentModel.countDocuments).toHaveBeenCalledTimes(1);
      expect(postCommentModel.countDocuments).toHaveBeenCalledWith({
        postId: id,
        isActive: true,
        parentId: null,
      });
    });

    it('listPostComments flags soft-deleted rows and returns the live count', async () => {
      // Regression: a post with one live comment and two deleted ones showed
      // "3 bình luận". Deleted rows still occupy their chronological slot (so
      // the cursor survives), but must be flagged and excluded from the count.
      const id = oid();
      const liveId = oid();
      const goneId = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      const docs = [
        {
          _id: goneId,
          postId: id,
          parentId: null,
          authorId: 'a',
          isActive: false,
          createdAt: new Date(1),
        },
        {
          _id: liveId,
          postId: id,
          parentId: null,
          authorId: 'b',
          isActive: true,
          createdAt: new Date(2),
        },
      ];
      // First query = the page, second = the deleted-id lookup.
      postCommentModel.find
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            limit: jest
              .fn()
              .mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) }),
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue([{ _id: goneId }]),
        });
      postCommentModel.countDocuments.mockResolvedValue(1);

      const result = await service.listPostComments(id, 'viewer-1');

      expect(result.comments).toHaveLength(2);
      expect(result.deletedIds).toEqual([goneId.toString()]);
      expect(result.activeCommentCount).toBe(1);
    });

    it('getActiveCommentCount returns the live top-level count', async () => {
      const id = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      postCommentModel.countDocuments.mockResolvedValue(2);

      const result = await service.getActiveCommentCount(id, 'viewer-1');

      expect(result.activeCommentCount).toBe(2);
      expect(postCommentModel.countDocuments).toHaveBeenCalledWith({
        postId: id,
        isActive: true,
        parentId: null,
      });
    });

    it('getActiveCommentCount subtracts the row this client just deleted', async () => {
      // Read-your-writes: the replica counting may not have the soft-delete
      // yet, so the row the caller deleted is subtracted explicitly.
      const id = oid();
      const commentId = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      postCommentModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: commentId,
          postId: id,
          parentId: null,
          isActive: false,
        }),
      });
      postCommentModel.countDocuments.mockResolvedValue(2);

      const result = await service.getActiveCommentCount(
        id,
        'viewer-1',
        commentId,
      );

      expect(result.activeCommentCount).toBe(1);
    });

    it('getActiveCommentCount never subtracts a row of another post', async () => {
      const id = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: id })),
      });
      postCommentModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: oid(),
          postId: oid(),
          parentId: null,
          isActive: false,
        }),
      });
      postCommentModel.countDocuments.mockResolvedValue(0);

      const result = await service.getActiveCommentCount(id, 'viewer-1', oid());

      expect(result.activeCommentCount).toBe(0);
    });

    it('deletePostComment by post author soft-deletes and decrements', async () => {
      const commentId = oid();
      const postId = oid();
      const comment: any = {
        _id: commentId,
        postId,
        authorId: 'commenter',
        isActive: true,
        parentId: null,
        save: jest.fn().mockResolvedValue(undefined),
        toObject() {
          return {
            _id: commentId,
            postId,
            authorId: 'commenter',
            isActive: false,
            parentId: null,
          };
        },
      };
      postCommentModel.findById.mockResolvedValue(comment);
      postCommentModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
      postModel.findById.mockResolvedValue(
        postDoc({ _id: postId, authorId: 'author-1' }),
      );
      postModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      postModel.findById.mockResolvedValueOnce(
        postDoc({ _id: postId, authorId: 'author-1' }),
      );
      (postModel.findById as jest.Mock).mockImplementation(
        (_id: string, _proj?: unknown) =>
          Promise.resolve(
            postDoc({ _id: postId, authorId: 'author-1', commentCount: 2 }),
          ),
      );
      commentLikeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.deletePostComment(commentId, 'author-1');

      expect(result.success).toBe(true);
      expect(comment.isActive).toBe(false);
    });

    it('deleting a parent with 2 replies recounts counts from DB', async () => {
      const commentId = oid();
      const postId = oid();
      const replyId1 = oid();
      const replyId2 = oid();
      const comment: any = {
        _id: commentId,
        postId,
        authorId: 'commenter',
        isActive: true,
        parentId: null,
        save: jest.fn().mockResolvedValue(undefined),
        toObject() {
          return {
            _id: commentId,
            postId,
            authorId: 'commenter',
            isActive: false,
            parentId: null,
          };
        },
      };
      postCommentModel.findById.mockResolvedValue(comment);
      postCommentModel.find.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([{ _id: replyId1 }, { _id: replyId2 }]),
      });
      postCommentModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
      postCommentModel.countDocuments
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2);
      postModel.findById.mockImplementation(() =>
        Promise.resolve(
          postDoc({ _id: postId, authorId: 'author-1', commentCount: 0 }),
        ),
      );
      commentLikeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await service.deletePostComment(commentId, 'author-1');

      expect(postCommentModel.updateMany).toHaveBeenCalledWith(
        { parentId: commentId, isActive: true },
        { $set: { isActive: false } },
      );
      expect(postCommentModel.countDocuments).toHaveBeenCalledWith({
        postId,
        isActive: true,
      });
      expect(postCommentModel.countDocuments).toHaveBeenCalledWith({
        postId,
        parentId: null,
        isActive: true,
      });
      expect(postModel.updateOne).toHaveBeenCalledWith(
        { _id: postId },
        { $set: { commentCount: 4, topLevelCommentCount: 2 } },
      );
    });

    it('listCommentReplies paginates with a stable _id cursor', async () => {
      const postId = oid();
      const commentId = oid();
      postModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(postDoc({ _id: postId })),
      });
      postCommentModel.findById.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue({ _id: commentId, postId, parentId: null }),
      });
      const r1 = {
        _id: oid(),
        postId,
        parentId: commentId,
        authorId: 'a',
        content: 'r1',
        createdAt: new Date(),
      };
      const r2 = {
        _id: oid(),
        postId,
        parentId: commentId,
        authorId: 'b',
        content: 'r2',
        createdAt: new Date(),
      };
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue([r1, r2]) }),
        }),
      });
      commentLikeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.listCommentReplies(
        postId,
        commentId,
        'viewer-1',
        undefined,
        1,
      );

      expect(result.replies).toHaveLength(1);
      expect(result.nextCursor).toBe(String((r1 as any)._id));
      const filter = postCommentModel.find.mock.calls[0][0];
      expect(filter.parentId).toBe(commentId);
    });

    it('feed resolves a post id on BOTH the feed item and its comment preview', async () => {
      // Regression: toObject() snapshots share the same `_id` field as the
      // spread, so `...p, _id: p._id` overwrote the real id with the
      // post-spread value and every post came back with `_id: null`.
      // Both queries run concurrently, so the mock must branch on the filter.
      const postId = oid();
      const commentId = oid();
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([postDoc({ _id: postId })]),
          }),
        }),
      });
      postCommentModel.find.mockImplementation((filter: any) => {
        const docs =
          filter?.parentId != null
            ? [] // replies of the previewed comment
            : [
                {
                  _id: commentId,
                  postId,
                  authorId: 'a',
                  content: 'hi',
                  createdAt: new Date(),
                },
              ];
        return {
          sort: jest.fn().mockReturnValue({
            limit: jest
              .fn()
              .mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) }),
          }),
        };
      });
      postCommentModel.countDocuments.mockResolvedValue(0);

      const result = await service.getPostsFeed('viewer-1');

      expect(result.items[0]._id).toBe(postId.toString());
      expect(result.items[0].comments[0]._id).toBe(commentId.toString());
      // The comment preview must carry the same shape as listPostComments —
      // replies are always present, even when there are none.
      expect(result.items[0].comments[0].replies).toEqual([]);
      expect(result.items[0].comments[0].replyCount).toBe(0);
    });

    it('feed serializes a Mongoose-like document (toObject snapshot)', async () => {
      // getPostsFeed calls .lean(), but getPostById / updatePost pass hydrated
      // documents through the same resolver — cover that path explicitly.
      const postId = oid();
      const doc = {
        ...postDoc({ _id: postId }),
        toObject: () => ({ ...postDoc({ _id: postId }) }),
      };
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([doc]),
          }),
        }),
      });

      const result = await service.getPostsFeed('viewer-1');

      expect(result.items[0]._id).toBe(postId.toString());
    });

    it('rejects documents with no resolvable id instead of emitting null', async () => {
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest
              .fn()
              .mockResolvedValue([{ ...postDoc(), _id: undefined }]),
          }),
        }),
      });

      await expect(service.getPostsFeed('viewer-1')).rejects.toThrow(
        /missing _id/,
      );
    });

    it('deletePostComment by stranger gets 403', async () => {
      const commentId = oid();
      const postId = oid();
      postCommentModel.findById.mockResolvedValue({
        _id: commentId,
        postId,
        authorId: 'commenter',
        isActive: true,
      });
      postModel.findById.mockResolvedValue(
        postDoc({ _id: postId, authorId: 'author-1' }),
      );

      await expect(
        service.deletePostComment(commentId, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
