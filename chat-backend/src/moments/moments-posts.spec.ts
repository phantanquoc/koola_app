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
import { Report } from '../admin/schemas/report.schema';
import { RedisService } from '../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import { AudienceScope, MediaType } from './schemas/story.schema';
import { CommentPostDto } from './dto/post.dto';
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
  let audienceListModel: any;
  let reportModel: any;
  let conversationsMock: any;
  let usersMock: any;
  let notificationsMock: any;

  beforeEach(async () => {
    postModel = makeModelMock();
    postCommentModel = makeModelMock();
    audienceListModel = makeModelMock();
    reportModel = makeModelMock();
    notificationsMock = {
      sendPushNotification: jest.fn(),
      sendMentionPush: jest.fn().mockResolvedValue(undefined),
      sendPostMentionPush: jest.fn().mockResolvedValue(undefined),
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
        { provide: getModelToken(Report.name), useValue: reportModel },
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue({
              set: jest.fn(),
              smembers: jest.fn().mockResolvedValue([]),
            }),
            get: jest.fn().mockResolvedValue(null),
            del: jest.fn().mockResolvedValue(undefined),
            tryAcquireLock: jest.fn().mockResolvedValue(true),
          },
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
          exec: jest.fn().mockResolvedValue(postDoc({ clientPostId: 'race-1' })),
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
        lean: jest
          .fn()
          .mockResolvedValue({ _id: 'list-1', ownerId: 'other' }),
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
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([p1, p2]) }),
        }),
      });
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
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
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
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

      // First call: not liked yet → like
      const unliked: any = {
        ...postDoc({ _id: id }),
        likes: [],
        likeCount: 0,
      };
      postModel.findById.mockResolvedValue(unliked);
      const liked: any = {
        ...postDoc({ _id: id }),
        likes: [{ userId: 'viewer-1', createdAt: new Date() }],
        likeCount: 1,
      };
      postModel.findOneAndUpdate.mockResolvedValue(liked);

      const first = await service.togglePostLike(id, 'viewer-1');
      expect(first.likedByMe).toBe(true);
      expect(first.likeCount).toBe(1);

      // Second call: already liked → unlike
      postModel.findById.mockResolvedValue(liked);
      const unlikedAgain: any = {
        ...postDoc({ _id: id }),
        likes: [],
        likeCount: 0,
      };
      postModel.findOneAndUpdate.mockResolvedValue(unlikedAgain);

      const second = await service.togglePostLike(id, 'viewer-1');
      expect(second.likedByMe).toBe(false);
      expect(second.likeCount).toBe(0);
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

      const result = await service.removePostLike(id, 'viewer-1');

      expect(result).toEqual({ likedByMe: false, likeCount: 0 });
      expect(postModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('unliking a liked post removes the like', async () => {
      const id = oid();
      postModel.findById.mockResolvedValue(
        postDoc({
          _id: id,
          likes: [{ userId: 'viewer-1', createdAt: new Date() }],
          likeCount: 1,
        }),
      );
      postModel.findOneAndUpdate.mockResolvedValue(
        postDoc({ _id: id, likes: [], likeCount: 0 }),
      );

      const result = await service.removePostLike(id, 'viewer-1');

      expect(result).toEqual({ likedByMe: false, likeCount: 0 });
      expect(postModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── share / update / delete / report ───────────────────────────────────

  describe('share/update/delete/report', () => {
    it('sharePost increments and returns a deep link', async () => {
      const id = oid();
      const doc: any = { ...postDoc({ _id: id }), save: jest.fn() };
      postModel.findById.mockResolvedValue(doc);
      postModel.findOneAndUpdate.mockResolvedValue({ shareCount: 4 });

      const result = await service.sharePost(id, 'viewer-1');

      expect(result.shareCount).toBe(4);
      expect(result.deepLink).toBe(`koola://moments/post/${id}`);
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
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
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
          return { _id: this._id, postId: id, authorId: 'viewer-1', content: 'nice!' };
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
      const c1 = { _id: oid(), postId: id, authorId: 'a', content: '1', createdAt: new Date() };
      const c2 = { _id: oid(), postId: id, authorId: 'b', content: '2', createdAt: new Date() };
      postCommentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([c1, c2]) }),
        }),
      });
      postCommentModel.countDocuments.mockResolvedValue(0);

      const result = await service.listPostComments(id, 'viewer-1', undefined, 20);

      expect(result.comments).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('deletePostComment by post author soft-deletes and decrements', async () => {
      const commentId = oid();
      const postId = oid();
      const comment: any = {
        _id: commentId,
        postId,
        authorId: 'commenter',
        isActive: true,
        save: jest.fn().mockResolvedValue(undefined),
      };
      postCommentModel.findById.mockResolvedValue(comment);
      postModel.findById.mockResolvedValue(postDoc({ _id: postId, authorId: 'author-1' }));
      postModel.findOneAndUpdate.mockResolvedValue({ commentCount: 2 });

      const result = await service.deletePostComment(commentId, 'author-1');

      expect(result.success).toBe(true);
      expect(comment.isActive).toBe(false);
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
      postModel.findById.mockResolvedValue(postDoc({ _id: postId, authorId: 'author-1' }));

      await expect(
        service.deletePostComment(commentId, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
