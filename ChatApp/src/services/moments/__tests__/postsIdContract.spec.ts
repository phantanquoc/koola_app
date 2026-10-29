/**
 * Post-id contract regressions (moments D1).
 *
 * The backend used to echo `_id: null` for every feed post; the client keyed
 * everything off `post._id`, so all rows collapsed onto one id. These tests
 * pin the client half: one canonical id, no dead rows, no duplicate-key feed.
 */
import { momentsService } from '../momentsService';

// The service is constructible on import, so every collaborator it touches at
// module scope (including NetInfo, read in createPost) must be mocked here.
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
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) },
}));

const { postsApi } = jest.requireMock('../postsApi') as {
  postsApi: Record<string, jest.Mock>;
};

function postView(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'post-1',
    id: 'post-1',
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

describe('momentsService — post id contract', () => {
  beforeEach(() => {
    momentsService.reset();
    jest.clearAllMocks();
  });

  it('keys posts by resolvePost(): id wins, _id is the fallback', async () => {
    postsApi.getFeed.mockResolvedValueOnce({
      items: [postView({ _id: 'mongo-a', id: 'alias-a' }), postView({ id: undefined, _id: 'mongo-b' })],
      nextCursor: null,
      total: 2,
    });

    await momentsService.refreshPosts();

    expect(momentsService.getState().feedIds).toEqual(['alias-a', 'mongo-b']);
    expect(momentsService.getState().postsById.has('alias-a')).toBe(true);
    expect(momentsService.getState().postsById.has('mongo-b')).toBe(true);
  });

  it('drops id-less posts and surfaces a contract error instead of an empty-looking feed', async () => {
    postsApi.getFeed.mockResolvedValueOnce({
      items: [postView({ _id: null, id: null })],
      nextCursor: null,
      total: 1,
    });

    await momentsService.refreshPosts();

    const state = momentsService.getState();
    expect(state.feedIds).toEqual([]);
    expect(state.postsError).toBe('Dữ liệu bài viết không hợp lệ — vui lòng thử lại');
    expect(momentsService.getFeedPosts()).toEqual([]);
  });

  it('mapPostToFeedPost returns null (not a null-id card) for a post with no id', () => {
    expect(momentsService.mapPostToFeedPost(postView({ _id: null, id: null }) as never)).toBeNull();
    expect(momentsService.mapPostToFeedPost(postView() as never)?.id).toBe('post-1');
  });

  it('createPost throws when the server returns a post without an id', async () => {
    postsApi.createPost.mockResolvedValueOnce(postView({ _id: null, id: null }));

    await expect(momentsService.createPost({ audienceScope: 'public' })).rejects.toThrow(
      /thiếu mã định danh/,
    );
  });

  it('addComment puts the new comment into the card preview (top-2)', async () => {
    postsApi.getFeed.mockResolvedValueOnce({
      items: [
        postView({
          comments: [
            { _id: 'c1', isActive: true, content: 'a', createdAt: new Date().toISOString() },
            { _id: 'c2', isActive: true, content: 'b', createdAt: new Date().toISOString() },
          ],
          commentCount: 2,
        }),
      ],
      nextCursor: null,
      total: 1,
    });
    await momentsService.refreshPosts();

    postsApi.commentOnPost.mockResolvedValueOnce({
      _id: 'c3',
      content: 'c',
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    await momentsService.addComment('post-1', 'c');

    const post = momentsService.getState().postsById.get('post-1');
    expect(post?.commentCount).toBe(3);
    expect(post?.comments.map((c) => c._id)).toEqual(['c2', 'c3']);
  });

  it('addComment on a reply bumps the parent replyCount, not the preview list', async () => {
    postsApi.getFeed.mockResolvedValueOnce({
      items: [
        postView({
          comments: [
            { _id: 'c1', isActive: true, content: 'a', createdAt: new Date().toISOString(), replies: [], replyCount: 0 },
          ],
          commentCount: 1,
        }),
      ],
      nextCursor: null,
      total: 1,
    });
    await momentsService.refreshPosts();

    postsApi.commentOnPost.mockResolvedValueOnce({ _id: 'r1', content: 'r', isActive: true });
    await momentsService.addComment('post-1', 'r', 'c1');

    const post = momentsService.getState().postsById.get('post-1');
    expect(post?.comments).toHaveLength(1);
    expect(post?.comments[0].replyCount).toBe(1);
  });

  it('deleteComment leaves a tombstone in the preview (slot kept, like the sheet)', async () => {
    postsApi.getFeed.mockResolvedValueOnce({
      items: [
        postView({
          comments: [{ _id: 'c1', isActive: true, content: 'a', createdAt: new Date().toISOString() }],
          commentCount: 1,
        }),
      ],
      nextCursor: null,
      total: 1,
    });
    await momentsService.refreshPosts();

    postsApi.deleteComment.mockResolvedValueOnce({ success: true });
    await momentsService.deleteComment('c1');

    const post = momentsService.getState().postsById.get('post-1');
    // The backend soft-deletes: the row keeps its slot so the card matches the
    // comment sheet (which renders it as "Bình luận này đã bị xóa"). Dropping it
    // here made the card show a different thread than the sheet.
    expect(post?.comments.map((c) => [c._id, c.isActive])).toEqual([['c1', false]]);
    // The row still occupies its slot, so the raw field (which still counts it)
    // is left alone; the caller re-reads the active count right after
    // (syncCommentCount), which is the number the card must show.
    expect(post?.commentCount).toBe(1);
  });

  it('a thread count stays pinned across a refresh and socket replays', async () => {
    // Regression: sheet says "1 bình luận", card says "3". The sheet corrected
    // the card to 1; the next focus refresh (raw field = 3) and a replayed
    // post.comment (3) both wrote it back.
    await (async () => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ commentCount: 3 })],
        nextCursor: null,
        total: 1,
      });
      await momentsService.refreshPosts();
    })();
    momentsService.patchCommentCount('post-1', 1);
    expect(momentsService.getFeedPosts()[0].commentCount).toBe(1);

    postsApi.getFeed.mockResolvedValueOnce({
      items: [postView({ commentCount: 3 })],
      nextCursor: null,
      total: 1,
    });
    await momentsService.refreshPosts();
    expect(momentsService.getFeedPosts()[0].commentCount).toBe(1);

    momentsService.setCurrentUserId('viewer-1');
    await momentsService.handlePostEvent({
      type: 'post.comment',
      postId: 'post-1',
      authorId: 'author-1',
      commentId: 'c9',
      commentCount: 4,
    } as never);
    expect(momentsService.getFeedPosts()[0].commentCount).toBe(1);
  });

  it('syncCommentCount pins the server count (and subtracts the just-deleted row)', async () => {
    postsApi.getFeed.mockResolvedValueOnce({
      items: [postView({ commentCount: 3 })],
      nextCursor: null,
      total: 1,
    });
    await momentsService.refreshPosts();
    postsApi.getActiveCommentCount.mockResolvedValueOnce({ activeCommentCount: 2 });

    await momentsService.syncCommentCount('post-1', 'c1');

    expect(postsApi.getActiveCommentCount).toHaveBeenCalledWith('post-1', 'c1');
    expect(momentsService.getFeedPosts()[0].commentCount).toBe(2);
  });

  describe('post.comment socket event', () => {
    const loadPost = async (commentCount: number) => {
      postsApi.getFeed.mockResolvedValueOnce({
        items: [postView({ commentCount })],
        nextCursor: null,
        total: 1,
      });
      await momentsService.refreshPosts();
      // The event handler returns early for a post this device cannot see.
      momentsService.setCurrentUserId('viewer-1');
    };

    it('grows the count on a create', async () => {
      await loadPost(1);

      await momentsService.handlePostEvent({
        type: 'post.comment',
        postId: 'post-1',
        commentCount: 2,
      } as never);

      expect(momentsService.getState().postsById.get('post-1')?.commentCount).toBe(2);
    });

    it('never resurrects a count this device already corrected (delete carries no isActive)', async () => {
      // Regression: "0 bình luận in the thread, 1 on the card". A device that
      // fetched the thread corrected the card to 0; a delayed/unrelated
      // post.comment replay then wrote a higher, stale server count back.
      await loadPost(3);
      momentsService.patchCommentCount('post-1', 0);
      // Sanity: the patch itself must land, or the assertion below is vacuous.
      expect(momentsService.getState().postsById.get('post-1')?.commentCount).toBe(0);

      await momentsService.handlePostEvent({
        type: 'post.comment',
        postId: 'post-1',
        commentCount: 1,
      } as never);

      expect(momentsService.getState().postsById.get('post-1')?.commentCount).toBe(0);
    });

    it('merges the enriched payload (comment view + postUpdated) without regressing the overlay pin', async () => {
      await loadPost(1);
      momentsService.patchCommentCount('post-1', 1);

      await momentsService.handlePostEvent({
        type: 'post.comment',
        postId: 'post-1',
        authorId: 'author-1',
        commentId: 'c-new',
        comment: {
          _id: 'c-new',
          postId: 'post-1',
          parentId: null,
          authorId: 'viewer-2',
          content: 'nice!',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          authorDisplayName: 'Viewer',
          authorAvatar: null,
          replies: [],
          replyCount: 0,
        },
        commentCount: 2,
        postUpdated: { likeCount: 5, commentCount: 2, shareCount: 1 },
      } as never);

      // Thread-corrected count survives the socket replay at read time.
      expect(momentsService.getFeedPosts()[0].commentCount).toBe(1);
      const stored = momentsService.getState().postsById.get('post-1');
      expect(stored?.likeCount).toBe(5);
      expect(stored?.shareCount).toBe(1);
      expect(stored?.comments?.some((c) => c._id === 'c-new')).toBe(true);
    });
  });
});
