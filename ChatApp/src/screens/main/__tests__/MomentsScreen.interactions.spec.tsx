/**
 * MomentsScreen — interaction regressions (moments D1/D3/D5).
 *
 * The plain MomentsScreen.spec.tsx is static source analysis; this one drives
 * the real component tree (with the service mocked) to pin the behaviours that
 * broke silently:
 *   - "Trả lời" keeps the draft and does NOT reload the thread (B7)
 *   - double-tap "Gửi" creates ONE comment (B9 guard)
 *   - "Xóa" is offered only where the backend would allow it (B8)
 *   - own-post "Sửa bài viết" opens PostComposer, never a delete dialog (B6)
 *   - share sends the readable sentence + routable link (B5)
 */
import React from 'react';
import { ActionSheetIOS, Alert, Platform, Share, Text } from 'react-native';
// @ts-expect-error — react-test-renderer ships untyped in this repo (see ShoppingTabStack test)
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) },
}));

jest.mock('../../../services/moments/momentsService', () => {
  const state: any = {
    feedRing: [],
    storiesByAuthor: new Map(),
    viewerCount: new Map(),
    highlights: new Map(),
    isLoading: false,
    error: null,
    postsById: new Map(),
    feedIds: [],
    postsCursor: null,
    isLoadingPosts: false,
    postsError: null,
  };
  const service = {
    __state: state,
    subscribe: jest.fn(() => () => {}),
    getState: jest.fn(() => state),
    setCurrentUserId: jest.fn(),
    reset: jest.fn(),
    refreshFeed: jest.fn().mockResolvedValue(undefined),
    refreshPosts: jest.fn().mockResolvedValue(undefined),
    loadMorePosts: jest.fn().mockResolvedValue(undefined),
    getFeedPosts: jest.fn(() => []),
    getStoriesForAuthor: jest.fn(() => []),
    toggleLike: jest.fn(),
    deletePost: jest.fn().mockResolvedValue(undefined),
    addComment: jest.fn(),
    deleteComment: jest.fn().mockResolvedValue(undefined),
    patchCommentCount: jest.fn(),
    registerComment: jest.fn(),
    syncCommentCount: jest.fn().mockResolvedValue(undefined),
    sharePost: jest.fn(),
    getMusicTrackById: jest.fn(),
    reactToStory: jest.fn(),
  };
  return { momentsService: service };
});

jest.mock('../../../services/moments/postsApi', () => ({
  postsApi: {
    listComments: jest.fn(),
    createPost: jest.fn(),
    getFeed: jest.fn(),
    deleteComment: jest.fn(),
    sharePost: jest.fn(),
  },
}));

jest.mock('../../..//contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me', displayName: 'Tôi' } }),
}));

jest.mock('../../..//components/moments/MomentsFeedHeader', () => 'MomentsFeedHeader');
jest.mock('../../..//components/moments/PostMediaGrid', () => 'PostMediaGrid');
jest.mock('../../..//components/MediaImage', () => 'MediaImage');
jest.mock('../../..//hooks/useComingSoonToast', () => ({
  useComingSoonToast: () => jest.fn(),
}));

const mockNavigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const ReactLib = require('react');
    ReactLib.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
    }, []);
  },
}));

// The screen imports navigation/context modules for layout only; stubbing them
// keeps this test off the heavy native-module graph (blur, svg, gesture).
jest.mock('../../../navigation/MainNavigator', () => ({
  useTabBarBottomInset: () => 0,
}));
jest.mock('../ChatSubTabVisibilityContext', () => ({
  ChatSubTabVisibilityContext: require('react').createContext({ setSubTabsHidden: () => {} }),
  CHAT_CHROME_LIFT_DISTANCE: 0,
}));
jest.mock('../ChatHomeHeaderInsetContext', () => ({
  ChatHomeHeaderInsetContext: require('react').createContext(0),
}));

import { momentsService } from '../../../services/moments/momentsService';
import { postsApi } from '../../../services/moments/postsApi';
import MomentsScreen from '../MomentsScreen';

const svc = momentsService as unknown as Record<string, jest.Mock> & { __state: any };
const api = postsApi as unknown as Record<string, jest.Mock>;

