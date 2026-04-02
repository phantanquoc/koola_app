import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { GiftedChat, Bubble, Send, SystemMessage, IMessage, BubbleProps, SendProps, SystemMessageProps } from 'react-native-gifted-chat';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { ChatScreenNavigationProp, ChatScreenRouteProp } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { socketService } from '../../services/socket/socketService';
import { useMessages } from './hooks/useMessages';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useReadReceipts } from './hooks/useReadReceipts';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import OfflineBanner from '../../components/OfflineBanner';
import { webrtcService } from '../../services/webrtc/webrtcService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { conversationId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id || '';

  const { isConnected } = useNetworkStatus();
  const { sendViaQueue } = useOfflineQueue();

  const {
    messages,
    sendMessage,
    loadEarlier,
    isLoadingEarlier,
    hasEarlier,
  } = useMessages(conversationId, currentUserId);

  const { typingUsers, emitTyping } = useTypingIndicator(conversationId);
  useReadReceipts(conversationId, messages, currentUserId);

  // ─── Join/leave conversation room ──────────────────────────────────────────
  useEffect(() => {
    socketService.emit('join_conversation', { conversationId });
    return () => {
      socketService.emit('leave_conversation', { conversationId });
    };
  }, [conversationId]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const onSend = useCallback(
    (newMessages: IMessage[] = []) => {
      if (newMessages.length > 0) {
        const text = newMessages[0].text;
        if (isConnected) {
          sendMessage(text);
        } else {
          // Offline: queue message for later
          sendViaQueue(conversationId, text, 'text');
        }
      }
    },
    [sendMessage, isConnected, sendViaQueue, conversationId],
  );

  const onInputTextChanged = useCallback(
    (text: string) => {
      emitTyping(text);
    },
    [emitTyping],
  );

  // ─── Custom renders ────────────────────────────────────────────────────────
  const renderBubble = useCallback(
    (props: BubbleProps<IMessage>) => (
      <Bubble
        {...props}
        wrapperStyle={{
          right: { backgroundColor: '#2196F3' },
          left: { backgroundColor: '#E8E8E8' },
        }}
        textStyle={{
          right: { color: '#fff' },
          left: { color: '#333' },
        }}
      />
    ),
    [],
  );

  const renderSend = useCallback(
    (props: SendProps<IMessage>) => (
      <Send {...props} containerStyle={styles.sendContainer}>
        <Text style={styles.sendText}>Send</Text>
      </Send>
    ),
    [],
  );

  const renderSystemMessage = useCallback(
    (props: SystemMessageProps<IMessage>) => (
      <SystemMessage
        {...props}
        textStyle={styles.systemMessage}
      />
    ),
    [],
  );

  const renderFooter = useCallback(() => {
    if (typingUsers.length === 0) return null;
    return (
      <View style={styles.typingContainer}>
        <Text style={styles.typingText}>
          {typingUsers.length === 1
            ? 'Someone is typing...'
            : `${typingUsers.length} people are typing...`}
        </Text>
      </View>
    );
  }, [typingUsers]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Offline Banner */}
      <OfflineBanner isVisible={!isConnected} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => {
              webrtcService.initiateCall('', conversationId, 'audio');
              (navigation as unknown as NativeStackNavigationProp<RootStackParamList>)
                .getParent()
                ?.navigate('CallModal', {
                  sessionId: '',
                  callType: 'audio',
                  isInitiator: true,
                });
            }}
            style={styles.callButton}>
            <Text style={styles.callIcon}>📞</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: currentUserId, name: user?.displayName }}
        renderBubble={renderBubble}
        renderSend={renderSend}
        renderSystemMessage={renderSystemMessage}
        renderFooter={renderFooter}
        onInputTextChanged={onInputTextChanged}
        loadEarlier={hasEarlier}
        onLoadEarlier={loadEarlier}
        isLoadingEarlier={isLoadingEarlier}
        alwaysShowSend
        infiniteScroll
        placeholder="Type a message..."
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backButton: { padding: 4, marginRight: 12 },
  backText: { fontSize: 24, color: '#2196F3' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#333' },
  headerRight: { width: 40, alignItems: 'flex-end' },
  callButton: { padding: 4 },
  callIcon: { fontSize: 20 },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 4 },
  sendText: { color: '#2196F3', fontSize: 16, fontWeight: '600' },
  systemMessage: { color: '#999', fontSize: 12, fontStyle: 'italic' },
  typingContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  typingText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
});

export default ChatScreen;
