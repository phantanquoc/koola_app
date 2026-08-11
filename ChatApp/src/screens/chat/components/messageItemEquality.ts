/**
 * Pure equality logic for the memoized chat row.
 *
 * This lives in its own module, free of any runtime `react-native` or
 * `react-native-gifted-chat` import, for one reason: it is the single thing
 * standing between a live message row and one that silently stops updating.
 * A too-aggressive comparator does not crash and logs nothing — the row just
 * freezes, which is far worse to diagnose than an exception. Keeping the logic
 * pure means it can be unit-tested directly, field by field, instead of being
 * asserted by eye through a component that cannot even be rendered in this
 * project's node test environment.
 *
 * Type-only imports are erased at compile time, so importing the row's own props
 * type and gifted-chat's types here costs nothing at runtime. That erasure is
 * load-bearing: `./MessageItem` pulls in react-native and gifted-chat, and this
 * module must stay importable from a plain node test. Keep every import in this
 * file an `import type`.
 */

import type { MessageItemProps } from './MessageItem';

/**
 * The mutable surface of a message, as produced by `dbMsgToGifted`.
 *
 * Every field the comparator reads is declared explicitly and there is NO
 * `[key: string]: unknown` index signature, deliberately. An index signature
 * would let the comparator read a misspelled or since-renamed field as
 * `undefined` forever — comparing `undefined === undefined`, reporting "equal",
 * and freezing the row with no compiler complaint. Explicit fields make a typo a
 * build error. Types are loose (`unknown`) where the comparator only needs
 * `===`, so this module still needs no dependency on the app's concrete message
 * type.
 */
export interface ComparableMessage {
  _id: string | number;
  text?: string;
  createdAt?: Date | number | string;
  system?: boolean;
  sent?: boolean;
  pending?: boolean;
  failed?: boolean;
  messageStatus?: unknown;
  readBy?: unknown[];
  reactions?: unknown;
  isUploading?: unknown;
  uploadProgress?: unknown;
  image?: unknown;
  video?: unknown;
  mediaType?: unknown;
  mediaKey?: unknown;
  mediaThumbnailKey?: unknown;
  mediaSize?: unknown;
  mediaDuration?: unknown;
  blurhash?: unknown;
  imageWidth?: unknown;
  imageHeight?: unknown;
  metadata?: unknown;
  user?: { _id: string | number; avatar?: unknown };
}

/**
 * The props the comparator inspects. Deliberately structural and loose on the
 * fields that are only ever identity-compared, so this module needs no
 * dependency on the component's concrete style or token types.
 *
 * Its key set is pinned to `ComparedPropKey` by an assertion at the bottom of
 * this file, and it carries no index signature for the same reason
 * `ComparableMessage` carries none. `Readonly<MessageItemProps>` is assignable
 * to this type, which is what lets `React.memo` accept the comparator with no
 * cast — see the note on the assertions below.
 */
export interface ComparableMessageItemProps {
  styles: unknown;
  tokens: unknown;
  currentUserId: string;
  isHighlighted: boolean;
  onRetry: unknown;
  getReactionPressHandler: unknown;
  position?: unknown;
  user?: { _id: string | number } | undefined;
  currentMessage?: ComparableMessage | undefined;
  previousMessage?: ComparableMessage | undefined;
  nextMessage?: ComparableMessage | undefined;
  renderMessageImage?: unknown;
  renderMessageVideo?: unknown;
  renderCustomView?: unknown;
}

/**
 * `createdAt` arrives as a `Date` from the DB mapper but as an ISO string or a
 * number from other paths, so identity and `===` are both unreliable. Normalise
 * before comparing, otherwise two equal timestamps of different types would
 * register as a change and defeat the memo on every remap.
 */
export function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

/**
 * Compare reactions arrays by value (length + per-index userId + emoji).
 * Returns true if reactions are equal. Treats undefined/null as empty array.
 *
 * WHY VALUE COMPARISON: reactions arrive from JSON.parse (socket events, REST sync)
 * which creates new array instances on every parse. Identity comparison would
 * always miss the memo even when reactions are unchanged, defeating the optimization.
 *
 * WARNING: This comparator only checks userId + emoji. If reactions gain additional
 * fields (e.g., timestamp, displayName), those fields will NOT trigger re-render.
 * Update this function if reaction schema changes.
 */
