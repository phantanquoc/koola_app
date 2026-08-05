/**
 * Comparator tests for the memoized chat row (change task 8.6).
 *
 * Why this file exists in this form: an over-aggressive `React.memo` comparator
 * does not crash and logs nothing — the row simply stops updating. That failure
 * is invisible, so it cannot be signed off by reading the code. These tests
 * exercise the comparator directly and assert, field by field, that every live
 * update the chat can produce is allowed through.
 *
 * The comparator returns TRUE to SKIP a re-render, so "must re-render" is
 * asserted as `toBe(false)`.
 */

import {
  messageItemPropsEqual,
  sameNeighbour,
  timeOf,
  type ComparableMessage,
  type ComparableMessageItemProps,
} from '../messageItemEquality';

// Stable references standing in for the identity-compared props. Reusing the
// same objects across prev/next is what an unchanged render looks like.
const STYLES = { marker: 'styles' };
const TOKENS = { marker: 'tokens' };
const ON_RETRY = () => {};
const GET_HANDLER = () => () => {};
const RENDER_IMAGE = () => null;
const RENDER_VIDEO = () => null;
const RENDER_CUSTOM = () => null;

const BASE_CREATED_AT = new Date('2026-01-01T10:00:00.000Z');

function makeMessage(overrides: Partial<ComparableMessage> = {}): ComparableMessage {
  return {
    _id: 'm1',
    text: 'hello',
    createdAt: BASE_CREATED_AT,
    user: { _id: 'me' },
    ...overrides,
  };
}

function makeProps(
  overrides: Partial<ComparableMessageItemProps> = {},
): ComparableMessageItemProps {
  return {
    styles: STYLES,
    tokens: TOKENS,
    currentUserId: 'me',
    isHighlighted: false,
    onRetry: ON_RETRY,
    getReactionPressHandler: GET_HANDLER,
    position: 'right',
    user: { _id: 'me' },
    currentMessage: makeMessage(),
    previousMessage: undefined,
    nextMessage: undefined,
    renderMessageImage: RENDER_IMAGE,
    renderMessageVideo: RENDER_VIDEO,
    renderCustomView: RENDER_CUSTOM,
    ...overrides,
  };
}

/**
 * Applies a change to the message the way the app actually does it: a NEW
 * message object, since the DB mapper rebuilds objects rather than mutating
 * them. Comparing a mutated object in-place would be a false-positive test.
 */
function withMessageChange(
  change: Partial<ComparableMessage>,
): [ComparableMessageItemProps, ComparableMessageItemProps] {
  const prev = makeProps();
  const next = makeProps({ currentMessage: makeMessage(change) });
  return [prev, next];
}

