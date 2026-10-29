/**
 * Offline media create_post (moments-posts-backend-hardening 5.4).
 *
 * A create_post row queued offline with local media URIs publishes exactly
 * once per clientPostId after reconnect: the dispatcher uploads each asset,
 * then creates the post with the stored clientPostId; a retry after a lost
 * response returns the existing post (no duplicate).
 */
import { momentsService } from '../momentsService';
import * as outboxRepository from '../../db/outboxRepository';

jest.mock('../postsApi', () => ({
  postsApi: {
    createPost: jest.fn(),
    getFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
    getPostById: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    toggleLike: jest.fn(),
    sharePost: jest.fn(),
    reportPost: jest.fn(),
    commentOnPost: jest.fn(),
    listComments: jest.fn(),
    deleteComment: jest.fn(),
    getActiveCommentCount: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: false }) },
}));

jest.mock('../../db/outboxRepository', () => {
  const actual = jest.requireActual('../../db/outboxRepository');
  return { ...actual, enqueue: jest.fn().mockReturnValue('row-1') };
});

const { postsApi } = jest.requireMock('../postsApi') as {
  postsApi: Record<string, jest.Mock>;
};

describe('offline media create_post', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    momentsService.reset();
  });

  it('enqueues media posts offline with local URIs + clientPostId instead of failing', async () => {
    const enqueue = outboxRepository.enqueue as jest.Mock;
    await expect(
      momentsService.createPost({
        caption: 'beach',
        media: [
          { mediaKey: 'file:///local/1.jpg', mediaType: 'image' as never },
          { mediaKey: 'file:///local/2.jpg', mediaType: 'image' as never },
        ],
        audienceScope: 'public',
      }),
    ).rejects.toMatchObject({ code: 'QUEUED' });

    expect(enqueue).toHaveBeenCalledWith(
      'create_post',
      expect.objectContaining({
        caption: 'beach',
        clientPostId: expect.any(String),
        media: [
          expect.objectContaining({ localUri: 'file:///local/1.jpg' }),
          expect.objectContaining({ localUri: 'file:///local/2.jpg' }),
        ],
      }),
    );
    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  it('one post per clientPostId after replay (server dedupes the retry)', async () => {
    const post = {
      _id: 'post-9',
      id: 'post-9',
      authorId: 'me',
      caption: 'beach',
      media: [],
      mentions: [],
      audienceScope: 'public',
      audienceListId: null,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      clientPostId: 'key-9',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reactionCount: 0,
      likedByMe: false,
      authorDisplayName: 'Me',
      authorAvatar: null,
      comments: [],
    };
    // First dispatch creates; the retry-after-lost-response returns the same row.
    postsApi.createPost.mockResolvedValueOnce(post).mockResolvedValueOnce(post);

    const NetInfo = jest.requireMock('@react-native-community/netinfo').default;
    NetInfo.fetch.mockResolvedValue({ isConnected: true });
    const first = await momentsService.createPost({
      caption: 'beach',
      audienceScope: 'public',
      clientPostId: 'key-9',
    });
    const second = await momentsService.createPost({
      caption: 'beach',
      audienceScope: 'public',
      clientPostId: 'key-9',
    });
    expect(first.id).toBe('post-9');
    expect(second.id).toBe('post-9');
    expect(momentsService.getState().feedIds.filter((id) => id === 'post-9')).toHaveLength(1);
  });
});
