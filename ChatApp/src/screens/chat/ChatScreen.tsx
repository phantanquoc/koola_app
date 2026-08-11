import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { GiftedChat, SystemMessage, IMessage, SystemMessageProps, DayProps, InputToolbarProps, MessageProps } from 'react-native-gifted-chat';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import type { ChatScreenNavigationProp, ChatScreenRouteProp } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { socketService } from '../../services/socket/SocketService';
import { getFromMemory, getOrDownload } from '../../services/media/mediaCacheService';
import type { Conversation, Message } from '../../types';
import { useMessages } from './hooks/useMessages';
import { useTargetMessage } from './hooks/useTargetMessage';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useReadReceipts } from './hooks/useReadReceipts';
import { usePinManagement } from './hooks/usePinManagement';
import { useCallInitiation } from './hooks/useCallInitiation';
import { useMediaUpload } from './hooks/useMediaUpload';
import { useDeadLetterActions } from './hooks/useDeadLetterActions';
import { useChatHeaderState } from './hooks/useChatHeaderState';
import ChatHeader from './components/ChatHeader';
import MessageItem, { makeMessageItemStyles } from './components/MessageItem';
import { MemoizedMessageList } from './components/MemoizedMessageList';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { useIsMounted } from '../../hooks/useIsMounted';
import OfflineBanner from '../../components/OfflineBanner';
import MediaImage from '../../components/MediaImage';
import FileAttachment from '../../components/FileAttachment';
import VideoMessage from '../../components/VideoMessage';
import VideoPlayerModal from '../../components/VideoPlayerModal';
import MessageContextMenu from '../../components/MessageContextMenu';
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
  KoolaEmptyState,
  KoolaErrorState,
  KoolaLoadingState,
  KoolaText,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { ComponentTokens } from '../../ui/tokens/components';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabDockSuppression } from '../../navigation/MainNavigator';

const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
};

// ─── Palette-aware style factory ─────────────────────────────────────────────
function makeScreenStyles(compTokens: ComponentTokens, semantic: SemanticTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: semantic.surface.level1 },
    stateOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'center', zIndex: 2,
    },
    stateContent: { flex: 1 },
    systemMessage: { color: semantic.text.muted, fontSize: 12 },
    dayContainer: { alignItems: 'center', marginVertical: koolaSpacing.lg },
    dayText: {
      backgroundColor: semantic.bg.canvas, borderRadius: koolaRadii.pill,
      borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle,
      paddingHorizontal: koolaSpacing.md, paddingVertical: 4, overflow: 'hidden',
    },
    typingContainer: { paddingHorizontal: koolaSpacing.lg, paddingVertical: koolaSpacing.sm },
    uploadingBlock: { marginBottom: koolaSpacing.sm },
    uploadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    uploadingText: { marginLeft: 6 },
    progressTrack: {
      height: 3, borderRadius: koolaRadii.pill, backgroundColor: semantic.border.subtle, overflow: 'hidden',
    },
    progressFill: {
      height: 3, borderRadius: koolaRadii.pill, backgroundColor: semantic.action.primary,
    },
  });
}

