/**
 * MessageItem — the memoized chat row.
 *
 * WHY THIS EXISTS
 * Previously ChatScreen passed `renderBubble` to GiftedChat. That callback's
 * identity changed whenever *any* of its dependencies changed — most notably
 * `highlightedMessageId`, which flips twice per search navigation — and a new
 * callback identity re-rendered the bubble of every mounted row, not just the
 * one whose highlight changed. Wiring a memoized component through the public
 * `renderMessage` prop instead moves the re-render decision into the row: a
 * per-row `isHighlighted` boolean means one row repaints instead of all of them.
 *
 * HOW IT KEEPS THE VISUALS IDENTICAL
 * The row still renders GiftedChat's own `Message` component internally, and the
 * bubble body is handed to it via `renderBubble`. That is deliberate: `Message`
 * owns the left/right container alignment, the same-sender bottom margin, the
 * avatar gating (placeholder vs real avatar), and the `currentMessage.system`
 * branch that routes to `renderSystemMessage`. Copying those by hand would be the
 * most likely source of silent visual drift, so we reuse them instead.
 *
 * WHY THE BUBBLE BODY IS NO LONGER GiftedChat's `Bubble` (Phase 2B)
 * `renderBubble` used to render GiftedChat's `<Bubble>`, which builds three
 * structurally empty layers per row — `View (fill+container)`, an inner
 * `TouchableWithoutFeedback`, and `View (inner)` — plus a retry touchable and its
 * wrapper that mounted with `undefined` props on every message. Fabric's
 * shadow-tree commit (`draw→sync`) cost scales with mounted view count, so those
 * dead layers were the dominant on-device scroll-jank source. This component now
 * renders the minimal tree directly: it reproduces `Bubble`'s geometry (start/end
 * alignment, 60 dp opposite-side inset, 20 dp min height, bottom-aligned content,
 * justified metadata strip) and its content order (leading custom view → image →
 * video → audio → text → trailing custom view) while dropping the empty wrappers.
 * Message TEXT is still rendered by GiftedChat's `MessageText` (imported from the
 * same barrel as `Message`), so url/phone/email linkification, `WWW_URL_PATTERN`
 * scheme repair, and the `Linking` failure fallback are preserved rather than
 * hand-ported. The long-press gesture — previously triggered by the touchable
 * INSIDE `Bubble` — is re-hosted on the row's own wrapper here; without that
 * re-host the reaction/reply/pin menu would die silently. `renderMessageImage`,
 * `renderMessageVideo` and `renderCustomView` (passed by ChatScreen through the
 * prop spread) keep being invoked exactly as before.
 *
 * WHY `shouldUpdateMessage` IS FORCED TRUE
 * `Message` is itself wrapped in `React.memo` with a comparator that ONLY deep-
 * compares currentMessage/previousMessage/nextMessage, so it silently swallows
 * any change that arrives through a render prop instead of through message data
 * — a theme switch, for instance, repaints nothing because the message objects
 * are untouched. Gifted-chat's documented escape hatch for that is
 * `shouldUpdateMessage`. Forcing it true makes THIS component's comparator the
 * single authoritative gate: nothing below can veto a render we decided to do,
 * which removes the double-gating hazard where one memo lets a change through
 * and the next one freezes it.
 */