function sameReactions(
  a: unknown,
  b: unknown,
): boolean {
  // Type guard: reactions should be array of {userId, emoji, ...}
  const aReactions = Array.isArray(a) ? a : [];
  const bReactions = Array.isArray(b) ? b : [];

  // Fast path: length mismatch
  if (aReactions.length !== bReactions.length) return false;

  // Compare each reaction's userId + emoji (order matters)
  for (let i = 0; i < aReactions.length; i++) {
    const aReaction = aReactions[i];
    const bReaction = bReactions[i];
    // Cast to any to avoid deep type dependency on reaction shape
    if ((aReaction as any)?.userId !== (bReaction as any)?.userId) return false;
    if ((aReaction as any)?.emoji !== (bReaction as any)?.emoji) return false;
  }

  return true;
}

/**
 * Neighbours influence this row only through their sender and their timestamp:
 * `isLastInGroup` reads the sender for the tail radius, and gifted-chat's
 * `isSameUser`/`isSameDay` use both to pick the grouping margin and to decide
 * whether the avatar slot shows a real avatar or a blank spacer. Nothing else
 * about a neighbour is observable from inside this row.
 */
export function sameNeighbour(
  a: ComparableMessage | undefined,
  b: ComparableMessage | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a === !b;
  if (a.user?._id !== b.user?._id) return false;
  return timeOf(a.createdAt) === timeOf(b.createdAt);
}

/**
 * Field-level comparison of the message itself — never deep equality, since
 * running `isEqual` over every row's nested arrays and metadata on every render
 * is precisely the cost this change exists to remove.
 *
 * Every field below is here because omitting it would freeze a real, reachable
 * update. This list is intentionally wider than the change proposal sketched:
 * the proposal named the delivery-status and grouping fields, but `text`,
 * `user.avatar`, `metadata` and the media fields each drive visible output too.
 */
export function sameMessage(
  a: ComparableMessage,
  b: ComparableMessage,
): boolean {
  return (
    a._id === b._id &&
    // Changes on edit and on delete-for-everyone.
    a.text === b.text &&
    timeOf(a.createdAt) === timeOf(b.createdAt) &&
    // Routes to renderSystemMessage instead of the bubble.
    a.system === b.system &&
    // Delivery state → which tick icon renders.
    a.messageStatus === b.messageStatus &&
    a.pending === b.pending &&
    a.failed === b.failed &&
    a.sent === b.sent &&
    // Length is enough: the row renders a single icon from it, not the members.
    (a.readBy?.length ?? 0) === (b.readBy?.length ?? 0) &&
    // Value comparison for reactions: JSON.parse creates new arrays on every DB
    // read, so identity check would always fail. Compare length + per-index userId
    // and emoji. WARNING: only checks userId + emoji, ignores other reaction fields.
    sameReactions(a.reactions, b.reactions) &&
    // Upload overlay and progress bar inside MediaImage.
    a.isUploading === b.isUploading &&
    a.uploadProgress === b.uploadProgress &&
    // Presence of these gates Bubble's image/video branches.
    a.image === b.image &&
    a.video === b.video &&
    // Feed MediaImage / VideoMessage / FileAttachment.
    a.mediaType === b.mediaType &&
    a.mediaKey === b.mediaKey &&
    a.mediaThumbnailKey === b.mediaThumbnailKey &&
    a.mediaSize === b.mediaSize &&
    a.mediaDuration === b.mediaDuration &&
    a.blurhash === b.blurhash &&
    a.imageWidth === b.imageWidth &&
    a.imageHeight === b.imageHeight &&
    // Story-reply card.
    a.metadata === b.metadata &&
    // Sender identity decides left/right. `avatar` is injected asynchronously by
    // ChatScreen's `messagesWithAvatar` once the header resolves it, which
    // rebuilds the message object — without this check the avatar would never
    // appear on a row that was already mounted.
    a.user?._id === b.user?._id &&
    a.user?.avatar === b.user?.avatar
  );
}

