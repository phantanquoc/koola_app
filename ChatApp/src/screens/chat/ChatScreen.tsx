import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import {
  GiftedChat,
  Bubble,
  Send,
  SystemMessage,
  IMessage,
  BubbleProps,
  SendProps,
  SystemMessageProps,
  MessageImageProps,
  MessageVideoProps,
  ActionsProps,
} from 'react-native-gifted-chat';
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
import MediaImage from '../../components/MediaImage';
import VideoMessage from '../../components/VideoMessage';
import VideoPlayerModal from '../../components/VideoPlayerModal';
import { getOrDownload } from '../../services/media/mediaCacheService';
import { webrtcService } from '../../services/webrtc/WebRTCService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { pickImage, pickVideo } from '../../services/media/mediaUploadService';
import type { MessageType } from '../../types';

type MediaMessage = IMessage & {
  messageType?: MessageType;
  mediaKey?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  mediaDuration?: number;
  isUploading?: boolean;
};

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
    sendMediaMessage,
    loadEarlier,
    isLoadingEarlier,
    hasEarlier,
  } = useMessages(conversationId, currentUserId);

  const { typingUsers, emitTyping } = useTypingIndicator(conversationId);
  useReadReceipts(conversationId, messages, currentUserId);
  const [videoViewerUri, setVideoViewerUri] = useState<string | null>(null);

  /**
   * Open the fullscreen image viewer as a modal route. We navigate instead of
   * rendering a local Modal so that pinch/pan/zoom gestures (which live in
   * ImageViewerScreen using react-native-reanimated + GestureDetector) have a
   * dedicated screen to own the gesture context — nesting a Modal inside
   * GiftedChat's input-aware KeyboardControllerView conflicts with gesture
   * handlers.
   *
   * The caller passes either a server mediaKey (which we resolve to a local
   * cached URI via getOrDownload) or an in-flight file:// URI from an
   * optimistic send — we show that directly without a round-trip.
   */
  const openImageViewer = useCallback(
    async (mediaKey?: string, fallbackUri?: string) => {
      if (!mediaKey && !fallbackUri) return;
      if (fallbackUri && fallbackUri.startsWith('file:')) {
        navigation.navigate('ImageViewer', { imageUrl: fallbackUri });
        return;
      }
      if (!mediaKey) return;
      const uri = await getOrDownload(mediaKey).catch(() => null);
      if (uri) navigation.navigate('ImageViewer', { imageUrl: uri });
    },
    [navigation],
  );

  const openVideoViewer = useCallback(async (mediaKey?: string, fallbackUri?: string) => {
    if (fallbackUri && fallbackUri.startsWith('file:')) {
      setVideoViewerUri(fallbackUri);
      return;
    }
    if (!mediaKey) return;
    const uri = await getOrDownload(mediaKey).catch(() => null);
    if (uri) setVideoViewerUri(uri);
  }, []);

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
      console.log('[ChatScreen] onSend invoked', {
        count: newMessages.length,
        isConnected,
        conversationId,
      });
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

  // ─── Attach media ─────────────────────────────────────────────────────────
  const handlePickImage = useCallback(async () => {
    console.log('[ChatScreen] handlePickImage: start');
    const result = await pickImage();
    console.log('[ChatScreen] handlePickImage: result', result);
    if (!result) return;
    if (result === 'TOO_LARGE') {
      Alert.alert('Ảnh quá lớn', 'Kích thước tối đa là 200MB.');
      return;
    }
    await sendMediaMessage({
      fileUri: result.uri,
      filename: result.filename,
      mimeType: result.mimeType,
      size: result.size,
      type: 'image',
    });
  }, [sendMediaMessage]);

  const handlePickVideo = useCallback(async () => {
    console.log('[ChatScreen] handlePickVideo: start');
    const result = await pickVideo();
    console.log('[ChatScreen] handlePickVideo: result', result);
    if (!result) return;
    if (result === 'TOO_LARGE') {
      Alert.alert('Video quá lớn', 'Kích thước tối đa là 200MB.');
      return;
    }
    if (result === 'UNSUPPORTED_FORMAT') {
      Alert.alert('Định dạng không hỗ trợ', 'Chỉ hỗ trợ MP4, MOV, WEBM.');
      return;
    }
    await sendMediaMessage({
      fileUri: result.uri,
      filename: result.filename,
      mimeType: result.mimeType,
      size: result.fileSize,
      type: 'video',
      duration: result.duration,
    });
  }, [sendMediaMessage]);

  const openAttachMenu = useCallback(() => {
    console.log('[ChatScreen] openAttachMenu pressed');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Hủy', 'Ảnh', 'Video'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) handlePickImage();
          if (idx === 2) handlePickVideo();
        },
      );
    } else {
      Alert.alert('Đính kèm', 'Chọn loại tệp', [
        { text: 'Ảnh', onPress: handlePickImage },
        { text: 'Video', onPress: handlePickVideo },
        { text: 'Hủy', style: 'cancel' },
      ]);
    }
  }, [handlePickImage, handlePickVideo]);

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

  const renderActions = useCallback(
    (_props: ActionsProps) => (
      <TouchableOpacity
        onPress={openAttachMenu}
        style={styles.actionButton}
        accessibilityLabel="Đính kèm"
      >
        <Text style={styles.actionIcon}>＋</Text>
      </TouchableOpacity>
    ),
    [openAttachMenu],
  );

  const renderMessageImage = useCallback(
    (props: MessageImageProps<IMessage>) => {
      const msg = props.currentMessage as MediaMessage | undefined;
      if (!msg) return null;
      const localUri = typeof msg.image === 'string' && msg.image.startsWith('file:')
        ? msg.image
        : undefined;
      if (msg.isUploading) {
        return (
          <MediaImage mediaKey="media-pending" isUploading uploadProgress={0} />
        );
      }
      return (
        <MediaImage
          mediaKey={msg.mediaKey}
          onPress={() => openImageViewer(msg.mediaKey, localUri)}
        />
      );
    },
    [openImageViewer],
  );

  const renderMessageVideo = useCallback(
    (props: MessageVideoProps<IMessage>) => {
      const msg = props.currentMessage as MediaMessage | undefined;
      if (!msg) return null;
      const localUri = typeof msg.video === 'string' && msg.video.startsWith('file:')
        ? msg.video
        : undefined;
      return (
        <VideoMessage
          message={{
            mediaKey: msg.mediaKey,
            mediaDuration: msg.mediaDuration,
          }}
          onPress={() => openVideoViewer(msg.mediaKey, localUri)}
        />
      );
    },
    [openVideoViewer],
  );

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
        renderActions={renderActions}
        renderMessageImage={renderMessageImage}
        renderMessageVideo={renderMessageVideo}
        onInputTextChanged={onInputTextChanged}
        loadEarlier={hasEarlier}
        onLoadEarlier={loadEarlier}
        isLoadingEarlier={isLoadingEarlier}
        alwaysShowSend
        infiniteScroll
        placeholder="Type a message..."
      />

      {/* Video viewer. Image viewer lives in a dedicated modal route
          (ImageViewerScreen) so gesture handlers get a clean ancestor. */}
      <VideoPlayerModal
        visible={!!videoViewerUri}
        uri={videoViewerUri || ''}
        onClose={() => setVideoViewerUri(null)}
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
  actionButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: { fontSize: 26, color: '#2196F3', fontWeight: '300' },
});

export default ChatScreen;
