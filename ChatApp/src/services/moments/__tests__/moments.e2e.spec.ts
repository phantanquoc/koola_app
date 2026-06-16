/**
 * moments.e2e.spec.ts
 *
 * Integration happy-path for the moments service layer.
 */

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}));

const STORY_FIXTURE = {
  _id: 'story-e2e',
  authorId: 'me',
  storyGroupId: 'grp-1',
  overFlowIndex: 1,
  mediaKey: 'stories/e2e-key',
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

jest.mock('../momentsApi', () => ({
  storiesApi: {
    getFeed: jest.fn(),
    createStory: jest.fn(),
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
import { storiesApi, viewsApi, reactionsApi } from '../momentsApi';

const STORY_ID = 'story-e2e';
const AUTHOR_ID = 'me';

describe('Moments happy path (service layer)', () => {
  beforeEach(() => {
    momentsService.reset();
    jest.clearAllMocks();

    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });

    (storiesApi.getFeed as jest.Mock).mockResolvedValue({
      items: [
        {
          authorId: AUTHOR_ID,
          displayName: 'Toi',
          avatarKey: null,
          stories: [STORY_FIXTURE],
          lastStoryId: STORY_FIXTURE._id,
          hasUnviewed: true,
        },
      ],
      nextCursor: null,
      total: 1,
    });
    (storiesApi.createStory as jest.Mock).mockResolvedValue(STORY_FIXTURE);
    (viewsApi.recordView as jest.Mock).mockResolvedValue(undefined);
    (reactionsApi.reactToStory as jest.Mock).mockResolvedValue(undefined);
  });

  it('Step 1: createStory succeeds when online', async () => {
    const result = await momentsService.createStory({
      mediaKey: 'stories/e2e-key',
      mediaType: 'image',
      caption: 'Test',
      audienceScope: 'public',
    });

    expect(result._id).toBe(STORY_ID);
    expect((storiesApi.createStory as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('Step 2: refreshFeed populates feedRing', async () => {
    await momentsService.refreshFeed();

    const state = momentsService.getState();
    expect(state.feedRing).toHaveLength(1);
    expect(state.feedRing[0].authorId).toBe(AUTHOR_ID);
    expect(state.feedRing[0].hasUnviewed).toBe(true);
    expect(state.feedRing[0].lastStoryId).toBe(STORY_ID);
  });

  it('Step 3: story.new socket event adds ring entry without calling getFeed', () => {
    momentsService.reset();

    momentsService.handleEvent({
      type: 'story.new',
      storyId: STORY_ID,
      authorId: AUTHOR_ID,
      mediaType: 'image',
      createdAt: new Date().toISOString(),
    });

    const state = momentsService.getState();
    expect(state.feedRing[0]).toMatchObject({
      authorId: AUTHOR_ID,
      lastStoryId: STORY_ID,
      hasUnviewed: true,
    });
    expect((storiesApi.getFeed as jest.Mock)).not.toHaveBeenCalled();
  });

  it('Step 4: recordView calls viewsApi with storyId', async () => {
    await momentsService.recordView(STORY_ID);
    expect((viewsApi.recordView as jest.Mock)).toHaveBeenCalledWith(STORY_ID);
  });

  it('Step 5: reactToStory calls reactionsApi with storyId and emoji', async () => {
    const HEART = '❤️';
    await momentsService.reactToStory(STORY_ID, AUTHOR_ID, HEART);
    expect((reactionsApi.reactToStory as jest.Mock)).toHaveBeenCalledWith(STORY_ID, HEART);
  });

  it('Step 6: Full pipeline -- create -> feed -> react -> view', async () => {
    const result = await momentsService.createStory({
      mediaKey: 'stories/e2e-key',
      mediaType: 'image',
      caption: 'E2E',
      audienceScope: 'public',
    });
    expect(result._id).toBe(STORY_ID);

    await momentsService.refreshFeed();
    expect(momentsService.getState().feedRing).toHaveLength(1);

    const FIRE = '🔥';
    await momentsService.reactToStory(STORY_ID, AUTHOR_ID, FIRE);
    expect((reactionsApi.reactToStory as jest.Mock)).toHaveBeenCalledWith(STORY_ID, FIRE);

    await momentsService.recordView(STORY_ID);
    expect((viewsApi.recordView as jest.Mock)).toHaveBeenCalledWith(STORY_ID);
  });
});
