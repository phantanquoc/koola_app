/**
 * MomentViewerScreen — target resolution (moments D1/B4).
 *
 * A shared post link lands here WITHOUT an `authorId`; a ring/story link has
 * one. The viewer must resolve the post (and cache it for the feed) in the
 * first case, and the story in the second — never both, never neither.
 */
import React from 'react';
// @ts-expect-error — react-test-renderer ships untyped in this repo (see ShoppingTabStack test)
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) },
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), push: jest.fn(), setOptions: jest.fn() };
let mockParams: Record<string, unknown> = { startStoryId: 'post-1' };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: () => {},
}));

jest.mock('../../../services/moments/momentsApi', () => ({
  storiesApi: {
    getStoryById: jest.fn(),
    deleteStory: jest.fn(),
  },
  viewsApi: { recordView: jest.fn().mockResolvedValue(undefined) },
  reactionsApi: { reactToStory: jest.fn(), removeReaction: jest.fn() },
  commentsApi: { commentOnStory: jest.fn() },
  highlightsApi: {},
  musicApi: { getTrackById: jest.fn() },
}));

jest.mock('../../../services/moments/postsApi', () => ({
  postsApi: { getPostById: jest.fn() },
}));

jest.mock('../../../services/moments/momentsService', () => ({
  momentsService: {
    getStoriesForAuthor: jest.fn(() => []),
    cachePost: jest.fn(),
    getMusicTrackById: jest.fn().mockResolvedValue(null),
    reactToStory: jest.fn(),
  },
}));

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me' } }),
}));

import { storiesApi } from '../../../services/moments/momentsApi';
import { postsApi } from '../../../services/moments/postsApi';
import { momentsService } from '../../../services/moments/momentsService';
import MomentViewerScreen from '../MomentViewerScreen';

const apiStories = storiesApi as unknown as Record<string, jest.Mock>;
const apiPosts = postsApi as unknown as Record<string, jest.Mock>;
const svc = momentsService as unknown as Record<string, jest.Mock>;

async function mount(params: Record<string, unknown>) {
  mockParams = params;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<MomentViewerScreen />);
  });
  return renderer;
}

describe('MomentViewerScreen target resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiPosts.getPostById.mockReset();
    apiStories.getStoryById.mockReset();
    svc.cachePost.mockReset();
    svc.getStoriesForAuthor.mockReturnValue([]);
  });

  it('resolves a post link (no authorId) and caches it for the feed', async () => {
    apiPosts.getPostById.mockResolvedValue({ _id: 'post-1', authorId: 'a1', caption: 'x' });
    const r = await mount({ startStoryId: 'post-1' });

    expect(apiPosts.getPostById).toHaveBeenCalledWith('post-1');
    expect(svc.cachePost).toHaveBeenCalledWith(expect.objectContaining({ id: 'post-1' }));
    // A post id is never tried as a story id.
    expect(apiStories.getStoryById).not.toHaveBeenCalled();
    expect(r.toJSON()).toBeTruthy();
  });

  it('resolves a story link with authorId and never fetches a post', async () => {
    apiStories.getStoryById.mockResolvedValue({
      _id: 'story-1',
      authorId: 'a1',
      mediaKey: 'k',
      mediaType: 'image',
    });
    await mount({ startStoryId: 'story-1', authorId: 'a1' });

    expect(apiStories.getStoryById).toHaveBeenCalledWith('story-1');
    expect(apiPosts.getPostById).not.toHaveBeenCalled();
    expect(svc.cachePost).not.toHaveBeenCalled();
  });

  it('surfaces an error state when the post cannot be resolved', async () => {
    apiPosts.getPostById.mockRejectedValue(new Error('404'));
    const r = await mount({ startStoryId: 'missing' });

    expect(svc.cachePost).not.toHaveBeenCalled();
    expect(JSON.stringify(r.toJSON())).toContain('Không mở được bài viết này');
  });

  it('never renders the story player from a post link, even before the fetch resolves', async () => {
    // Post link + a never-settling fetch: no stories, no saved post. Falling
    // through to the player here is what painted the empty "Text strings must
    // be rendered within a <Text>" frame.
    apiPosts.getPostById.mockReturnValue(new Promise(() => {}));
    const r = await mount({ startStoryId: 'post-1' });

    const tree = JSON.stringify(r.toJSON());
    expect(tree).toContain('Đang tải');
    expect(tree).not.toContain('Khoảnh khắc');
  });
});
