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
import { getFromMemory } from '../../services/media/mediaCacheService';
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
import { useInlineCallLogs } from './hooks/useInlineCallLogs';
import ChatHeader from './components/ChatHeader';
import MessageItem, { makeMessageItemStyles } from './components/MessageItem';
import CallMessageCard from './components/CallMessageCard';
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

// Stable no-ops for MemoizedMessageList props. Sending goes through ChatComposer
// and the useMessages callbacks, never through GiftedChat's onSend, and older
// messages load silently in the background — the default "Load earlier" spinner
// would shift the list header on every page arrival. Both were previously inline
// arrows / absent, which handed the memo boundary a fresh identity (or a toggling
// boolean) and re-rendered the whole list on unrelated ChatScreen renders.
const NOOP_SEND = () => {};
const RENDER_NO_LOAD_EARLIER = () => null;

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

  // ─── Viewability / media prefetch: REMOVED (perf isolation) ────────────────
  // This screen previously wired the list's per-tick viewability callback to a
  // debounced media prefetch. On-device profiling showed the JS thread pinned at
  // ~100% during scroll once the loaded window grew past the first screen: the
  // viewability helper recomputes the visible set on every scroll tick (60/s via
  // scrollEventThrottle) and the cost scales with the data length, so a 1000-row
  // conversation starved the same thread that mounts new rows — the "khựng như
  // đợi load" past the first 50 messages. The prefetch was cache-warming only;
  // images already lazy-load on row mount. If media warm-up is wanted back,
  // re-implement it off scroll position (onMomentumScrollEnd / onScrollEndDrag),
  // NOT off per-tick viewability.

  // ─── Header state: conversation load, avatar, title, status, header tap ────
  const {
    chatTitle,
    otherUserStatus,
    otherAvatarKey,
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
    isInitialLoading,
    initialLoadError,
    retryInitialLoad,
    hasEarlier,
  } = useMessages(conversationId, currentUserId);

  // ─── Inline call logs — merged into timeline ──────────────────────────────
  const { callLogs } = useInlineCallLogs(conversationId);

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

  // Pick the window GiftedChat renders. When a search navigation loaded a
  // target-message context window, prefer it over the normal messages.
  //
  // No avatar injection here, on purpose. Rows never draw sender avatars
  // (showUserAvatar={false}, showAvatarForEveryMessage={false}, and the minimal
  // MessageItem tree has no avatar element), so the only reader of
  // `user.avatar` on a message was the row comparator. The old
  // `messagesWithAvatar` mapped the whole array to stamp the avatar in, which
  // rebuilt every message object on each page arrival and invalidated GiftedChat
  // end to end — a full-list invalidation per 40-row page for a pixel nothing
  // renders. The header avatar is unaffected: ChatHeader resolves it from
  // `otherAvatarKey` via UserAvatar.
  // Inline call logs are merged here (newest-first) when no target snapshot is active.
  type TimelineItem = IMessage & { __callEntry?: import('../../services/api/apiService').CallLogEntry };
  const displayedMessages: TimelineItem[] = React.useMemo(() => {
    if (targetContextMessages && targetContextMessages.length > 0) {
      return targetContextMessages as TimelineItem[];
    }
    if (!callLogs || callLogs.length === 0) return messages as TimelineItem[];
    const callItems: TimelineItem[] = callLogs.map((e) => ({
      _id: `call:${e._id}`,
      text: '',
      createdAt: new Date(e.startedAt),
      user: { _id: e.initiatorId } as IMessage['user'],
      __callEntry: e,
    } as TimelineItem));
    const merged = [...(messages as TimelineItem[]), ...callItems];
    merged.sort((a, b) => {
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string | number | Date).getTime();
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string | number | Date).getTime();
      if (tb !== ta) return tb - ta;
      // tie-break: messages before call cards so text order is stable
      const aIsCall = !!(a as TimelineItem).__callEntry;
      const bIsCall = !!(b as TimelineItem).__callEntry;
      if (aIsCall !== bIsCall) return aIsCall ? 1 : -1;
      return 0;
    });
    return merged;
  }, [messages, targetContextMessages, callLogs]);

  // ─── Scroll back to newest on own send ────────────────────────────────────
  // Sending never goes through GiftedChat: `onSend` is the stable `NOOP_SEND`
  // and ONLINE sends flow ChatComposer -> handleSend -> useMessages ->
  // messageRepository.insertOptimistic -> repository notify -> a fresh array
  // in `messages`. OFFLINE sends take the sendViaQueue/outbox path instead and
  // create no optimistic bubble, so this effect does not fire for them at send
  // time; they snap only later, when the message materializes via socket
  // echo/sync as a normal prepend of an own message. GiftedChat's internal
  // `_onSend` scroll-to-bottom never runs, and nothing else moves the list —
  // a message typed while scrolled up landed off-screen with no jump to it.
  //
  // THE SEND SIGNATURE IS A HEAD CHANGE, NOT LENGTH GROWTH. The repository
  // invalidation for a send takes the `orderChanged` branch of
  // handleInvalidation and does a FULL RELOAD capped at LIMIT =
  // max(INITIAL_WINDOW_SIZE, loadedCount): the new row is included but the
  // oldest row is truncated, so the window length does NOT grow on send
  // (confirmed on device: rows=150 before, rows=150 after). A length-growth
  // guard here was always false on the real send path and silently disabled
  // this feature. The reliable signal is the index-0 `_id` changing to a
  // fresh OWN-authored row. Fires only when ALL of these hold:
  //   1. The head `_id` changed vs the tracked one — a fresh row at index 0
  //      (or the optimistic temp id swapping for the server id on ack).
  //   2. The new head belongs to the current user: an own send. Incoming
  //      messages from the other user change the head the exact same way,
  //      and this identity check is what excludes them — a receive must never
  //      yank a reading user back to the bottom (deliberate UX decision).
  //   3. No target-message context window is active: that snapshot has its
  //      own scroll-to-target effect above and must not be fought.
  // Every other mutation is excluded by check 1 or 2:
  //   - loadEarlier appends older rows to the TAIL of the newest-first array,
  //     so index 0 never moves.
  //   - Incremental PATCH (reactions/status/delete) replaces rows in place;
  //     the head's `_id` is unchanged.
  //   - Initial mount / conversation switch can fire once when the newest
  //     message is one's own, but offset 0 IS the mount position of the
  //     inverted list — the scrollToOffset is a no-op there.
  //   - The send ack (temp id -> server id) changes the head `_id` again and
  //     re-fires at offset 0 — already there, another no-op.
  // animated MUST stay false: the list can hold hundreds of unmounted rows
  // between a scrolled-up position and the bottom, and an animated scroll
  // would mount every one of them in a single pass — the exact jank this
  // screen's memo/batch tuning exists to prevent. An instant snap mounts only
  // what maxToRenderPerBatch schedules.
  const prevRenderedHeadIdRef = useRef<string | null>(null);
  useEffect(() => {
    const first = displayedMessages[0];
    const headChanged = !!first && String(first._id) !== prevRenderedHeadIdRef.current;
    const isOwnHead = first?.user?._id === currentUserId;
    const noTargetContext = !targetContextMessages || targetContextMessages.length === 0;
    if (headChanged && isOwnHead && noTargetContext) {
      messageContainerRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    // Update the tracked head only while the live window is rendered. During
    // a target-context snapshot, freeze the ref (skip the update) so it keeps
    // the live window's pre-snapshot head; when the snapshot clears, the exit
    // transition reads as no head change and no spurious snap fires. (Resetting
    // the ref to null here would NOT achieve this: the exit run would then see
    // a head differing from null and re-fire the very snap this prevents.)
    if (noTargetContext) {
      prevRenderedHeadIdRef.current = first ? String(first._id) : null;
    }
  }, [displayedMessages, currentUserId, targetContextMessages]);

  // GiftedChat's "self" identity. Inline it would hand MemoizedMessageList a new
  // object every ChatScreen render and fail its shallow memo; only `_id` drives
  // left/right alignment, and the own avatar is never drawn.
  const chatUser = React.useMemo(
    () => ({ _id: currentUserId, name: user?.displayName, avatar: user?.avatar }),
    [currentUserId, user?.displayName, user?.avatar],
  );

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
      const raw = props.currentMessage as IMessage & { __callEntry?: import('../../services/api/apiService').CallLogEntry };
      if (raw?.__callEntry) {
        return (
          <CallMessageCard
            entry={raw.__callEntry}
            currentUserId={currentUserId}
            conversationId={conversationId}
            conversationType={conversation?.type}
          />
        );
      }
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
          // Other sender's avatar for incoming rows. Threaded as plain props —
          // NOT injected into the message objects — so a header resolve repaints
          // rows once instead of rebuilding the whole messages array.
          otherAvatarKey={otherAvatarKey}
          otherDisplayName={chatTitle}
        />
      );
    },
    [
      chatTitle,
      conversation?.type,
      conversationId,
      currentUserId,
      getReactionPressHandler,
      handleRetryFailedMessage,
      highlightedMessageId,
      messageStyles,
      otherAvatarKey,
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
  // composerScrollClearance depends on insets but is computed once at mount.
  // NOTE: no per-tick viewability props here — see the removal note near the top
  // of the component for why they were dropped.
  const stableListViewProps = useMemo(
    () => ({
      scrollEventThrottle: 16,
      contentContainerStyle: {
        paddingTop: composerScrollClearance,
        paddingBottom: 20,
      },
      showsVerticalScrollIndicator: false,
      removeClippedSubviews: false,
      initialNumToRender: 10,
      // Real-device recalibration. The conservative pair (5 / 100) was tuned on the
      // emulator, whose weak JS thread starved scrolling whenever a batch landed;
      // on device the bottleneck inverts — a fast flick outruns a 5-row batch that
      // only schedules every 100ms, so the viewport shows blank space until the
      // next batch lands ("khựng như đợi load"). A larger batch on a shorter
      // period spends the device's spare JS headroom on mount throughput instead.
      maxToRenderPerBatch: 12,
      windowSize: 21,
      updateCellsBatchingPeriod: 50,
      // Start fetching older messages one full screen before the user reaches
      // the top instead of at half a screen. GiftedChat hardcodes 0.1 on its
      // FlatList but spreads `listViewProps` after it, so this override wins.
      // The fetch is a local SQLite read on `idx_messages_conv_created`, so
      // triggering it early costs little and is what keeps the "load earlier"
      // spinner off screen; an 80-row page (EARLIER_PAGE_SIZE, ≈ 4 screens of
      // rows) landing this far ahead of the cursor means the next page is
      // already mounted before a fast flick can outrun it.
      onEndReachedThreshold: 1.0,
      onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => {
        const offset = info.averageItemLength * info.index;
        messageContainerRef.current?.scrollToOffset({ offset, animated: true });
        setTimeout(() => {
          messageContainerRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
        }, 100);
      },
    }),
    [composerScrollClearance],
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
            messages={displayedMessages}
            onSend={NOOP_SEND}
            user={chatUser}
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
            renderAvatar={null}
            showUserAvatar={false}
            showAvatarForEveryMessage={false}
            loadEarlier={hasEarlier}
            onLoadEarlier={loadEarlier}
            renderLoadEarlier={RENDER_NO_LOAD_EARLIER}
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
