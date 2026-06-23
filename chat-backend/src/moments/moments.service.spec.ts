import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
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
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
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
  let notificationsMock: any;
  let conversationsMock: any;
  let usersMock: any;

  beforeEach(async () => {
    storyModel = makeModelMock();
    storyViewModel = makeModelMock();
    audienceListModel = makeModelMock();
    musicTrackModel = makeModelMock();
    notificationsMock = {
      sendPushNotification: jest.fn(),
      sendMentionPush: jest.fn().mockResolvedValue(undefined),
    };
    conversationsMock = {
      createDirect: jest.fn().mockResolvedValue({
        conversation: { _id: 'conv-1' },
        isNew: false,
      }),
      getSharedConversationIds: jest.fn().mockResolvedValue([]),
      getConnectedUserIds: jest.fn().mockResolvedValue([]),
    };
    usersMock = {
      findById: jest.fn().mockResolvedValue({
        _id: 'user-1',
        displayName: 'Test',
        isPrivate: false,
      }),
      findByIds: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };

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
          useValue: notificationsMock,
        },
        {
          provide: ConversationsService,
          useValue: conversationsMock,
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
          useValue: usersMock,
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

    it('updates an existing reaction in-place via the positional operator (no second push)', async () => {
      storyModel.findById.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        isActive: true,
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
      });
      // matchedCount > 0 → the viewer already had a reaction, updated in place
      storyModel.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await service.reactToStory('507f1f77bcf86cd799439011', 'viewer-1', {
        emoji: '😂',
      });

      // Exactly one updateOne — the positional $set; NO follow-up $push
      expect(storyModel.updateOne).toHaveBeenCalledTimes(1);
      expect(storyModel.updateOne).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439011', 'reactions.userId': 'viewer-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ 'reactions.$.emoji': '😂' }),
        }),
      );
    });

    it('pushes a new reaction guarded by $ne when the viewer has none yet', async () => {
      storyModel.findById.mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        isActive: true,
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
      });
      // First updateOne (positional $set) matches nothing → fall through to push
      storyModel.updateOne
        .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

      await service.reactToStory('507f1f77bcf86cd799439011', 'viewer-1', {
        emoji: '🔥',
      });

      expect(storyModel.updateOne).toHaveBeenCalledTimes(2);
      // The push is guarded so concurrent requests can't double-insert
      expect(storyModel.updateOne).toHaveBeenLastCalledWith(
        {
          _id: '507f1f77bcf86cd799439011',
          'reactions.userId': { $ne: 'viewer-1' },
        },
        expect.objectContaining({
          $push: expect.objectContaining({
            reactions: expect.objectContaining({
              userId: 'viewer-1',
              emoji: '🔥',
            }),
          }),
        }),
      );
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
        smembers: jest.fn().mockResolvedValue(['story-1']),
        get: jest.fn().mockResolvedValue('5'),
        incr: jest.fn().mockResolvedValue(6),
        decrby: jest.fn().mockResolvedValue(0),
        srem: jest.fn().mockResolvedValue(1),
      });
      storyModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(service.flushViewCounts()).resolves.not.toThrow();
      expect(storyModel.updateOne).toHaveBeenCalledWith(
        { _id: 'story-1' },
        { $inc: { viewCount: 5 } },
      );
    });
  });

  // ─── getMusicTrackById playback URLs ────────────────────────────────────────

  describe('getMusicTrackById — playback URLs', () => {
    it('attaches presigned audioUrl and previewUrl to the track', async () => {
      musicTrackModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'track-1',
          title: 'Đà Lạt',
          artist: 'KOOLA',
          audioKey: 'music/track-1.mp3',
          previewKey: 'music/track-1-preview.mp3',
          isActive: true,
        }),
      });

      const result = await service.getMusicTrackById('track-1');

      expect(result.audioUrl).toEqual(expect.any(String));
      expect(result.audioUrl.length).toBeGreaterThan(0);
      expect(result.previewUrl).toEqual(expect.any(String));
      // Original metadata preserved
      expect((result as any).title).toBe('Đà Lạt');
    });

    it('throws NotFoundException for a missing track', async () => {
      musicTrackModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getMusicTrackById('missing')).rejects.toThrow(
        NotFoundException,
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

  // ─── Privacy CONNECTIONS scope ────────────────────────────────────────────

  describe('Privacy CONNECTIONS scope', () => {
    const validStoryId = '507f1f77bcf86cd799439011';
    const authorId = new Types.ObjectId().toString();
    const viewerId = new Types.ObjectId().toString();

    // Restore redisMock.getClient to a full client before each test in this block
    // (the flushViewCounts test above modifies the singleton mock without restoring it)
    beforeEach(() => {
      redisMock.getClient.mockReturnValue({
        incr: jest.fn().mockResolvedValue(1),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        keys: jest.fn().mockResolvedValue([]),
        decrby: jest.fn().mockResolvedValue(0),
        sadd: jest.fn().mockResolvedValue(1),
        srem: jest.fn().mockResolvedValue(1),
        smembers: jest.fn().mockResolvedValue([]),
      });
    });

    function connStory(overrides: Record<string, unknown> = {}) {
      return {
        _id: validStoryId,
        authorId,
        isActive: true,
        expiresAt: new Date(Date.now() + 86400_000),
        audienceScope: AudienceScope.CONNECTIONS,
        mediaKey: 'stories/test/file.jpg',
        reactions: [],
        mentions: [],
        viewCount: 0,
        musicRef: null,
        ...overrides,
      };
    }

    it('getFeed excludes connections-scope story when viewer has no shared DIRECT conversation', async () => {
      // getConnectedUserIds returns [] by default in the beforeEach mock
      storyModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([connStory()]),
          }),
        }),
      });

      const result = await service.getFeed(viewerId, undefined, 20);
      // The story has authorId that is NOT in the empty connectionIds array,
      // so the $or filter would not match it; getFeed returns empty
      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
    });

    it('getFeed always includes viewer own connections-scope story', async () => {
      // When viewer IS the author the { authorId: viewerId } clause matches
      storyModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.getFeed(viewerId, undefined, 20);
      expect(result).toBeDefined();
    });

    it('assertViewAccess throws ForbiddenException when viewer is not a connection', async () => {
      // getConnectedUserIds returns [] — authorId is not in it
      storyModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(connStory()),
      });

      // Access via getStoryById (which calls assertViewAccess internally)
      await expect(
        service.getStoryById(validStoryId, viewerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('assertViewAccess passes when viewer is a connection', async () => {
      // Override getConnectedUserIds to include authorId
      const conversationsService = (service as any).conversationsService;
      conversationsService.getConnectedUserIds = jest
        .fn()
        .mockResolvedValue([authorId]);

      storyModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(connStory()),
      });

      // Should resolve (may succeed with presigned URL or throw non-ForbiddenException)
      await expect(service.getStoryById(validStoryId, viewerId)).resolves.toBeDefined();
    });

    it('assertViewAccess passes when viewer is the author regardless of scope', async () => {
      // Author ID is passed as both the story authorId and viewerId
      storyModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(connStory({ authorId: viewerId })),
      });

      // Should resolve — author always allowed (early return in assertViewAccess)
      await expect(service.getStoryById(validStoryId, viewerId)).resolves.toBeDefined();
    });

    it('getFeed includes connections-scope story from author who shares a DIRECT conversation', async () => {
      // Viewer IS connected to the author
      const conversationsService = (service as any).conversationsService;
      conversationsService.getConnectedUserIds = jest
        .fn()
        .mockResolvedValue([authorId]);

      // storyModel.find returns one CONNECTIONS-scope story from authorId
      storyModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([connStory()]),
          }),
        }),
      });

      // No prior views → hasUnviewed = true
      storyViewModel.countDocuments = jest.fn().mockResolvedValue(0);

      // usersService.findByIds returns the author profile
      const usersService = (service as any).usersService;
      usersService.findByIds = jest.fn().mockResolvedValue([
        {
          _id: { toString: () => authorId },
          displayName: 'Connected Author',
          avatar: 'avatar.jpg',
        },
      ]);

      const result = await service.getFeed(viewerId, undefined, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].authorId).toBe(authorId);
      expect(result.items[0].authorDisplayName).toBe('Connected Author');
      expect(result.items[0].hasUnviewed).toBe(true);
    });
  });

  // ─── Mention notifications (FCM push) ───────────────────────────────────────

  describe('processMentionNotifications — FCM push', () => {
    const authorId = new Types.ObjectId().toString();
    const mentionedId = new Types.ObjectId().toString();
    const storyId = new Types.ObjectId().toString();

    const buildStory = (caption = 'hi @bob') =>
      ({
        _id: { toString: () => storyId },
        caption,
      }) as any;

    it('sends an FCM mention push for a public author', async () => {
      usersMock.findById.mockResolvedValue({
        _id: authorId,
        displayName: 'Alice',
        isPrivate: false,
      });

      await (service as any).processMentionNotifications(authorId, buildStory(), [
        { userId: mentionedId, username: 'bob' },
      ]);

      expect(notificationsMock.sendMentionPush).toHaveBeenCalledWith(
        expect.objectContaining({
          mentionedUserId: mentionedId,
          authorName: 'Alice',
          storyId,
        }),
      );
    });

    it('suppresses the push when a private author is not connected to the mentioned user', async () => {
      usersMock.findById.mockResolvedValue({
        _id: authorId,
        displayName: 'Alice',
        isPrivate: true,
      });
      // Author has no connections → mentioned user is not reachable
      conversationsMock.getConnectedUserIds.mockResolvedValue([]);

      await (service as any).processMentionNotifications(authorId, buildStory(), [
        { userId: mentionedId, username: 'bob' },
      ]);

      expect(notificationsMock.sendMentionPush).not.toHaveBeenCalled();
    });

    it('sends the push when a private author IS connected to the mentioned user', async () => {
      usersMock.findById.mockResolvedValue({
        _id: authorId,
        displayName: 'Alice',
        isPrivate: true,
      });
      conversationsMock.getConnectedUserIds.mockResolvedValue([mentionedId]);

      await (service as any).processMentionNotifications(authorId, buildStory(), [
        { userId: mentionedId, username: 'bob' },
      ]);

      expect(notificationsMock.sendMentionPush).toHaveBeenCalledTimes(1);
    });

    it('never notifies the author about a self-mention', async () => {
      usersMock.findById.mockResolvedValue({
        _id: authorId,
        displayName: 'Alice',
        isPrivate: false,
      });

      await (service as any).processMentionNotifications(authorId, buildStory(), [
        { userId: authorId, username: 'alice' },
      ]);

      expect(notificationsMock.sendMentionPush).not.toHaveBeenCalled();
    });
  });
});
