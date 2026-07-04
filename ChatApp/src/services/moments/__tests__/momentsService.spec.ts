/**
 * momentsService.spec.ts
 *
 * Unit tests for momentsService state transitions.
 * Tests verify pub/sub, socket event handling, and state mutation.
 */

import { momentsService } from '../momentsService';
import type { MomentsEvent } from '../momentsService';

// Mock momentsApi
jest.mock('../momentsApi', () => ({
  storiesApi: {
    getFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
    createStory: jest.fn(),
    getStoryById: jest.fn(),
    deleteStory: jest.fn(),
  },
  viewsApi: {
    recordView: jest.fn().mockResolvedValue(undefined),
    listViewers: jest.fn().mockResolvedValue({ viewers: [], nextCursor: null }),
  },
  reactionsApi: {
    reactToStory: jest.fn().mockResolvedValue(undefined),
    removeReaction: jest.fn().mockResolvedValue(undefined),
  },
  commentsApi: {
    commentOnStory: jest.fn().mockResolvedValue({ conversationId: 'conv-1', messageId: 'msg-1' }),
  },
  highlightsApi: {
    getUserHighlights: jest.fn().mockResolvedValue({ highlights: [] }),
    createHighlight: jest.fn(),
    updateHighlight: jest.fn(),
    deleteHighlight: jest.fn(),
    getHighlightDetail: jest.fn(),
  },
  audienceListsApi: {
    listOwn: jest.fn().mockResolvedValue({ lists: [] }),
    createList: jest.fn(),
    updateList: jest.fn(),
    deleteList: jest.fn(),
    getDetail: jest.fn(),
  },
  musicApi: {
    searchTracks: jest.fn().mockResolvedValue({ tracks: [], nextCursor: null, total: 0 }),
    getTrackById: jest.fn(),
  },
}));

// Mock @react-native-community/netinfo
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  },
}));

