import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  InteractionManager,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { Conversation } from '../../types';
import type { ConversationListScreenNavigationProp } from '../../navigation/types';
import { conversationsApi } from '../../services/api/apiService';
import { socketService } from '../../services/socket/SocketService';
import { warmMemoryCache } from '../../services/media/mediaCacheService';
import { useAuth } from '../../contexts/AuthContext';
import ConversationListItem from '../../components/ConversationListItem';
import LoadingFooter from '../../components/LoadingFooter';
import GroupCreateModal from '../../components/GroupCreateModal';
import { useMessageSync } from '../../hooks/useMessageSync';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineQueueService } from '../../services/OfflineQueueService';
import OfflineBanner from '../../components/OfflineBanner';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import {
  KoolaEmptyState,
  KoolaErrorState,
  KoolaLoadingState,
  KoolaOfflineState,
  useTheme,
} from '../../ui';
import { useLocalFirstFlag } from '../../config/featureFlags';
import * as conversationRepository from '../../services/db/conversationRepository';
import type { ConversationInput } from '../../services/db/conversationRepository';
import { syncOnForeground } from '../../services/sync/syncOrchestrator';
import * as syncStateRepository from '../../services/db/syncStateRepository';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChatSubTabVisibilityContext } from './ChatSubTabVisibilityContext';

const Separator = ({ tokens: t }: { tokens: SemanticTokens }) => (
  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border.subtle }} />
);

