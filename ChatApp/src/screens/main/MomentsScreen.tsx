/**
 * Màn hình Khoảnh khắc: header feed + danh sách Post thật từ posts API.
 * Story lấy từ momentsService; Post đọc từ post state trong cùng service.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import type { ChatTabStackParamList } from '../../navigation/types';
import { momentsService, type FeedRingItem, type MomentsState } from '../../services/moments/momentsService';
import { postsApi, type PostCommentView } from '../../services/moments/postsApi';
import type { PostMediaItem } from '../../components/moments/PostMediaGrid';
import { useAuth } from '../../contexts/AuthContext';
import MomentsFeedHeader, { type FeedHeaderRing } from '../../components/moments/MomentsFeedHeader';
import PostCard, { type FeedPost } from '../../components/moments/PostCard';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import {
  KoolaButton,
  KoolaErrorState,
  KoolaText,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { acquireBackIntercept } from '../../services/nativeBack';
import { CHAT_CHROME_LIFT_DISTANCE, ChatSubTabVisibilityContext } from './ChatSubTabVisibilityContext';
import { ChatHomeHeaderInsetContext } from './ChatHomeHeaderInsetContext';
import { resolveMomentsStoryRegion } from './momentsView';

type MomentsNavProp = NativeStackNavigationProp<ChatTabStackParamList>;

const MomentsScreen: React.FC = () => {
  const navigation = useNavigation<MomentsNavProp>();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const tabBarInset = useTabBarBottomInset();
  const { width: screenWidth } = useWindowDimensions();
  const visibilityContext = React.useContext(ChatSubTabVisibilityContext);
  const headerInset = React.useContext(ChatHomeHeaderInsetContext);
  const previousScrollY = useSharedValue(0);
  const scrollDirection = useSharedValue(0);
  const directionTravel = useSharedValue(0);
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  // Comment-sheet keyboard shift (Android only). The window is edge-to-edge
  // (MainActivity clears decorFitsSystemWindows), so manifest adjustResize is
  // a no-op and the keyboard arrives only as a window inset — the same root
  // cause ChatScreen.tsx compensates for with useReanimatedKeyboardAnimation.
  // The whole sheet container travels (input row + reply banner + list, which
  // is why empty/loading states shift too), on the UI thread with no JS
  // re-render per keyboard frame. Deliberately NOT KeyboardAvoidingView: it is
  // a documented no-op on Android under edge-to-edge (see AuthFormShell).
  // Platform is read on the JS thread (style array composition), never inside
  // the worklet; iOS pageSheet already avoids the keyboard natively, so
  // shifting there too would double-move the sheet.
  // No Keyboard.addListener fallback: keyboard-controller's listener is global
  // (window inset, not view-hierarchy), so it fires while the Modal sheet is
  // open; a second JS-driven translate would double-shift and re-render the
  // FlatList per keyboard frame.
  const keyboard = useReanimatedKeyboardAnimation();
  const sheetShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.height.value }],
  }));
  const { notify, toast } = useComingSoonToast();
  const initialState = momentsService.getState();
  const [state, setState] = useState<MomentsState>(initialState);
  const [refreshing, setRefreshing] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentReplyTo, setCommentReplyTo] = useState<PostCommentView | null>(null);
  const [postComments, setPostComments] = useState<PostCommentView[]>([]);
  /**
   * Soft-deleted top-level rows in the loaded thread. The API still returns
   * them (chronological page + cursor) but they must never be counted — that
   * is how "1 comment" showed as "3 bình luận".
   */
  const [deletedCommentIds, setDeletedCommentIds] = useState<string[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  // Mirrors postComments (the sheet's rows) for callbacks that must not re-create
  // on every thread update (delete → count sync needs the rows after the
  // tombstone edit).
  const threadRef = useRef<PostCommentView[]>([]);
  useEffect(() => {
    threadRef.current = postComments;
  }, [postComments]);
  // Guards double-tap on "Gửi": a second press while the first request is in
  // flight would post the same text twice. The ref is checked synchronously
  // (state is not readable inside the same tick).
  const [sendingComment, setSendingComment] = useState(false);
  const sendingCommentRef = useRef(false);
  // RN 0.76 (Fabric) + `presentationStyle="pageSheet"`: the sheet's own window
  // stays "focused" after it closes, so no touch ever reaches the feed again —
  // every tap, tab switch included, is swallowed. Remounting the native modal
  // with a fresh `key` forces a new window; all sheet state must be reset at
  // the same time or it leaks into the next open.
  const [sheetEpoch, setSheetEpoch] = useState(0);
  // Mirrors commentPostId so closeComments (a stable useCallback([])) can
  // tell a real close from a duplicate fire without re-creating.
  const sheetOpenRef = useRef(false);
  const closeComments = useCallback(() => {
    // Idempotent: Android delivers BOTH Modal.onRequestClose AND the JS
    // hardwareBackPress listener for a single system-Back press. The second
    // fire must be a no-op — a second sheetEpoch bump would remount the Modal
    // window twice and re-open the leaked-window race (see the `key` comment
    // above). Same-tick double-taps on "Đóng" are absorbed here too.
    if (!sheetOpenRef.current) return;
    sheetOpenRef.current = false;
    setCommentPostId(null);
    setCommentText('');
    setCommentReplyTo(null);
    setPostComments([]);
    setDeletedCommentIds([]);
    setCommentsLoading(false);
    setSendingComment(false);
    sendingCommentRef.current = false;
    setSheetEpoch((n) => n + 1);
  }, []);
  // Hardware Back while the comment sheet is open (Android). Follows the
  // QrScannerModal / KoolaConfirmHost contract exactly: hold a JS
  // hardwareBackPress listener AND an acquireBackIntercept() lease for the
  // whole open window, releasing both in cleanup. Without the lease, native
  // runs the card shrink/nav-pop flow while the Modal dialog window is open;
  // the leaked window keeps focus and swallows every touch afterwards — the
  // freeze. The effect cleanup also runs on unmount-with-sheet-open, so
  // native never delegates Back to a dead JS side.
  // Keyboard ordering: one press closes the sheet outright (same as
  // QrScannerModal and the other overlay owners — none dismiss keyboard
  // first) instead of dismissing the keyboard first. The keyboard belongs to
  // the sheet's window, so closing the sheet dismisses it as a side effect.
  // (If the framework ever swallows a press for keyboard-dismiss only, the
  // next press still closes the sheet; either way there is no freeze.)
  // Deliberately outside the keyboard-shift mechanism above — this effect
  // owns Back only and never touches sheetShiftStyle.
  useEffect(() => {
    if (commentPostId === null) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeComments();
      return true;
    });
    // JS consumes Back while open → native skips any card shrink.
    const releaseIntercept = acquireBackIntercept();
    return () => {
      sub.remove();
      releaseIntercept();
    };
  }, [commentPostId, closeComments]);
  // State khởi tạo của momentsService là { isLoading: false, feedRing: [] }, nên
  // ở frame đầu tiên (trước khi useFocusEffect kịp gọi refreshFeed) resolver sẽ
  // ra "empty" rồi nháy sang "skeleton". hasAttemptedLoad đánh dấu đã kích hoạt
  // ít nhất một lần tải: trước đó coi như đang tải để hiện skeleton, tránh nháy.
  // Khởi tạo true nếu service đã có sẵn ring hoặc error từ lần vào trước.
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(
    () => initialState.feedRing.length > 0 || initialState.error !== null,
  );
  const lastFetchAtRef = useRef(0);

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!visibilityContext) return;
      const offsetY = Math.max(0, event.contentOffset.y);
      const delta = offsetY - previousScrollY.value;
      const lift = offsetY / CHAT_CHROME_LIFT_DISTANCE;
      visibilityContext.scrolledProgress.value = lift > 1 ? 1 : lift;
      if (offsetY <= 4) {
        directionTravel.value = 0;
        if (scrollDirection.value !== -1) {
          scrollDirection.value = -1;
          visibilityContext.hiddenProgress.value = withTiming(0, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
          });
        }
      } else if (delta > 0) {
        directionTravel.value = Math.max(0, directionTravel.value) + delta;
        if (directionTravel.value > 8 && scrollDirection.value !== 1) {
          scrollDirection.value = 1;
          visibilityContext.hiddenProgress.value = withTiming(1, {
            duration: 260,
            easing: Easing.out(Easing.cubic),
          });
        }
      } else if (delta < 0) {
        directionTravel.value = Math.min(0, directionTravel.value) + delta;
        if (directionTravel.value < -8 && scrollDirection.value !== -1) {
          scrollDirection.value = -1;
          visibilityContext.hiddenProgress.value = withTiming(0, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
          });
        }
      }
      previousScrollY.value = offsetY;
    },
  });

  useEffect(() => {
    const unsubscribe = momentsService.subscribe(setState);
    return unsubscribe;
  }, []);

  const requestFeed = useCallback(async () => {
    await momentsService.refreshFeed();
    await momentsService.refreshPosts();
    // Mark completion after the service publishes its terminal state. This
    // preserves skeleton through the synchronous loading notification and
    // switches to empty/error only after the first request really settles.
    setHasAttemptedLoad(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetchAtRef.current > 5000) {
        lastFetchAtRef.current = Date.now();
        void requestFeed();
      }
    }, [requestFeed]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchAtRef.current = Date.now();
    await requestFeed();
    setRefreshing(false);
  }, [requestFeed]);

  const handleAddPress = useCallback(() => navigation.push('MomentComposer'), [navigation]);

  const handleRingPress = useCallback(
    (authorId: string) => {
      const ring = state.feedRing.find((item) => item.authorId === authorId);
      if (!ring?.lastStoryId) {
        handleAddPress();
        return;
      }
      navigation.push('MomentViewer', { authorId, startStoryId: ring.lastStoryId });
    },
    [handleAddPress, navigation, state.feedRing],
  );

  const handleOwnLongPress = useCallback(() => {
    if (!user) return;
    const openOwn = () => {
      const ring = state.feedRing.find((item) => item.authorId === user._id);
      if (ring?.lastStoryId) navigation.push('MomentViewer', { authorId: user._id, startStoryId: ring.lastStoryId });
      else handleAddPress();
    };
    const openHighlights = () => navigation.push('Highlights', { userId: user._id, isOwn: true });
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Xem khoảnh khắc của tôi', 'Quản lý nổi bật', 'Hủy'], cancelButtonIndex: 2 },
        (index) => index === 0 ? openOwn() : index === 1 ? openHighlights() : undefined,
      );
    } else {
      Alert.alert('Khoảnh khắc của tôi', undefined, [
        { text: 'Xem khoảnh khắc của tôi', onPress: openOwn },
        { text: 'Quản lý nổi bật', onPress: openHighlights },
        { text: 'Hủy', style: 'cancel' },
      ]);
    }
  }, [handleAddPress, navigation, state.feedRing, user]);

  const ownRing = useMemo<FeedRingItem | undefined>(
    () => user
      ? state.feedRing.find((item) => item.authorId === user._id) ?? {
          authorId: user._id,
          lastStoryId: '',
          hasUnviewed: false,
          authorDisplayName: user.displayName ?? 'Tôi',
          authorAvatar: user.avatar ?? null,
        }
      : undefined,
    [state.feedRing, user],
  );
  const otherRings = useMemo(
    () => state.feedRing.filter((item) => item.authorId !== user?._id),
    [state.feedRing, user?._id],
  );
  const rings = useMemo<FeedHeaderRing[]>(
    () => [
      ...(ownRing ? [{
        authorId: ownRing.authorId,
        displayName: user?.displayName ?? 'Tôi',
        avatarKey: user?.avatar ?? undefined,
        hasUnviewed: ownRing.hasUnviewed,
        isOwn: true,
      }] : []),
      ...otherRings.map((item) => ({
        authorId: item.authorId,
        displayName: item.authorDisplayName || 'Người dùng',
        avatarKey: item.authorAvatar ?? undefined,
        hasUnviewed: item.hasUnviewed,
        isOwn: false,
      })),
    ],
    [otherRings, ownRing, user?.avatar, user?.displayName],
  );

  const handleQuickAction = useCallback((key: string) => {
    if (key === 'highlight') {
      if (user) navigation.push('Highlights', { userId: user._id, isOwn: true });
      else notify('Đăng nhập để quản lý nổi bật');
      return;
    }
    navigation.push('MomentComposer');
  }, [navigation, notify, user]);

  const posts = useMemo<FeedPost[]>(
    () => momentsService.getFeedPosts(),
    // Recompute when post state changes (service publishes a new object)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.postsById, state.feedIds],
  );

  const handleToggleLike = useCallback((postId: string) => {
    void momentsService.toggleLike(postId);
  }, []);

  const openComments = useCallback(async (postId: string) => {
    sheetOpenRef.current = true;
    setCommentPostId(postId);
    setCommentText('');
    setCommentReplyTo(null);
    setCommentsLoading(true);
    try {
      // The sheet posts via momentsService; the full comment list loads here.
      // Opening a post always starts a fresh thread — replying is a separate
      // action (startReply) so it never reloads the list or clears the draft.
      setPostComments([]);
      setDeletedCommentIds([]);
      const result = await postsApi.listComments(postId, { limit: 20 });
      setPostComments(result.comments);
      setDeletedCommentIds(result.deletedIds ?? []);
      // The stored count still includes soft-deleted rows (it is only
      // decremented by a live delete, so edits made elsewhere — or before this
      // thread loaded — keep it stale). The visible thread is the truth.
      if (typeof result.activeCommentCount === 'number') {
        momentsService.patchCommentCount(postId, result.activeCommentCount);
      }
    } catch {
      // Preview stays empty — the sheet still allows posting
      setPostComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  /** Reply to a comment WITHOUT reloading the thread or clearing the draft. */
  const startReply = useCallback((comment: PostCommentView) => {
    setCommentReplyTo(comment);
  }, []);

  /**
   * After a delete the card must show the server's active count, never
   * `previous - 1` (the card may already hold a corrected count, and the raw
   * field includes soft-deleted rows). The sheet's own rows are the fallback
   * when the count request fails.
   */
  const syncCommentCount = useCallback(async (postId: string, deletedId: string) => {
    await momentsService.syncCommentCount(postId, deletedId, threadRef.current);
  }, []);

  /** Comment author OR the post author may delete (mirrors the backend rule). */
  const canDeleteComment = useCallback((comment: PostCommentView) => {
    if (!user) return false;
    if (comment.authorId === user._id) return true;
    if (!commentPostId) return false;
    return momentsService.getState().postsById.get(commentPostId)?.authorId === user._id;
  }, [commentPostId, user]);

  const handleDeleteComment = useCallback(async (comment: PostCommentView) => {
    Alert.alert('Xóa bình luận?', undefined, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void momentsService
            .deleteComment(comment._id)
            .then(async () => {
              // Mirrors momentsService.deleteComment: the backend keeps the
              // deleted row (and its replies) in place. A top-level comment
              // becomes a tombstone; a deleted reply becomes one inside its
              // parent, keeping the slot and the "đã xóa" label.
              let removedTopLevel = false;
              setPostComments((current) =>
                current.map((c) => {
                  if (c._id === comment._id && !c.parentId) {
                    removedTopLevel = true;
                    return { ...c, isActive: false, replies: c.replies ?? [] };
                  }
                  if (!(c.replies ?? []).some((r) => r._id === comment._id)) {
                    return c;
                  }
                  return {
                    ...c,
                    replies: (c.replies ?? []).map((r) =>
                      r._id === comment._id ? { ...r, isActive: false } : r,
                    ),
                  };
                }),
              );
              if (removedTopLevel) {
                setDeletedCommentIds((ids) => [...ids, comment._id]);
              }
              // The count the card must show is the ACTIVE one returned by the
              // server, never `previous - 1`: the card may already hold the
              // corrected (active) count, which would lose a comment, and it
              // includes soft-deleted rows, which the delete only lowers by one.
              if (commentPostId) {
                await syncCommentCount(commentPostId, comment._id);
              }
              if (commentReplyTo?._id === comment._id) setCommentReplyTo(null);
            })
            .catch(() => notify('Xóa bình luận thất bại — thử lại'));
        },
      },
    ]);
  }, [commentPostId, commentReplyTo?._id, notify, syncCommentCount]);

  const handleSendComment = useCallback(async () => {
    // The ref, not the state: two presses in the same tick both read the state
    // from the previous render, so `sendingComment` alone let the second tap
    // through and posted the same text twice.
    if (!commentPostId || !commentText.trim() || sendingCommentRef.current) return;
    const text = commentText.trim();
    sendingCommentRef.current = true;
    setSendingComment(true);
    setCommentText('');
    try {
      const comment = await momentsService.addComment(
        commentPostId,
        text,
        commentReplyTo?._id,
      );
      // The server resolves replyCount/replies for top-level comments and
      // returns [] for a reply (no replies under a reply). Only fill what the
      // API omits so the row matches a later refetch.
      const row: PostCommentView = {
        ...comment,
        replies: comment.replies ?? [],
        replyCount: comment.replyCount ?? 0,
      };
      setPostComments((current) => {
        if (row.parentId) {
          // Reply: nest it under its parent (and bump replyCount) so the new
          // row shows the author resolved by the backend, not an empty name.
          return current.map((c) =>
            c._id === row.parentId
              ? {
                  ...c,
                  replies: [...(c.replies ?? []), row],
                  replyCount: (c.replyCount ?? 0) + 1,
                }
              : c,
          );
        }
        return [...current, row];
      });
      // The card's preview stays server state (latest 2 top-level comments).
      // Hand this row to the service instead of writing the thread back:
      // addComment already applied it, so this is a no-op unless the sheet and
      // the card disagree.
      momentsService.registerComment(commentPostId, row);
      setCommentReplyTo(null);
    } catch {
      notify('Gửi bình luận thất bại — thử lại');
      setCommentText(text);
    } finally {
      sendingCommentRef.current = false;
      setSendingComment(false);
    }
  }, [commentPostId, commentText, commentReplyTo, notify]);

  const handleShare = useCallback(async (postId: string) => {
    try {
      const result = await momentsService.sharePost(postId);
      const post = momentsService.getState().postsById.get(postId);
      const caption = post?.caption?.trim() ?? '';
      // Share the ROUTABLE link (`appLink`), not `deepLink`: a bare URI in a
      // chat is unreadable, so it gets a sentence around it. `deepLink` stays
      // reserved for a future web fallback once a share domain exists.
      await Share.share({
        message: caption
          ? `${caption}\n\nXem bài viết trên Koola: ${result.appLink}`
          : `Xem bài viết trên Koola: ${result.appLink}`,
      });
    } catch {
      notify('Chia sẻ thất bại — thử lại');
    }
  }, [notify]);

  const handleAuthor = useCallback((authorId: string) => {
    navigation.push('Profile', { userId: authorId });
  }, [navigation]);

  const handleMenu = useCallback((postId: string) => {
    const post = momentsService.getState().postsById.get(postId);
    if (!post) return;
    const isOwn = user?._id === post.authorId;
    const options = isOwn
      ? ['Sửa bài viết', 'Xóa bài viết', 'Hủy']
      : ['Báo cáo bài viết', 'Hủy'];
    const showAction = (index: number) => {
      if (isOwn) {
        if (index === 0) {
          // Editing is a screen, not an alert: Alert.prompt does not exist on
          // Android, and the old fallback showed a DELETE dialog under the
          // "Sửa bài viết" action — a destructive misfire.
          navigation.navigate('PostComposer', { postId });
        } else if (index === 1) {
          Alert.alert('Xóa bài viết?', 'Bài viết sẽ biến mất khỏi bảng tin.', [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Xóa',
              style: 'destructive',
              onPress: () => {
                void momentsService.deletePost(postId).catch(() => {
                  notify('Xóa bài viết thất bại — thử lại');
                });
              },
            },
          ]);
        }
      } else if (index === 0) {
        Alert.alert('Báo cáo bài viết', 'Cho chúng tôi biết lý do:', [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Nội dung không phù hợp',
            onPress: () => {
              void momentsService
                .reportPost(postId, 'Nội dung không phù hợp')
                .then(() => notify('Đã gửi báo cáo'))
                .catch(() => notify('Gửi báo cáo thất bại — thử lại'));
            },
          },
          {
            text: 'Spam',
            onPress: () => {
              void momentsService
                .reportPost(postId, 'Spam')
                .then(() => notify('Đã gửi báo cáo'))
                .catch(() => notify('Gửi báo cáo thất bại — thử lại'));
            },
          },
        ]);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: isOwn ? 1 : undefined },
        showAction,
      );
    } else {
      Alert.alert(
        'Bài viết',
        undefined,
        options.map((text, index) => ({
          text,
          style: (isOwn && index === 1 ? 'destructive' : undefined) as 'destructive' | undefined,
          onPress: index < options.length - 1 ? () => showAction(index) : undefined,
        })),
      );
    }
  }, [notify, user?._id]);

  const handleMedia = useCallback((postId: string, mediaIndex: number) => {
    const post = momentsService.getState().postsById.get(postId);
    if (!post) return;
    const items: PostMediaItem[] = post.media.map((m) => ({
      mediaKey: m.mediaKey,
      uri: m.mediaUrl ?? undefined,
      mediaType: m.mediaType,
      duration: m.duration ?? undefined,
    }));
    navigation.push('PostMediaViewer', { items, initialIndex: mediaIndex });
  }, [navigation]);

  // Full-bleed feed: the list has no page gutter, so PostMediaGrid computes
  // media tile widths from the full screen width.
  const contentWidth = screenWidth;
  const renderPost = useCallback(({ item }: { item: FeedPost }) => (
    <PostCard
      post={item}
      contentWidth={contentWidth}
      onToggleLike={handleToggleLike}
      onPressComment={(postId) => void openComments(postId)}
      onPressShare={(postId) => void handleShare(postId)}
      onPressAuthor={handleAuthor}
      onPressMenu={handleMenu}
      onPressMedia={handleMedia}
    />
  ), [contentWidth, handleToggleLike, openComments, handleShare, handleAuthor, handleMenu, handleMedia]);

  // Cold-load signal for the story rail. The same flag is forwarded to the
  // header, which renders in-place skeleton rings in the rail — the rail height
  // stays identical before/after loading settles, so nothing below it shifts.
  const railLoading = state.isLoading || !hasAttemptedLoad;

  // Story-rail region status. This describes ONLY the story rail, never the
  // whole screen (regression 2026-08-11): the header chrome and the Phase-1
  // mock feed always render. `hasFriendRings` is the meaningful signal because
  // the own ring is always synthesised, so it can never be a "content" signal.
  const storyRegion = resolveMomentsStoryRegion({
    // The service starts idle before useFocusEffect invokes refreshFeed. Treat
    // that first frame as cold-loading so the rail cannot flash friend-empty.
    isLoading: railLoading,
    error: state.error,
    hasFriendRings: otherRings.length > 0,
  });

  // Non-blocking banner for the story rail, rendered inside the header flow so
  // it never replaces the composer, quick actions, own ring, or the feed.
  // Cold loading is signalled by in-place skeletons in the ring rail
  // (MomentsFeedHeader), never by a banner here — a banner row inserted under
  // the rail and removed on settle shifted the whole feed vertically.
  const storyRegionBanner = useMemo(() => {
    if (storyRegion === 'error') {
      return (
        <KoolaErrorState
          style={styles.regionState}
          title="Không thể tải khoảnh khắc"
          message={state.error ?? 'Vui lòng kiểm tra kết nối và thử lại'}
          onRetry={requestFeed}
        />
      );
    }
    // Friend-empty no longer gates anything — the real feed renders below.
    return null;
  }, [handleAddPress, requestFeed, state.error, storyRegion, styles.regionState]);

  // Real post feed states: skeleton on cold load, inline retryable banner on
  // error (never a full-screen replacement), real empty state with composer.
  const postsLoading = state.isLoadingPosts || !hasAttemptedLoad;
  const postsEmpty = hasAttemptedLoad && !state.isLoadingPosts && posts.length === 0 && !state.postsError;

  const handleLoadMore = useCallback(() => {
    if (state.postsCursor && !state.isLoadingPosts) {
      void momentsService.loadMorePosts();
    }
  }, [state.postsCursor, state.isLoadingPosts]);

  const handleComposerPress = useCallback(() => navigation.push('PostComposer'), [navigation]);

  // Header ALWAYS renders when signed in: it is chrome (composer prompt, quick
  // actions) and it carries the own story ring, so it must not be gated behind
  // real friend stories. The story-region banner sits directly beneath it.
  // The composer entry opens the real PostComposer.
  const listHeader = useMemo(() => (
    <View>
      <MomentsFeedHeader
        myDisplayName={user?.displayName ?? 'Tôi'}
        myAvatar={user?.avatar ?? undefined}
        rings={rings}
        railLoading={railLoading}
        onPressComposer={handleComposerPress}
        onPressQuickAction={handleQuickAction}
        onPressRing={handleRingPress}
        onLongPressOwnRing={handleOwnLongPress}
        onPressAddStory={handleAddPress}
      />
      {storyRegionBanner}
      {/* Banner, not a replacement: `posts` still holds the posts already
          loaded (a feed failure keeps them). Swapping the list for a
          full-area error state would make a failed load-more erase the
          feed the user is reading. */}
      {state.postsError ? (
        <View style={styles.postsErrorBanner}>
          <KoolaErrorState
            style={styles.regionState}
            title="Không thể tải bài viết"
            message={state.postsError}
            onRetry={requestFeed}
          />
        </View>
      ) : null}
    </View>
  ), [handleAddPress, handleComposerPress, handleQuickAction, handleOwnLongPress, handleRingPress, railLoading, rings, storyRegionBanner, state.postsError, requestFeed, user?.avatar, user?.displayName, styles]);

  return (
    <View style={styles.container} accessibilityLabel="Danh sách khoảnh khắc" accessibilityRole="list">
      <Animated.FlatList
        // Real post feed: loading/error/empty are inline states, never a
        // full-screen replacement — the header chrome always renders.
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          postsEmpty ? (
            <View style={styles.emptyState}>
              <KoolaText variant="label" tone="muted" align="center">
                Chưa có bài viết nào
              </KoolaText>
              <KoolaText variant="caption" tone="faint" align="center" style={styles.emptyHint}>
                Hãy là người đầu tiên chia sẻ khoảnh khắc của bạn
              </KoolaText>
              <KoolaButton
                title="Viết bài đầu tiên"
                onPress={handleComposerPress}
                style={styles.emptyAction}
                accessibilityLabel="Viết bài đầu tiên"
              />
            </View>
          ) : undefined
        }
        // Starts at y=0 behind Chat Home's glass header + overlaid sub-tab bar;
        // reserve exactly the resting chrome so the feed header sits below it.
        contentContainerStyle={[styles.listContent, { paddingTop: headerInset, paddingBottom: tabBarInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.semantic.action.primary} progressViewOffset={headerInset} />}
        removeClippedSubviews={false}
        initialNumToRender={4}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={100}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        accessibilityLabel="Bảng tin khoảnh khắc"
        ListFooterComponent={
          postsLoading && posts.length > 0 ? (
            <View style={styles.footer}>
              <KoolaText variant="caption" tone="faint" align="center">
                Đang tải thêm...
              </KoolaText>
            </View>
          ) : !postsLoading && posts.length > 0 && !state.postsCursor ? (
            <View style={styles.footer}>
              <KoolaText variant="caption" tone="faint" align="center">
                Hết bài viết mới
              </KoolaText>
            </View>
          ) : null
        }
      />
      {toast}
      {/* Comment bottom-sheet. `key` is load-bearing — see `sheetEpoch`. */}
      <Modal
        key={sheetEpoch}
        visible={commentPostId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeComments}>
        <Animated.View style={[styles.sheet, Platform.OS === 'android' && sheetShiftStyle]}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              onPress={closeComments}
              accessibilityRole="button"
              accessibilityLabel="Đóng bình luận">
              <KoolaText tone="primary">Đóng</KoolaText>
            </TouchableOpacity>
            <KoolaText variant="label" weight="700">
              Bình luận
            </KoolaText>
            <View style={{ width: 40 }} />
          </View>
          <FlatList
            removeClippedSubviews={false}
            data={postComments}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => {
              // A soft-deleted row keeps its slot (and its replies are still
              // visible) but is a tombstone: no author, no actions, no reply
              // target, and never counted in "N bình luận".
              const isDeleted =
                deletedCommentIds.includes(item._id) || !item.isActive;
              if (isDeleted) {
                return (
                  <View style={styles.commentRow} accessibilityLabel="Bình luận đã xóa">
                    <KoolaText tone="faint" variant="caption">
                      Bình luận này đã bị xóa
                    </KoolaText>
                    {item.replies?.map((reply) => (
                      <View key={reply._id} style={styles.replyRow}>
                        <KoolaText variant="label" weight="700">
                          {reply.authorDisplayName || 'Người dùng'}
                        </KoolaText>
                        <KoolaText>{reply.isActive ? String(reply.content ?? '') : '[đã xóa]'}</KoolaText>
                      </View>
                    ))}
                  </View>
                );
              }
              return (
              <View style={styles.commentRow}>
                <KoolaText variant="label" weight="700">
                  {item.authorDisplayName || 'Người dùng'}
                </KoolaText>
                <KoolaText>{item.content}</KoolaText>
                <TouchableOpacity
                  onPress={() => startReply(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Trả lời ${item.authorDisplayName}`}>
                  <KoolaText variant="caption" tone="primary">
                    Trả lời
                  </KoolaText>
                </TouchableOpacity>
                {canDeleteComment(item) ? (
                  <TouchableOpacity
                    onPress={() => void handleDeleteComment(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa bình luận của ${item.authorDisplayName}`}>
                    <KoolaText variant="caption" tone="faint">
                      Xóa
                    </KoolaText>
                  </TouchableOpacity>
                ) : null}
                {item.replies?.map((reply) => (
                  <View key={reply._id ?? `${item._id}-reply`} style={styles.replyRow}>
                    <KoolaText variant="label" weight="700">
                      {reply.authorDisplayName || 'Người dùng'}
                    </KoolaText>
                    <KoolaText>{reply.isActive ? String(reply.content ?? '') : '[đã xóa]'}</KoolaText>
                  </View>
                ))}
              </View>
              );
            }}
            ListEmptyComponent={
              commentsLoading ? (
                <KoolaText tone="muted" align="center" style={styles.regionState}>
                  Đang tải bình luận...
                </KoolaText>
              ) : (
                <KoolaText tone="faint" align="center" style={styles.regionState}>
                  Chưa có bình luận — hãy là người đầu tiên
                </KoolaText>
              )
            }
          />
          {commentReplyTo ? (
            <View style={styles.replyBanner}>
              <KoolaText variant="caption" tone="muted">
                {`Trả lời ${commentReplyTo.authorDisplayName ?? ''}`}
              </KoolaText>
              <TouchableOpacity
                onPress={() => setCommentReplyTo(null)}
                accessibilityRole="button"
                accessibilityLabel="Hủy trả lời">
                <KoolaText variant="caption" tone="primary">
                  Hủy
                </KoolaText>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.commentInputRow}>
            <TextInput
              value={commentText}
              onChangeText={(text) => setCommentText(text.slice(0, 1000))}
              placeholder="Viết bình luận..."
              style={styles.commentInput}
              accessibilityLabel="Nhập bình luận"
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={sendingComment || commentText.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Gửi bình luận"
              accessibilityState={{ disabled: sendingComment }}>
              <KoolaText tone={sendingComment ? 'muted' : 'primary'} weight="700">
                {sendingComment ? 'Đang gửi...' : 'Gửi'}
              </KoolaText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: semantic.surface.level0 },
  // Full-bleed feed: no page gutter here — the header and PostCards each own
  // their internal padding, and PostMediaGrid media spans the full screen width.
  listContent: {},
  // Error cards sit inline in the feed flow, not centered on a blank screen, so
  // the composer, quick actions, own ring, and feed stay put.
  regionState: { paddingVertical: koolaSpacing.lg },
  postsErrorBanner: { paddingHorizontal: koolaSpacing.lg },
  footer: { paddingTop: koolaSpacing.lg, paddingBottom: koolaSpacing.lg },
  emptyState: { paddingVertical: koolaSpacing.xl * 2, paddingHorizontal: koolaSpacing.lg, alignItems: 'center' },
  emptyHint: { marginTop: koolaSpacing.sm },
  emptyAction: { marginTop: koolaSpacing.lg, minWidth: 180 },
  sheet: { flex: 1, backgroundColor: semantic.surface.level0 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: koolaSpacing.md,
    paddingVertical: koolaSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.border.subtle,
  },
  commentRow: { paddingHorizontal: koolaSpacing.md, paddingVertical: koolaSpacing.sm },
  replyRow: { marginLeft: koolaSpacing.lg, marginTop: koolaSpacing.xs, paddingLeft: koolaSpacing.sm, borderLeftWidth: 2, borderLeftColor: semantic.border.subtle },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: koolaSpacing.md,
    paddingVertical: koolaSpacing.xs,
    backgroundColor: semantic.surface.level1,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: koolaSpacing.md,
    paddingVertical: koolaSpacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border.subtle,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: semantic.border.subtle,
    borderRadius: 20,
    paddingHorizontal: koolaSpacing.md,
    paddingVertical: koolaSpacing.xs,
    marginRight: koolaSpacing.sm,
  },
});

export default MomentsScreen;
