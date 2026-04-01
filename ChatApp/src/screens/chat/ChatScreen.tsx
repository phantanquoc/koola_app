import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { GiftedChat, Bubble, IMessage, Send, LoadEarlier } from 'react-native-gifted-chat';
import { useAuth } from '../../contexts/AuthContext';
import { useCall } from '../../contexts/CallContext';
import { socketService } from '../../services/socket/SocketService';
import { useMessages } from './hooks/useMessages';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useReadReceipts } from './hooks/useReadReceipts';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { OfflineBanner } from '../../components/OfflineBanner';
import type { ChatScreenProps } from '../../navigation/types';

// Re-export GiftedMessage for convenience
export type { GiftedMessage } from './hooks/useMessages';

export const ChatScreen: React.FC<ChatScreenProps> = ({ route }) => {
  const { conversationId } = route.params;
  const { user } = useAuth();
  const { initiateCall } = useCall();
  const currentUserId = user?._id ?? '';
  const [isJoined, setIsJoined] = useState(false);

  // ── Offline infrastructure ────────────────────────────────────────────────────
  const isConnected = useNetworkStatus();
  const { queue } = useOfflineQueue();

  // Map from clientMessageId → tempId for tracking failed queue items
  const clientIdToTempRef = useRef<Map<string, string>>(new Map());

  const {
    messages,
    isLoadingEarlier,
    hasEarlier,
    sendMessage,
    loadEarlier,
    deleteMessage,
    updateMessageStatus,
  } = useMessages({ conversationId, currentUserId });

  const { typingUserIds, emitTyping, stopTyping } = useTypingIndicator({ conversationId });

  const { markLastVisibleMessageRead } = useReadReceipts({ conversationId, messages });

  // ── Sync queue tempId map whenever queue changes ───────────────────────────────
  useEffect(() => {
    queue.forEach((item) => {
      if (item.conversationId === conversationId && item.status === 'pending') {
        clientIdToTempRef.current.set(item.id, item.tempId);
      }
    });
  }, [queue, conversationId]);

  // ── Mark failed messages in UI when queue item exhausts retries ───────────────
  useEffect(() => {
    const failedItems = queue.filter(
      (m) => m.conversationId === conversationId && m.status === 'failed',
    );
    failedItems.forEach((item) => {
      const tempId = clientIdToTempRef.current.get(item.id);
      if (tempId) {
        updateMessageStatus(tempId, 'failed');
        clientIdToTempRef.current.delete(item.id);
      }
    });
  }, [queue, conversationId, updateMessageStatus]);

  // ── Join conversation room on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;

    socketService.emit('join_conversation', { conversationId });
    setIsJoined(true);

    return () => {
      socketService.emit('leave_conversation', { conversationId });
    };
  }, [conversationId, currentUserId]);

  // ── Call handlers ──────────────────────────────────────────────────────────
  const handleAudioCall = useCallback(() => {
    // For direct chats, conversationId is used; the backend resolves the other participant
    initiateCall('', conversationId, 'audio');
  }, [initiateCall, conversationId]);

  const handleVideoCall = useCallback(() => {
    initiateCall('', conversationId, 'video');
  }, [initiateCall, conversationId]);

  // ── Send message ──────────────────────────────────────────────────────────────
  // useMessages.sendMessage handles online vs offline internally.
  // It always shows optimistic UI and queues when offline.
  const handleSend = useCallback(
    async (msgs: IMessage[] = []) => {
      const text = msgs[0]?.text ?? '';
      if (!text.trim()) return;
      stopTyping();
      await sendMessage(text);
    },
    [sendMessage, stopTyping],
  );

  const handleInputTextChanged = useCallback(
    (text: string) => {
      emitTyping(text);
    },
    [emitTyping],
  );

  const handleLoadEarlier = useCallback(() => {
    loadEarlier();
  }, [loadEarlier]);

  const handleLongPress = useCallback(
    (context: any, message: IMessage) => {
      // Only allow delete of own messages
      if (String(message.user._id) !== String(currentUserId)) return;
    },
    [currentUserId],
  );

  // Convert GiftedMessage to IMessage for GiftedChat
  const giftedMessages: IMessage[] = messages.map((m) => ({
    _id: String(m._id),
    text: m.text,
    createdAt: m.createdAt,
    user: m.user,
    image: m.image,
    status: m.status,
  }));

  const renderBubble = useCallback((props: any) => {
    const isCurrentUser = String(props.currentMessage?.user?._id) === String(currentUserId);
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          left: { backgroundColor: '#f0f0f0', marginBottom: 4 },
          right: { backgroundColor: '#007AFF', marginBottom: 4 },
        }}
        textStyle={{
          left: { color: '#1a1a1a' },
          right: { color: '#fff' },
        }}
      />
    );
  }, [currentUserId]);

  const renderSend = useCallback((props: any) => (
    <Send {...props} containerStyle={styles.sendContainer}>
      <View style={styles.sendBtn}>
        <Text style={styles.sendText}>Send</Text>
      </View>
    </Send>
  ), []);

  const renderLoadEarlier = useCallback(() => {
    if (!hasEarlier) return null;
    if (isLoadingEarlier) {
      return (
        <View style={styles.loadEarlier}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      );
    }
    return (
      // @ts-ignore
      <LoadEarlier label="Load more messages" wrapperStyle={styles.loadEarlier} />
    );
  }, [hasEarlier, isLoadingEarlier, handleLoadEarlier]);

  const renderSystemMessage = useCallback((props: any) => {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemText}>{props.currentMessage?.text}</Text>
      </View>
    );
  }, []);

  // GiftedChat user
  const giftedUser = {
    _id: currentUserId,
    name: user?.displayName ?? '',
    avatar: user?.avatar,
  };

  if (!currentUserId) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Offline banner */}
      <OfflineBanner isVisible={!isConnected} />

      {/* Call buttons header */}
      <View style={styles.callHeader}>
        <TouchableOpacity style={styles.callBtn} onPress={handleAudioCall}>
          <Text style={styles.callBtnText}>Audio Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.callBtn} onPress={handleVideoCall}>
          <Text style={styles.callBtnText}>Video Call</Text>
        </TouchableOpacity>
      </View>

      {/* Typing indicator */}
      {typingUserIds.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {typingUserIds.length === 1
              ? 'Someone is typing...'
              : `${typingUserIds.length} people are typing...`}
          </Text>
        </View>
      )}

      <GiftedChat
        messages={giftedMessages}
        onSend={handleSend}
        // @ts-ignore - onInputTextChanged exists at runtime
        onInputTextChanged={handleInputTextChanged}
        onLongPress={handleLongPress}
        user={giftedUser}
        renderBubble={renderBubble}
        renderSend={renderSend}
        renderLoadEarlier={renderLoadEarlier}
        renderSystemMessage={renderSystemMessage}
        loadEarlier={hasEarlier}
        onLoadEarlier={handleLoadEarlier}
        placeholder="Type a message..."
        alwaysShowSend
        renderAvatar={undefined}
        showAvatarForEveryMessage={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  callBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#007AFF',
  },
  callBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  typingText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
  },
  sendBtn: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  loadEarlier: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadEarlierLabel: { color: '#007AFF', fontSize: 14 },
  systemMsg: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
});