const ConversationListScreen: React.FC = () => {
  const navigation = useNavigation<ConversationListScreenNavigationProp>();
  const tabBarInset = useTabBarBottomInset();
  const { user, activeAccount } = useAuth();
  const { sync } = useMessageSync();
  const { isConnected } = useNetworkStatus();
  const localFirstEnabled = useLocalFirstFlag();
  const { tokens } = useTheme();
  const visibilityContext = React.useContext(ChatSubTabVisibilityContext);
  const previousScrollY = useSharedValue(0);
  const scrollDirection = useSharedValue(0);
  const directionTravel = useSharedValue(0);

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

  const screenStyles = useMemo(() => makeScreenStyles(tokens.semantic), [tokens.semantic]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const fetchingRef = useRef(false);
  const pageRef = useRef(1);
  const lastFetchAtRef = useRef(0);

  // ─── SQLite read path (task 5.4) ──────────────────────────────────────────
  // When LOCAL_FIRST_SQLITE is on: read from conversationRepository + subscribe.
  // Replace the useFocusEffect REST reset with: read SQLite first, fire
  // background sync if cursor is stale.
  //
  // Re-runs on account switch (activeAccount?._id): switchAccount() wipes the DB
  // and clears the invalidation broadcaster, which silently drops this screen's
  // subscription. Without the dep the effect would never re-subscribe, so the
  // list would keep rendering the previous account's stale conversations even
  // after REST re-seeds SQLite for the new account.
  useEffect(() => {
    if (!localFirstEnabled) return;

    // Clear any stale rows from the previous account immediately so the list
    // never flashes the old account's conversations while the new ones load.
    setConversations([]);

    // Initial read from SQLite
    const loadFromDb = () => {
      const t0 = Date.now();
      const rows = conversationRepository.list({ limit: 50 });
      const tQuery = Date.now();
      // Map ConversationInput to Conversation shape for the existing UI
      const mapped = rows.map((r: ConversationInput) => ({
        _id: r.id,
        type: r.type ?? 'direct',
        name: r.name ?? '',
        avatar: r.avatarKey ?? null,
        members: Array.isArray(r.members) ? r.members : [],
        lastMessagePreview: r.lastMessagePreview ?? '',
        lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt as number).toISOString() : null,
        unreadCount: r.unreadCount ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt as number).toISOString() : new Date().toISOString(),
      })) as unknown as Conversation[];
      setConversations(mapped);
      console.log(`[PERF ConvList] SQLite queryMs=${tQuery - t0} mapMs=${Date.now() - tQuery} rows=${rows.length}`);
    };

    loadFromDb();

    // Subscribe to invalidations
    const unsub = conversationRepository.subscribe(loadFromDb);

    // Fire background sync if cursor is stale (> 60 s)
    const cursor = syncStateRepository.getCursor('global');
    const isStale = !cursor || Date.now() - new Date(cursor).getTime() > 60_000;
    if (isStale) {
      syncOnForeground().catch((err) =>
        console.warn('[ConversationListScreen] background sync error:', err),
      );
    }

    return unsub;
  }, [localFirstEnabled, activeAccount?._id]);

  const fetchConversations = useCallback(
    async (reset = false) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      const targetPage = reset ? 1 : pageRef.current;
      if (reset) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await conversationsApi.list(targetPage, 20);
        // Warm avatar cache post-render (fire-and-forget) — does not gate list paint
        const avatarKeys = data.conversations
          .flatMap((c) => c.members.map((m) => m.user?.avatar))
          .filter((a): a is string => !!a);
        if (avatarKeys.length > 0) {
          InteractionManager.runAfterInteractions(() => {
            try {
              warmMemoryCache(avatarKeys).catch(() => {});
            } catch {
              // Swallow — cache warm is additive, not a render precondition
            }
          });
        }

        // Local-first additive seed: when flag is on, mirror REST result into
        // SQLite so the subscription-driven render path has data to show.
        // Legacy in-memory state is still maintained below for the flag-off path.
        if (localFirstEnabled) {
          try {
            const inputs = data.conversations.map((c) => ({
              id: c._id,
              type: c.type,
              name: c.name ?? null,
              avatarKey: c.avatar ?? null,
              members: c.members,
              lastMessageId: null,
              lastMessagePreview: c.lastMessagePreview ?? null,
              lastMessageAt: c.lastMessageAt ?? 0,
              unreadCount: c.unreadCount ?? 0,
              pinned: false,
              archived: false,
              updatedAt: c.updatedAt,
            }));
            conversationRepository.upsertMany(inputs);
          } catch (e) {
            console.warn('[ConversationListScreen] SQLite seed failed:', e);
          }
        }

        // When flag is ON, SQLite is the single source of truth for the list.
        // REST data was already upserted into SQLite above; the subscription
        // will fire loadFromDb() automatically — do NOT call setConversations here.
        if (!localFirstEnabled) {
          if (reset) {
            setConversations(data.conversations);
            pageRef.current = 2;
            setPage(2);
          } else {
            setConversations((prev) => [...prev, ...data.conversations]);
            pageRef.current = pageRef.current + 1;
            setPage((p) => p + 1);
          }
        }
        setHasMore(data.hasMore);
        setError(null);
      } catch {
        setError('Không thể kết nối đến máy chủ.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [localFirstEnabled],
  );

  // Fetch on focus — refresh list when returning from chat.
  // Always reset (page 1) on focus; never append on focus, which would
  // duplicate the existing in-memory list. Subsequent updates come from
  // socket events, not REST polling.
  // When LOCAL_FIRST_SQLITE is on we still hit REST here so SQLite stays
  // seeded; the flag-on read path above also subscribes to invalidations
  // for live updates from socket events.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetchAtRef.current > 5000) {
        lastFetchAtRef.current = Date.now();
        fetchConversations(true);
      }
    }, [fetchConversations]),
  );

  // Sync missed messages + flush offline queue on reconnect
  useEffect(() => {
    if (isConnected) {
      sync().then(() => {
        offlineQueueService.processQueue();
      });
    }
  }, [isConnected, sync]);

  // Keep a fresh user ref so socket handlers always see the current userId
  // without re-subscribing the listener on every user change.
  const userIdRef = useRef<string | undefined>(user?._id);
  useEffect(() => {
    userIdRef.current = user?._id;
  }, [user?._id]);

  // Socket: new_message → update list
  // When LOCAL_FIRST_SQLITE is ON: socketEventRouter already calls
  // conversationRepository.bumpFromMessage which fires the subscription
  // and triggers loadFromDb(). Do NOT also call setConversations here —
  // that would be the third conflicting write path (Bug #1').
  useEffect(() => {
    const handleNewMessage = (data: { message: { conversationId: string; content: string; createdAt: string; senderId?: string } }) => {
      if (localFirstEnabled) return; // SQLite subscription handles this path
      const msg = data.message;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c._id === msg.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const conv = { ...updated[idx] };
        conv.lastMessagePreview = msg.content;
        conv.lastMessageAt = msg.createdAt;
        // Only increment unread for messages from others
        if (msg.senderId && msg.senderId !== userIdRef.current) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
        updated.splice(idx, 1);
        return [conv, ...updated];
      });
    };

    const handlePresenceUpdate = (data: { userId: string; isOnline: boolean }) => {
      setConversations((prev) =>
        prev.map((conv) => ({
          ...conv,
          members: conv.members.map((m) =>
            m.userId === data.userId && m.user
              ? { ...m, user: { ...m.user, isOnline: data.isOnline } }
              : m,
          ),
        })),
      );
    };

    socketService.on('new_message', handleNewMessage as (...args: unknown[]) => void);
    socketService.on('presence_update', handlePresenceUpdate as (...args: unknown[]) => void);

    return () => {
      socketService.off('new_message', handleNewMessage as (...args: unknown[]) => void);
      socketService.off('presence_update', handlePresenceUpdate as (...args: unknown[]) => void);
    };
  }, [localFirstEnabled]);

  const handleRefresh = () => fetchConversations(true);
  const handleLoadMore = () => { if (hasMore && !loading) fetchConversations(false); };

  const handleConversationPress = useCallback((conv: Conversation) => {
    // Extract other member's displayName + avatar for instant header render
    let displayName: string | undefined;
    let avatar: string | undefined;
    if (conv.type !== 'group') {
      const other = conv.members.find((m) => m.userId !== user?._id);
      if (other?.user) {
        displayName = other.user.displayName;
        avatar = other.user.avatar;
      }
    } else {
      displayName = conv.name;
      avatar = conv.avatar;
    }
    navigation.navigate('Chat', { conversationId: conv._id, displayName, avatar });
  }, [navigation, user?._id]);

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationListItem
        conversation={item}
        onPress={() => handleConversationPress(item)}
      />
    ),
    [handleConversationPress],
  );

  const handleGroupCreated = (conv: Conversation) => {
    if (localFirstEnabled) {
      // When flag ON: SQLite is the single source of truth.
      // Upsert the new conversation so the subscription fires loadFromDb()
      // and updates the UI — do NOT write to in-memory state directly.
      try {
        const input: ConversationInput = {
          id: conv._id,
          type: conv.type,
          name: conv.name ?? null,
          avatarKey: conv.avatar ?? null,
          members: conv.members,
          lastMessageId: null,
          lastMessagePreview: conv.lastMessagePreview ?? null,
          lastMessageAt: conv.lastMessageAt ?? 0,
          unreadCount: conv.unreadCount ?? 0,
          pinned: false,
          archived: false,
          updatedAt: conv.updatedAt,
        };
        conversationRepository.upsertMany([input]);
      } catch (e) {
        console.warn('[ConversationListScreen] handleGroupCreated: SQLite upsert failed', e);
      }
    } else {
      setConversations((prev) => [conv, ...prev]);
    }
  };

  const handleStartChat = () => {
    // Contacts are now a sub-tab within ChatHomeScreen (ChatSubTabParamList)
    navigation.getParent()?.navigate('Contacts');
  };

  const SeparatorComponent = useCallback(() => <Separator tokens={tokens.semantic} />, [tokens.semantic]);

  if (error && conversations.length === 0 && isConnected !== false) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <KoolaErrorState
          icon="wifi-off"
          title="Không thể tải hội thoại"
          message={error}
          actionLabel="Thử lại"
          onRetry={() => fetchConversations(true)}
          style={screenStyles.errorContainer}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <OfflineBanner
        isVisible={isConnected === false && conversations.length > 0}
      />
      <Animated.FlatList
        // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
        removeClippedSubviews={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        data={conversations}
        keyExtractor={(item) => item._id}
        renderItem={renderConversation}
        contentContainerStyle={[
          screenStyles.listContent,
          { paddingBottom: tabBarInset },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListEmptyComponent={
          loading || refreshing ? (
            <KoolaLoadingState
              title="Đang tải hội thoại"
              style={screenStyles.stateContainer}
            />
          ) : isConnected === false ? (
            <KoolaOfflineState
              onRetry={handleRefresh}
              style={screenStyles.stateContainer}
            />
          ) : (
            <KoolaEmptyState
              title="Chưa có cuộc trò chuyện"
              message="Bắt đầu một cuộc trò chuyện mới từ danh bạ của bạn."
              icon="forum"
              actionLabel="Bắt đầu trò chuyện"
              onActionPress={handleStartChat}
              style={screenStyles.stateContainer}
            />
          )
        }
        ListFooterComponent={
          hasMore ? <LoadingFooter loading={loading} onLoadMore={handleLoadMore} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.semantic.action.primary}
          />
        }
        ItemSeparatorComponent={SeparatorComponent}
      />

      <GroupCreateModal
        visible={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreated={handleGroupCreated}
      />
    </SafeAreaView>
  );
};

// ─── Token-aware styles ─────────────────────────────────────────────────────
function makeScreenStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: semantic.bg.canvas },
    errorContainer: { flex: 1 },
    listContent: { flexGrow: 1 },
    stateContainer: { flex: 1 },
  });
}

export default ConversationListScreen;