describe('messageItemPropsEqual — skips redundant renders', () => {
  it('skips when nothing changed and the message object is identical', () => {
    const msg = makeMessage();
    const prev = makeProps({ currentMessage: msg });
    const next = makeProps({ currentMessage: msg });
    expect(messageItemPropsEqual(prev, next)).toBe(true);
  });

  it('skips when the message is a new object with identical field values', () => {
    // The realistic hot path: a DB remap rebuilds every message object even
    // though nothing about this row changed. This is the case that makes the
    // memo worth having at all — deep equality would also pass here, but at a
    // per-row cost on every scroll frame.
    const [prev, next] = withMessageChange({});
    expect(prev.currentMessage).not.toBe(next.currentMessage);
    expect(messageItemPropsEqual(prev, next)).toBe(true);
  });

  it('skips when the parent re-renders but passes the same `user` value in a fresh object', () => {
    // ChatScreen builds `user={{ _id, name, avatar }}` inline, so this prop is a
    // new object on every parent render. Comparing it by identity would make the
    // memo never hit — the whole optimization would silently do nothing.
    const prev = makeProps({ user: { _id: 'me' } });
    const next = makeProps({ user: { _id: 'me' } });
    expect(prev.user).not.toBe(next.user);
    expect(messageItemPropsEqual(prev, next)).toBe(true);
  });

  it('skips when createdAt is an equal timestamp of a different type', () => {
    // Date vs ISO string vs epoch all reach this comparator depending on the
    // code path. Treating those as a change would defeat the memo on every remap.
    const prev = makeProps({ currentMessage: makeMessage({ createdAt: BASE_CREATED_AT }) });
    const next = makeProps({
      currentMessage: makeMessage({ createdAt: BASE_CREATED_AT.toISOString() }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(true);

    const asEpoch = makeProps({
      currentMessage: makeMessage({ createdAt: BASE_CREATED_AT.getTime() }),
    });
    expect(messageItemPropsEqual(prev, asEpoch)).toBe(true);
  });
});

// ─── Task 8.6: the four named live updates must each reach the screen ─────────

describe('messageItemPropsEqual — the four live updates from task 8.6', () => {
  it('re-renders when a reaction is added', () => {
    // `reactions` is rebuilt as a new array on every remap, so identity is the
    // signal. A row that swallowed this would show a reaction only after some
    // unrelated change happened to repaint it.
    const [prev, next] = withMessageChange({
      reactions: [{ emoji: '👍', userId: 'u2' }],
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when a tick advances sent → read via messageStatus', () => {
    const prev = makeProps({ currentMessage: makeMessage({ messageStatus: 'sent' }) });
    const next = makeProps({ currentMessage: makeMessage({ messageStatus: 'read' }) });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when a tick advances via readBy gaining its first member', () => {
    // The row renders `done-all` when messageStatus is 'read' OR readBy is
    // non-empty, so the readBy path must be covered independently.
    const prev = makeProps({ currentMessage: makeMessage({ readBy: [] }) });
    const next = makeProps({ currentMessage: makeMessage({ readBy: ['u2'] }) });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when an upload progresses', () => {
    const prev = makeProps({
      currentMessage: makeMessage({ isUploading: true, uploadProgress: 0.25 }),
    });
    const next = makeProps({
      currentMessage: makeMessage({ isUploading: true, uploadProgress: 0.5 }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when an upload completes and the uploading flag clears', () => {
    const prev = makeProps({
      currentMessage: makeMessage({ isUploading: true, uploadProgress: 0.9 }),
    });
    const next = makeProps({
      currentMessage: makeMessage({ isUploading: false, uploadProgress: 1 }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when a send fails', () => {
    const prev = makeProps({ currentMessage: makeMessage({ pending: true }) });
    const next = makeProps({
      currentMessage: makeMessage({ pending: false, failed: true }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when a pending message is confirmed sent', () => {
    const prev = makeProps({ currentMessage: makeMessage({ pending: true }) });
    const next = makeProps({
      currentMessage: makeMessage({ pending: false, sent: true }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });
});

// ─── Every remaining field that drives visible output ────────────────────────

describe('messageItemPropsEqual — other visible changes are not swallowed', () => {
  it.each([
    ['text (edit / delete-for-everyone)', { text: 'edited' }],
    ['system flag (routes to renderSystemMessage)', { system: true }],
    ['createdAt (the time label)', { createdAt: new Date('2026-01-02T11:30:00.000Z') }],
    ['image (gates the image branch)', { image: 'media-pending' }],
    ['video (gates the video branch)', { video: 'media-pending' }],
    ['mediaType (scrim vs text time row)', { mediaType: 'image' }],
    ['mediaKey', { mediaKey: 'k2' }],
    ['mediaThumbnailKey', { mediaThumbnailKey: 't2' }],
    ['mediaSize', { mediaSize: 4096 }],
    ['mediaDuration', { mediaDuration: 12 }],
    ['blurhash', { blurhash: 'LKO2' }],
    ['imageWidth', { imageWidth: 800 }],
    ['imageHeight', { imageHeight: 600 }],
    ['metadata (story-reply card)', { metadata: { storyReply: { storyId: 's1' } } }],
  ])('re-renders when %s changes', (_label, change) => {
    const [prev, next] = withMessageChange(change as Partial<ComparableMessage>);
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when the avatar is injected asynchronously', () => {
    // ChatScreen's `messagesWithAvatar` injects the other user's avatar once the
    // header resolves it. Without this check the avatar would never appear on a
    // row that was already on screen.
    const prev = makeProps({
      currentMessage: makeMessage({ user: { _id: 'other' } }),
    });
    const next = makeProps({
      currentMessage: makeMessage({ user: { _id: 'other', avatar: 'https://x/a.png' } }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when this row gains or loses the search highlight', () => {
    const off = makeProps({ isHighlighted: false });
    const on = makeProps({ isHighlighted: true });
    expect(messageItemPropsEqual(off, on)).toBe(false);
    expect(messageItemPropsEqual(on, off)).toBe(false);
  });

  it('re-renders on a theme change, which only shows up as new styles/tokens identities', () => {
    // The message data is untouched by a light↔dark switch, so this is the case
    // gifted-chat's own message-only deep-equality memo would have swallowed.
    const prev = makeProps();
    expect(messageItemPropsEqual(prev, makeProps({ styles: { marker: 'dark' } }))).toBe(false);
    expect(messageItemPropsEqual(prev, makeProps({ tokens: { marker: 'dark' } }))).toBe(false);
  });

  it('re-renders when a child render prop identity changes', () => {
    const prev = makeProps();
    expect(messageItemPropsEqual(prev, makeProps({ renderMessageImage: () => null }))).toBe(false);
    expect(messageItemPropsEqual(prev, makeProps({ renderMessageVideo: () => null }))).toBe(false);
    expect(messageItemPropsEqual(prev, makeProps({ renderCustomView: () => null }))).toBe(false);
  });

  it('re-renders when the retry or reaction handler identity changes', () => {
    const prev = makeProps();
    expect(messageItemPropsEqual(prev, makeProps({ onRetry: () => {} }))).toBe(false);
    expect(
      messageItemPropsEqual(prev, makeProps({ getReactionPressHandler: () => () => {} })),
    ).toBe(false);
  });

  it('re-renders when position flips, since it drives left/right layout', () => {
    const prev = makeProps({ position: 'right' });
    const next = makeProps({ position: 'left' });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when the row is recycled onto a different message id', () => {
    const [prev, next] = withMessageChange({ _id: 'm2' });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });
});

// ─── Neighbour-driven grouping ────────────────────────────────────────────────

describe('neighbour comparison drives grouping and the avatar slot', () => {
  it('re-renders when the next message sender changes (tail radius flips)', () => {
    const prev = makeProps({ nextMessage: makeMessage({ _id: 'n1', user: { _id: 'me' } }) });
    const next = makeProps({ nextMessage: makeMessage({ _id: 'n1', user: { _id: 'other' } }) });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when a neighbour appears or disappears at the window edge', () => {
    const none = makeProps({ nextMessage: undefined });
    const some = makeProps({ nextMessage: makeMessage({ _id: 'n1' }) });
    expect(messageItemPropsEqual(none, some)).toBe(false);
    expect(messageItemPropsEqual(some, none)).toBe(false);
  });

  it('re-renders when a neighbour crosses a day boundary (avatar spacer vs avatar)', () => {
    // gifted-chat's Avatar uses isSameDay on the neighbour to choose a blank
    // spacer over a real avatar, so a neighbour date change is visible here.
    const prev = makeProps({
      nextMessage: makeMessage({ _id: 'n1', createdAt: BASE_CREATED_AT }),
    });
    const next = makeProps({
      nextMessage: makeMessage({ _id: 'n1', createdAt: new Date('2026-01-02T10:00:00.000Z') }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });

  it('skips when a neighbour is a new object with the same sender and timestamp', () => {
    const prev = makeProps({ nextMessage: makeMessage({ _id: 'n1' }) });
    const next = makeProps({ nextMessage: makeMessage({ _id: 'n1' }) });
    expect(messageItemPropsEqual(prev, next)).toBe(true);
  });

  it('ignores neighbour fields that this row cannot observe', () => {
    // A neighbour's own text or delivery state has no effect on how this row
    // draws, so treating it as a change would repaint the neighbours of every
    // updated message for nothing.
    const prev = makeProps({
      nextMessage: makeMessage({ _id: 'n1', text: 'a', messageStatus: 'sent' }),
    });
    const next = makeProps({
      nextMessage: makeMessage({ _id: 'n1', text: 'b', messageStatus: 'read' }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(true);
  });

  it('treats previousMessage the same way', () => {
    const prev = makeProps({ previousMessage: makeMessage({ _id: 'p1', user: { _id: 'me' } }) });
    const next = makeProps({
      previousMessage: makeMessage({ _id: 'p1', user: { _id: 'other' } }),
    });
    expect(messageItemPropsEqual(prev, next)).toBe(false);
  });
});

describe('helpers', () => {
  it('timeOf normalises Date, ISO string, and epoch to the same number', () => {
    const epoch = BASE_CREATED_AT.getTime();
    expect(timeOf(BASE_CREATED_AT)).toBe(epoch);
    expect(timeOf(BASE_CREATED_AT.toISOString())).toBe(epoch);
    expect(timeOf(epoch)).toBe(epoch);
  });

  it('timeOf returns 0 for missing values rather than NaN', () => {
    // NaN !== NaN would report a change on every render for a message with no
    // timestamp, quietly disabling the memo for that row.
    expect(timeOf(undefined)).toBe(0);
    expect(timeOf(null)).toBe(0);
  });

  it('sameNeighbour treats two undefined neighbours as equal', () => {
    expect(sameNeighbour(undefined, undefined)).toBe(true);
  });
});

// ─── The prop ledger ─────────────────────────────────────────────────────────
//
// The comparator is an allow-list, so a prop added to `MessageItemProps` and not
// added to the comparator is ignored forever and its row silently freezes. Jest
// CANNOT catch that: babel strips types without checking them, so every
// assertion in this file would still pass. The protection is the ledger in
// messageItemEquality.ts, enforced by `tsc --noEmit`.
//
// These tests therefore do not attempt to test the guard — they document the two
// runtime facts the guard depends on, so that a future edit which breaks one of
// them fails here rather than quietly weakening the type-level check.

describe('the ledger guard', () => {
  it('is enforced by tsc, not by jest — this suite cannot catch a missing prop', () => {
    // Proof, in executable form, that a type-level guard is the only option: an
    // unknown prop sails through the comparator at runtime and is reported as
    // "equal" (skip the re-render). This is the silent freeze. Asserting it here
    // pins WHY the tsc guard exists, so nobody replaces it with a jest test.
    const prev = makeProps();
    const next = { ...makeProps(), someNewProp: 'a' } as ComparableMessageItemProps;
    const changed = { ...makeProps(), someNewProp: 'b' } as ComparableMessageItemProps;
    expect(messageItemPropsEqual(next, changed)).toBe(true);
    expect(messageItemPropsEqual(prev, next)).toBe(true);
  });

  it('keeps messageItemEquality free of runtime imports so it loads in plain node', () => {
    // The guard imports `MessageItemProps` from ./MessageItem, which pulls in
    // react-native and gifted-chat. That import MUST stay `import type` — it is
    // erased at compile time, which is the only reason this suite can require the
    // module at all in a node test environment. If someone converts it to a value
    // import, requiring the module here throws instead of silently regressing.
    expect(() => jest.requireActual('../messageItemEquality')).not.toThrow();
  });
});
