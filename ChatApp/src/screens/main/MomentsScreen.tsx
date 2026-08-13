/**
 * Màn hình Khoảnh khắc thật: header feed + danh sách Post mẫu.
 * Story vẫn lấy từ momentsService; Post sẽ được thay bằng service thật ở Pha 2.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ChatTabStackParamList } from '../../navigation/types';
import { momentsService, type FeedRingItem, type MomentsState } from '../../services/moments/momentsService';
import { useAuth } from '../../contexts/AuthContext';
import MomentsFeedHeader, { type FeedHeaderRing } from '../../components/moments/MomentsFeedHeader';
import PostCard, { type FeedPost } from '../../components/moments/PostCard';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import {
  KoolaEmptyState,
  KoolaErrorState,
  KoolaText,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { ChatSubTabVisibilityContext } from './ChatSubTabVisibilityContext';
import { resolveMomentsStoryRegion } from './momentsView';
import { MOCK_MOMENTS_POSTS } from './momentsMockPosts';

type MomentsNavProp = NativeStackNavigationProp<ChatTabStackParamList>;

const MomentsScreen: React.FC = () => {
  const navigation = useNavigation<MomentsNavProp>();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const tabBarInset = useTabBarBottomInset();
  const { width: screenWidth } = useWindowDimensions();
  const visibilityContext = React.useContext(ChatSubTabVisibilityContext);
  const previousScrollY = useSharedValue(0);
  const scrollDirection = useSharedValue(0);
  const directionTravel = useSharedValue(0);
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const { notify, toast } = useComingSoonToast();
  const initialState = momentsService.getState();
  const [state, setState] = useState<MomentsState>(initialState);
  const [posts, setPosts] = useState<FeedPost[]>(MOCK_MOMENTS_POSTS);
  const [refreshing, setRefreshing] = useState(false);
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

  const handleToggleLike = useCallback((postId: string) => {
    setPosts((current) => current.map((post) => post.id === postId ? {
      ...post,
      likedByMe: !post.likedByMe,
      reactionCount: post.reactionCount + (post.likedByMe ? -1 : 1),
    } : post));
  }, []);

  // Full-bleed feed: the list has no page gutter, so PostMediaGrid computes
  // media tile widths from the full screen width.
  const contentWidth = screenWidth;
  const renderPost = useCallback(({ item }: { item: FeedPost }) => (
    <PostCard
      post={item}
      contentWidth={contentWidth}
      onToggleLike={handleToggleLike}
      onPressComment={() => notify('Bình luận — chưa có backend')}
      onPressShare={() => notify('Chia sẻ — chưa có backend')}
      onPressAuthor={() => notify(`Mở trang ${item.authorDisplayName}`)}
      onPressMenu={() => notify('Menu bài viết — chưa có backend')}
      onPressMedia={() => notify('Mở ảnh toàn màn hình — chưa có backend')}
    />
  ), [contentWidth, handleToggleLike, notify]);

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
    // Phase 1: friend-empty banner removed — feed always shows with mock posts.
    // Phase 2 will gate feed on real Post API availability.
    return null;
  }, [handleAddPress, requestFeed, state.error, storyRegion, styles.regionState]);

  // Header ALWAYS renders when signed in: it is chrome (composer prompt, quick
  // actions) and it carries the own story ring, so it must not be gated behind
  // real friend stories. The story-region banner sits directly beneath it.
  const listHeader = useMemo(() => (
    <View>
      <MomentsFeedHeader
        myDisplayName={user?.displayName ?? 'Tôi'}
        myAvatar={user?.avatar ?? undefined}
        rings={rings}
        railLoading={railLoading}
        onPressComposer={handleAddPress}
        onPressQuickAction={handleQuickAction}
        onPressRing={handleRingPress}
        onLongPressOwnRing={handleOwnLongPress}
        onPressAddStory={handleAddPress}
      />
      {storyRegionBanner}
    </View>
  ), [handleAddPress, handleQuickAction, handleOwnLongPress, handleRingPress, railLoading, rings, storyRegionBanner, user?.avatar, user?.displayName]);

  return (
    <View style={styles.container} accessibilityLabel="Danh sách khoảnh khắc" accessibilityRole="list">
      <Animated.FlatList
        // Phase 1: the mock feed always renders — it is the whole point of the
        // phase (letting the user browse the feed shape on the real tab). Story
        // loading/error/empty are surfaced by the header banner, never by
        // blanking this list.
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.semantic.action.primary} />}
        removeClippedSubviews={false}
        initialNumToRender={4}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={100}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        accessibilityLabel="Bảng tin khoảnh khắc"
        ListFooterComponent={
          <View style={styles.footer}>
            <KoolaText variant="caption" tone="faint" align="center">
              Hết bài viết mới · dữ liệu mẫu
            </KoolaText>
          </View>
        }
      />
      {toast}
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
  footer: { paddingTop: koolaSpacing.lg, paddingBottom: koolaSpacing.lg },
});

export default MomentsScreen;
