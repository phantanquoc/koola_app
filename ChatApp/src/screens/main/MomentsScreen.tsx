/**
 * MomentsScreen.tsx
 *
 * Real implementation of the "Khoảnh khắc" (Moments) tab.
 * Replaces the placeholder screen.
 *
 * Shows a horizontal scrollable ring of story authors (unviewed first),
 * with pull-to-refresh and loading/empty/error states.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  RefreshControl,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatTabStackParamList } from '../../navigation/types';
import { momentsService, type FeedRingItem, type MomentsState } from '../../services/moments/momentsService';
import { useAuth } from '../../contexts/AuthContext';
import MomentRing from '../../components/moments/MomentRing';
import { KoolaText, KoolaState, koolaColors } from '../../ui';

type MomentsNavProp = NativeStackNavigationProp<ChatTabStackParamList>;

const MomentsScreen: React.FC = () => {
  const navigation = useNavigation<MomentsNavProp>();
  const { user } = useAuth();

  const [state, setState] = useState<MomentsState>(() => momentsService.getState());
  const [refreshing, setRefreshing] = useState(false);

  // Subscribe to service state updates (mount once)
  useEffect(() => {
    const unsub = momentsService.subscribe((s) => setState(s));
    return unsub;
  }, []);

  // Refresh feed every time tab gains focus
  useFocusEffect(
    useCallback(() => {
      momentsService.refreshFeed();
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
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
          options: ['Xem khoảnh khắc của tôi', 'Quản lý Highlights', 'Hủy'],
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
          text: 'Quản lý Highlights',
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
      })
    : undefined;
  const otherRings = state.feedRing.filter((r) => r.authorId !== user?._id);

  const renderItem = useCallback(
    ({ item }: { item: FeedRingItem }) => {
      const isOwn = item.authorId === user?._id;
      return (
        <MomentRing
          authorId={item.authorId}
          displayName={isOwn ? (user?.displayName ?? 'Tôi') : item.authorId}
          avatarKey={isOwn ? user?.avatar : undefined}
          hasUnviewed={item.hasUnviewed}
          isOwn={isOwn}
          onPress={() => {
            if (!item.lastStoryId) {
              // Own ring with no stories → go to composer
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

  if (state.isLoading && state.feedRing.length === 0) {
    return (
      <View style={styles.center}>
        <KoolaState
          icon="hourglass-empty"
          title="Đang tải..."
          message="Vui lòng chờ trong giây lát."
        />
      </View>
    );
  }

  if (state.error && state.feedRing.length === 0) {
    return (
      <View style={styles.center}>
        <KoolaState
          icon="wifi-off"
          title="Không thể tải khoảnh khắc"
          message={state.error}
          actionLabel="Thử lại"
          onActionPress={() => momentsService.refreshFeed()}
        />
      </View>
    );
  }

  const rings: FeedRingItem[] = [
    ...(ownRing ? [ownRing] : []),
    ...otherRings,
  ];

  if (!state.isLoading && rings.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={koolaColors.primary}
          />
        }>
        <KoolaState
          icon="auto-awesome"
          title="Chưa có khoảnh khắc"
          message="Nhấn vào ảnh đại diện của bạn để tạo khoảnh khắc đầu tiên."
        />
      </ScrollView>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel="Danh sách khoảnh khắc"
      accessibilityRole="list">
      <View style={styles.header}>
        <KoolaText variant="heading" weight="700" tone="ink">
          Khoảnh khắc
        </KoolaText>
      </View>

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
            tintColor={koolaColors.primary}
          />
        }
        accessibilityRole="list"
        accessibilityLabel="Danh sách người dùng có khoảnh khắc"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  ringList: {
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
});

export default MomentsScreen;
