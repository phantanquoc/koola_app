import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { MomentsService, ALLOWED_REACTIONS } from './moments.service';
import { Story } from './schemas/story.schema';
import { StoryView } from './schemas/story-view.schema';
import { Highlight } from './schemas/highlight.schema';
import { AudienceList } from './schemas/audience-list.schema';
import { MusicTrack } from './schemas/music-track.schema';
import { RedisService } from '../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import { AudienceScope, MediaType } from './schemas/story.schema';

// ─── Model Mock Factory ───────────────────────────────────────────────────────

function makeModelMock(savedData: Record<string, unknown> = {}) {
  const instance = {
    ...savedData,
    save: jest.fn().mockResolvedValue({ ...savedData }),
  };
  const mock = jest.fn().mockImplementation(() => instance);
  (mock as any).create = jest.fn();
  (mock as any).findById = jest.fn();
  (mock as any).findOne = jest.fn();
  (mock as any).find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }),
    lean: jest.fn().mockResolvedValue([]),
  });
  (mock as any).updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  (mock as any).deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  (mock as any).countDocuments = jest.fn().mockResolvedValue(0);
  return mock;
}

// ─── Redis Mock ───────────────────────────────────────────────────────────────

const redisMock = {
  getClient: jest.fn().mockReturnValue({
    incr: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    decrby: jest.fn().mockResolvedValue(0),
  }),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(undefined),
};