describe('momentsService', () => {
  beforeEach(() => {
    momentsService.reset();
  });

  describe('subscribe / getState', () => {
    it('starts with empty feedRing', () => {
      const state = momentsService.getState();
      expect(state.feedRing).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('notifies subscriber on state change', () => {
      const listener = jest.fn();
      const unsub = momentsService.subscribe(listener);

      momentsService.reset(); // triggers notify
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ feedRing: [] }));

      unsub();
      momentsService.reset(); // should NOT call listener after unsub
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleEvent — story.new', () => {
    it('adds new author ring item when author not in feed', () => {
      const event: MomentsEvent = {
        type: 'story.new',
        storyId: 'story-1',
        authorId: 'author-1',
        mediaType: 'image',
        createdAt: new Date().toISOString(),
      };

      momentsService.handleEvent(event);
      const state = momentsService.getState();
      expect(state.feedRing).toHaveLength(1);
      expect(state.feedRing[0]).toMatchObject({
        authorId: 'author-1',
        lastStoryId: 'story-1',
        hasUnviewed: true,
      });
    });

    it('marks existing ring item as unviewed on new story', () => {
      // Simulate existing ring item
      const existingEvent: MomentsEvent = {
        type: 'story.new',
        storyId: 'story-old',
        authorId: 'author-1',
        mediaType: 'image',
        createdAt: new Date().toISOString(),
      };
      momentsService.handleEvent(existingEvent);

      // Second story from same author
      const newEvent: MomentsEvent = {
        type: 'story.new',
        storyId: 'story-new',
        authorId: 'author-1',
        mediaType: 'video',
        createdAt: new Date().toISOString(),
      };
      momentsService.handleEvent(newEvent);

      const state = momentsService.getState();
      expect(state.feedRing).toHaveLength(1); // still 1 author
      expect(state.feedRing[0].lastStoryId).toBe('story-new');
      expect(state.feedRing[0].hasUnviewed).toBe(true);
    });
  });

  describe('handleEvent — story.deleted', () => {
    it('removes story from storiesByAuthor', () => {
      // Pre-populate state by simulating a feed item
      const addEvent: MomentsEvent = {
        type: 'story.new',
        storyId: 'story-1',
        authorId: 'author-1',
        mediaType: 'image',
        createdAt: new Date().toISOString(),
      };
      momentsService.handleEvent(addEvent);

      const deleteEvent: MomentsEvent = {
        type: 'story.deleted',
        storyId: 'story-1',
        authorId: 'author-1',
      };
      momentsService.handleEvent(deleteEvent);

      const state = momentsService.getState();
      // feedRing entry for author-1 should be removed (no stories left)
      const ringItem = state.feedRing.find((r) => r.authorId === 'author-1');
      expect(ringItem).toBeUndefined();
    });
  });

  describe('handleEvent — story.reaction', () => {
    it('increments reactionCounts for the story', () => {
      // Add a fake story to storiesByAuthor via internal state hack
      const state = momentsService.getState();
      const map = new Map(state.storiesByAuthor);
      map.set('author-1', [
        {
          _id: 'story-1',
          authorId: 'author-1',
          storyGroupId: 'group-1',
          overFlowIndex: 1,
          mediaKey: 'stories/k',
          mediaType: 'image',
          thumbnailKey: null,
          duration: null,
          caption: '',
          mentions: [],
          musicRef: null,
          audienceScope: 'public',
          audienceListId: null,
          reactions: [],
          reactionCounts: {},
          viewCount: 0,
          hasOverflow: false,
          isActive: true,
          expiresAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      // Access private setState via cast
      (momentsService as unknown as { setState: (s: object) => void }).setState({
        storiesByAuthor: map,
      });

      const reactionEvent: MomentsEvent = {
        type: 'story.reaction',
        storyId: 'story-1',
        viewerId: 'viewer-1',
        emoji: '❤️',
      };
      momentsService.handleEvent(reactionEvent);

      const updated = momentsService.getState().storiesByAuthor.get('author-1');
      expect(updated?.[0].reactionCounts?.['❤️']).toBe(1);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const addEvent: MomentsEvent = {
        type: 'story.new',
        storyId: 'story-1',
        authorId: 'author-1',
        mediaType: 'image',
        createdAt: new Date().toISOString(),
      };
      momentsService.handleEvent(addEvent);

      momentsService.reset();
      const state = momentsService.getState();
      expect(state.feedRing).toHaveLength(0);
      expect(state.storiesByAuthor.size).toBe(0);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('refreshFeed isLoading sequence', () => {
    const { storiesApi } = jest.requireMock('../momentsApi') as {
      storiesApi: { getFeed: jest.Mock };
    };

    beforeEach(() => {
      momentsService.reset();
    });

    it('sets isLoading:true on cold load (empty feed)', async () => {
      storiesApi.getFeed.mockResolvedValueOnce({ items: [], nextCursor: null, total: 0 });

      const listener = jest.fn();
      momentsService.subscribe(listener);

      await momentsService.refreshFeed();

      // Listener should have received at least one call with isLoading:true
      const hadLoading = listener.mock.calls.some(
        ([s]: [{ isLoading: boolean }]) => s.isLoading === true,
      );
      expect(hadLoading).toBe(true);

      // Final state should have isLoading:false
      const finalState = momentsService.getState();
      expect(finalState.isLoading).toBe(false);
    });

    it('does NOT set isLoading:true on warm refresh (feed already has data)', async () => {
      // Seed with feed data first
      const feedItems = [
        {
          authorId: 'author-warm',
          lastStoryId: 'story-warm',
          hasUnviewed: true,
          authorDisplayName: 'Warm Author',
          authorAvatar: 'avatar.jpg',
          stories: [],
        },
      ];
      storiesApi.getFeed.mockResolvedValueOnce({ items: feedItems, nextCursor: null, total: 1 });
      await momentsService.refreshFeed();

      // Verify feed is now populated
      expect(momentsService.getState().feedRing.length).toBeGreaterThan(0);

      // Now do a second refresh — listener should NOT see isLoading:true
      storiesApi.getFeed.mockResolvedValueOnce({ items: feedItems, nextCursor: null, total: 1 });
      const listener2 = jest.fn();
      momentsService.subscribe(listener2);

      await momentsService.refreshFeed();

      // No call should have isLoading:true (silent refresh — anti-flash)
      const hadLoading = listener2.mock.calls.some(
        ([s]: [{ isLoading: boolean }]) => s.isLoading === true,
      );
      expect(hadLoading).toBe(false);
    });

    it('clears error on warm refresh without setting isLoading', async () => {
      // Seed feed
      const feedItems = [
        {
          authorId: 'author-err',
          lastStoryId: 'story-err',
          hasUnviewed: false,
          authorDisplayName: 'Error Test',
          authorAvatar: null,
          stories: [],
        },
      ];
      storiesApi.getFeed.mockResolvedValueOnce({ items: feedItems, nextCursor: null, total: 1 });
      await momentsService.refreshFeed();

      // Simulate an error state (via a failing refresh)
      storiesApi.getFeed.mockRejectedValueOnce(new Error('Network down'));
      await momentsService.refreshFeed();
      expect(momentsService.getState().error).toBe('Network down');

      // Now a successful warm refresh should clear error without isLoading
      storiesApi.getFeed.mockResolvedValueOnce({ items: feedItems, nextCursor: null, total: 1 });
      const listener3 = jest.fn();
      momentsService.subscribe(listener3);

      await momentsService.refreshFeed();

      const hadLoading = listener3.mock.calls.some(
        ([s]: [{ isLoading: boolean }]) => s.isLoading === true,
      );
      expect(hadLoading).toBe(false);
      expect(momentsService.getState().error).toBeNull();
    });
  });
});
