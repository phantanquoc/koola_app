import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MomentsGateway } from './moments.gateway';
import { AudienceList } from './schemas/audience-list.schema';
import { AudienceScope, MediaType } from './schemas/story.schema';

describe('MomentsGateway', () => {
  let gateway: MomentsGateway;
  let audienceListModel: any;
  let mockIo: any;

  beforeEach(async () => {
    audienceListModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MomentsGateway,
        { provide: getModelToken(AudienceList.name), useValue: audienceListModel },
      ],
    }).compile();

    gateway = module.get<MomentsGateway>(MomentsGateway);

    // Mock the ChatGateway reference with a mock io
    mockIo = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };
    const mockChatGateway = { io: mockIo } as any;
    gateway.setChatGateway(mockChatGateway);
  });

  describe('emitStoryNew', () => {
    it('should broadcast to namespace for PUBLIC scope', async () => {
      const story = {
        _id: 'story-1',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.PUBLIC,
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      expect(mockIo.emit).toHaveBeenCalledWith('story.new', expect.objectContaining({
        storyId: 'story-1',
        authorId: 'author-1',
        audienceScope: AudienceScope.PUBLIC,
      }));
      // Should NOT call .to() for public
      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it('should emit to user rooms for CUSTOM scope', async () => {
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

      // Should emit to viewer-1 and viewer-2, but NOT author-1
      expect(mockIo.to).toHaveBeenCalledWith('user:viewer-1');
      expect(mockIo.to).toHaveBeenCalledWith('user:viewer-2');
      expect(mockIo.to).not.toHaveBeenCalledWith('user:author-1');
    });

    it('should exclude author from CONNECTIONS scope recipients', async () => {
      const story = {
        _id: 'story-3',
        authorId: 'author-1',
        mediaType: MediaType.IMAGE,
        audienceScope: AudienceScope.CONNECTIONS,
        createdAt: new Date(),
      } as any;

      await gateway.emitStoryNew(story);

      // CONNECTIONS currently returns [authorId] via resolvePermittedViewers,
      // but author is excluded, so no .to() calls
      expect(mockIo.to).not.toHaveBeenCalledWith('user:author-1');
    });
  });

  describe('emitStoryReaction', () => {
    it('should include action field when action is remove', async () => {
      await gateway.emitStoryReaction('story-1', 'author-1', 'viewer-1', '', 'remove');

      expect(mockIo.to).toHaveBeenCalledWith('user:author-1');
      expect(mockIo.emit).toHaveBeenCalledWith('story.reaction', {
        storyId: 'story-1',
        viewerId: 'viewer-1',
        emoji: '',
        action: 'remove',
      });
    });

    it('should default action to add', async () => {
      await gateway.emitStoryReaction('story-1', 'author-1', 'viewer-1', '❤️');

      expect(mockIo.emit).toHaveBeenCalledWith('story.reaction', {
        storyId: 'story-1',
        viewerId: 'viewer-1',
        emoji: '❤️',
        action: 'add',
      });
    });
  });

  describe('emitStoryDeleted', () => {
    it('should broadcast to namespace (not targeted)', async () => {
      await gateway.emitStoryDeleted('story-1', 'author-1');

      // Should call io.emit directly (broadcast), not io.to().emit
      expect(mockIo.emit).toHaveBeenCalledWith('story.deleted', {
        storyId: 'story-1',
        authorId: 'author-1',
      });
    });
  });
});