/**
 * The `React.memo` comparator. Returns true to SKIP the re-render.
 *
 * This is an allow-list: a prop it does not name is a prop it ignores, and
 * ignoring a prop that changed freezes the row. The ledger below is what stops
 * that from happening silently — read it before adding a comparison here.
 */
export function messageItemPropsEqual(
  prev: ComparableMessageItemProps,
  next: ComparableMessageItemProps,
): boolean {
  return (
    // Both are memoized on the palette in ChatScreen, so identity is the exact
    // signal for a theme change. This is what repaints mounted bubbles on a
    // light↔dark switch rather than leaving them stale.
    prev.styles === next.styles &&
    prev.tokens === next.tokens &&
    prev.isHighlighted === next.isHighlighted &&
    prev.currentUserId === next.currentUserId &&
    prev.onRetry === next.onRetry &&
    prev.getReactionPressHandler === next.getReactionPressHandler &&
    prev.position === next.position &&
    // `user` is compared by _id only: ChatScreen builds that prop as a fresh
    // object literal every render, so comparing identity would make this memo
    // never hit. Only `_id` is observable here — the own avatar is suppressed by
    // showUserAvatar={false}.
    prev.user?._id === next.user?._id &&
    // These reach Bubble through the spread, so a new identity must repaint.
    prev.renderMessageImage === next.renderMessageImage &&
    prev.renderMessageVideo === next.renderMessageVideo &&
    prev.renderCustomView === next.renderCustomView &&
    sameCurrentMessage(prev.currentMessage, next.currentMessage) &&
    sameNeighbour(prev.previousMessage, next.previousMessage) &&
    sameNeighbour(prev.nextMessage, next.nextMessage)
  );
}

function sameCurrentMessage(
  a: ComparableMessage | undefined,
  b: ComparableMessage | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a === !b;
  return sameMessage(a, b);
}

// ─── The prop ledger ─────────────────────────────────────────────────────────
//
// WHY THIS EXISTS
// `messageItemPropsEqual` is an allow-list, so a prop added to
// `MessageItemProps` that nobody remembers to compare is skipped forever and the
// affected row silently freezes: no crash, no log, no failing test. Jest cannot
// catch it either — babel strips types without checking them. The ledger unions
// below force `tsc --noEmit` to fail instead: every key of `MessageItemProps`
// must appear in exactly one of them, so adding a prop is a build error until
// the author decides, in writing, whether the row can observe it.//
// ADDED A PROP AND LANDED HERE FROM A TSC ERROR? Pick one:
//   - the row's output can change with it → compare it in
//     `messageItemPropsEqual`, declare it on `ComparableMessageItemProps`, add
//     it to `ComparedPropKey`, and cover it in messageItemEquality.spec.ts;
//   - the row cannot observe it → add it to `UncomparedPropKey` WITH a reason.
// Never add a key to `UncomparedPropKey` just to clear the error.

/** Keys `messageItemPropsEqual` compares. Pinned to `ComparableMessageItemProps` below. */
type ComparedPropKey =
  | 'styles'
  | 'tokens'
  | 'currentUserId'
  | 'isHighlighted'
  | 'onRetry'
  | 'getReactionPressHandler'
  | 'position'
  | 'user'
  | 'currentMessage'
  | 'previousMessage'
  | 'nextMessage'
  | 'renderMessageImage'
  | 'renderMessageVideo'
  | 'renderCustomView';

/**
 * Keys deliberately NOT compared, each with the reason it cannot produce a
 * visible change this comparator would swallow. Mostly gifted-chat `MessageProps`
 * keys that MessageItem forwards to `Message` through its `...giftedProps`
 * spread; `renderTime` is a Bubble prop declared on `MessageItemProps` purely so
 * that the guard covers it.
 */
