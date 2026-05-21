import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import { GiftedChat, Bubble, SystemMessage, Actions, IMessage, BubbleProps, SystemMessageProps, ActionsProps, DayProps, ComposerProps } from 'react-native-gifted-chat';
import { useNavigation, useRoute } from '@react-navigation/native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { ChatScreenNavigationProp, ChatScreenRouteProp, ChatTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { socketService } from '../../services/socket/SocketService';
import { conversationsApi } from '../../services/api/apiService';
import { getOrDownload, getFromMemory, warmMemoryCache } from '../../services/media/mediaCacheService';
import type { Conversation, Message, PinnedMessage, MessageReaction } from '../../types';
import { useMessages } from './hooks/useMessages';
import UserAvatar from '../../components/UserAvatar';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useReadReceipts } from './hooks/useReadReceipts';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import OfflineBanner from '../../components/OfflineBanner';
import MediaImage from '../../components/MediaImage';
import FileAttachment from '../../components/FileAttachment';
import VideoMessage from '../../components/VideoMessage';
import VideoPlayerModal from '../../components/VideoPlayerModal';
import MessageContextMenu from '../../components/MessageContextMenu';
import ReactionDisplay from '../../components/ReactionDisplay';
import PinBanner from '../../components/PinBanner';
import ForwardModal from '../../components/ForwardModal';
import { webrtcService } from '../../services/webrtc/WebRTCService';
import { pickImage, pickDocument, pickVideo, uploadMedia, compressVideo, getMessageTypeFromMime } from '../../services/media/mediaUploadService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { initialWindowMetrics } from 'react-native-safe-area-context';