// NOTE: the bubble-level styles (bubbleOuter/bubbleHighlight/bubbleTail*/
// bubbleGrouped*/tickRow/mediaTime*/textTime*/failed*/storyRefCardWrapper) and
// `isLastInGroup` now live in ./components/MessageItem, next to the only code
// that reads them. Keeping a second copy here would let the two drift apart.

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { conversationId, displayName: initialDisplayName, avatar: initialAvatar, targetMessageId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id || '';
  const insets = useSafeAreaInsets();
  const composerBottomInset = Math.max(insets.bottom, 8);
  const composerScrollClearance =
    CHAT_COMPOSER_DOCK_HEIGHT + CHAT_COMPOSER_TOP_GAP + CHAT_COMPOSER_SCROLL_GAP + composerBottomInset;

  const { tokens } = useTheme();
  const styles = useMemo(
    () => makeScreenStyles(tokens.component, tokens.semantic),
    [tokens],
  );
  // Built once per theme and passed to every row. Its identity is the signal
  // MessageItem's comparator uses to detect a palette change, so it must be
  // memoized on `tokens` and nothing else.
  const messageStyles = useMemo(
    () => makeMessageItemStyles(tokens.component, tokens.semantic),
    [tokens],
  );

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

  // ─── Viewability tracking: media prefetch only ────────────────────────────
  // Intentionally writes NO React state. A setState here would re-render the
  // whole GiftedChat subtree on every viewability change during scroll.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: IMessage & Record<string, unknown>; index: number | null }> }) => {
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
    sendMediaMessage: _sendMediaMessage,
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

  // ─── Target message: scroll-to + highlight from search navigation ─────────
  const {
    contextMessages: targetContextMessages,
    highlightId: targetHighlightId,
    isLoading: _targetLoading,
    error: targetError,
    clearHighlight: clearTargetHighlight,
    clearContextMessages,
  } = useTargetMessage(conversationId, currentUserId, targetMessageId);

  // Track which message ID should be highlighted (brief flash)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // When target context is loaded, scroll to it
  useEffect(() => {
    if (!targetHighlightId || !targetContextMessages || targetContextMessages.length === 0) return;

    // Set highlight for temporary visual feedback
    setHighlightedMessageId(targetHighlightId);

    // Find target index in the current messages array
    // GiftedChat inverts the list (newest first), so we need to find the index
    const allMessages = targetContextMessages.length > 0 ? targetContextMessages : messages;
    const idx = allMessages.findIndex((m) => String(m._id) === targetHighlightId);
    if (idx >= 0 && messageContainerRef.current) {
      // Small delay to let GiftedChat render the messages
      setTimeout(() => {
        try {
          messageContainerRef.current?.scrollToIndex({
            index: idx,
            animated: true,
            viewPosition: 0.3,
          });
        } catch {
          // onScrollToIndexFailed handler will retry
        }
      }, 300);
    }

    // Clear highlight after 2 seconds, then exit snapshot to restore live list
    const timer = setTimeout(() => {
      setHighlightedMessageId(null);
      clearTargetHighlight();
      clearContextMessages();
    }, 2000);

    return () => clearTimeout(timer);
  }, [targetHighlightId, targetContextMessages, messages, clearTargetHighlight, clearContextMessages]);

  // Show non-blocking notice if target message was unavailable
  useEffect(() => {
    if (targetError && targetMessageId) {
      // We just let the normal conversation load proceed — the user sees
      // the conversation with a brief toast-like notice (handled via the
      // chatReady guard below, or could be a Toast — for now we log it).
      console.warn('[ChatScreen] Target message unavailable:', targetError);
    }
  }, [targetError, targetMessageId]);

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
    // When a target message context window is loaded, prefer it over normal messages
    const baseMessages = (targetContextMessages && targetContextMessages.length > 0)
      ? targetContextMessages
      : messages;
    if (!otherAvatarUrl) return baseMessages;
    return baseMessages.map((m) =>
      m.user._id !== currentUserId
        ? { ...m, user: { ...m.user, avatar: otherAvatarUrl } }
        : m,
    );
  }, [messages, targetContextMessages, otherAvatarUrl, currentUserId]);

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

  // Emoji picker and voice message are unavailable — handlers removed.
  // ChatComposer hides buttons when onPressEmoji / onPressVoice are not provided.

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

  // `ReactionDisplay` is memoized, so the `onPress` it receives must keep its
  // identity across parent re-renders — an inline arrow would give every row a
  // fresh function and make the memo never hit. One handler is cached per message
  // id; the cache is dropped whenever `reactToMessage` changes identity so no
  // handler can call a stale version.
  const reactionPressHandlers = useRef(new Map<string, (emoji: string) => void>());
  const getReactionPressHandler = useCallback((messageId: string) => {
    const cached = reactionPressHandlers.current.get(messageId);
    if (cached) return cached;
    const handler = (emoji: string) => reactToMessage(messageId, emoji);
    reactionPressHandlers.current.set(messageId, handler);
    return handler;
  }, [reactToMessage]);

  useEffect(() => {
    reactionPressHandlers.current.clear();
  }, [getReactionPressHandler]);

  // Rows are rendered by the memoized `MessageItem` via GiftedChat's
  // `renderMessage` prop (see the wiring at the <GiftedChat> element below).
  // The former `renderBubble` closure lived here and depended on
  // `highlightedMessageId`, so every highlight change gave GiftedChat a new
  // render prop and repainted every mounted row. The highlight decision is now a
  // per-row boolean, so only the affected row re-renders.
  const renderMessage = useCallback(
    (props: MessageProps<IMessage>) => {
      const id = String(props.currentMessage?._id ?? '');
      return (
        <MessageItem
          {...props}
          styles={messageStyles}
          tokens={tokens}
          currentUserId={currentUserId}
          isHighlighted={highlightedMessageId != null && id === highlightedMessageId}
          onRetry={handleRetryFailedMessage}
          getReactionPressHandler={getReactionPressHandler}
        />
      );
    },
    [
      currentUserId,
      getReactionPressHandler,
      handleRetryFailedMessage,
      highlightedMessageId,
      messageStyles,
      tokens,
    ],
  );

  // Both this and `renderDay` previously declared `[]` while referencing themed
  // styles, which permanently captured the palette active at first render: after
  // a light↔dark switch, system messages and day separators kept stale colors
  // while the rest of the screen recolored. Declaring the real dependencies is
  // the fix — `styles` is memoized on `tokens`, so these callbacks now recreate
  // exactly on a theme change and at no other time.
  const renderSystemMessage = useCallback(
    (props: SystemMessageProps<IMessage>) => (
      <SystemMessage
        {...props}
        textStyle={styles.systemMessage}
      />
    ),
    [styles.systemMessage],
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
    [styles.dayContainer, styles.dayText],
  );

  const renderFooter = useCallback(() => {
    if (typingUsers.length === 0 && !isUploading) return null;
    return (
      <View style={styles.typingContainer}>
        {isUploading && (
          <View style={styles.uploadingBlock}>
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={tokens.semantic.action.primary} />
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
  }, [typingUsers, isUploading, uploadProgress, styles, tokens]);

  // ─── Media renderers ──────────────────────────────────────────────────────
  // Opening the swipe gallery needs the tapped message's id, so the handler is
  // per-message. It is cached by id rather than rebuilt inline: `MediaImage` is
  // memoized, and a fresh closure on every render would make that memo never hit.
  const imagePressHandlers = useRef(new Map<string, (uri: string) => void>());

  const openImageViewer = useCallback((messageId: string, uri: string) => {
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
          if (String(m._id) === messageId) {
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
  }, [navigation]);

  const getImagePressHandler = useCallback((messageId: string) => {
    const cached = imagePressHandlers.current.get(messageId);
    if (cached) return cached;
    const handler = (uri: string) => openImageViewer(messageId, uri);
    imagePressHandlers.current.set(messageId, handler);
    return handler;
  }, [openImageViewer]);

  // Drop cached handlers when the viewer changes identity, so they can never
  // navigate with a stale navigation object.
  useEffect(() => {
    imagePressHandlers.current.clear();
  }, [getImagePressHandler]);

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
          onPress={getImagePressHandler(String(msg._id))}
        />
      );
    },
    [getImagePressHandler],
  );

  // Same rationale as the image handler: `VideoMessage` is memoized, so its
  // onPress must keep its identity across parent re-renders. The message is
  // re-read from the ref at press time so the player never opens a stale row.
  //
  // NO CLEARING EFFECT HERE, unlike `imagePressHandlers` above — the asymmetry is
  // deliberate, not an oversight. That cache needs clearing because its handlers
  // close over `openImageViewer`, which closes over `navigation`; when navigation
  // changes identity the cached closures would navigate with a stale object. This
  // handler closes over nothing that can go stale: `messageId` is its own
  // argument, `messagesRef` is a ref read at press time, and `setPlayerMessage`
  // is a `useState` setter whose identity React guarantees is stable. Hence the
  // empty dep array below is exhaustive and the Map never holds a stale entry.
  // The Map grows one closure per distinct video message id and is discarded with
  // the screen, so it is bounded per mount.
  const videoPressHandlers = useRef(new Map<string, () => void>());
  const getVideoPressHandler = useCallback((messageId: string) => {
    const cached = videoPressHandlers.current.get(messageId);
    if (cached) return cached;
    const handler = () => {
      const current = messagesRef.current.find((m) => String(m._id) === messageId);
      if (current) setPlayerMessage(current as IMessage & Record<string, unknown>);
    };
    videoPressHandlers.current.set(messageId, handler);
    return handler;
  }, []);

  const renderMessageVideo = useCallback(
    (props: any) => {
      const msg = props.currentMessage as IMessage & Record<string, unknown> | undefined;
      if (!msg) return null;
      const rawMsg = msg as unknown as Message;
      return (
        <VideoMessage
          message={{
            mediaKey: msg.mediaKey as string | undefined,
            mediaDuration: (rawMsg.mediaDuration ?? undefined) as number | undefined,
            blurhash: rawMsg.blurhash,
            mediaThumbnailKey: msg.mediaThumbnailKey as string | null | undefined,
          }}
          onPress={getVideoPressHandler(String(msg._id))}
        />
      );
    },
    [getVideoPressHandler],
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

  // Stabilize listViewProps reference to prevent memo boundary from breaking.
  // All values are frozen constants or stable refs (viewabilityConfig, onViewableItemsChanged).
  // composerScrollClearance depends on insets but is computed once at mount.
  const stableListViewProps = useMemo(
    () => ({
      viewabilityConfig,
      onViewableItemsChanged,
      scrollEventThrottle: 16,
      contentContainerStyle: {
        paddingTop: composerScrollClearance,
        paddingBottom: 20,
      },
      showsVerticalScrollIndicator: false,
      removeClippedSubviews: false,
      initialNumToRender: 10,
      maxToRenderPerBatch: 5,
      windowSize: 7,
      updateCellsBatchingPeriod: 100,
      onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => {
        const offset = info.averageItemLength * info.index;
        messageContainerRef.current?.scrollToOffset({ offset, animated: true });
        setTimeout(() => {
          messageContainerRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
        }, 100);
      },
    }),
    [composerScrollClearance, onViewableItemsChanged],
  );

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
          <View style={styles.stateOverlay}>
            <KoolaErrorState
              icon="cloud-off"
              title="Không thể tải tin nhắn"
              message="Kiểm tra kết nối và thử lại."
              onRetry={retryInitialLoad}
              style={styles.stateContent}
            />
          </View>
        )}
        {/* Empty state — conversation has no messages yet.
            pointerEvents="none" so the overlay does not swallow taps targeting
            the absolute-positioned ChatComposer that sits visually below it. */}
        {chatReady && !isInitialLoading && !initialLoadError && messages.length === 0 && (
          <View pointerEvents="none" style={styles.stateOverlay}>
            <KoolaEmptyState
              icon="chat-bubble-outline"
              title="Bắt đầu cuộc trò chuyện"
              message={`Gửi tin nhắn đầu tiên đến ${chatTitle}.`}
              style={styles.stateContent}
            />
          </View>
        )}
        {/* Loading overlay - absolute positioned, doesn't affect layout */}
        {!chatReady && messages.length === 0 && !initialLoadError && (
          <View style={styles.stateOverlay}>
            <KoolaLoadingState
              title="Đang tải tin nhắn"
              style={styles.stateContent}
            />
          </View>
        )}
        {/* GiftedChat - always rendered (Fabric-safe: no Animated.View wrapper) */}
        <View style={{ flex: 1, opacity: chatReady ? 1 : 0 }}>
          <MemoizedMessageList
            messageContainerRef={messageContainerRef as unknown as React.ComponentProps<typeof GiftedChat>['messageContainerRef']}
            messages={messagesWithAvatar}
            onSend={() => {}}
            user={{ _id: currentUserId, name: user?.displayName, avatar: user?.avatar }}
            renderMessage={renderMessage}
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
            listViewProps={stableListViewProps}
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