describe('MomentsService', () => {
  let service: MomentsService;
  let storyModel: any;
  let storyViewModel: any;
  let audienceListModel: any;
  let musicTrackModel: any;

  beforeEach(async () => {
    storyModel = makeModelMock();
    storyViewModel = makeModelMock();
    audienceListModel = makeModelMock();
    musicTrackModel = makeModelMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MomentsService,
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: getModelToken(StoryView.name), useValue: storyViewModel },
        { provide: getModelToken(Highlight.name), useValue: makeModelMock() },
        {
          provide: getModelToken(AudienceList.name),
          useValue: audienceListModel,
        },
        { provide: getModelToken(MusicTrack.name), useValue: musicTrackModel },
        { provide: RedisService, useValue: redisMock },
        {
          provide: NotificationsService,
          useValue: { sendPushNotification: jest.fn() },
        },
        {
          provide: ConversationsService,
          useValue: {
            createDirect: jest.fn().mockResolvedValue({
              conversation: { _id: 'conv-1' },
              isNew: false,
            }),
            getSharedConversationIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: MessagesService,
          useValue: {
            sendMessageWithStoryReply: jest.fn().mockResolvedValue({
              message: { _id: 'msg-1' },
            }),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              _id: 'user-1',
              displayName: 'Test',
              isPrivate: false,
            }),
            findByIds: jest.fn().mockResolvedValue([]),
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<MomentsService>(MomentsService);
  });

  // ─── createStory ───────────────────────────────────────────────────────────

  describe('createStory', () => {
    it('should reject video longer than 60s', async () => {
      await expect(
        service.createStory('author-1', {
          mediaKey: 'k1',
          mediaType: MediaType.VIDEO,
          duration: 61,
          audienceScope: AudienceScope.PUBLIC,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject custom scope without audienceListId', async () => {
      await expect(
        service.createStory('author-1', {
          mediaKey: 'k1',
          mediaType: MediaType.IMAGE,
          audienceScope: AudienceScope.CUSTOM,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject custom scope with unowned audience list', async () => {
      audienceListModel.findById.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue({ _id: 'list-1', ownerId: 'other-user' }),
      });
      await expect(
        service.createStory('author-1', {
          mediaKey: 'k1',
          mediaType: MediaType.IMAGE,
          audienceScope: AudienceScope.CUSTOM,
          audienceListId: 'list-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject inactive music track', async () => {
      musicTrackModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'track-1', isActive: false }),
      });
      await expect(
        service.createStory('author-1', {
          mediaKey: 'k1',
          mediaType: MediaType.IMAGE,
          audienceScope: AudienceScope.PUBLIC,
          musicRef: { trackId: '507f1f77bcf86cd799439011', startMs: 0 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a public image story successfully', async () => {
      const fakeStory = {
        _id: 'story-1',
        storyGroupId: '',
        authorId: 'author-1',
        mediaKey: 'k1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.PUBLIC,
        isActive: true,
        reactions: [],
        overFlowIndex: 1,
        toString: () => 'story-1',
      };
      storyModel.create.mockResolvedValue(fakeStory);
      storyModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.createStory('author-1', {
        mediaKey: 'k1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.PUBLIC,
      });

      expect(storyModel.create).toHaveBeenCalled();
    });
  });

  // ─── recordView ────────────────────────────────────────────────────────────

  describe('recordView', () => {
    it('should silently succeed on duplicate view (E11000)', async () => {
      const future = new Date(Date.now() + 60000);
      storyModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'story-1',
          storyGroupId: 'story-1',
          authorId: 'author-1',
          expiresAt: future,
          audienceScope: AudienceScope.PUBLIC,
          isActive: true,
        }),
      });
      storyViewModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.recordView('507f1f77bcf86cd799439011', 'viewer-1'),
      ).resolves.not.toThrow();
    });

    it('should return 410 on expired story', async () => {
      const past = new Date(Date.now() - 60000);
      storyModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'story-1',
          expiresAt: past,
          audienceScope: AudienceScope.PUBLIC,
          isActive: true,
        }),
      });

      await expect(
        service.recordView('507f1f77bcf86cd799439011', 'viewer-1'),
      ).rejects.toThrow(GoneException);
    });
  });

  // ─── reactToStory ──────────────────────────────────────────────────────────

  describe('reactToStory', () => {
    it('should reject unsupported emoji', async () => {
      // reactToStory calls findById (returns Mongoose document, not lean)
      storyModel.findById.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        isActive: true,
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
      });

      await expect(
        service.reactToStory('507f1f77bcf86cd799439011', 'viewer-1', {
          emoji: '🚀',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid reaction emoji', async () => {
      storyModel.findById.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        isActive: true,
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
      });
      storyModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.reactToStory('507f1f77bcf86cd799439011', 'viewer-1', {
          emoji: '❤️',
        }),
      ).resolves.not.toThrow();
    });
  });

  // ─── commentOnStory ────────────────────────────────────────────────────────

  describe('commentOnStory', () => {
    it('should reject self-comment', async () => {
      storyModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'story-1',
          authorId: 'author-1',
          audienceScope: AudienceScope.PUBLIC,
          expiresAt: new Date(Date.now() + 60000),
          isActive: true,
        }),
      });

      await expect(
        service.commentOnStory('507f1f77bcf86cd799439011', 'author-1', {
          content: 'own comment',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── ALLOWED_REACTIONS set ─────────────────────────────────────────────────

  it('should have correct allowed reaction set', () => {
    expect(ALLOWED_REACTIONS.has('❤️')).toBe(true);
    expect(ALLOWED_REACTIONS.has('😂')).toBe(true);
    expect(ALLOWED_REACTIONS.has('🚀')).toBe(false);
    expect(ALLOWED_REACTIONS.size).toBe(7);
  });

  // ─── flushViewCounts ──────────────────────────────────────────────────────

  describe('flushViewCounts', () => {
    it('should flush pending view counts to Mongo', async () => {
      redisMock.getClient.mockReturnValue({
        keys: jest.fn().mockResolvedValue(['moments:story:story-1:views']),
        get: jest.fn().mockResolvedValue('5'),
        incr: jest.fn().mockResolvedValue(6),
        decrby: jest.fn().mockResolvedValue(0),
      });
      storyModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(service.flushViewCounts()).resolves.not.toThrow();
      expect(storyModel.updateOne).toHaveBeenCalledWith(
        { _id: 'story-1' },
        { $inc: { viewCount: 5 } },
      );
    });
  });

  // ─── createStory with mentions ────────────────────────────────────────────

  describe('createStory — mentions validation', () => {
    it('should throw BadRequestException for invalid mention userId', async () => {
      const usersService = (service as any).usersService;
      usersService.findByIds.mockResolvedValue([]); // no valid users found

      storyModel.create.mockResolvedValue({
        _id: 'story-1',
        authorId: 'author-1',
        mediaType: 'image',
        audienceScope: AudienceScope.PUBLIC,
        isActive: true,
        reactions: [],
      });

      await expect(
        service.createStory('author-1', {
          mediaKey: 'k1',
          mediaType: MediaType.IMAGE,
          audienceScope: AudienceScope.PUBLIC,
          mentions: [
            {
              userId: '507f1f77bcf86cd799439099',
              username: 'baduser',
              offset: 0,
              length: 8,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should persist story with valid mentions', async () => {
      const usersService = (service as any).usersService;
      usersService.findByIds.mockResolvedValue([
        {
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          displayName: 'good',
        },
      ]);

      const fakeStory = {
        _id: 'story-1',
        storyGroupId: 'story-1',
        authorId: 'author-1',
        mediaKey: 'k1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.PUBLIC,
        isActive: true,
        reactions: [],
        overFlowIndex: 1,
      };
      storyModel.create.mockResolvedValue(fakeStory);
      storyModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.createStory('author-1', {
          mediaKey: 'k1',
          mediaType: MediaType.IMAGE,
          audienceScope: AudienceScope.PUBLIC,
          mentions: [
            {
              userId: '507f1f77bcf86cd799439011',
              username: 'good',
              offset: 0,
              length: 5,
            },
          ],
        }),
      ).resolves.not.toThrow();

      expect(storyModel.create).toHaveBeenCalled();
    });
  });

  // ─── reactToStory on expired story ────────────────────────────────────────

  describe('reactToStory — expiry guard', () => {
    it('should throw GoneException on expired story', async () => {
      const past = new Date(Date.now() - 60000);
      storyModel.findById.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        isActive: true,
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
        expiresAt: past,
      });

      await expect(
        service.reactToStory('507f1f77bcf86cd799439011', 'viewer-1', {
          emoji: '❤️',
        }),
      ).rejects.toThrow(GoneException);
    });
  });

  // ─── commentOnStory on expired story ──────────────────────────────────────

  describe('commentOnStory — expiry guard', () => {
    it('should throw GoneException on expired story', async () => {
      const past = new Date(Date.now() - 60000);
      storyModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'story-1',
          authorId: 'author-1',
          audienceScope: AudienceScope.PUBLIC,
          expiresAt: past,
          isActive: true,
        }),
      });

      await expect(
        service.commentOnStory('507f1f77bcf86cd799439011', 'viewer-1', {
          content: 'test',
        }),
      ).rejects.toThrow(GoneException);
    });
  });

  // ─── removeReaction — silent no-op ────────────────────────────────────────

  describe('removeReaction', () => {
    it('should return silently when story not found', async () => {
      storyModel.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(
        service.removeReaction('507f1f77bcf86cd799439011', 'viewer-1'),
      ).resolves.not.toThrow();
    });
  });
});