function comment(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'c1',
    postId: 'p1',
    parentId: null,
    authorId: 'other',
    content: 'bình luận cũ',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    authorDisplayName: 'Người khác',
    authorAvatar: null,
    replies: [],
    replyCount: 0,
    ...overrides,
  };
}

let renderer: TestRenderer.ReactTestRenderer;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(<MomentsScreen />);
  });
}

/** Every host node whose flattened text contains `text`. */
function findAllByText(text: string): ReactTestInstance[] {
  return renderer.root.findAll(
    (n: ReactTestInstance) =>
      n.type === Text &&
      React.Children.toArray(n.props.children)
        .flat()
        .join('')
        .includes(text),
  );
}

function textOf(node: ReactTestInstance): string {
  return node.props.children;
}

function input(): ReactTestInstance {
  return renderer.root.find(
    (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Nhập bình luận',
  );
}

function sendButton(): ReactTestInstance {
  return renderer.root.find(
    (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Gửi bình luận',
  );
}

async function openCommentSheet() {
  const card = renderer.root.find(
    (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.onPressComment && n.props.post,
  );
  await act(async () => {
    card.props.onPressComment('p1');
  });
}

// Force the Android branch: the destructive-misfire bug (B6) only existed there.
Platform.OS = 'android';

describe('MomentsScreen — comment sheet & post menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    svc.__state.postsById = new Map([
      ['p1', { _id: 'p1', id: 'p1', authorId: 'me', caption: 'cap', shareCount: 0, comments: [] }],
    ]);
    svc.__state.feedIds = ['p1'];
    svc.getFeedPosts.mockReturnValue([
      {
        id: 'p1',
        authorId: 'me',
        authorDisplayName: 'Tôi',
        timeLabel: 'Vừa xong',
        audience: 'public',
        caption: 'cap',
        media: [],
        reactionCount: 0,
        commentCount: 0,
        shareCount: 0,
        likedByMe: false,
        comments: [],
      },
    ]);
    api.listComments.mockResolvedValue({ comments: [comment()], nextCursor: null });
  });

  it('"Trả lời" keeps the draft and does not refetch the thread (B7)', async () => {
    await mount();
    await openCommentSheet();

    await act(async () => {
      input().props.onChangeText('đang gõ dở');
    });
    const reply = renderer.root.find(
      (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Trả lời Người khác',
    );
    await act(async () => {
      reply.props.onPress();
    });

    expect(input().props.value).toBe('đang gõ dở');
    // Reply banner appeared (the sheet's label survives next to the button).
    expect(findAllByText('Trả lời Người khác').length).toBeGreaterThan(0);
    // Exactly ONE thread fetch: opening the sheet. Replying must not reload.
    expect(api.listComments).toHaveBeenCalledTimes(1);
  });

  it('double-tapping "Gửi" posts exactly one comment', async () => {
    let resolve!: (v: unknown) => void;
    svc.addComment.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    await mount();
    await openCommentSheet();
    await act(async () => {
      input().props.onChangeText('một');
    });

    await act(async () => {
      sendButton().props.onPress();
      sendButton().props.onPress();
    });

    expect(svc.addComment).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(comment({ _id: 'c-new', authorId: 'me' }));
    });
  });

  it('offers "Xóa" only on comments the viewer may delete (B8)', async () => {
    api.listComments.mockResolvedValue({
      comments: [comment({ _id: 'mine', authorId: 'me', authorDisplayName: 'Tôi' })],
      nextCursor: null,
    });
    await mount();
    await openCommentSheet();

    const labels = renderer.root
      .findAll((n: ReactTestInstance) => typeof n.type !== 'string' && !!n.props.accessibilityLabel)
      .map((n: ReactTestInstance) => n.props.accessibilityLabel as string);
    expect(labels).toContain('Xóa bình luận của Tôi');
    expect(labels.some((l: string) => l.startsWith('Xóa bình luận của Người khác'))).toBe(false);
  });

  it('closing the sheet remounts the modal and clears the draft', async () => {
    // Regression: after closing, the RN 0.76 Fabric pageSheet window kept the
    // focus and froze the feed. The remount key is the mitigation; it only
    // works if closing also resets the state that would otherwise leak into
    // the next open.
    await mount();
    await openCommentSheet();
    await act(async () => {
      input().props.onChangeText('nửa chừng');
    });

    const close = renderer.root.find(
      (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Đóng bình luận',
    );
    await act(async () => {
      close.props.onPress();
    });

    const modalAfter = renderer.root.findByType(require('react-native').Modal);
    expect(modalAfter.props.visible).toBe(false);

    await openCommentSheet();
    expect(input().props.value).toBe('');
  });

  it('never counts a soft-deleted row in the thread (1 comment, not 3)', async () => {
    // Regression: the API returns deleted rows (they hold their slot) and the
    // card's stored count includes them. Opening the thread must show a
    // tombstone AND push the live count back onto the card.
    api.listComments.mockResolvedValue({
      comments: [
        comment({ _id: 'gone', content: 'đã xóa', isActive: false }),
        comment({ _id: 'live', content: 'còn đây' }),
        comment({ _id: 'live2', content: 'còn đây' }),
        comment({ _id: 'live3', content: 'còn đây' }),
        comment({ _id: 'live4', content: 'còn đây' }),
      ],
      nextCursor: null,
      deletedIds: ['gone'],
      activeCommentCount: 1,
    });

    await mount();
    await openCommentSheet();

    expect(findAllByText('Bình luận này đã bị xóa').length).toBeGreaterThan(0);
    expect(findAllByText('đã xóa').length).toBe(0);
    expect(svc.patchCommentCount).toHaveBeenCalledWith('p1', 1);
    // Tombstones are not actionable.
    const labels = renderer.root
      .findAll((n: ReactTestInstance) => typeof n.type !== 'string' && !!n.props.accessibilityLabel)
      .map((n: ReactTestInstance) => n.props.accessibilityLabel as string);
    // One "Trả lời" per host node; composite+host wrappers repeat each label,
    // so compare against the live-row count rather than an absolute number.
    const replyLabels = labels.filter((l: string) => l === 'Trả lời Người khác').length;
    expect(replyLabels).toBeGreaterThan(0);
    expect(replyLabels / 4).toBe(4);
    expect(labels.filter((l: string) => l === 'Xóa bình luận của Người khác').length).toBe(replyLabels);
  });

  it('own "Sửa bài viết" opens PostComposer and shows no delete dialog (B6)', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
    await mount();

    const card = renderer.root.find(
      (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.onPressMenu && n.props.post,
    );
    await act(async () => {
      card.props.onPressMenu('p1');
    });
    // Android has no ActionSheetIOS prompt; the screen falls back to Alert with
    // the same option order. Take whichever surface was used.
    const alertButtons = (alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[]) ?? [];

    // Simulate the user choosing the first option ("Sửa bài viết").
    const call = sheet.mock.calls[0] ?? [];
    const options = call[0]?.options as string[] | undefined;
    const titles = options ?? alertButtons.map((b) => b.text);
    expect(titles?.[0]).toBe('Sửa bài viết');
    await act(async () => {
      if (options) (call[1] as (i: number) => void)(0);
      else alertButtons[0]?.onPress?.();
    });

    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostComposer', { postId: 'p1' });
    expect(svc.deletePost).not.toHaveBeenCalled();
    // The edit path never opens the delete confirmation.
    expect(alert).not.toHaveBeenCalledWith(
      'Xóa bài viết?',
      expect.anything(),
      expect.anything(),
    );
  });

  it('share sends the caption + readable, routable link (B5)', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    svc.sharePost.mockResolvedValue({
      shareCount: 1,
      deepLink: 'koola://moments/post/p1',
      appLink: 'koola://moments/post/p1',
    });
    await mount();

    const card = renderer.root.find(
      (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.onPressShare && n.props.post,
    );
    await act(async () => {
      card.props.onPressShare('p1');
    });

    expect(share).toHaveBeenCalledWith({
      message: 'cap\n\nXem bài viết trên Koola: koola://moments/post/p1',
    });
  });
});