import React, { useCallback } from 'react';
import { View, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { Message, MessageText } from 'react-native-gifted-chat';
import type {
  BubbleProps,
  IMessage,
  MessageProps,
  RenderMessageImageProps,
  RenderMessageVideoProps,
  TimeProps,
} from 'react-native-gifted-chat';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import dayjs from 'dayjs';
import StoryReferenceCard from '../../../components/moments/StoryReferenceCard';
import ReactionDisplay from '../../../components/ReactionDisplay';
import TranslatedText from '../../../components/TranslatedText';
import UserAvatar from '../../../components/UserAvatar';
import type { MessageReaction } from '../../../types';
import { KoolaText, koolaRadii, koolaSpacing } from '../../../ui';
import type { SemanticTokens } from '../../../ui/tokens/semantic';
import type { ComponentTokens } from '../../../ui/tokens/components';
import { messageItemPropsEqual, sameMessage, sameNeighbour } from './messageItemEquality';

/**
 * Row-local palette-aware styles. These moved here verbatim from ChatScreen's
 * style factory — they were only ever read by the bubble body, so they belong to
 * the row. ChatScreen builds this once per theme and passes it down, rather than
 * each row calling useTheme() and adding a context subscription per message.
 */
export function makeMessageItemStyles(
  compTokens: ComponentTokens,
  semantic: SemanticTokens,
) {
  return StyleSheet.create({
    failedBubbleWrapper: {
      borderLeftWidth: 1,
      borderLeftColor: semantic.status.danger,
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
    bubbleOuter: {
      marginBottom: 2,
    },
    bubbleHighlight: {
      backgroundColor: 'rgba(33, 150, 243, 0.12)',
      borderRadius: koolaRadii.md,
    },
    // ─── Bubble geometry, ported verbatim from GiftedChat's Bubble/styles.js ───
    // The row now draws the bubble itself instead of rendering <Bubble>, so the
    // wrapper geometry that used to come from that component's stylesheet lives
    // here. Losing any of these makes bubbles span the full width or collapse
    // below a legible height (see chat-message-presentation spec).
    //
    // `minHeight: 20` + `justifyContent: 'flex-end'` reproduce Bubble's 20 dp
    // floor and bottom-aligned content. The 60 dp opposite-side margin is the
    // inset that stops a bubble from ever reaching the far edge — it is applied
    // per side below because it differs for incoming vs outgoing.
    bubbleWrapperBase: {
      minHeight: 20,
      justifyContent: 'flex-end',
    },
    // Incoming: reserve the inset on the trailing (right) side.
    bubbleInsetLeft: {
      marginRight: 60,
    },
    // Outgoing: reserve the inset on the leading (left) side.
    bubbleInsetRight: {
      marginLeft: 60,
    },
    // The metadata strip beneath the bubble body (time). Bubble laid this out as
    // a horizontal row justified to the start for incoming and end for outgoing.
    bottomStripLeft: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    bottomStripRight: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    // Grouped bubble (not last in a run) — no tail radius
    bubbleGroupedRight: {
      backgroundColor: compTokens.chatBubble.own.bg,
      borderRadius: koolaRadii.lg,
    },
    bubbleGroupedLeft: {
      backgroundColor: compTokens.chatBubble.other.bg,
      borderRadius: koolaRadii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: compTokens.chatBubble.other.border,
    },
    // Last bubble in a run — tail via asymmetric radius
    bubbleTailRight: {
      backgroundColor: compTokens.chatBubble.own.bg,
      borderRadius: koolaRadii.lg,
      borderBottomRightRadius: koolaRadii.xs2,
    },
    bubbleTailLeft: {
      backgroundColor: compTokens.chatBubble.other.bg,
      borderRadius: koolaRadii.lg,
      borderBottomLeftRadius: koolaRadii.xs2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: compTokens.chatBubble.other.border,
    },
    // Read tick row
    tickRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginTop: 1,
      marginRight: 4,
    },
    // Media message time scrim — semi-opaque backing for legibility over images
    mediaTimeScrim: {
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      borderRadius: koolaRadii.xs2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignSelf: 'flex-end',
      marginRight: 6,
      marginBottom: 4,
    },
    mediaTimeText: {
      color: '#FFFFFF',
      fontSize: 11,
    },
    // Text message time row
    textTimeRow: {
      paddingHorizontal: koolaSpacing.sm,
      paddingBottom: 4,
      alignItems: 'flex-end',
    },
    textTimeLabel: {
      fontSize: 11,
    },
    // Sender avatar for incoming rows. The incoming bubble shifts right by
    // `incomingAvatarGutter` so a 28 dp avatar fits in the left gutter, parked
    // absolute and bottom-aligned with the run's last bubble. Absolute so the
    // avatar adds no height to the row and bubbles never shift when it resolves.
    incomingAvatarGutter: {
      marginLeft: 34,
    },
    avatarGutter: {
      position: 'absolute',
      left: 2,
      bottom: 0,
    },
  });
}

export type MessageItemStyles = ReturnType<typeof makeMessageItemStyles>;

/**
 * Determine if a message is the last in a consecutive run from the same sender.
 * GiftedChat passes previousMessage/nextMessage in BubbleProps — we use
 * nextMessage (which in the inverted list is the *older* message chronologically)
 * to check if the NEXT rendered bubble is from a different sender, meaning
 * the current bubble is the "last" in the visual group (bottom of the run).
 */
export function isLastInGroup(props: BubbleProps<IMessage>): boolean {
  const current = props.currentMessage;
  const next = props.nextMessage;
  if (!current) return true;
  if (!next || !next.user) return true;
  // Different sender → current is the last in its run
  return next.user._id !== current.user._id;
}

/**
 * THE COMPARATOR IS KEYED OFF THIS TYPE. Adding a field here fails
 * `tsc --noEmit` until it is listed in messageItemEquality's ledger — either as
 * compared, or as explicitly-not-compared with a reason. See the ledger comment
 * in ./messageItemEquality for why that guard exists.
 *
 * Note the contract that makes it work: a prop is only covered if it is DECLARED
 * here. GiftedChat spreads its whole prop bag down through MessageContainer into
 * `renderMessage`, so props ChatScreen never declared can still arrive at runtime
 * (`renderTime`, for one). Those are invisible to `keyof MessageItemProps` and so
 * invisible to the guard — if you start relying on one, declare it here.
 */
export interface MessageItemProps extends MessageProps<IMessage> {
  styles: MessageItemStyles;
  tokens: { semantic: SemanticTokens; component: ComponentTokens };
  currentUserId: string;
  /** Decided by the parent per row, so a highlight change repaints one row. */
  isHighlighted: boolean;
  onRetry: (messageId: string) => void;
  /** Returns the cached per-message reaction handler (stable identity). */
  getReactionPressHandler: (messageId: string) => (emoji: string) => void;
  /**
   * These three are Bubble props, not `MessageProps`, so gifted-chat's types do
   * not declare them on this boundary — yet ChatScreen passes all three to
   * <GiftedChat> and MessageContainer spreads them into `renderMessage`, which
   * hands them here and on to `Message` → `Bubble`. They are declared optional
   * because ChatScreen's own `{...props}` spread (typed `MessageProps<IMessage>`)
   * cannot promise them. The comparator has always compared their identity;
   * declaring them is what puts them under the guard.
   */
  renderMessageImage?: (props: RenderMessageImageProps<IMessage>) => React.ReactNode;
  renderMessageVideo?: (props: RenderMessageVideoProps<IMessage>) => React.ReactNode;
  renderCustomView?: (props: BubbleProps<IMessage>) => React.ReactNode;
  /**
   * Other sender's avatar, threaded as plain props by ChatScreen (header state)
   * instead of being injected into every message object. Rendered in the left
   * gutter of incoming rows, only on the last bubble of a run; grouped rows
   * still reserve the gutter so bubbles stay aligned.
   */
  otherAvatarKey?: string;
  otherDisplayName?: string;
  /**
   * Also a Bubble prop rather than a `MessageProps` one, declared for the same
   * reason: to put it under the ledger guard. Unlike the three above it is NOT
   * compared, because this component passes its own `renderTime` AFTER the
   * `{...bubbleProps}` spread and therefore always wins — see the ledger entry.
   */
  renderTime?: (props: TimeProps<IMessage>) => React.ReactNode;
}

/**
 * See the file header: this defeats gifted-chat's internal deep-equality memo so
 * that this component's own comparator is the only gate on row re-renders.
 */
const alwaysUpdate = () => true;

const MessageItem: React.FC<MessageItemProps> = (props) => {
  const {
    styles,
    tokens,
    currentUserId,
    isHighlighted,
    onRetry,
    getReactionPressHandler,
    otherAvatarKey,
    otherDisplayName,
    ...giftedProps
  } = props;

  // Sender-avatar visibility for incoming rows, computed here at the ROW level
  // (not inside renderBubble): the avatar is drawn on the row root below so its
  // absolute positioning anchors to the row = the screen edge, not to the
  // bubble (which sits `incomingAvatarGutter` dp to the right). Conditions:
  // incoming sender, not a system message, and last bubble of the sender's run
  // — the same grouping check renderBubble uses for the bubble tail.
  const currentMessage = giftedProps.currentMessage;
  const showIncomingAvatar =
    !!currentMessage &&
    !currentMessage.system &&
    currentMessage.user._id !== currentUserId &&
    isLastInGroup(props);

  // Ported verbatim from ChatScreen's former `renderBubble`, with one change:
  // `isHighlighted` is now a prop decided per row instead of being derived from
  // a screen-wide `highlightedMessageId` captured in the closure.
  const renderBubble = useCallback(
    (bubbleProps: BubbleProps<IMessage>) => {
      const msg = bubbleProps.currentMessage as IMessage & Record<string, unknown>;
      const isImage = msg?.image && msg?.mediaType === 'image';
      const isVideo = msg?.mediaType === 'video';
      const isMedia = isImage || isVideo;
      const reactions = (msg?.reactions as MessageReaction[]) || [];
      const isRight = msg?.user?._id === currentUserId;
      const isFailed = msg?.failed === true;
      const isPending = msg?.pending === true;

      // Consecutive-message grouping: determine if this is last in a run
      const lastInRun = isLastInGroup(bubbleProps);

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

      // Time label — media uses scrim, text uses row
      const timeText = dayjs(msg.createdAt).format('HH:mm');
      const timeElement = isMedia ? (
        <View style={styles.mediaTimeScrim}>
          <KoolaText variant="caption" style={styles.mediaTimeText}>{timeText}</KoolaText>
        </View>
      ) : (
        <View style={styles.textTimeRow}>
          <KoolaText variant="caption" tone="muted" style={styles.textTimeLabel}>{timeText}</KoolaText>
        </View>
      );

      // Text style for MessageText
      const textStyle = {
        right: { color: tokens.component.chatBubble.own.text, fontSize: 15, lineHeight: 22 },
        left: { color: tokens.component.chatBubble.other.text, fontSize: 15, lineHeight: 22 },
      };

      // Bubble content in fixed order: leading custom view → image → video →
      // audio (slot retained, unused today) → text → trailing custom view
      const bubbleContent = (
        <View
          style={[
            styles.bubbleWrapperBase,
            isRight ? styles.bubbleInsetRight : [styles.bubbleInsetLeft, styles.incomingAvatarGutter],
            bubbleWrapStyle,
          ]}>
          {/* Leading custom view */}
          {!bubbleProps.isCustomViewBottom && bubbleProps.renderCustomView?.(bubbleProps)}
          {/* Image */}
          {msg.image && bubbleProps.renderMessageImage?.(bubbleProps as RenderMessageImageProps<IMessage>)}
          {/* Video */}
          {msg.video && bubbleProps.renderMessageVideo?.(bubbleProps as RenderMessageVideoProps<IMessage>)}
          {/* Audio slot — retained per spec, never populated today */}
          {msg.audio && bubbleProps.renderMessageAudio?.(bubbleProps as RenderMessageVideoProps<IMessage>)}
          {/* Text */}
          {msg.text && (
            <MessageText
              currentMessage={msg}
              position={bubbleProps.position}
              textStyle={textStyle}
            />
          )}
          {/* Translation subtitle — only for eligible text messages. The marker
              is attached by dbMsgToGifted; live state flows through
              translationStore inside TranslatedText, so this mount gate does not
              affect memo behavior or re-render other rows when a translation
              arrives. */}
          {msg.text && !!(msg as IMessage & Record<string, unknown>).translation && (
            <TranslatedText message={msg} currentUserId={currentUserId} />
          )}
          {/* Trailing custom view */}
          {bubbleProps.isCustomViewBottom && bubbleProps.renderCustomView?.(bubbleProps)}
          {/* Time beneath content */}
          <View style={isRight ? styles.bottomStripRight : styles.bottomStripLeft}>
            {timeElement}
          </View>
        </View>
      );
      // TASK 3.1–3.3: Re-host the long-press gesture on the row's own wrapper.
      // System messages must NOT trigger long-press (task 3.4). Failed messages
      // need BOTH tap-retry (single tap) and long-press-menu on the same subtree
      // (task 3.3). The context argument is ignored by ChatScreen:353, so passing
      // `undefined` is safe.
      const longPressHandler = msg.system
        ? undefined
        : () => bubbleProps.onLongPress?.(undefined, msg);

      // TASK 2.6: Mount retry TouchableOpacity + failedBubbleWrapper ONLY when
      // failed, so normal messages no longer carry two layers with undefined props.
      const wrappedContent = isFailed ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onRetry(String(msg._id))}
          onLongPress={longPressHandler}
          accessible
          accessibilityLabel="Gửi thất bại — nhấn để thử lại"
          accessibilityRole="button">
          <View style={styles.failedBubbleWrapper}>
            {bubbleContent}
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableWithoutFeedback onLongPress={longPressHandler}>
          {bubbleContent}
        </TouchableWithoutFeedback>
      );

      return (
        <View style={[styles.bubbleOuter, isHighlighted && styles.bubbleHighlight]}>
          {/* The sender avatar is NOT rendered here — it lives on the row root
              (see the component body below) so its absolute positioning anchors
              to the screen edge instead of to this bubble's offset box. */}
          {/* Story reference card above bubble */}
          {storyReply && (
            <View style={styles.storyRefCardWrapper}>
              <StoryReferenceCard storyReply={storyReply} />
            </View>
          )}
          {wrappedContent}
          {/* Failed label beneath retry touchable */}
          {isFailed && (
            <KoolaText variant="caption" tone="danger" style={styles.failedLabel}>
              Gửi thất bại — nhấn để thử lại
            </KoolaText>
          )}
          {/* Delivery/read tick for own messages */}
          {isRight && !isFailed && !msg?.system && (
            <View style={styles.tickRow}>
              {isPending ? (
                <MaterialIcons name="access-time" size={12} color={tokens.semantic.text.muted} />
              ) : ((msg as IMessage & Record<string, unknown>).messageStatus === 'read' ||
                    ((msg as IMessage & Record<string, unknown>).readBy as string[] | undefined)?.length) ? (
                <MaterialIcons name="done-all" size={13} color={tokens.semantic.action.primary} />
              ) : (
                <MaterialIcons name="done" size={13} color={tokens.semantic.text.muted} />
              )}
            </View>
          )}
          {/* Reactions beneath bubble */}
          {reactions.length > 0 && (
            <ReactionDisplay
              reactions={reactions}
              currentUserId={currentUserId}
              onPress={getReactionPressHandler(String(msg._id))}
              isRight={isRight}
            />
          )}
        </View>
      );
    },
    [currentUserId, getReactionPressHandler, isHighlighted, onRetry, styles, tokens],
  );

  return (
    <View>
      {/* Sender avatar in the left gutter, once per run (last bubble). Drawn on
          the row ROOT — not inside renderBubble — so `avatarGutter`'s absolute
          left:2 anchors to the row/screen edge. Absolute + pointerEvents none,
          so it adds no row height, never shifts the bubble, and never captures
          touches. */}
      {showIncomingAvatar && (
        <View style={styles.avatarGutter} pointerEvents="none">
          <UserAvatar
            displayName={otherDisplayName ?? ''}
            avatar={otherAvatarKey}
            size={28}
          />
        </View>
      )}
      <Message
        {...giftedProps}
        renderBubble={renderBubble}
        shouldUpdateMessage={alwaysUpdate}
      />
    </View>
  );
};

// ─── Comparator ──────────────────────────────────────────────────────────────
//
// The comparison logic lives in ./messageItemEquality, which imports nothing at
// runtime and is therefore unit-testable field by field. That separation is
// deliberate: an over-aggressive comparator freezes a row without crashing or
// logging anything, so this is the one part of the change that must be proven by
// test rather than by inspection. See messageItemEquality.spec.ts.
//
// Passed with NO cast, on purpose. `messageItemPropsEqual` takes
// `ComparableMessageItemProps`, which `Readonly<MessageItemProps>` satisfies
// structurally, so the compiler checks this wiring instead of being silenced. A
// cast here would also defeat the ledger guards at the bottom of
// messageItemEquality — they only bind because MessageItemProps is the real
// source of truth for what a row receives. Do not reintroduce one.

export default React.memo(MessageItem, messageItemPropsEqual);