const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
};

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { conversationId, displayName: initialDisplayName, avatar: initialAvatar } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id || '';

  const { isConnected } = useNetworkStatus();
  const { sendViaQueue } = useOfflineQueue();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [chatReady, setChatReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  // Seed avatar from nav params so the header doesn't flash a placeholder
  // while waiting for /conversations/:id to resolve.
  const [otherAvatarKey, setOtherAvatarKey] = useState<string>(initialAvatar || '');
  const [otherAvatarUrl, setOtherAvatarUrl] = useState<string>(() => {
    if (!initialAvatar) return '';
    // Resolved URI (http/file) — use directly
    if (initialAvatar.startsWith('http') || initialAvatar.startsWith('file://')) return initialAvatar;
    // mediaKey — check memory cache synchronously to avoid placeholder flash
    return getFromMemory(initialAvatar) || '';
  });

  // ─── Video player state ────────────────────────────────────────────────────
  const [playerMessage, setPlayerMessage] = useState<(IMessage & Record<string, unknown>) | null>(null);

  // ─── Viewability tracking for auto-play ───────────────────────────────────
  const [visibleMessageIds, setVisibleMessageIds] = useState<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: IMessage }> }) => {
      const ids = new Set(viewableItems.map((v) => String(v.item._id)));
      setVisibleMessageIds(ids);
    },
  ).current;

  // Fetch conversation details for header name
  useEffect(() => {
    conversationsApi.getDetails(conversationId).then((data: { conversation: Conversation }) => {
      const conv = data.conversation || data;
      setConversation(conv);
      // Resolve other member's avatar
      if (conv.type !== 'group') {
        const other = conv.members.find((m: any) => {
          const id = typeof m.userId === 'object' ? m.userId._id : m.userId;
          return id !== currentUserId;
        });
        const rawAvatar = other && typeof other.userId === 'object'
          ? (other.userId as any).avatar
          : other?.user?.avatar;
        if (rawAvatar) {
          setOtherAvatarKey(rawAvatar);
          getOrDownload(rawAvatar).then((url) => { if (url) setOtherAvatarUrl(url); });
        }
      }
    }).catch(() => {});
  }, [conversationId, currentUserId]);

  // Warm avatar URL from the mediaKey passed via nav params (cache hit is instant).
  useEffect(() => {
    if (!initialAvatar) return;
    if (initialAvatar.startsWith('http') || initialAvatar.startsWith('file://')) {
      setOtherAvatarUrl(initialAvatar);
      return;
    }
    let cancelled = false;
    getOrDownload(initialAvatar).then((url) => {
      if (!cancelled && url) setOtherAvatarUrl(url);
    });
    return () => { cancelled = true; };
  }, [initialAvatar]);

  // Derive chat title from conversation
  const chatTitle = (() => {
    if (!conversation) return initialDisplayName || 'Trò chuyện';
    if (conversation.type === 'group') return conversation.name || 'Nhóm';
    // Direct: find the other member - members may be populated (userId is object) or not
    const otherMember = conversation.members.find((m) => {
      if (!m?.userId) return false;
      const id = typeof m.userId === 'object' ? (m.userId as any)?._id : m.userId;
      return Boolean(id) && id !== currentUserId;
    });
    if (!otherMember) return initialDisplayName || 'Trò chuyện';
    // Populated: userId is the user object itself
    if (typeof otherMember.userId === 'object') {
      return (otherMember.userId as any).displayName || initialDisplayName || 'Trò chuyện';
    }
    return otherMember.user?.displayName || initialDisplayName || 'Trò chuyện';
  })();

  // Derive online status for direct chats
  const otherUserStatus = (() => {
    if (!conversation || conversation.type === 'group') return null;
    const otherMember = conversation.members.find((m) => {
      if (!m?.userId) return false;
      const id = typeof m.userId === 'object' ? (m.userId as any)?._id : m.userId;
      return Boolean(id) && id !== currentUserId;
    });
    if (!otherMember) return null;
    // userData can be: populated userId object, or separate .user field
    const userData = typeof otherMember.userId === 'object'
      ? (otherMember.userId as any)
      : otherMember.user;
    if (!userData) return null;
    if (userData.isOnline === true) return 'Đang hoạt động';
    const lastSeen = userData.lastSeen || userData.lastSeenAt;
    if (lastSeen) {
      const lastSeenDate = new Date(lastSeen);
      if (isNaN(lastSeenDate.getTime())) return null;
      const now = new Date();
      const diffMs = now.getTime() - lastSeenDate.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Vừa mới truy cập';
      if (diffMin < 60) return `Hoạt động ${diffMin} phút trước`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      return `Hoạt động ${diffDays} ngày trước`;
    }
    return 'Không hoạt động';
  })();

  const {
    messages,
    sendMessage,
    sendMediaMessage,
    createOptimisticMedia,
    confirmMediaMessage,
    loadEarlier,
    deleteMessage,
    reactToMessage,
    deleteForMe,
    updateUploadProgress,
    isLoadingEarlier,
    isInitialLoading,
    initialLoadError,
    retryInitialLoad,
    hasEarlier,
  } = useMessages(conversationId, currentUserId);

  // ─── Context menu state ────────────────────────────────────────────────────
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<(IMessage & Record<string, unknown>) | null>(null);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);

  // ─── Pin state ─────────────────────────────────────────────────────────────
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const pinnedContents = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const pin of pinnedMessages) {
      const msg = messages.find((m) => String(m._id) === pin.messageId);
      if (msg) map[pin.messageId] = msg.text || '📷 Media';
    }
    return map;
  }, [pinnedMessages, messages]);

  // Load pinned messages from conversation
  useEffect(() => {
    if (conversation?.pinnedMessages) {
      setPinnedMessages(conversation.pinnedMessages);
    }
  }, [conversation]);

  // Socket: pin/unpin events
  useEffect(() => {
    const handlePinned = (data: { messageId: string; conversationId: string; pinnedBy: string }) => {
      if (data.conversationId !== conversationId) return;
      setPinnedMessages((prev) => {
        if (prev.some((p) => p.messageId === data.messageId)) return prev;
        return [...prev, { messageId: data.messageId, pinnedBy: data.pinnedBy, pinnedAt: new Date().toISOString() }];
      });
    };
    const handleUnpinned = (data: { messageId: string; conversationId: string }) => {
      if (data.conversationId !== conversationId) return;
      setPinnedMessages((prev) => prev.filter((p) => p.messageId !== data.messageId));
    };

    socketService.on('message_pinned', handlePinned as (...args: unknown[]) => void);
    socketService.on('message_unpinned', handleUnpinned as (...args: unknown[]) => void);
    return () => {
      socketService.off('message_pinned', handlePinned as (...args: unknown[]) => void);
      socketService.off('message_unpinned', handleUnpinned as (...args: unknown[]) => void);
    };
  }, [conversationId]);

  const pinnedMessageIds = React.useMemo(
    () => pinnedMessages.map((p) => p.messageId),
    [pinnedMessages],
  );

  // ─── Context menu handlers ─────────────────────────────────────────────────
  const handleLongPress = useCallback((_context: unknown, message: IMessage) => {
    if (message.system) return;
    setSelectedMessage(message as IMessage & Record<string, unknown>);
    setContextMenuVisible(true);
  }, []);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    reactToMessage(messageId, emoji);
  }, [reactToMessage]);

  const handleDeleteForMe = useCallback((messageId: string) => {
    deleteForMe(messageId);
  }, [deleteForMe]);

  const handleDeleteForEveryone = useCallback((messageId: string) => {
    deleteMessage(messageId);
  }, [deleteMessage]);

  const handleForward = useCallback((msg: IMessage & Record<string, unknown>) => {
    setForwardMessageId(String(msg._id));
    setForwardModalVisible(true);
  }, []);

  const handlePin = useCallback((messageId: string) => {
    conversationsApi.pinMessage(conversationId, messageId);
  }, [conversationId]);

  const handleUnpin = useCallback((messageId: string) => {
    conversationsApi.unpinMessage(conversationId, messageId);
  }, [conversationId]);

  const giftedChatRef = useRef<any>(null);
  const handlePinBannerPress = useCallback((messageId: string) => {
    // Scroll to message — find index in messages array
    const idx = messages.findIndex((m) => String(m._id) === messageId);
    if (idx >= 0 && giftedChatRef.current?._messageContainerRef?.current) {
      giftedChatRef.current._messageContainerRef.current.scrollToIndex({ index: idx, animated: true });
    }
  }, [messages]);

  // Inject other user's avatar into messages for GiftedChat rendering
  const messagesWithAvatar = React.useMemo(() => {
    if (!otherAvatarUrl) return messages;
    return messages.map((m) =>
      m.user._id !== currentUserId
        ? { ...m, user: { ...m.user, avatar: otherAvatarUrl, name: m.user.name || chatTitle } }
        : m,
    );
  }, [messages, otherAvatarUrl, currentUserId, chatTitle]);

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
        console.log('[ChatScreen] onSend called, text:', text, 'isConnected:', isConnected);
        // Stop typing when sending
        socketService.emit('typing_stop', { conversationId });
        if (isConnected !== false) {
          sendMessage(text);
        } else {
          console.log('[ChatScreen] Offline - sending via queue');
          sendViaQueue(conversationId, text, 'text');
        }
      }
    },
    [sendMessage, isConnected, sendViaQueue, conversationId],
  );

  const handlePickImage = useCallback(async () => {
    try {
      const picked = await pickImage();
      if (picked === null) return;
      if (picked === 'TOO_LARGE') {
        Alert.alert('Ảnh quá lớn', 'Vui lòng chọn ảnh dưới 200MB');
        return;
      }

      const messageType = getMessageTypeFromMime(picked.mimeType);
      const tempId = createOptimisticMedia(picked.uri, picked.mimeType, picked.size, messageType);

      setIsUploading(true);
      setUploadProgress(0);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
        conversationId,
        (percent) => {
          setUploadProgress(percent);
          updateUploadProgress(tempId, percent);
        },
      );
      await confirmMediaMessage(tempId, result.mediaUrl, result.mimeType, result.size, messageType);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string | string[] } } };
      const msg = error.response?.data?.message;
      Alert.alert('Tải lên thất bại', Array.isArray(msg) ? msg.join('\n') : msg || 'Không thể tải ảnh lên');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [conversationId, createOptimisticMedia, confirmMediaMessage, updateUploadProgress]);

  const handlePickDocument = useCallback(async () => {
    try {
      const picked = await pickDocument();
      if (!picked) return;

      const messageType = getMessageTypeFromMime(picked.mimeType);
      const tempId = createOptimisticMedia(picked.uri, picked.mimeType, picked.size, messageType, picked.filename);

      setIsUploading(true);
      setUploadProgress(0);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
        conversationId,
        (percent) => {
          setUploadProgress(percent);
          updateUploadProgress(tempId, percent);
        },
      );
      await confirmMediaMessage(tempId, result.mediaUrl, result.mimeType, result.size, messageType, picked.filename);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string | string[] } } };
      const msg = error.response?.data?.message;
      Alert.alert('Tải lên thất bại', Array.isArray(msg) ? msg.join('\n') : msg || 'Không thể tải tệp lên');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [conversationId, createOptimisticMedia, confirmMediaMessage, updateUploadProgress]);

  const handlePickVideo = useCallback(async () => {
    try {
      const pickResult = await pickVideo();

      if (pickResult === null) return;

      if (pickResult === 'TOO_LARGE') {
        Alert.alert('Video quá lớn', 'Vui lòng chọn video dưới 200MB');
        return;
      }

      if (pickResult === 'UNSUPPORTED_FORMAT') {
        Alert.alert('Định dạng không hỗ trợ', 'Vui lòng chọn video MP4, MOV hoặc WebM');
        return;
      }

      // 1. Compress before upload (720p / ~2 Mbps). Files under 10 MB are
      //    returned unchanged by the compressor (minimumFileSizeForCompress).
      setIsUploading(true);
      setUploadProgress(0);

      let compressedUri = pickResult.uri;
      try {
        const handle = compressVideo(pickResult.uri, (progress) => {
          // Map compress phase to 0..50% of the overall progress bar
          setUploadProgress(Math.round(progress * 50));
        });
        compressedUri = await handle.promise;
      } catch (compressErr) {
        // Compression failure is non-fatal — fall back to original file
        console.warn('[ChatScreen] Video compression failed, using original:', compressErr);
        compressedUri = pickResult.uri;
      }

      // 2. Upload the (possibly compressed) file
      const tempId = createOptimisticMedia(compressedUri, pickResult.mimeType, pickResult.fileSize, 'video', undefined, pickResult.duration);

      const result = await uploadMedia(
        compressedUri,
        pickResult.filename,
        pickResult.mimeType,
        pickResult.fileSize,
        conversationId,
        (percent) => {
          // Map upload phase to 50..100% of the overall progress bar
          const overall = 50 + Math.round(percent / 2);
          setUploadProgress(overall);
          updateUploadProgress(tempId, overall);
        },
      );
      await confirmMediaMessage(tempId, result.mediaUrl, result.mimeType, result.size, 'video', undefined, pickResult.duration);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string | string[] } } };
      const msg = error.response?.data?.message;
      Alert.alert('Tải lên thất bại', Array.isArray(msg) ? msg.join('\n') : msg || 'Không thể tải video lên');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [conversationId, createOptimisticMedia, confirmMediaMessage, updateUploadProgress]);

  const handleAttachment = useCallback(() => {
    Alert.alert(
      'Gửi tệp đính kèm',
      'Chọn loại tệp',
      [
        { text: 'Ảnh', onPress: handlePickImage },
        { text: 'Video', onPress: handlePickVideo },
        { text: 'Tài liệu', onPress: handlePickDocument },
      ],
      { cancelable: true },
    );
  }, [handlePickImage, handlePickVideo, handlePickDocument]);

  // Emit typing indicator without interfering with IME composition
  const typingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInputTextChanged = useCallback(
    (text: string) => {
      if (text.length > 0) {
        emitTyping(text);
        // Auto stop typing after 2s of no input
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          socketService.emit('typing_stop', { conversationId });
        }, 2000);
      } else {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        socketService.emit('typing_stop', { conversationId });
      }
    },
    [emitTyping, conversationId],
  );

  // Cleanup typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  // Smooth fade-in when messages are ready
  useEffect(() => {
    if (!isInitialLoading) {
      const id = requestAnimationFrame(() => {
        setChatReady(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
      return () => cancelAnimationFrame(id);
    } else {
      setChatReady(false);
      fadeAnim.setValue(0);
    }
  }, [isInitialLoading]);

  // ─── Custom renders ────────────────────────────────────────────────────────
  const renderBubble = useCallback(
    (props: BubbleProps<IMessage>) => {
      const msg = props.currentMessage as IMessage & Record<string, unknown>;
      const isImage = msg?.image && msg?.mediaType === 'image';
      const isVideo = msg?.mediaType === 'video';
      const isMedia = isImage || isVideo;
      const reactions = (msg?.reactions as MessageReaction[]) || [];
      const isRight = msg?.user?._id === currentUserId;
      return (
        <View>
          <Bubble
            {...props}
            wrapperStyle={{
              right: isMedia
                ? { backgroundColor: 'transparent', padding: 0 }
                : { backgroundColor: '#2196F3', borderRadius: 18, borderBottomRightRadius: 4 },
              left: isMedia
                ? { backgroundColor: 'transparent', padding: 0 }
                : { backgroundColor: '#F3F4F6', borderRadius: 18, borderBottomLeftRadius: 4 },
            }}
            textStyle={{
              right: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
              left: { color: '#374151', fontSize: 15, lineHeight: 21 },
            }}
          />
          {reactions.length > 0 && (
            <ReactionDisplay
              reactions={reactions}
              currentUserId={currentUserId}
              onPress={(emoji) => reactToMessage(String(msg._id), emoji)}
              isRight={isRight}
            />
          )}
        </View>
      );
    },
    [currentUserId, reactToMessage],
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

  const renderDay = useCallback(
    (props: DayProps) => {
      const date = props.createdAt;
      if (!date) return null;
      const msgDay = dayjs(date).startOf('day');
      const today = dayjs().startOf('day');
      const diffDays = today.diff(msgDay, 'day');
      let label: string;
      if (diffDays === 0) {
        label = 'Hôm nay';
      } else if (diffDays === 1) {
        label = 'Hôm qua';
      } else if (diffDays === 2) {
        label = '2 ngày trước';
      } else {
        label = msgDay.locale('vi').format('D [tháng] M, YYYY');
      }
      return (
        <View style={styles.dayContainer}>
          <Text style={styles.dayText}>{label}</Text>
        </View>
      );
    },
    [],
  );

  const renderFooter = useCallback(() => {
    if (typingUsers.length === 0 && !isUploading) return null;
    return (
      <View style={styles.typingContainer}>
        {isUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color="#2196F3" />
            <Text style={styles.typingText}> Đang tải lên... {uploadProgress > 0 ? `${uploadProgress}%` : ''}</Text>
          </View>
        )}
        {typingUsers.length > 0 && (
          <Text style={styles.typingText}>
            {typingUsers.length === 1
              ? 'Đang soạn tin...'
              : `${typingUsers.length} người đang soạn tin...`}
          </Text>
        )}
      </View>
    );
  }, [typingUsers, isUploading, uploadProgress]);

  const renderActions = useCallback(
    (props: ActionsProps) => (
      <Actions
        {...props}
        icon={() => <MaterialIcons name="attach-file" size={24} color="#2196F3" />}
        onPressActionButton={handleAttachment}
      />
    ),
    [handleAttachment],
  );

  // ─── Media renderers ──────────────────────────────────────────────────────
  const renderMessageImage = useCallback(
    (props: any) => {
      const msg = props.currentMessage as IMessage & Record<string, unknown> | undefined;
      if (!msg) return null;
      return (
        <MediaImage
          mediaKey={msg.mediaKey as string | undefined}
          imageWidth={msg.imageWidth as number | undefined}
          imageHeight={msg.imageHeight as number | undefined}
          isUploading={!!msg.isUploading}
          uploadProgress={msg.uploadProgress as number | undefined}
          blurhash={msg.blurhash as string | null | undefined}
          onPress={(uri) => {
            // Collect all resolved image URIs from messages for swipe gallery
            // messages is newest-first, so reverse to get chronological order (oldest = 1/X)
            const allImageUris: string[] = [];
            let tappedIndex = 0;
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              const mRec = m as IMessage & Record<string, unknown>;
              if (mRec.image === 'media-pending' && mRec.mediaKey) {
                const resolved = getFromMemory(mRec.mediaKey as string);
                if (resolved) {
                  allImageUris.push(resolved);
                  if (String(m._id) === String(msg._id)) {
                    tappedIndex = allImageUris.length - 1;
                  }
                }
              }
            }
            // Fallback: if we couldn't build the list, just show the single image
            if (allImageUris.length === 0) {
              allImageUris.push(uri);
              tappedIndex = 0;
            }
            (navigation as unknown as NativeStackNavigationProp<RootStackParamList>)
              .getParent()
              ?.navigate('ImageViewer', {
                imageUrl: uri,
                imageUrls: allImageUris,
                initialIndex: tappedIndex,
              });
          }}
        />
      );
    },
    [navigation, messages],
  );

  const renderMessageVideo = useCallback(
    (props: any) => {
      const msg = props.currentMessage as IMessage & Record<string, unknown> | undefined;
      if (!msg) return null;
      const isVisible = visibleMessageIds.has(String(msg._id));
      const rawMsg = msg as unknown as Message;
      return (
        <VideoMessage
          message={{
            mediaKey: msg.mediaKey as string | undefined,
            mediaDuration: (rawMsg.mediaDuration ?? undefined) as number | undefined,
            blurhash: rawMsg.blurhash,
            mediaThumbnailKey: msg.mediaThumbnailKey as string | null | undefined,
          }}
          isVisible={isVisible}
          onPress={() => setPlayerMessage(msg)}
        />
      );
    },
    [visibleMessageIds],
  );

  const renderCustomView = useCallback(
    (props: any) => {
      const msg = props.currentMessage as IMessage & Record<string, unknown> | undefined;
      if (!msg) return null;

      if (msg.mediaType !== 'file' || !msg.mediaKey) return null;
      const isRight = msg.user._id === currentUserId;
      return (
        <FileAttachment
          mediaKey={msg.mediaKey as string}
          filename={msg.text || 'File'}
          size={(msg.mediaSize as number) || 0}
          isRight={isRight}
        />
      );
    },
    [currentUserId],
  );

  // Custom composer to fix Vietnamese IME on Fabric (New Architecture)
  // GiftedChat's default Composer uses controlled TextInput (value prop)
  // which resets IME composition on every re-render under Fabric.
  const composerTextRef = useRef('');
  const textInputRef = useRef<TextInput>(null);

  const renderComposer = useCallback(
    (_props: ComposerProps) => (
      <View style={styles.composerContainer}>
        <TextInput
          ref={textInputRef}
          style={styles.composerInput}
          placeholder="Nhập tin nhắn..."
          placeholderTextColor="#999"
          multiline
          onChangeText={(text: string) => {
            composerTextRef.current = text;
            onInputTextChanged(text);
          }}
        />
      </View>
    ),
    [onInputTextChanged],
  );

  // Override onSend to use our uncontrolled text ref
  const handleSend = useCallback(() => {
    const text = composerTextRef.current.trim();
    if (!text) return;
    composerTextRef.current = '';
    if (textInputRef.current) {
      textInputRef.current.clear();
    }
    socketService.emit('typing_stop', { conversationId });
    if (isConnected !== false) {
      sendMessage(text);
    } else {
      sendViaQueue(conversationId, text, 'text');
    }
  }, [sendMessage, isConnected, sendViaQueue, conversationId]);

  const renderSendButton = useCallback(
    () => (
      <TouchableOpacity onPress={handleSend} style={styles.sendContainer}>
        <Text style={styles.sendText}>Gửi</Text>
      </TouchableOpacity>
    ),
    [handleSend],
  );

  const handleHeaderPress = useCallback(async () => {
    const nav = navigation as NativeStackNavigationProp<ChatTabStackParamList>;
    let conv = conversation;
    if (!conv) {
      try {
        const data = await conversationsApi.getDetails(conversationId);
        conv = (data.conversation || data) as Conversation;
        setConversation(conv);
      } catch {
        return;
      }
    }
    if (conv.type === 'group') {
      nav.navigate('GroupInfo', { conversationId });
      return;
    }
    const other = conv.members?.find((m: any) => {
      const id = typeof m.userId === 'object' ? m.userId._id : m.userId;
      return id !== currentUserId;
    });
    if (!other) return;
    const otherUserId =
      typeof other.userId === 'object' ? (other.userId as any)._id : other.userId;
    if (!otherUserId) return;
    nav.navigate('Profile', { userId: otherUserId });
  }, [conversation, conversationId, currentUserId, navigation]);

  // Start a 1-1 call. Waits for the backend 'call_initiated' event to get a
  // real sessionId before navigating to the CallModal.
  const handleStartCall = useCallback(
    async (callType: 'audio' | 'video') => {
      // Load conversation if not ready yet
      let conv = conversation;
      if (!conv) {
        try {
          const data = await conversationsApi.getDetails(conversationId);
          conv = (data.conversation || data) as Conversation;
          setConversation(conv);
        } catch {
          Alert.alert('Lỗi', 'Không thể tải thông tin cuộc trò chuyện');
          return;
        }
      }

      if (conv.type === 'group') {
        Alert.alert('Thông báo', 'Gọi nhóm đang được phát triển');
        return;
      }

      // Resolve the other member's userId
      const other = conv.members?.find((m: any) => {
        const id = typeof m.userId === 'object' ? m.userId._id : m.userId;
        return id !== currentUserId;
      });
      const otherUserId =
        other && (typeof other.userId === 'object'
          ? (other.userId as any)._id
          : other.userId);
      if (!otherUserId) {
        Alert.alert('Lỗi', 'Không xác định được người nhận cuộc gọi');
        return;
      }

      const rootNav = (navigation as unknown as NativeStackNavigationProp<RootStackParamList>)
        .getParent();

      // One-shot listeners: wait for either 'call_initiated' or an error
      let settled = false;
      const cleanup = () => {
        webrtcService.off('call_initiated', onInitiated);
        webrtcService.off('call_missed', onMissed);
        webrtcService.off('call_busy', onError);
        webrtcService.off('error', onError);
        clearTimeout(timer);
      };
      const onInitiated = (data: unknown) => {
        if (settled) return;
        settled = true;
        const { sessionId, iceServers: servers } =
          (data as { sessionId?: string; iceServers?: { urls: string; username?: string; credential?: string }[] }) || {};
        cleanup();
        if (!sessionId) {
          Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
          return;
        }
        rootNav?.navigate('CallModal', {
          sessionId,
          callType,
          isInitiator: true,
          iceServers: servers,
        });
      };
      const onMissed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        Alert.alert('Không thể gọi', 'Người dùng hiện không trực tuyến');
      };
      const onError = (data: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        const msg = (data as { message?: string })?.message || 'Cuộc gọi thất bại';
        Alert.alert('Lỗi', msg);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        Alert.alert('Hết thời gian', 'Máy chủ không phản hồi. Vui lòng thử lại.');
      }, 15000);

      webrtcService.on('call_initiated', onInitiated);
      webrtcService.on('call_missed', onMissed);
      webrtcService.on('call_busy', onError);
      webrtcService.on('error', onError);

      webrtcService.initiateCall(otherUserId, conversationId, callType);
    },
    [conversation, conversationId, currentUserId, navigation],
  );

  const playerMediaKey = (playerMessage?.mediaKey as string | undefined) || '';

  return (
    <View style={styles.container}>
      {/* Offline Banner */}
      <OfflineBanner isVisible={isConnected === false} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2196F3" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={handleHeaderPress}>
          <UserAvatar displayName={chatTitle} avatar={otherAvatarKey || undefined} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{chatTitle}</Text>
            <Text style={[styles.headerStatus, otherUserStatus ? {} : { opacity: 0 }]} numberOfLines={1}>
              {otherUserStatus || 'placeholder'}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => handleStartCall('audio')}
            style={styles.callButton}
            accessibilityRole="button"
            accessibilityLabel="Gọi thoại">
            <MaterialIcons name="call" size={24} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleStartCall('video')}
            style={styles.callButton}
            accessibilityRole="button"
            accessibilityLabel="Gọi video">
            <MaterialIcons name="videocam" size={26} color="#2196F3" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pin Banner */}
      <PinBanner
        pinnedMessages={pinnedMessages}
        messageContents={pinnedContents}
        onPress={handlePinBannerPress}
        onClose={handleUnpin}
      />

      <View style={{ flex: 1 }}>
        {/* Initial-load error overlay */}
        {initialLoadError && messages.length === 0 && !isInitialLoading && (
          <View style={styles.initialErrorOverlay}>
            <Text style={styles.initialErrorText}>
              Không thể tải tin nhắn. Vui lòng thử lại.
            </Text>
            <TouchableOpacity style={styles.initialErrorRetry} onPress={retryInitialLoad}>
              <Text style={styles.initialErrorRetryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Loading overlay - absolute positioned, doesn't affect layout */}
        {!chatReady && messages.length === 0 && !initialLoadError && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1 }}>
            <ActivityIndicator size="small" color="#2196F3" />
          </View>
        )}
        {/* GiftedChat - always rendered, smooth fade in when ready */}
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <GiftedChat
            messages={messagesWithAvatar}
            onSend={() => {}}
            user={{ _id: currentUserId, name: user?.displayName, avatar: user?.avatar }}
            renderBubble={renderBubble}
            renderSend={renderSendButton}
            renderComposer={renderComposer}
            renderSystemMessage={renderSystemMessage}
            renderMessageImage={renderMessageImage}
            renderMessageVideo={renderMessageVideo}
            renderCustomView={renderCustomView}
            renderDay={renderDay}
            timeFormat="HH:mm"
            locale="vi"
            renderActions={renderActions}
            renderFooter={renderFooter}
            showUserAvatar={false}
            showAvatarForEveryMessage={false}
            loadEarlier={hasEarlier}
            onLoadEarlier={loadEarlier}
            isLoadingEarlier={isLoadingEarlier}
            alwaysShowSend
            infiniteScroll
            onLongPress={handleLongPress}
            bottomOffset={(initialWindowMetrics?.insets.bottom ?? 0) > 0 ? initialWindowMetrics!.insets.bottom : 8}
            minInputToolbarHeight={52}
            listViewProps={{
              viewabilityConfig,
              onViewableItemsChanged,
              contentContainerStyle: { paddingTop: 20 },
              showsVerticalScrollIndicator: false,
            } as Record<string, unknown>}
          />
        </Animated.View>
      </View>

      {/* Context Menu */}
      <MessageContextMenu
        visible={contextMenuVisible}
        message={selectedMessage}
        currentUserId={currentUserId}
        pinnedMessageIds={pinnedMessageIds}
        onClose={() => setContextMenuVisible(false)}
        onReact={handleReact}
        onDeleteForMe={handleDeleteForMe}
        onDeleteForEveryone={handleDeleteForEveryone}
        onForward={handleForward}
        onPin={handlePin}
        onUnpin={handleUnpin}
      />

      {/* Forward Modal */}
      <ForwardModal
        visible={forwardModalVisible}
        messageId={forwardMessageId}
        onClose={() => setForwardModalVisible(false)}
      />

      {/* Video Player Modal */}
      <VideoPlayerModal
        visible={!!playerMessage && !!playerMediaKey}
        uri={playerMediaKey}
        onClose={() => setPlayerMessage(null)}
      />

      {/* Toast */}
      <Toast />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  initialErrorOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 2,
    paddingHorizontal: 32, gap: 12,
  },
  initialErrorText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  initialErrorRetry: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#2196F3',
  },
  initialErrorRetryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingTop: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8, marginRight: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  headerStatus: { fontSize: 12, color: '#10B981', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  callButton: { padding: 10 },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 0 },
  sendText: { color: '#2196F3', fontSize: 15, fontWeight: '600' },
  systemMessage: { color: '#6B7280', fontSize: 12 },
  dayContainer: { alignItems: 'center', marginVertical: 12 },
  dayText: { fontSize: 12, color: '#6B7280', fontWeight: '500', backgroundColor: 'rgba(107, 114, 128, 0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  typingContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  typingText: { fontSize: 13, color: '#6B7280' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center' },
  composerContainer: {
    flex: 1, justifyContent: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 22,
    borderWidth: 0,
    marginHorizontal: 4, marginVertical: 8,
  },
  composerInput: {
    fontSize: 15, lineHeight: 20, paddingHorizontal: 14, paddingVertical: 10,
    maxHeight: 120, color: '#111827',
  },
});

export default ChatScreen;