type UncomparedPropKey =
  // MessageItem passes its OWN `renderBubble` and `shouldUpdateMessage` AFTER
  // the spread, so an incoming value is always overridden and can never reach
  // `Message`. Unobservable by construction, not by convention.
  | 'renderBubble'
  | 'shouldUpdateMessage'
  // Same construction, one level deeper: MessageItem's `renderBubble` renders
  // <Bubble {...bubbleProps} renderTime={...}> — its own `renderTime` is written
  // after the spread and therefore always wins. An inherited one is dead.
  | 'renderTime'
  // Read by `Message` to pick the system-message branch. ChatScreen memoizes it
  // on `styles.systemMessage`, so its identity changes only when `tokens`
  // changes — and `styles`/`tokens` are both compared and both memoized on that
  // same `tokens` object. Any change here therefore already forces a re-render
  // through those keys; comparing it too would be redundant, never protective.
  | 'renderSystemMessage'
  // Consumed by gifted-chat's `Item` to draw the day separator ABOVE the row,
  // before `renderMessage` is called. It is forwarded on but nothing inside the
  // row reads it — neither `Message` nor `Bubble` declares it.
  | 'renderDay'
  // Constant for the life of the screen: ChatScreen passes the literal
  // `showUserAvatar={false}` and never passes `containerStyle`, `renderAvatar`
  // or `onMessageLayout` at all, and leaves `inverted` at GiftedChat's default.
  // A fixed value cannot change between two renders, so there is nothing to
  // detect. If ChatScreen ever makes one of these dynamic, move it above.
  | 'showUserAvatar'
  | 'inverted'
  | 'containerStyle'
  | 'renderAvatar'
  | 'onMessageLayout';

type LedgerPropKey = ComparedPropKey | UncomparedPropKey;

/**
 * Compile-time assertion that `T` is `never`. Instantiating it with anything
 * else fails the build.
 */
type MustBeNever<T extends never> = T;

/**
 * Wraps a leftover key set so the compiler prints the offending key names AND
 * the instruction, instead of the bare `Type 'string' does not satisfy the
 * constraint 'never'` a plain `Exclude` would produce. Collapses to `never` when
 * the key set is empty, which is what makes the assertion pass.
 */
type Leftover<Message extends string, K extends PropertyKey> = [K] extends [never]
  ? never
  : { [M in Message]: K };

/**
 * GUARD 1 — a prop exists on `MessageItemProps` but is in neither ledger union.
 * This is the silent-freeze case. Fix by following the "ADDED A PROP" note above.
 */
type _EveryPropIsAccountedFor = MustBeNever<
  Leftover<
    'MessageItem prop is in neither ComparedPropKey nor UncomparedPropKey — compare it or document why the row cannot observe it',
    Exclude<keyof MessageItemProps, LedgerPropKey>
  >
>;

/**
 * GUARD 2 — the ledger names a prop that no longer exists, e.g. after a rename
 * or a gifted-chat upgrade. Left unchecked, the comparator would keep comparing
 * a dead key (always `undefined === undefined`) and quietly stop guarding the
 * real one.
 */
type _LedgerHasNoStaleKeys = MustBeNever<
  Leftover<
    'ledger names a prop that no longer exists on MessageItemProps — it was renamed or removed',
    Exclude<LedgerPropKey, keyof MessageItemProps>
  >
>;

/**
 * GUARD 3 — `ComparedPropKey` and `ComparableMessageItemProps` must describe the
 * same key set. That keeps the comparator's parameter type honest: it declares
 * exactly what is compared and nothing more, which is also what makes
 * `Readonly<MessageItemProps>` assignable to it and lets `React.memo` take
 * `messageItemPropsEqual` without a cast. Restoring a cast there would reopen
 * the hole these guards close.
 */
type _ComparedKeysAreDeclared = MustBeNever<
  Leftover<
    'ComparedPropKey names a key that ComparableMessageItemProps does not declare',
    Exclude<ComparedPropKey, keyof ComparableMessageItemProps>
  >
>;
type _DeclaredKeysAreCompared = MustBeNever<
  Leftover<
    'ComparableMessageItemProps declares a key that ComparedPropKey does not list',
    Exclude<keyof ComparableMessageItemProps, ComparedPropKey>
  >
>;
