import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { Conversation } from '../../types';
import type { ConversationListScreenNavigationProp } from '../../navigation/types';
import { conversationsApi } from '../../services/api/apiService';
import { socketService } from '../../services/socket/socketService';
import { useAuth } from '../../contexts/AuthContext';
import ConversationListItem from '../../components/ConversationListItem';
import EmptyConversations from '../../components/EmptyConversations';
import LoadingFooter from '../../components/LoadingFooter';
import GroupCreateModal from '../../components/GroupCreateModal';
import { useMessageSync } from '../../hooks/useMessageSync';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineQueueService } from '../../services/OfflineQueueService';
import OfflineBanner from '../../components/OfflineBanner';

const ConversationListScreen: React.FC = () => {
  const navigation = useNavigation<ConversationListScreenNavigationProp>();
  const { user } = useAuth();
  const { sync } = useMessageSync();
  const { isConnected } = useNetworkStatus();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const fetchConversations = useCallback(
    async (reset = false) => {
      const targetPage = reset ? 1 : page;
      if (reset) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await conversationsApi.list(targetPage, 20);
        if (reset) {
          setConversations(data.conversations);
          setPage(2);
        } else {
          setConversations((prev) => [...prev, ...data.conversations]);
          setPage((p) => p + 1);
        }
        setHasMore(data.hasMore);
        setError(null);
      } catch {
        setError('Failed to load conversations');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page],
  );

  // Fetch on first mount and on focus
  useFocusEffect(
    useCallback(() => {
      fetchConversations(true);
    }, []),
  );

  // Sync missed messages + flush offline queue on reconnect
  useEffect(() => {
    if (isConnected) {
      sync().then(() => {
        offlineQueueService.processQueue();
      });
    }
  }, [isConnected, sync]);

  // Socket: new_message → update list
  useEffect(() => {
    const handleNewMessage = (data: { message: { conversationId: string; content: string; createdAt: string } }) => {
      const msg = data.message;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c._id === msg.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const conv = { ...updated[idx] };
        conv.lastMessagePreview = msg.content;
        conv.lastMessageAt = msg.createdAt;
        conv.unreadCount = (conv.unreadCount || 0) + 1;
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
  }, []);

  const handleRefresh = () => fetchConversations(true);
  const handleLoadMore = () => { if (hasMore && !loading) fetchConversations(false); };

  const handleConversationPress = (conv: Conversation) => {
    navigation.navigate('Chat', { conversationId: conv._id });
  };

  const handleGroupCreated = (conv: Conversation) => {
    setConversations((prev) => [conv, ...prev]);
  };

  const handleStartChat = () => {
    // Contacts are now a sub-tab within ChatHomeScreen (ChatSubTabParamList)
    navigation.getParent()?.navigate('Contacts');
  };

  if (error && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchConversations(true)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <OfflineBanner isVisible={!isConnected} />
      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ConversationListItem
            conversation={item}
            onPress={() => handleConversationPress(item)}
          />
        )}
        ListEmptyComponent={
          !loading && !refreshing ? <EmptyConversations onStartChat={handleStartChat} /> : null
        }
        ListFooterComponent={
          hasMore ? <LoadingFooter loading={loading} onLoadMore={handleLoadMore} /> : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2196F3" />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* FAB for new group */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowGroupModal(true)}
        activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <GroupCreateModal
        visible={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreated={handleGroupCreated}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  separator: { height: 1, backgroundColor: '#f0f0f0' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#ff4444', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#2196F3', borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#2196F3', justifyContent: 'center',
    alignItems: 'center', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: 'bold', marginTop: -2 },
});

export default ConversationListScreen;
