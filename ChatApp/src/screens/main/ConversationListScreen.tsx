import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
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
import EmptyConversations from '../../components/EmptyConversations';
import LoadingFooter from '../../components/LoadingFooter';
import GroupCreateModal from '../../components/GroupCreateModal';
import { useMessageSync } from '../../hooks/useMessageSync';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineQueueService } from '../../services/OfflineQueueService';
import OfflineBanner from '../../components/OfflineBanner';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { KoolaState, koolaColors } from '../../ui';
import { useLocalFirstFlag } from '../../config/featureFlags';
import * as conversationRepository from '../../services/db/conversationRepository';
import type { ConversationInput } from '../../services/db/conversationRepository';
import { syncOnForeground } from '../../services/sync/syncOrchestrator';
import * as syncStateRepository from '../../services/db/syncStateRepository';

const Separator = () => <View style={styles.separator} />;

const ConversationListScreen: React.FC = () => {
  const navigation = useNavigation<ConversationListScreenNavigationProp>();
  const tabBarInset = useTabBarBottomInset();
  const { user } = useAuth();
  const { sync } = useMessageSync();
  const { isConnected } = useNetworkStatus();
  const localFirstEnabled = useLocalFirstFlag();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const fetchingRef = useRef(false);
  const pageRef = useRef(1);

  // ─── SQLite read path (task 5.4) ──────────────────────────────────────────
  // When LOCAL_FIRST_SQLITE is on: read from conversationRepository + subscribe.
  // Replace the useFocusEffect REST reset with: read SQLite first, fire
  // background sync if cursor is stale.
  useEffect(() => {
    if (!localFirstEnabled) return;

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
  }, [localFirstEnabled]);

  const fetchConversations = useCallback(
    async (reset = false) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      const targetPage = reset ? 1 : pageRef.current;
      if (reset) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await conversationsApi.list(targetPage, 20);
        // Pre-warm avatar cache from disk BEFORE rendering conversations
        const avatarKeys = data.conversations
          .flatMap((c) => c.members.map((m) => m.user?.avatar))
          .filter((a): a is string => !!a);
        if (avatarKeys.length > 0) await warmMemoryCache(avatarKeys);

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
        setError('Failed to load conversations');
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
      fetchConversations(true);
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

  const handleConversationPress = (conv: Conversation) => {
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
  };

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

  if (error && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KoolaState
          icon="wifi-off"
          title="Không thể tải hội thoại"
          message={error}
          actionLabel="Thử lại"
          onActionPress={() => fetchConversations(true)}
          style={styles.errorContainer}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <OfflineBanner isVisible={isConnected === false} />
      <FlatList
        // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
        removeClippedSubviews={false}
        data={conversations}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ConversationListItem
            conversation={item}
            onPress={() => handleConversationPress(item)}
          />
        )}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading && !refreshing ? <EmptyConversations onStartChat={handleStartChat} /> : null
        }
        ListFooterComponent={
          hasMore ? <LoadingFooter loading={loading} onLoadMore={handleLoadMore} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={koolaColors.primary}
          />
        }
        ItemSeparatorComponent={Separator}
      />

      <GroupCreateModal
        visible={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreated={handleGroupCreated}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: koolaColors.surface },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: koolaColors.line },
  errorContainer: { flex: 1 },
});

export default ConversationListScreen;
