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

// Mock postsApi
jest.mock('../postsApi', () => ({
  postsApi: {
    createPost: jest.fn(),
    getFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
    getPostById: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn().mockResolvedValue(undefined),
    toggleLike: jest.fn(),
    unlike: jest.fn(),
    sharePost: jest.fn(),
    reportPost: jest.fn(),
    commentOnPost: jest.fn(),
    listComments: jest.fn(),
    deleteComment: jest.fn(),
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

    it('sets error on failure (no mock fallback) and clears on warm refresh', async () => {
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

      // API error sets the error state (mock fallback removed)
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

  describe('posts', () => {
    const { postsApi } = jest.requireMock('../postsApi') as {
      postsApi: Record<string, jest.Mock>;
    };

    function postView(overrides: Record<string, unknown> = {}) {
      return {
        _id: 'post-1',
        authorId: 'author-1',
        caption: 'hello',
        media: [],
        mentions: [],
        audienceScope: 'public',
        audienceListId: null,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        clientPostId: null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reactionCount: 0,
        likedByMe: false,
        authorDisplayName: 'Author',
        authorAvatar: null,
        comments: [],
        ...overrides,
      };
    }

    beforeEach(() => {
      momentsService.reset();
      jest.clearAllMocks();
    });

    it('refreshPosts loads feed into state', async () => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ _id: 'post-1' }), postView({ _id: 'post-2' })],
        nextCursor: 'cursor-1',
        total: 2,
      });

      await momentsService.refreshPosts();

      const state = momentsService.getState();
      expect(state.feedIds).toEqual(['post-1', 'post-2']);
      expect(state.postsCursor).toBe('cursor-1');
      expect(state.isLoadingPosts).toBe(false);
      expect(momentsService.getFeedPosts()).toHaveLength(2);
    });

    it('refreshPosts sets postsError on failure (no mock fallback)', async () => {
      postsApi.getFeed.mockRejectedValueOnce(new Error('Network down'));

      await momentsService.refreshPosts();

      expect(momentsService.getState().postsError).toBe('Network down');
      expect(momentsService.getState().feedIds).toEqual([]);
    });

    it('toggleLike optimistically flips then reconciles', async () => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ _id: 'post-1' })],
        nextCursor: null,
        total: 1,
      });
      await momentsService.refreshPosts();

      postsApi.toggleLike.mockResolvedValueOnce({ likedByMe: true, likeCount: 1 });
      await momentsService.toggleLike('post-1');

      const post = momentsService.getState().postsById.get('post-1');
      expect(post?.likedByMe).toBe(true);
      expect(post?.likeCount).toBe(1);
    });

    it('post.new prepends via fetch-by-id; replay is a no-op', async () => {
      postsApi.getPostById.mockResolvedValue(postView({ _id: 'post-9' }));

      await momentsService.handlePostEvent({
        type: 'post.new',
        postId: 'post-9',
        authorId: 'author-9',
        createdAt: new Date().toISOString(),
      });

      expect(momentsService.getState().feedIds[0]).toBe('post-9');

      // Replay with the same ID must not duplicate
      await momentsService.handlePostEvent({
        type: 'post.new',
        postId: 'post-9',
        authorId: 'author-9',
        createdAt: new Date().toISOString(),
      });
      expect(
        momentsService.getState().feedIds.filter((id) => id === 'post-9'),
      ).toHaveLength(1);
      expect(postsApi.getPostById).toHaveBeenCalledTimes(1);
    });

    it('post.deleted removes from feed without refetch', async () => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ _id: 'post-1' })],
        nextCursor: null,
        total: 1,
      });
      await momentsService.refreshPosts();

      await momentsService.handlePostEvent({
        type: 'post.deleted',
        postId: 'post-1',
        authorId: 'author-1',
      });

      expect(momentsService.getState().feedIds).toEqual([]);
      expect(postsApi.getFeed).toHaveBeenCalledTimes(1);
    });

    it('post.reaction patches count but preserves likedByMe for other viewers', async () => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ _id: 'post-1', likedByMe: false, likeCount: 0 })],
        nextCursor: null,
        total: 1,
      });
      await momentsService.refreshPosts();
      momentsService.setCurrentUserId('me-1');

      await momentsService.handlePostEvent({
        type: 'post.reaction',
        postId: 'post-1',
        actorId: 'viewer-2',
        liked: true,
        likeCount: 5,
      });
      await momentsService.handlePostEvent({
        type: 'post.comment',
        postId: 'post-1',
        authorId: 'author-1',
        commentId: 'c-1',
        commentCount: 3,
      });

      const post = momentsService.getState().postsById.get('post-1');
      expect(post?.likeCount).toBe(5);
      expect(post?.reactionCount).toBe(5);
      // Another viewer's like must NOT flip our own likedByMe
      expect(post?.likedByMe).toBe(false);
      expect(post?.commentCount).toBe(3);
    });

    it('post.reaction from self on another device sets likedByMe', async () => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ _id: 'post-1', likedByMe: false, likeCount: 0 })],
        nextCursor: null,
        total: 1,
      });
      await momentsService.refreshPosts();
      momentsService.setCurrentUserId('me-1');

      await momentsService.handlePostEvent({
        type: 'post.reaction',
        postId: 'post-1',
        actorId: 'me-1',
        liked: true,
        likeCount: 1,
      });

      const post = momentsService.getState().postsById.get('post-1');
      expect(post?.likeCount).toBe(1);
      expect(post?.likedByMe).toBe(true);
    });
  });
});
