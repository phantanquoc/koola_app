import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MomentsGateway } from './moments.gateway';
import { AudienceList } from './schemas/audience-list.schema';
import { AudienceScope, MediaType } from './schemas/story.schema';
import { ConversationsService } from '../conversations/conversations.service';

/**
 * These tests protect the story-privacy fix: story fanout MUST go to targeted
 * `user:<id>` rooms only, NEVER a namespace-wide broadcast.
 *
 * The mock is deliberately structured so a namespace-level `io.emit(...)` and a
 * targeted `io.to(room).emit(...)` land on DIFFERENT spies:
 *   - `mockIo.emit`  → the namespace broadcast. Must NEVER be called.
 *   - `roomEmit`     → the per-room emit returned by `io.to(room)`.
 *
 * A previous version of this file let `to` return `this`, so both paths hit the
 * same `emit` spy — meaning a regression back to `this.io.emit(...)` would still
 * pass. With the split below, any such regression turns these tests RED.
 */
describe('MomentsGateway', () => {
  let gateway: MomentsGateway;
  let audienceListModel: any;
  let mockIo: { emit: jest.Mock; to: jest.Mock };
  let roomEmit: jest.Mock;
  let conversationsService: any;

  /** Assert every `io.to(...)` call targeted a `user:<id>` room (never global). */
  const expectOnlyUserRooms = () => {
    for (const call of mockIo.to.mock.calls) {
      expect(String(call[0])).toMatch(/^user:/);
    }
  };

  beforeEach(async () => {
    audienceListModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    };

    conversationsService = {
      getConnectedUserIds: jest.fn().mockResolvedValue(['userA', 'userB']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MomentsGateway,
        {
          provide: getModelToken(AudienceList.name),
          useValue: audienceListModel,
        },
        {
          provide: ConversationsService,
          useValue: conversationsService,
        },
      ],
    }).compile();

    gateway = module.get<MomentsGateway>(MomentsGateway);

    // roomEmit is the spy for `io.to(room).emit(...)`. mockIo.emit is the
    // namespace-level broadcast and is kept SEPARATE so we can prove it is
    // never invoked.
    roomEmit = jest.fn();
    mockIo = {
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
    };
    const mockChatGateway = { io: mockIo } as any;
    gateway.setChatGateway(mockChatGateway);
  });

  describe('emitStoryNew', () => {
    it('PUBLIC → only author connections, never namespace-wide', async () => {
      const story = {
        _id: 'story-1',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.PUBLIC,
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      // getConnectedUserIds returns ['userA', 'userB'] per mock
      expect(mockIo.to).toHaveBeenCalledWith('user:userA');
      expect(mockIo.to).toHaveBeenCalledWith('user:userB');
      // author is excluded by the emitStoryNew loop
      expect(mockIo.to).not.toHaveBeenCalledWith('user:author-1');
      expectOnlyUserRooms();

      // the event reached the per-room spy...
      expect(roomEmit).toHaveBeenCalledWith(
        'story.new',
        expect.objectContaining({
          storyId: 'story-1',
          authorId: 'author-1',
          audienceScope: AudienceScope.PUBLIC,
        }),
      );
      expect(roomEmit).toHaveBeenCalledTimes(2);
      // ...and the namespace broadcast was NEVER used.
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('CUSTOM → only audience-list members, author excluded', async () => {
      audienceListModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'list-1',
          memberIds: ['viewer-1', 'viewer-2', 'author-1'],
        }),
      });

      const story = {
        _id: 'story-2',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.CUSTOM,
        audienceListId: 'list-1',
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      expect(mockIo.to).toHaveBeenCalledWith('user:viewer-1');
      expect(mockIo.to).toHaveBeenCalledWith('user:viewer-2');
      expect(mockIo.to).not.toHaveBeenCalledWith('user:author-1');
      expectOnlyUserRooms();

      expect(roomEmit).toHaveBeenCalledWith('story.new', expect.any(Object));
      expect(roomEmit).toHaveBeenCalledTimes(2);
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('CONNECTIONS → only author connections, author excluded', async () => {
      const story = {
        _id: 'story-3',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.CONNECTIONS,
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      expect(mockIo.to).toHaveBeenCalledWith('user:userA');
      expect(mockIo.to).toHaveBeenCalledWith('user:userB');
      expect(mockIo.to).not.toHaveBeenCalledWith('user:author-1');
      expectOnlyUserRooms();

      expect(roomEmit).toHaveBeenCalledTimes(2);
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitStoryReaction', () => {
    it('should include action field when action is remove', async () => {
      await gateway.emitStoryReaction(
        'story-1',
        'author-1',
        'viewer-1',
        '',
        'remove',
      );

      expect(mockIo.to).toHaveBeenCalledWith('user:author-1');
      expectOnlyUserRooms();
      expect(roomEmit).toHaveBeenCalledWith('story.reaction', {
        storyId: 'story-1',
        viewerId: 'viewer-1',
        emoji: '',
        action: 'remove',
      });
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('should default action to add', async () => {
      await gateway.emitStoryReaction('story-1', 'author-1', 'viewer-1', '❤️');

      expect(roomEmit).toHaveBeenCalledWith('story.reaction', {
        storyId: 'story-1',
        viewerId: 'viewer-1',
        emoji: '❤️',
        action: 'add',
      });
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitStoryDeleted', () => {
    it('PUBLIC → author connections + author, never namespace-wide', async () => {
      await gateway.emitStoryDeleted({
        _id: 'story-1',
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
      } as any);

      // getConnectedUserIds mock returns ['userA', 'userB']; author is INCLUDED
      // for deletions (they hold the story in their own feed state).
      expect(mockIo.to).toHaveBeenCalledWith('user:userA');
      expect(mockIo.to).toHaveBeenCalledWith('user:userB');
      expect(mockIo.to).toHaveBeenCalledWith('user:author-1');
      expectOnlyUserRooms();

      expect(roomEmit).toHaveBeenCalledWith('story.deleted', {
        storyId: 'story-1',
        authorId: 'author-1',
      });
      expect(roomEmit).toHaveBeenCalledTimes(3);
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('CONNECTIONS → permitted viewers + author, never namespace-wide', async () => {
      await gateway.emitStoryDeleted({
        _id: 'story-2',
        authorId: 'author-1',
        audienceScope: AudienceScope.CONNECTIONS,
      } as any);

      expect(mockIo.to).toHaveBeenCalledWith('user:userA');
      expect(mockIo.to).toHaveBeenCalledWith('user:userB');
      expect(mockIo.to).toHaveBeenCalledWith('user:author-1');
      expectOnlyUserRooms();

      expect(roomEmit).toHaveBeenCalledTimes(3);
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });

  describe('resolvePermittedViewers', () => {
    it('returns getConnectedUserIds result for CONNECTIONS scope', async () => {
      const story = {
        _id: 'story-conn',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.CONNECTIONS,
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      expect(conversationsService.getConnectedUserIds).toHaveBeenCalledWith(
        'author-1',
      );
      expect(mockIo.to).toHaveBeenCalledWith('user:userA');
      expect(mockIo.to).toHaveBeenCalledWith('user:userB');
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('returns AudienceList memberIds for CUSTOM scope', async () => {
      audienceListModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'list-custom',
          memberIds: ['viewer-x', 'viewer-y', 'author-1'],
        }),
      });

      const story = {
        _id: 'story-custom',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.CUSTOM,
        audienceListId: 'list-custom',
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      expect(mockIo.to).toHaveBeenCalledWith('user:viewer-x');
      expect(mockIo.to).toHaveBeenCalledWith('user:viewer-y');
      expect(mockIo.to).not.toHaveBeenCalledWith('user:author-1');
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('CONNECTIONS with no connections → emits to nobody (no global fallback)', async () => {
      conversationsService.getConnectedUserIds = jest
        .fn()
        .mockResolvedValue([]);

      const story = {
        _id: 'story-lonely',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.CONNECTIONS,
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      // No targeted emits — and crucially NO namespace-wide fallback either.
      expect(mockIo.to).not.toHaveBeenCalled();
      expect(roomEmit).not.toHaveBeenCalled();
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });
});
