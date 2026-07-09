import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
import type { ChatScreenNavigationProp, ChatScreenRouteProp } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { socketService } from '../../services/socket/SocketService';
import { getFromMemory, getOrDownload } from '../../services/media/mediaCacheService';
import type { Conversation, Message, MessageReaction } from '../../types';
import { useMessages } from './hooks/useMessages';
import StoryReferenceCard from '../../components/moments/StoryReferenceCard';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useReadReceipts } from './hooks/useReadReceipts';
import { usePinManagement } from './hooks/usePinManagement';
import { useCallInitiation } from './hooks/useCallInitiation';
import { useMediaUpload } from './hooks/useMediaUpload';
import { useDeadLetterActions } from './hooks/useDeadLetterActions';
import { useChatHeaderState } from './hooks/useChatHeaderState';
import ChatHeader from './components/ChatHeader';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { useIsMounted } from '../../hooks/useIsMounted';
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
import {
  KoolaText,
  koolaRadii,
  koolaSpacing,
  koolaShadows,
  koolaDarkShadows,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabDockSuppression } from '../../navigation/MainNavigator';

const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
};

// ─── Palette-aware style factory ─────────────────────────────────────────────
function makeScreenStyles(palette: Palette, scheme: 'light' | 'dark') {
  const bubbleShadow = scheme === 'dark' ? koolaDarkShadows.xs : koolaShadows.xs;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.surface },
    initialErrorOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'center', alignItems: 'center', zIndex: 2,
      paddingHorizontal: 32, gap: koolaSpacing.md,
    },
    errorIconShell: {
      width: 64, height: 64, borderRadius: koolaRadii.lg,
      backgroundColor: palette.dangerSoft,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: koolaSpacing.xs,
    },
    initialErrorRetry: {
      paddingHorizontal: 20, paddingVertical: 10, borderRadius: koolaRadii.sm,
      backgroundColor: palette.primary, marginTop: koolaSpacing.xs,
    },
    emptyOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'center', alignItems: 'center', zIndex: 1,
      paddingHorizontal: 32, gap: koolaSpacing.sm,
    },
    emptyIconShell: {
      width: 64, height: 64, borderRadius: koolaRadii.lg,
      backgroundColor: palette.primarySoft,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: koolaSpacing.xs,
    },
    emptyBody: { paddingHorizontal: 16 },
    systemMessage: { color: palette.muted, fontSize: 12 },
    dayContainer: { alignItems: 'center', marginVertical: koolaSpacing.lg },
    dayText: {
      backgroundColor: palette.canvas, borderRadius: koolaRadii.pill,
      borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line,
      paddingHorizontal: koolaSpacing.md, paddingVertical: 4, overflow: 'hidden',
    },
    typingContainer: { paddingHorizontal: koolaSpacing.lg, paddingVertical: koolaSpacing.sm, gap: koolaSpacing.sm },
    uploadingBlock: { gap: 6 },
    uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    uploadingText: { marginLeft: 0 },
    progressTrack: {
      height: 3, borderRadius: koolaRadii.pill, backgroundColor: palette.line, overflow: 'hidden',
    },
    progressFill: {
      height: 3, borderRadius: koolaRadii.pill, backgroundColor: palette.primary,
    },
    failedBubbleWrapper: {
      borderLeftWidth: 1,
      borderLeftColor: palette.danger,
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
    // Bubble depth — subtle shadow on each bubble wrapper
    bubbleOuter: {
      ...bubbleShadow,
      marginBottom: 2,
    },
    // Grouped bubble (not last in a run) — no tail radius
    bubbleGroupedRight: {
      backgroundColor: palette.primary,
      borderRadius: koolaRadii.lg,
    },
    bubbleGroupedLeft: {
      backgroundColor: palette.canvas,
      borderRadius: koolaRadii.lg,
    },
    // Last bubble in a run — tail via asymmetric radius
    bubbleTailRight: {
      backgroundColor: palette.primary,
      borderRadius: koolaRadii.lg,
      borderBottomRightRadius: koolaRadii.xs2,
    },
    bubbleTailLeft: {
      backgroundColor: palette.canvas,
      borderRadius: koolaRadii.lg,
      borderBottomLeftRadius: koolaRadii.xs2,
    },
    // Read tick row
    tickRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginTop: 1,
      marginRight: 4,
      gap: 1,
    },
  });
}

/**
 * Determine if a message is the last in a consecutive run from the same sender.
 * GiftedChat passes previousMessage/nextMessage in BubbleProps — we use
 * nextMessage (which in the inverted list is the *older* message chronologically)
 * to check if the NEXT rendered bubble is from a different sender, meaning
 * the current bubble is the "last" in the visual group (bottom of the run).
 */
