import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { GiftedChat, Bubble, SystemMessage, IMessage, BubbleProps, SystemMessageProps, DayProps, InputToolbarProps } from 'react-native-gifted-chat';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { ChatScreenNavigationProp, ChatScreenRouteProp, ChatTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { socketService } from '../../services/socket/SocketService';
import { conversationsApi } from '../../services/api/apiService';
import { getOrDownload, getFromMemory, warmMemoryCache } from '../../services/media/mediaCacheService';
import type { Conversation, Message, MessageReaction } from '../../types';
import { useMessages } from './hooks/useMessages';
import StoryReferenceCard from '../../components/moments/StoryReferenceCard';
import UserAvatar from '../../components/UserAvatar';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useReadReceipts } from './hooks/useReadReceipts';
import { usePinManagement } from './hooks/usePinManagement';
import { useCallInitiation } from './hooks/useCallInitiation';
import { useMediaUpload } from './hooks/useMediaUpload';
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
import PinListBottomSheet from '../../components/PinListBottomSheet';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import ForwardModal from '../../components/ForwardModal';
import AttachmentSheet from '../../components/AttachmentSheet';
import ChatComposer, {
  CHAT_COMPOSER_DOCK_HEIGHT,
  CHAT_COMPOSER_SCROLL_GAP,
  CHAT_COMPOSER_TOP_GAP,
  ChatComposerHandle,
} from './components/ChatComposer';
import { KoolaText, KoolaIconButton, koolaColors, koolaRadii, koolaSpacing } from '../../ui';
import * as outboxRepository from '../../services/db/outboxRepository';
import * as messageRepository from '../../services/db/messageRepository';
import * as conversationRepository from '../../services/db/conversationRepository';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
};

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { conversationId, displayName: initialDisplayName, avatar: initialAvatar } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id || '';
  const insets = useSafeAreaInsets();
  const composerBottomInset = Math.max(insets.bottom, 8);
  const composerScrollClearance =
    CHAT_COMPOSER_DOCK_HEIGHT + CHAT_COMPOSER_TOP_GAP + CHAT_COMPOSER_SCROLL_GAP + composerBottomInset;

  const { isConnected } = useNetworkStatus();
  const { sendViaQueue } = useOfflineQueue();
  const [chatReady, setChatReady] = useState(true);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const composerRef = useRef<ChatComposerHandle>(null);

  // ─── Focus + mount guard for async setState ────────────────────────────────
  // Prevents async callbacks from calling setState on a screen that is already
  // being popped off the native stack (Fabric snapshot flicker on back-press).
  const isFocused = useIsFocused();
  // Seed true: the incoming screen is focused on first render; avoids dropping
  // the first getDetails update if the navigator hasn't flagged focus yet.
  const isFocusedRef = useRef(true);
  useEffect(() => { isFocusedRef.current = isFocused; }, [isFocused]);
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

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

  // Fetch conversation details for header name.
  // SQLite-first: populate conversation state synchronously from local DB so
  // chatTitle is stable on first render, then refresh from network in background.
  useEffect(() => {
    // 1. Synchronous SQLite read — non-fatal, falls through to network on error
    try {
      const local = conversationRepository.getById(conversationId);
      if (local) {
        const localConv: Conversation = {
          _id: local.id,
          type: (local.type ?? 'direct') as Conversation['type'],
          name: local.name ?? undefined,
          avatar: local.avatarKey ?? undefined,
          members: Array.isArray(local.members) ? (local.members as Conversation['members']) : [],
          createdBy: '',
          unreadCount: local.unreadCount ?? 0,
          lastMessagePreview: local.lastMessagePreview ?? undefined,
          lastMessageAt: local.lastMessageAt ? new Date(local.lastMessageAt as number).toISOString() : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: local.updatedAt ? new Date(local.updatedAt as number).toISOString() : new Date().toISOString(),
          // pinnedMessages not stored in SQLite — will be populated by network refresh
        };
        setConversation(localConv);
      }
    } catch {
      // non-fatal — network refresh below will populate state
    }

    // 2. Background network refresh for authoritative data (online status, pinnedMessages, populated members)
    conversationsApi.getDetails(conversationId).then((data: { conversation: Conversation }) => {
      // Guard: do not setState on a screen that is being/already popped off the stack
      if (!isFocusedRef.current || !isMountedRef.current) return;
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
          getOrDownload(rawAvatar).then((url) => {
            if (!isFocusedRef.current || !isMountedRef.current) return;
            if (url) setOtherAvatarUrl(url);
          });
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
      if (!cancelled && url && isFocusedRef.current && isMountedRef.current) setOtherAvatarUrl(url);
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

  // ─── Pin management (state, socket sync, handlers, derived data) ──────────
  const {
    pinnedMessages,
    pinnedMessageIds,
    pinnedContents,
    handlePin,
    handleUnpin,
  } = usePinManagement({
    conversationId,
    conversation,
    currentUserId,
    messages,
  });

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

  // ─── Dead-letter retry / discard ──────────────────────────────────────────
  const handleRetryFailedMessage = useCallback((messageId: string) => {
    // messageId here is the temp_xxx id stored in messages table
    // Find the outbox row by clientMessageId (strip temp_ prefix)
    try {
      const rows = outboxRepository.getDeadLetterRows();
      const row = rows.find((r) => {
        try {
          // We don't have payload_json in getDeadLetterRows, so use message_id field
          return r.message_id === messageId || r.id === messageId;
        } catch {
          return false;
        }
      });
      if (row) {
        outboxRepository.markPendingForRetry(row.id);
        // Flip the messages row back to pending so UI updates immediately
        messageRepository.markPendingFromRetry(messageId);
      }
    } catch (err) {
      console.warn('[ChatScreen] handleRetryFailedMessage error:', err);
    }
  }, []);

  const handleDiscardFailedMessage = useCallback((messageId: string) => {
    try {
      const rows = outboxRepository.getDeadLetterRows();
      const row = rows.find((r) => r.message_id === messageId || r.id === messageId);
      if (row) {
        // Hard-delete the outbox row so it no longer appears in dead-letter list
        outboxRepository.deleteRow(row.id);
      }
      // Hard-delete the temp messages row
      messageRepository.deleteById(messageId);
    } catch (err) {
      console.warn('[ChatScreen] handleDiscardFailedMessage error:', err);
    }
  }, [conversationId]);

  // gifted-chat ^2.8.1 exposes messageContainerRef as a public prop.
  // Earlier code reached into giftedChatRef.current._messageContainerRef which
  // only existed in v2.6.x class-component impl and silently became falsy after
  // upgrade, breaking pin-banner scroll.
  const messageContainerRef = useRef<FlatList<IMessage> | null>(null);
  const pinListSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const handlePinBannerPress = useCallback((messageId: string) => {
    const idx = messages.findIndex((m) => String(m._id) === messageId);
    if (idx < 0 || !messageContainerRef.current) return;
    try {
      messageContainerRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
    } catch {
      // onScrollToIndexFailed handler in listViewProps will retry; swallow sync throw.
    }
  }, [messages]);

  // Inject other user's avatar into messages for GiftedChat rendering.
  // chatTitle is intentionally excluded from deps — it resolves async via
  // getDetails and would cause a full FlatList re-render on every title change.
  // name is not displayed in bubbles (showUserAvatar=false, showAvatarForEveryMessage=false).
  const messagesWithAvatar = React.useMemo(() => {
    if (!otherAvatarUrl) return messages;
    return messages.map((m) =>
      m.user._id !== currentUserId
        ? { ...m, user: { ...m.user, avatar: otherAvatarUrl } }
        : m,
    );
  }, [messages, otherAvatarUrl, currentUserId]);

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

  // ─── Media upload (image / document / video) ──────────────────────────────
  const {
    isUploading,
    uploadProgress,
    handlePickImage,
    handlePickDocument,
    handlePickVideo,
  } = useMediaUpload({
    conversationId,
    createOptimisticMedia,
    confirmMediaMessage,
    updateUploadProgress,
  });

  const handleAttachment = useCallback(() => {
    setAttachmentSheetVisible(true);
  }, []);

  const handleEmojiPress = useCallback(() => {
    Alert.alert('Tính năng đang phát triển', 'Bảng biểu tượng cảm xúc sẽ sớm có mặt.');
  }, []);

  const handleVoicePress = useCallback(() => {
    Alert.alert('Tính năng đang phát triển', 'Tin nhắn thoại sẽ sớm có mặt.');
  }, []);

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

  // Ensure chatReady flips true when isInitialLoading clears (safety for legacy/non-SQLite path)
  useEffect(() => {
    if (!isInitialLoading) {
      setChatReady(true);
    } else {
      setChatReady(false);
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
      const isFailed = msg?.failed === true;

      // Detect story reply metadata
      const storyReply = (msg?.metadata as Record<string, unknown> | undefined)?.storyReply as
        | { storyId: string; mediaKeyPreview?: string; captionSnippet?: string; authorId?: string }
        | undefined;

      return (
        <View>
          <TouchableOpacity
            activeOpacity={isFailed ? 0.7 : 1}
            onPress={isFailed ? () => handleRetryFailedMessage(String(msg._id)) : undefined}
            accessible={isFailed}
            accessibilityLabel={isFailed ? 'Gửi thất bại — nhấn để thử lại' : undefined}
            accessibilityRole={isFailed ? 'button' : undefined}>
            <View style={isFailed ? styles.failedBubbleWrapper : undefined}>
              {/* Story reference card prepended above the bubble */}
              {storyReply && (
                <View style={styles.storyRefCardWrapper}>
                  <StoryReferenceCard storyReply={storyReply} />
                </View>
              )}
              <Bubble
                {...props}
                wrapperStyle={{
                  right: isMedia
                    ? { backgroundColor: 'transparent', padding: 0 }
                    : { backgroundColor: koolaColors.primary, borderRadius: koolaRadii.lg, borderBottomRightRadius: koolaRadii.xs },
                  left: isMedia
                    ? { backgroundColor: 'transparent', padding: 0 }
                    : { backgroundColor: koolaColors.canvas, borderRadius: koolaRadii.lg, borderBottomLeftRadius: koolaRadii.xs },
                }}
                textStyle={{
                  right: { color: koolaColors.surface, fontSize: 15, lineHeight: 22 },
                  left: { color: koolaColors.ink, fontSize: 15, lineHeight: 22 },
                }}
              />
            </View>
            {isFailed && (
              <KoolaText variant="caption" tone="danger" style={styles.failedLabel}>Gửi thất bại — nhấn để thử lại</KoolaText>
            )}
          </TouchableOpacity>
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
    [currentUserId, reactToMessage, handleRetryFailedMessage],
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
          <KoolaText variant="caption" tone="muted" weight="500" style={styles.dayText}>{label}</KoolaText>
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
          <View style={styles.uploadingBlock}>
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={koolaColors.primary} />
              <KoolaText variant="caption" tone="muted" style={styles.uploadingText}>
                Đang tải lên... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
              </KoolaText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, uploadProgress)}%` }]} />
            </View>
          </View>
        )}
        {typingUsers.length > 0 && (
          <KoolaText variant="caption" tone="muted">
            {typingUsers.length === 1
              ? 'Đang soạn tin...'
              : `${typingUsers.length} người đang soạn tin...`}
          </KoolaText>
        )}
      </View>
    );
  }, [typingUsers, isUploading, uploadProgress]);

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

  // Send handler — ChatComposer owns the (uncontrolled) text ref and passes
  // the trimmed text up. Keeping the input uncontrolled is required to avoid
  // Vietnamese IME composition resets on Fabric (New Architecture).
  const handleSend = useCallback(
    (text: string) => {
      if (!text) return;
      socketService.emit('typing_stop', { conversationId });
      if (isConnected !== false) {
        sendMessage(text);
      } else {
        sendViaQueue(conversationId, text, 'text');
      }
    },
    [sendMessage, isConnected, sendViaQueue, conversationId],
  );

  const renderInputToolbar = useCallback(
    (_props: InputToolbarProps<IMessage>) => (
      <ChatComposer
        ref={composerRef}
        onSend={handleSend}
        onChangeText={onInputTextChanged}
        onPressEmoji={handleEmojiPress}
        onPressVoice={handleVoicePress}
        onPressImage={handlePickImage}
        onPressAttach={handleAttachment}
        disabled={isUploading}
        offline={isConnected === false}
      />
    ),
    [
      handleSend,
      onInputTextChanged,
      handleEmojiPress,
      handleVoicePress,
      handlePickImage,
      handleAttachment,
      isUploading,
      isConnected,
    ],
  );

  const handleHeaderPress = useCallback(async () => {
    const nav = navigation as NativeStackNavigationProp<ChatTabStackParamList>;
    let conv = conversation;
    if (!conv) {
      try {
        const data = await conversationsApi.getDetails(conversationId);
        conv = (data.conversation || data) as Conversation;
        // Guard setState only; navigation below is a direct user action and must proceed
        if (isFocusedRef.current && isMountedRef.current) setConversation(conv);
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
  const { handleStartCall } = useCallInitiation({
    conversationId,
    conversation,
    currentUserId,
    setConversation,
    isFocusedRef,
    isMountedRef,
  });

  const playerMediaKey = (playerMessage?.mediaKey as string | undefined) || '';

  return (
    <BottomSheetModalProvider>
    <View style={styles.container}>
      {/* Offline Banner */}
      <OfflineBanner isVisible={isConnected === false} />

      {/* Header */}
      <View style={styles.header}>
        <KoolaIconButton
          icon="arrow-back"
          tone="primary"
          variant="ghost"
          size={40}
          iconSize={24}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Quay lại"
        />
        <TouchableOpacity style={styles.headerCenter} onPress={handleHeaderPress} activeOpacity={0.8}>
          <View>
            <UserAvatar displayName={chatTitle} avatar={otherAvatarKey || undefined} size={38} />
            {otherUserStatus === 'Đang hoạt động' && (
              <View style={styles.onlineDot} accessibilityElementsHidden importantForAccessibility="no" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <KoolaText variant="label" tone="ink" weight="600" numberOfLines={1}>{chatTitle}</KoolaText>
            <KoolaText
              variant="caption"
              tone={otherUserStatus === 'Đang hoạt động' ? 'success' : 'muted'}
              numberOfLines={1}
              style={otherUserStatus ? undefined : { opacity: 0 }}>
              {otherUserStatus || 'placeholder'}
            </KoolaText>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <KoolaIconButton
            icon="call"
            tone="primary"
            variant="soft"
            size={40}
            iconSize={22}
            onPress={() => handleStartCall('audio')}
            accessibilityLabel="Gọi thoại"
          />
          <KoolaIconButton
            icon="videocam"
            tone="primary"
            variant="soft"
            size={40}
            iconSize={22}
            onPress={() => handleStartCall('video')}
            accessibilityLabel="Gọi video"
          />
        </View>
      </View>

      {/* Pin Banner */}
      <PinBanner
        pinnedMessages={pinnedMessages}
        messageContents={pinnedContents}
        onPress={handlePinBannerPress}
        onClose={handleUnpin}
        onShowList={() => pinListSheetRef.current?.present()}
      />

      <PinListBottomSheet
        ref={pinListSheetRef}
        pinnedMessages={pinnedMessages}
        messageContents={pinnedContents}
        onSelect={handlePinBannerPress}
        onUnpin={handleUnpin}
      />

      <View style={{ flex: 1 }}>
        {/* Initial-load error overlay */}
        {initialLoadError && messages.length === 0 && !isInitialLoading && (
          <View style={styles.initialErrorOverlay}>
            <View style={styles.errorIconShell}>
              <MaterialIcons name="cloud-off" size={28} color={koolaColors.danger} />
            </View>
            <KoolaText variant="label" tone="danger" weight="600" align="center">
              Không thể tải tin nhắn
            </KoolaText>
            <KoolaText variant="body" tone="muted" align="center">
              Kiểm tra kết nối và thử lại
            </KoolaText>
            <TouchableOpacity style={styles.initialErrorRetry} onPress={retryInitialLoad} activeOpacity={0.82}>
              <KoolaText variant="label" tone="surface" weight="600">Thử lại</KoolaText>
            </TouchableOpacity>
          </View>
        )}
        {/* Empty state — conversation has no messages yet */}
        {chatReady && !isInitialLoading && !initialLoadError && messages.length === 0 && (
          <View style={styles.emptyOverlay}>
            <View style={styles.emptyIconShell}>
              <MaterialIcons name="chat-bubble-outline" size={28} color={koolaColors.primary} />
            </View>
            <KoolaText variant="label" tone="ink" weight="600" align="center">
              Bắt đầu cuộc trò chuyện
            </KoolaText>
            <KoolaText variant="body" tone="muted" align="center" style={styles.emptyBody}>
              Gửi tin nhắn đầu tiên đến {chatTitle}
            </KoolaText>
          </View>
        )}
        {/* Loading overlay - absolute positioned, doesn't affect layout */}
        {!chatReady && messages.length === 0 && !initialLoadError && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1 }}>
            <ActivityIndicator size="small" color={koolaColors.primary} />
          </View>
        )}
        {/* GiftedChat - always rendered (Fabric-safe: no Animated.View wrapper) */}
        <View style={{ flex: 1, opacity: chatReady ? 1 : 0 }}>
          <GiftedChat
            messageContainerRef={messageContainerRef as unknown as React.ComponentProps<typeof GiftedChat>['messageContainerRef']}
            messages={messagesWithAvatar}
            onSend={() => {}}
            user={{ _id: currentUserId, name: user?.displayName, avatar: user?.avatar }}
            renderBubble={renderBubble}
            renderInputToolbar={renderInputToolbar}
            renderSystemMessage={renderSystemMessage}
            renderMessageImage={renderMessageImage}
            renderMessageVideo={renderMessageVideo}
            renderCustomView={renderCustomView}
            renderDay={renderDay}
            timeFormat="HH:mm"
            locale="vi"
            renderFooter={renderFooter}
            showUserAvatar={false}
            showAvatarForEveryMessage={false}
            loadEarlier={hasEarlier}
            onLoadEarlier={loadEarlier}
            isLoadingEarlier={isLoadingEarlier}
            alwaysShowSend
            infiniteScroll
            onLongPress={handleLongPress}
            bottomOffset={composerBottomInset}
            minInputToolbarHeight={0}
            listViewProps={{
              viewabilityConfig,
              onViewableItemsChanged,
              contentContainerStyle: {
                paddingTop: composerScrollClearance,
                paddingBottom: 20,
              },
              showsVerticalScrollIndicator: false,
              // Fabric (RN 0.76 New Arch) workaround: facebook/react-native#53258
              // FlatList + state-driven data updates can throw
              // "addViewAt: child already has a parent" when view recycling
              // collides with mount items. Disabling clipped-subview recycling
              // forces stable view tree at the cost of slightly more memory.
              removeClippedSubviews: false,
              initialNumToRender: 12,
              maxToRenderPerBatch: 8,
              windowSize: 7,
              updateCellsBatchingPeriod: 50,
              // Required by FlatList when scrollToIndex targets an offscreen row
              // without getItemLayout. Average bubble height ~80px is a reasonable
              // estimate; retry after a tick lets layout pass measure the target.
              onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => {
                const offset = info.averageItemLength * info.index;
                messageContainerRef.current?.scrollToOffset({ offset, animated: true });
                setTimeout(() => {
                  messageContainerRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
                }, 100);
              },
            } as Record<string, unknown>}
          />
        </View>
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
        onDiscard={handleDiscardFailedMessage}
      />

      {/* Forward Modal */}
      <ForwardModal
        visible={forwardModalVisible}
        messageId={forwardMessageId}
        onClose={() => setForwardModalVisible(false)}
      />

      {/* Attachment picker bottom sheet */}
      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onPickImage={handlePickImage}
        onPickVideo={handlePickVideo}
        onPickDocument={handlePickDocument}
      />

      {/* Video Player Modal */}
      <VideoPlayerModal
        visible={!!playerMessage && !!playerMediaKey}
        uri={playerMediaKey}
        onClose={() => setPlayerMessage(null)}
      />
    </View>
    </BottomSheetModalProvider>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: koolaColors.surface },
  initialErrorOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 2,
    paddingHorizontal: 32, gap: koolaSpacing.md,
  },
  errorIconShell: {
    width: 64, height: 64, borderRadius: koolaRadii.lg,
    backgroundColor: koolaColors.dangerSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: koolaSpacing.xs,
  },
  initialErrorRetry: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: koolaRadii.sm,
    backgroundColor: koolaColors.primary, marginTop: koolaSpacing.xs,
  },
  emptyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 1,
    paddingHorizontal: 32, gap: koolaSpacing.sm,
  },
  emptyIconShell: {
    width: 64, height: 64, borderRadius: koolaRadii.lg,
    backgroundColor: koolaColors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: koolaSpacing.xs,
  },
  emptyBody: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: koolaSpacing.lg,
    paddingTop: koolaSpacing.sm, paddingBottom: koolaSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm, marginLeft: koolaSpacing.xs },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.xs },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.accent,
    borderWidth: 2, borderColor: koolaColors.surface,
  },
  systemMessage: { color: koolaColors.muted, fontSize: 12 },
  dayContainer: { alignItems: 'center', marginVertical: koolaSpacing.lg },
  dayText: {
    backgroundColor: koolaColors.canvas, borderRadius: koolaRadii.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: koolaColors.line,
    paddingHorizontal: koolaSpacing.md, paddingVertical: 4, overflow: 'hidden',
  },
  typingContainer: { paddingHorizontal: koolaSpacing.lg, paddingVertical: koolaSpacing.sm, gap: koolaSpacing.sm },
  uploadingBlock: { gap: 6 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadingText: { marginLeft: 0 },
  progressTrack: {
    height: 3, borderRadius: koolaRadii.pill, backgroundColor: koolaColors.line, overflow: 'hidden',
  },
  progressFill: {
    height: 3, borderRadius: koolaRadii.pill, backgroundColor: koolaColors.primary,
  },
  // Dead-letter bubble visual
  failedBubbleWrapper: {
    borderLeftWidth: 1,
    borderLeftColor: koolaColors.danger,
  },
  failedLabel: {
    marginTop: 2,
    marginLeft: 4,
    marginBottom: 2,
  },
  storyRefCardWrapper: {
    marginHorizontal: 8,
    marginBottom: 4,
    maxWidth: 240,
  },
});

export default ChatScreen;
