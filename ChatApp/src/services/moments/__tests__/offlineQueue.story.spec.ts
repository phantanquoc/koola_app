/**
 * offlineQueue.story.spec.ts
 *
 * Integration test: story upload attempted while offline is rejected with
 * an OFFLINE error (not queued) because media uploads require live connectivity.
 */

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}));

jest.mock('../momentsApi', () => ({
  storiesApi: {
    requestUploadUrl: jest.fn(),
    createStory: jest.fn(),
    getFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
    getStoryById: jest.fn(),
    deleteStory: jest.fn(),
  },
  viewsApi: {
    recordView: jest.fn(),
    listViewers: jest.fn(),
  },
  reactionsApi: {
    reactToStory: jest.fn(),
    removeReaction: jest.fn(),
  },
  commentsApi: {
    commentOnStory: jest.fn(),
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

import NetInfo from '@react-native-community/netinfo';
import { momentsService } from '../momentsService';
import { storiesApi } from '../momentsApi';

describe('momentsService.createStory -- offline guard', () => {
  beforeEach(() => {
    momentsService.reset();
    jest.clearAllMocks();
  });

  it('throws with code=OFFLINE when device is offline', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false });

    await expect(momentsService.createStory({
      mediaKey: 'stories/test',
      mediaType: 'image',
      caption: 'Test',
      audienceScope: 'public',
    })).rejects.toMatchObject({ code: 'OFFLINE' });

    expect((storiesApi.createStory as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does not call storiesApi when offline', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false });

    try {
      await momentsService.createStory({
        mediaKey: 'stories/test',
        mediaType: 'image',
        caption: 'No queue',
        audienceScope: 'public',
      });
    } catch {
      // expected
    }

    expect((storiesApi.createStory as jest.Mock)).not.toHaveBeenCalled();
  });

  it('calls storiesApi.createStory when online', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true });

    const createdStory = {
      _id: 'story-123',
      authorId: 'author-1',
      storyGroupId: 'grp-1',
      overFlowIndex: 1,
      mediaKey: 'stories/test-key',
      mediaType: 'image',
      thumbnailKey: null,
      duration: null,
      caption: 'Test',
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
    };

    (storiesApi.createStory as jest.Mock).mockResolvedValueOnce(createdStory);
    // refreshFeed is called after createStory
    (storiesApi.getFeed as jest.Mock).mockResolvedValueOnce({ items: [], nextCursor: null, total: 0 });

    const result = await momentsService.createStory({
      mediaKey: 'stories/test-key',
      mediaType: 'image',
      caption: 'Test',
      audienceScope: 'public',
    });

    expect(result._id).toBe('story-123');
    expect((storiesApi.createStory as jest.Mock)).toHaveBeenCalledTimes(1);
  });
});
