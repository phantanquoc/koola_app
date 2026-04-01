import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { conversationsApi } from '../../services/api/apiService';
import { socketService } from '../../services/socket/SocketService';
import { storage } from '../../utils/asyncStorage';
import { ConversationListItem } from '../../components/ConversationListItem';
import { EmptyConversations } from '../../components/EmptyConversations';
import { LoadingFooter } from '../../components/LoadingFooter';
import { GroupCreateModal } from '../../components/GroupCreateModal';
import type { Conversation, User } from '../../types';
import type { ConversationListScreenProps } from '../../navigation/types';

const PAGE_SIZE = 20;

export const ConversationListScreen: React.FC<ConversationListScreenProps> = ({
  navigation,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupModalVisible, setGroupModalVisible] = useState(false);

  const fetchConversations = useCallback(async (reset = false) => {
    const targetPage = reset ? 1 : page;
    try {
      setError(null);
      const { data } = await conversationsApi.list(targetPage, PAGE_SIZE);
      if (reset) {
        setConversations(data.conversations);
      } else {
        setConversations((prev) => [...prev, ...data.conversations]);
      }
      setHasMore(data.hasMore);
      if (!reset) setPage(targetPage);
    } catch {
      setError('Failed to load conversations');
    }
  }, [page]);

  // Initial fetch + sync missed messages on mount
  useEffect(() => {
    setLoading(true);
    (async () => {
      // Sync missed messages on reconnect (handled centrally in AuthContext;
      // here we just restore lastSyncAt so ConversationListScreen has fresh data)
      const since = await storage.getLastSyncAt();
      // Sync is done in AuthContext — ConversationListScreen refreshes on focus
      await fetchConversations(true);
    })().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchConversations(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Socket listeners
  useEffect(() => {
    const handlePresenceUpdate = (payload: { userId: string; isOnline: boolean }) => {
      setConversations((prev) =>
        prev.map((conv) => ({
          ...conv,
          members: conv.members.map((m: User) =>
            m._id === payload.userId ? { ...m, isOnline: payload.isOnline } : m,
          ),
        })),
      );
    };

    const handleNewMessage = (payload: { message: any; conversationId: string }) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv._id !== payload.conversationId) return conv;
          return {
            ...conv,
            lastMessage: payload.message,
            lastMessageAt: payload.message.createdAt,
            unreadCount: conv.unreadCount + 1,
          };
        }),
      );
    };

    socketService.on('presence_update', handlePresenceUpdate);
    socketService.on('new_message', handleNewMessage);

    return () => {
      socketService.off('presence_update', handlePresenceUpdate);
      socketService.off('new_message', handleNewMessage);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchConversations(true);
    setRefreshing(false);
  }, [fetchConversations]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    setPage((p) => p + 1);
    await fetchConversations(false);
    setLoading(false);
  }, [hasMore, loading, fetchConversations]);

  const handleConversationPress = useCallback(
    (conv: Conversation) => {
      navigation.navigate('Chat', { conversationId: conv._id });
    },
    [navigation],
  );

  const handleGroupCreated = useCallback((conv: Conversation) => {
    setConversations((prev) => [conv, ...prev]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationListItem conversation={item} onPress={handleConversationPress} />
    ),
    [handleConversationPress],
  );

  const keyExtractor = useCallback((item: Conversation) => item._id, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
      </View>

      {/* Error banner */}
      {error ? (
        <TouchableOpacity style={styles.errorBanner} onPress={() => fetchConversations(true)}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : null}

      {/* List */}
      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : conversations.length === 0 ? (
        <EmptyConversations onCreateGroup={() => setGroupModalVisible(true)} />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#007AFF" />
          }
          ListFooterComponent={
            <LoadingFooter
              loading={loading}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
            />
          }
          contentContainerStyle={styles.list}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setGroupModalVisible(true)}
        activeOpacity={0.8}>
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Group creation modal */}
      <GroupCreateModal
        visible={groupModalVisible}
        onClose={() => setGroupModalVisible(false)}
        onCreated={handleGroupCreated}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a' },
  list: { paddingBottom: 80 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffe69c',
  },
  errorText: { color: '#856404', fontSize: 14, textAlign: 'center' },
  errorRetry: { color: '#856404', fontSize: 12, textAlign: 'center', marginTop: 4 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
