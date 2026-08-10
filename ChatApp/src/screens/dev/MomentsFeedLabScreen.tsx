/**
 * MomentsFeedLabScreen.tsx
 *
 * __DEV__ only — not registered in production builds.
 *
 * Design preview for the proposed "Khoảnh khắc" tab format:
 *   [composer prompt] + [quick actions] + [story ring rail]  ← ListHeaderComponent
 *   [post card] [post card] ...                              ← vertical feed
 *
 * Runs on MOCK data. No backend Post capability exists yet, so nothing here
 * touches momentsService or the network. The three components previewed
 * (MomentsFeedHeader, PostCard, PostMediaGrid) are real and reusable — when the
 * Posts backend lands, MomentsScreen swaps mock arrays for service state.
 *
 * FlatList tuning mirrors the measured chat-scroll config:
 *   maxToRenderPerBatch 5 / updateCellsBatchingPeriod 100 /
 *   removeClippedSubviews FALSE (true re-crashes Fabric on back-nav, #53258).
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import PostCard, { type FeedPost } from '../../components/moments/PostCard';
import MomentsFeedHeader, {
  type FeedHeaderRing,
} from '../../components/moments/MomentsFeedHeader';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { KoolaText, koolaSpacing, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

// ─── Mock data ────────────────────────────────────────────────────────────────
// Remote URIs: UserAvatar and PostMediaGrid pass http(s) straight through to
// <Image>, so the preview renders real pixels without seeding the media cache.
// Tiles fall back to a neutral block if the device has no internet.

const AV = (seed: string) => `https://i.pravatar.cc/150?u=${seed}`;
const IMG = (id: number) => `https://picsum.photos/id/${id}/800/600`;

const MOCK_RINGS: FeedHeaderRing[] = [
  { authorId: 'me', displayName: 'Tôi', avatarKey: AV('me'), hasUnviewed: false, isOwn: true },
  { authorId: 'u1', displayName: 'Ngọc Anh', avatarKey: AV('u1'), hasUnviewed: true, isOwn: false },
  { authorId: 'u2', displayName: 'Minh Quân', avatarKey: AV('u2'), hasUnviewed: true, isOwn: false },
  { authorId: 'u3', displayName: 'Thu Hà', avatarKey: AV('u3'), hasUnviewed: true, isOwn: false },
  { authorId: 'u4', displayName: 'Đức Long', avatarKey: AV('u4'), hasUnviewed: false, isOwn: false },
  { authorId: 'u5', displayName: 'Phương Vy', avatarKey: AV('u5'), hasUnviewed: false, isOwn: false },
];

const MOCK_POSTS: FeedPost[] = [
  {
    id: 'p1',
    authorId: 'u1',
    authorDisplayName: 'Ngọc Anh',
    authorAvatar: AV('u1'),
    timeLabel: '2 giờ',
    audience: 'public',
    caption:
      'Chuyến đi Đà Lạt cuối tuần vừa rồi đẹp hơn mong đợi. Sương sớm, cà phê nóng, và một con đường thông dài vô tận. Nhất định sẽ quay lại vào tháng sau 🌲☕',
    media: [
      { uri: IMG(1018), mediaType: 'image', width: 800, height: 600 },
      { uri: IMG(1015), mediaType: 'image', width: 800, height: 600 },
    ],
    reactionCount: 34,
    commentCount: 12,
    shareCount: 3,
    likedByMe: false,
    comments: [
      {
        id: 'c1',
        authorDisplayName: 'Minh Quân',
        authorAvatar: AV('u2'),
        content: 'Ảnh thứ hai xuất sắc luôn 🔥',
        timeLabel: '1 giờ',
      },
    ],
  },
  {
    id: 'p2',
    authorId: 'u2',
    authorDisplayName: 'Minh Quân',
    authorAvatar: AV('u2'),
    timeLabel: '5 giờ',
    audience: 'connections',
    caption: 'Hôm nay deploy xong tính năng mới. Nhẹ cả người 😮‍💨',
    media: [],
    reactionCount: 8,
    commentCount: 0,
    shareCount: 0,
    likedByMe: true,
    comments: [],
  },
  {
    id: 'p3',
    authorId: 'u3',
    authorDisplayName: 'Thu Hà',
    authorAvatar: AV('u3'),
    timeLabel: 'Hôm qua',
    audience: 'public',
    caption:
      'Bộ ảnh mới nhận về từ studio. Chọn mãi không biết lấy tấm nào làm ảnh bìa, mọi người vote giúp mình với. Cảm giác tấm nào cũng có cái hay riêng, mà bìa thì chỉ được chọn một. Bộ này chụp trong hai buổi, một buổi sáng sớm ngoài trời và một buổi trong studio với đèn vàng, nên tông màu khác nhau khá rõ.',
    media: [
      { uri: IMG(1027), mediaType: 'image', width: 800, height: 600 },
      { uri: IMG(1025), mediaType: 'image', width: 800, height: 600 },
      { uri: IMG(1024), mediaType: 'image', width: 800, height: 600 },
      { uri: IMG(1035), mediaType: 'image', width: 800, height: 600 },
      { uri: IMG(1039), mediaType: 'image', width: 800, height: 600 },
    ],
    reactionCount: 1264,
    commentCount: 41,
    shareCount: 9,
    likedByMe: true,
    comments: [
      {
        id: 'c2',
        authorDisplayName: 'Phương Vy',
        authorAvatar: AV('u5'),
        content: 'Tấm 3 nhé, ánh sáng đẹp nhất trong bộ.',
        timeLabel: '20 giờ',
      },
      {
        id: 'c3',
        authorDisplayName: 'Đức Long',
        authorAvatar: AV('u4'),
        content: 'Mình thì thích tấm cuối hơn.',
        timeLabel: '18 giờ',
      },
    ],
  },
  {
    id: 'p4',
    authorId: 'u4',
    authorDisplayName: 'Đức Long',
    authorAvatar: AV('u4'),
    timeLabel: '2 ngày',
    audience: 'custom',
    caption: 'Góc làm việc mới, gọn hơn hẳn.',
    media: [{ uri: IMG(1050), mediaType: 'image', width: 800, height: 1000 }],
    reactionCount: 17,
    commentCount: 5,
    shareCount: 1,
    likedByMe: false,
    comments: [],
  },
  {
    id: 'p5',
    authorId: 'u5',
    authorDisplayName: 'Phương Vy',
    authorAvatar: AV('u5'),
    timeLabel: '3 ngày',
    audience: 'public',
    caption: 'Clip hậu trường buổi chụp hôm nọ 🎬',
    media: [{ uri: IMG(1043), mediaType: 'video', width: 800, height: 600, duration: 47 }],
    reactionCount: 52,
    commentCount: 7,
    shareCount: 2,
    likedByMe: false,
    comments: [],
  },
];

// Card sits inside a 16px page gutter on each side; media is full-bleed to the
// card edge, so the collage width is screen width minus both gutters.
const PAGE_GUTTER = koolaSpacing.md;

const MomentsFeedLabScreen: React.FC = () => {
  const { tokens, palette } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const { notify, toast } = useComingSoonToast();

  const [posts, setPosts] = useState<FeedPost[]>(MOCK_POSTS);
  const [refreshing, setRefreshing] = useState(false);

  const contentWidth = screenWidth - PAGE_GUTTER * 2;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  // Optimistic reaction toggle — demonstrates the interaction, local only.
  const handleToggleLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              reactionCount: p.reactionCount + (p.likedByMe ? -1 : 1),
            }
          : p,
      ),
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <PostCard
        post={item}
        contentWidth={contentWidth}
        onToggleLike={handleToggleLike}
        onPressComment={() => notify('Bình luận — chưa có backend')}
        onPressShare={() => notify('Chia sẻ — chưa có backend')}
        onPressAuthor={() => notify(`Mở trang ${item.authorDisplayName}`)}
        onPressMenu={() => notify('Menu bài viết')}
        onPressMedia={() => notify('Mở ảnh toàn màn hình')}
      />
    ),
    [contentWidth, handleToggleLike, notify],
  );

  const listHeader = useMemo(
    () => (
      <MomentsFeedHeader
        myDisplayName="Tôi"
        myAvatar={AV('me')}
        rings={MOCK_RINGS}
        onPressComposer={() => notify('Mở MomentComposer')}
        onPressQuickAction={(key) => notify(`Quick action: ${key}`)}
        onPressRing={(id) => notify(`Xem khoảnh khắc: ${id}`)}
        onLongPressOwnRing={() => notify('Menu khoảnh khắc của tôi')}
        onPressAddStory={() => notify('Tạo khoảnh khắc')}
      />
    ),
    [notify],
  );

  return (
    <View style={styles.container}>
      {/* In-app header. insets.top is the live value (0 when the RN root already
          starts below the cutout), so this cannot double-count like the native
          stack header did. */}
      <View style={[styles.header, { paddingTop: insets.top + koolaSpacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          android_ripple={{ color: palette.primarySoft, borderless: true }}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <MaterialIcons name="arrow-back" size={24} color={palette.primary} />
        </Pressable>
        <KoolaText variant="heading" numberOfLines={1} style={styles.headerTitle}>
          [DEV] Moments Feed Lab
        </KoolaText>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <View style={[styles.footer, { paddingBottom: insets.bottom + koolaSpacing.xl }]}>
            <KoolaText variant="caption" tone="faint" align="center">
              Hết bài viết mới · dữ liệu mẫu
            </KoolaText>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.semantic.action.primary}
          />
        }
        // Measured chat-scroll config. removeClippedSubviews MUST stay false.
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={100}
        initialNumToRender={4}
        windowSize={7}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        accessibilityRole="list"
        accessibilityLabel="Bảng tin khoảnh khắc"
      />
      {toast}
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: semantic.surface.level0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level1,
      paddingHorizontal: koolaSpacing.md,
      paddingBottom: koolaSpacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: koolaSpacing.xs,
    },
    backBtnPressed: {
      opacity: 0.78,
    },
    headerTitle: {
      flexShrink: 1,
    },
    listContent: {
      paddingHorizontal: PAGE_GUTTER,
    },
    footer: {
      paddingTop: koolaSpacing.lg,
    },
  });

export default MomentsFeedLabScreen;
