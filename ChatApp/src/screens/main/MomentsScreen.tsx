/**
 * MomentsScreen.tsx
 *
 * Real implementation of the "Khoảnh khắc" (Moments) tab.
 * Replaces the placeholder screen.
 *
 * Shows a horizontal scrollable ring of story authors (unviewed first),
 * with pull-to-refresh and loading/empty/error states.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
  Pressable,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatTabStackParamList } from '../../navigation/types';
import { momentsService, type FeedRingItem, type MomentsState } from '../../services/moments/momentsService';
import { useAuth } from '../../contexts/AuthContext';
import MomentRing from '../../components/moments/MomentRing';
import { KoolaButton, KoolaText, KoolaState, KoolaSurface, KoolaSkeleton, koolaSpacing, useTheme } from '../../ui';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { Palette } from '../../ui/theme';
import { resolveMomentsView } from './momentsView';

type MomentsNavProp = NativeStackNavigationProp<ChatTabStackParamList>;

const MomentsScreen: React.FC = () => {
  const navigation = useNavigation<MomentsNavProp>();
  const { user } = useAuth();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [state, setState] = useState<MomentsState>(() => momentsService.getState());
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchAtRef = useRef(0);

  // Subscribe to service state updates (mount once)
  useEffect(() => {
    const unsub = momentsService.subscribe((s) => setState(s));
    return unsub;
  }, []);

  // Refresh feed on focus with 5s throttle to prevent redundant fetches
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetchAtRef.current > 5000) {
        lastFetchAtRef.current = Date.now();
        momentsService.refreshFeed();
      }
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchAtRef.current = Date.now();
    await momentsService.refreshFeed();
    setRefreshing(false);
  }, []);

  const handleRingPress = useCallback(
    (authorId: string, lastStoryId: string) => {
      navigation.push('MomentViewer', { authorId, startStoryId: lastStoryId });
    },
    [navigation],
  );

  const handleOwnLongPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Xem khoảnh khắc của tôi', 'Quản lý nổi bật', 'Hủy'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0 && user) {
            navigation.push('MomentViewer', {
              authorId: user._id,
              startStoryId: state.feedRing.find((r) => r.authorId === user._id)?.lastStoryId ?? '',
            });
          } else if (index === 1 && user) {
            navigation.push('Highlights', { userId: user._id, isOwn: true });
          }
        },
      );
    } else {
      Alert.alert('Khoảnh khắc của tôi', undefined, [
        {
          text: 'Xem khoảnh khắc của tôi',
          onPress: () => {
            if (!user) return;
            const ring = state.feedRing.find((r) => r.authorId === user._id);
            if (ring) {
              navigation.push('MomentViewer', { authorId: user._id, startStoryId: ring.lastStoryId });
            }
          },
        },
        {
          text: 'Quản lý nổi bật',
          onPress: () => user && navigation.push('Highlights', { userId: user._id, isOwn: true }),
        },
        { text: 'Hủy', style: 'cancel' },
      ]);
    }
  }, [navigation, user, state.feedRing]);

  const handleAddPress = useCallback(() => {
    navigation.push('MomentComposer');
  }, [navigation]);

  // Build ring list: own avatar first (always shown), then others
  const ownRing: FeedRingItem | undefined = user
    ? (state.feedRing.find((r) => r.authorId === user._id) ?? {
        authorId: user._id,
        lastStoryId: '',
        hasUnviewed: false,
        authorDisplayName: '',
        authorAvatar: null,
      })
    : undefined;
  const otherRings = state.feedRing.filter((r) => r.authorId !== user?._id);
  const unviewedCount = otherRings.filter((r) => r.hasUnviewed).length;
  const totalStoryCount = otherRings.length;

  const renderItem = useCallback(
    ({ item }: { item: FeedRingItem }) => {
      const isOwn = item.authorId === user?._id;
      return (
        <MomentRing
          authorId={item.authorId}
          displayName={isOwn ? (user?.displayName ?? 'Tôi') : (item.authorDisplayName || 'Người dùng')}
          avatarKey={isOwn ? user?.avatar : (item.authorAvatar ?? undefined)}
          hasUnviewed={item.hasUnviewed}
          isOwn={isOwn}
          onPress={() => {
            if (!item.lastStoryId) {
              // Own ring with no stories -> go to composer
              handleAddPress();
              return;
            }
            handleRingPress(item.authorId, item.lastStoryId);
          }}
          onLongPress={isOwn ? handleOwnLongPress : undefined}
          onAddPress={isOwn ? handleAddPress : undefined}
        />
      );
    },
    [user, handleRingPress, handleOwnLongPress, handleAddPress],
  );

  const rings: FeedRingItem[] = [
    ...(ownRing ? [ownRing] : []),
    ...otherRings,
  ];

  const viewState = resolveMomentsView({
    isLoading: state.isLoading,
    error: state.error,
    ringsLength: rings.length,
  });

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + koolaSpacing.sm, paddingBottom: tabBarInset }]}
      accessibilityLabel="Danh sách khoảnh khắc"
      accessibilityRole="list">
      <View style={styles.headerWrap}>
        <View style={styles.headerCopy}>
          <KoolaText variant="caption" tone="primary" weight="800" style={styles.eyebrow}>
            KHOẢNH KHẮC
          </KoolaText>
          <KoolaText variant="title">Khoảnh khắc</KoolaText>
          <KoolaText variant="body" tone="muted" style={styles.subtitle}>
            {totalStoryCount > 0
              ? `${unviewedCount} mới • ${totalStoryCount} bạn bè đang chia sẻ hôm nay`
              : 'Chia sẻ nhanh một ảnh, video hoặc bài hát trong ngày.'}
          </KoolaText>
        </View>
        <Pressable
          onPress={handleAddPress}
          accessibilityRole="button"
          accessibilityLabel="Tạo khoảnh khắc mới"
          accessibilityHint="Mở trình tạo khoảnh khắc"
          android_ripple={{ color: palette.primarySoft, borderless: true }}
          style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}>
          <MaterialIcons name="add" size={22} color={palette.surface} />
        </Pressable>
      </View>

      <KoolaSurface variant="raised" style={styles.ringCard}>
        {viewState === 'skeleton' ? (
          <View style={styles.skeletonRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonRingItem}>
                <KoolaSkeleton width={64} height={64} radius={32} />
                <KoolaSkeleton width={48} height={10} radius={4} style={styles.skeletonLabel} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={rings}
            keyExtractor={(item) => item.authorId}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.ringList}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={palette.primary}
              />
            }
            accessibilityRole="list"
            accessibilityLabel="Danh sách người dùng có khoảnh khắc"
          />
        )}
      </KoolaSurface>

      {viewState === 'error' && (
        <View style={styles.inlineState}>
          <KoolaState
            icon="wifi-off"
            title="Không thể tải khoảnh khắc"
            message={state.error || 'Kiểm tra kết nối rồi thử lại.'}
            actionLabel="Thử lại"
            onActionPress={() => momentsService.refreshFeed()}
          />
        </View>
      )}

      {viewState === 'empty' && (
        <View style={styles.inlineState}>
          <KoolaState
            icon="auto-awesome"
            title="Chưa có khoảnh khắc"
            message="Chia sẻ ảnh, video hoặc một bài hát để bạn bè biết hôm nay của bạn thế nào."
            actionLabel="Tạo khoảnh khắc"
            onActionPress={handleAddPress}
          />
        </View>
      )}

      {viewState === 'content' && otherRings.length === 0 && (
        <KoolaSurface variant="outline" style={styles.friendsEmpty}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="auto-awesome" size={24} color={palette.primary} />
          </View>
          <KoolaText variant="label" tone="ink" align="center">
            Bạn bè chưa đăng khoảnh khắc mới
          </KoolaText>
          <KoolaText variant="caption" tone="muted" align="center" style={styles.friendsEmptyHint}>
            Tạo khoảnh khắc của bạn để bắt đầu cuộc trò chuyện, hoặc kéo xuống để tải lại.
          </KoolaText>
          <KoolaButton
            title="Tạo khoảnh khắc"
            variant="secondary"
            size="sm"
            icon="add"
            onPress={handleAddPress}
            style={styles.friendsEmptyAction}
          />
        </KoolaSurface>
      )}
    </View>
  );
};

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    headerWrap: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: koolaSpacing.lg,
      marginBottom: koolaSpacing.md,
    },
    headerCopy: {
      flex: 1,
      marginRight: koolaSpacing.md,
    },
    eyebrow: {
      marginBottom: koolaSpacing.xs,
      letterSpacing: 0.8,
    },
    subtitle: {
      marginTop: koolaSpacing.xs,
      maxWidth: 280,
    },
    createButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    createButtonPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.98 }],
    },
    ringCard: {
      marginHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.md,
      overflow: 'hidden',
    },
    ringList: {
      paddingHorizontal: koolaSpacing.sm,
    },
    friendsEmpty: {
      marginHorizontal: koolaSpacing.lg,
      marginTop: koolaSpacing.lg,
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.xl,
      alignItems: 'center',
      backgroundColor: palette.surface,
    },
    emptyIconWrap: {
      width: 58,
      height: 58,
      borderRadius: 20,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: koolaSpacing.md,
    },
    friendsEmptyHint: {
      marginTop: koolaSpacing.sm,
    },
    friendsEmptyAction: {
      marginTop: koolaSpacing.md,
    },
    skeletonRow: {
      flexDirection: 'row',
      paddingHorizontal: koolaSpacing.sm,
    },
    skeletonRingItem: {
      width: 78,
      alignItems: 'center',
      marginHorizontal: 6,
    },
    skeletonLabel: {
      marginTop: koolaSpacing.xs,
    },
    inlineState: {
      marginHorizontal: koolaSpacing.lg,
      marginTop: koolaSpacing.lg,
      alignItems: 'center',
    },
  });

export default MomentsScreen;