function isLastInGroup(props: BubbleProps<IMessage>): boolean {
  const current = props.currentMessage;
  const next = props.nextMessage;
  if (!current) return true;
  if (!next || !next.user) return true;
  // Different sender → current is the last in its run
  return next.user._id !== current.user._id;
}

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

  const { palette, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeScreenStyles(palette, resolvedScheme), [palette, resolvedScheme]);

  const { isConnected } = useNetworkStatus();
  const { sendViaQueue } = useOfflineQueue();
  const [chatReady, setChatReady] = useState(true);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [isComposerExiting, setIsComposerExiting] = useState(false);
  const composerRef = useRef<ChatComposerHandle>(null);
  const suppressTabDock = useTabDockSuppression();

  // While Chat is on screen, the main tab dock stays hidden. On back, hide the
  // composer first and return the dock after the tuned handoff delay; this avoids
  // the heavy overlap of an immediate release without waiting for full pop end.
  useEffect(() => {
    const releaseSuppression = suppressTabDock();
    let released = false;
    let isRemoving = false;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    const release = () => {
      if (released) return;
      released = true;
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseSuppression();
    };

    const scheduleComposerExitRelease = () => {
      if (released) return;
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(release, 280);
    };

    const unsubscribeRemove = navigation.addListener('beforeRemove', () => {
      isRemoving = true;
      setIsComposerExiting(true);
      scheduleComposerExitRelease();
    });

    return () => {
      unsubscribeRemove();
      if (isRemoving) {
        scheduleComposerExitRelease();
        return;
      }
      release();
    };
  }, [navigation, suppressTabDock]);

  // ─── Focus + mount guard for async setState ────────────────────────────────
  // Prevents async callbacks from calling setState on a screen that is already
  // being popped off the native stack (Fabric snapshot flicker on back-press).
  const isFocused = useIsFocused();
  // Seed true: the incoming screen is focused on first render; avoids dropping
  // the first getDetails update if the navigator hasn't flagged focus yet.
  const isFocusedRef = useRef(true);
  useEffect(() => { isFocusedRef.current = isFocused; }, [isFocused]);
  const isMountedRef = useIsMounted();

  const [conversation, setConversation] = useState<Conversation | null>(null);

  // ─── Video player state ────────────────────────────────────────────────────
  const [playerMessage, setPlayerMessage] = useState<(IMessage & Record<string, unknown>) | null>(null);

  // ─── Viewability tracking for auto-play ───────────────────────────────────
  const [visibleMessageIds, setVisibleMessageIds] = useState<Set<string>>(new Set());
  // Keep a ref of visible video IDs to avoid setState on every scroll frame
  // (only video messages consume isVisible for autoplay — text/image don't need it)
  const prevVisibleVideoIdsRef = useRef<string>('');
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: IMessage & Record<string, unknown>; index: number | null }> }) => {
      // Filter to video messages only — these are the ones that need isVisible for autoplay
      const videoIds = viewableItems
        .filter((v) => v.item.mediaType === 'video' || v.item.video)
        .map((v) => String(v.item._id))
        .sort()
        .join(',');
      // Only trigger state update when the visible video set actually changed
      if (videoIds !== prevVisibleVideoIdsRef.current) {
        prevVisibleVideoIdsRef.current = videoIds;
        const ids = new Set(viewableItems.map((v) => String(v.item._id)));
        setVisibleMessageIds(ids);
      }

      // ─── Media prefetch around viewport ──────────────────────────────────
      // Fire-and-forget: warm cache for images/thumbnails near visible area.
      // Uses messagesRef (stable ref) to find ±5 neighbors by index.
      const allMessages = messagesRef.current;
      if (!allMessages.length || !viewableItems.length) return;

      const indices = viewableItems
        .map((v) => v.index)
        .filter((i): i is number => i !== null);
      if (!indices.length) return;

      const minIdx = Math.max(0, Math.min(...indices) - 5);
      const maxIdx = Math.min(allMessages.length - 1, Math.max(...indices) + 5);

      for (let i = minIdx; i <= maxIdx; i++) {
        const msg = allMessages[i] as IMessage & Record<string, unknown>;
        if (!msg) continue;

        // Image messages
        const mediaKey = msg.mediaKey as string | undefined;
        const mediaType = msg.mediaType as string | undefined;
        if (mediaKey && (mediaType === 'image' || msg.image === 'media-pending')) {
          if (!getFromMemory(mediaKey)) {
            getOrDownload(mediaKey).catch(() => {});
          }
        }

        // Video thumbnail
        const thumbKey = msg.mediaThumbnailKey as string | undefined;
        if (thumbKey && (mediaType === 'video' || msg.video)) {
          if (!getFromMemory(thumbKey)) {
            getOrDownload(thumbKey).catch(() => {});
          }
        }
      }
    },
  ).current;

  // ─── Header state: conversation load, avatar, title, status, header tap ────
  const {
    chatTitle,
    otherUserStatus,
    otherAvatarKey,
    otherAvatarUrl,
    handleHeaderPress,
  } = useChatHeaderState({
    conversationId,
    conversation,
    setConversation,
    currentUserId,
    initialDisplayName,
    initialAvatar,
    isFocusedRef,
    isMountedRef,
  });


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

  // Stable ref to messages for use in callbacks that should NOT re-create on
  // every messages change (e.g. renderMessageImage gallery builder).
  const messagesRef = useRef<IMessage[]>(messages);
  messagesRef.current = messages;

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
  const { handleRetryFailedMessage, handleDiscardFailedMessage } =
    useDeadLetterActions();

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
  // Perf note: when otherAvatarUrl is falsy, returns the messages reference unchanged
  // (no new objects created). When truthy, .map() is unavoidable — avatar comes from
  // header state, not DB, so injection at DB-map time is not possible.
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
      const isPending = msg?.pending === true;

      // Consecutive-message grouping: determine if this is last in a run
      const lastInRun = isLastInGroup(props);

      // Bubble wrapper style: tail only on last bubble in a run
      const bubbleWrapStyle = isMedia
        ? { backgroundColor: 'transparent', padding: 0 }
        : isRight
          ? (lastInRun ? styles.bubbleTailRight : styles.bubbleGroupedRight)
          : (lastInRun ? styles.bubbleTailLeft : styles.bubbleGroupedLeft);

      // Detect story reply metadata
      const storyReply = (msg?.metadata as Record<string, unknown> | undefined)?.storyReply as
        | { storyId: string; mediaKeyPreview?: string; captionSnippet?: string; authorId?: string }
        | undefined;

      return (
        <View style={styles.bubbleOuter}>
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
                  right: bubbleWrapStyle,
                  left: bubbleWrapStyle,
                }}
                textStyle={{
                  right: { color: palette.surface, fontSize: 15, lineHeight: 22 },
                  left: { color: palette.ink, fontSize: 15, lineHeight: 22 },
                }}
              />
            </View>
            {isFailed && (
              <KoolaText variant="caption" tone="danger" style={styles.failedLabel}>Gửi thất bại — nhấn để thử lại</KoolaText>
            )}
          </TouchableOpacity>
          {/* Delivery/read tick for own messages */}
          {isRight && !isFailed && !msg?.system && (
            <View style={styles.tickRow}>
              {isPending ? (
                <MaterialIcons name="access-time" size={12} color={palette.muted} />
              ) : (
                <MaterialIcons name="done" size={13} color={palette.primary} />
              )}
            </View>
          )}
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
    [currentUserId, reactToMessage, handleRetryFailedMessage, styles, palette],
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
              <ActivityIndicator size="small" color={palette.primary} />
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
  }, [typingUsers, isUploading, uploadProgress, styles, palette]);

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
            // Read from ref to avoid closing over messages array (stabilizes callback identity)
            const currentMessages = messagesRef.current;
            // messages is newest-first, so reverse to get chronological order (oldest = 1/X)
            const allImageUris: string[] = [];
            let tappedIndex = 0;
            for (let i = currentMessages.length - 1; i >= 0; i--) {
              const m = currentMessages[i];
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
    [navigation],
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
        exiting={isComposerExiting}
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
      isComposerExiting,
    ],
  );

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
      <ChatHeader
        chatTitle={chatTitle}
        otherUserStatus={otherUserStatus}
        otherAvatarKey={otherAvatarKey}
        onBack={() => navigation.goBack()}
        onHeaderPress={handleHeaderPress}
        onStartCall={handleStartCall}
      />

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
              <MaterialIcons name="cloud-off" size={28} color={palette.danger} />
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
        {/* Empty state — conversation has no messages yet.
            pointerEvents="none" so the overlay does not swallow taps targeting
            the absolute-positioned ChatComposer that sits visually below it. */}
        {chatReady && !isInitialLoading && !initialLoadError && messages.length === 0 && (
          <View pointerEvents="none" style={styles.emptyOverlay}>
            <View style={styles.emptyIconShell}>
              <MaterialIcons name="chat-bubble-outline" size={28} color={palette.primary} />
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
            <ActivityIndicator size="small" color={palette.primary} />
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
              // Cap scroll events to ~1/frame (16ms). GiftedChat's internal default
              // is scrollEventThrottle=1 which fires on every pixel. This prop is
              // spread AFTER GiftedChat's internals in MessageContainer, so it wins.
              scrollEventThrottle: 16,
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
              // Tuned 2026-06-30: smaller batches + longer batching period spread
              // render work across frames to cut fling jank spikes
              // (removeClippedSubviews must stay false → keep windowSize modest).
              initialNumToRender: 10,
              maxToRenderPerBatch: 5,
              windowSize: 7,
              updateCellsBatchingPeriod: 100,
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

export default ChatScreen;
