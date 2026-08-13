/**
 * ChatScreen.viewability.spec.tsx — coverage for fix group 1.
 *
 * Fix group 1 deleted a dead prop chain: `VideoMessage` declared an `isVisible`
 * prop it never read, and ChatScreen maintained a `visibleMessageIds` state
 * purely to feed it. Writing that state from `onViewableItemsChanged` re-rendered
 * the whole GiftedChat subtree on every viewability change during scroll, to
 * supply a value nobody consumed.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * The two halves of that contract are testable to different depths, so they are
 * asserted differently and labelled as such:
 *
 *   1. `VideoMessage` ignores `isVisible` — proven BEHAVIOURALLY against the real
 *      component: the rendered tree is identical with the prop present and
 *      absent, and the memo comparator treats a flip as "no change" so React
 *      skips the row entirely.
 *
 *   2. ChatScreen wires NO per-tick viewability — proven STRUCTURALLY, by reading
 *      ChatScreen's source. The screen once kept a debounced media prefetch on
 *      `onViewableItemsChanged`; on-device profiling showed that merely having the
 *      callback wired pins the JS thread at ~100% during scroll once the loaded
 *      window grows (ViewabilityHelper recomputes per scroll tick, cost scales
 *      with data length), so the callback and its config were deleted outright and
 *      the guard now asserts their absence. A source assertion is a weaker
 *      instrument than a render, and it is used only where a render is unavailable
 *      — but it targets this defect exactly: the failure mode is literally "the
 *      callback comes back", and that is what it detects.
 *
 * Both halves guard against regression, which is the point: with the props and
 * the state gone, nothing else in the codebase would fail if they came back.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';

// The real cache service reaches for MMKV and the network; the prop contract
// under test is independent of it, so it is stubbed to a deterministic miss.
jest.mock('../../../services/media/mediaCacheService', () => ({
  getFromMemory: jest.fn(() => null),
  getOrDownload: jest.fn(() => Promise.resolve(null)),
}));

import VideoMessage from '../../../components/VideoMessage';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');

/**
 * Extracts the arrow-function body that follows `anchor`, by brace matching.
 *
 * Source assertions are scoped to one callback rather than run over the whole
 * 900-line file: an unscoped match both passes for the wrong reasons and fails
 * for irrelevant ones — `ChatScreen` legitimately renders
 * `<OfflineBanner isVisible={...} />`, which has nothing to do with the video
 * prop chain this file is about.
 */
function extractCallbackBody(source: string, anchor: string): string {
  const start = source.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);

  const open = source.indexOf('{', source.indexOf('=>', start));
  expect(open).toBeGreaterThan(start);

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces while extracting: ${anchor}`);
}

// ─── 1. VideoMessage ignores `isVisible` (behavioural) ───────────────────────

describe('VideoMessage exposes no isVisible prop', () => {
  const message = { mediaKey: 'v1', mediaDuration: 65, mediaThumbnailKey: 't1' };
  const onPress = () => {};

  function renderVideo(extraProps: Record<string, unknown> = {}) {
    let tree: { toJSON: () => unknown } | undefined;
    // Assembled then widened to the component's own props type, because passing
    // a prop that is deliberately absent from the public type is the whole point
    // of this test. Widening the assembled object (rather than casting inside the
    // JSX spread) keeps the spread itself well-typed — spreading `never` is not.
    const props = { message, onPress, ...extraProps } as unknown as React.ComponentProps<
      typeof VideoMessage
    >;
    act(() => {
      tree = render(<VideoMessage {...props} />);
    });
    // Compared as a serialized string, not with `toEqual`: the tree carries
    // freshly-bound touch handlers (`onResponderGrant` and friends) whose
    // identities differ between two renders of even an identical element, so a
    // deep-equality check fails on function identity alone. Serializing compares
    // the structure and every rendered value, which is what "no visual
    // difference" means here.
    return JSON.stringify(tree!.toJSON());
  }

  it('renders an identical tree whether isVisible is passed or not', () => {
    const withoutProp = renderVideo();

    expect(renderVideo({ isVisible: true })).toBe(withoutProp);
    expect(renderVideo({ isVisible: false })).toBe(withoutProp);
  });

  it('does not surface isVisible anywhere in the rendered output', () => {
    // Guards the weaker failure where the prop is forwarded onto a host view
    // (and so reaches the native side) rather than being read by the body.
    expect(renderVideo({ isVisible: true })).not.toContain('isVisible');
  });

  it('skips the re-render when only isVisible changes', () => {
    // The comparator returns true to SKIP. If `isVisible` were still part of the
    // props contract this would have to be false, and every viewability change
    // would repaint the row — the cost fix group 1 removes.
    const compare = (VideoMessage as unknown as {
      compare: (a: unknown, b: unknown) => boolean;
    }).compare;

    expect(compare({ message, onPress, isVisible: true }, { message, onPress, isVisible: false })).toBe(true);
  });

  it('still re-renders when a field the component actually reads changes', () => {
    // Companion to the assertion above: proves the comparator is ignoring
    // `isVisible` specifically, not returning true indiscriminately (which would
    // freeze the row and make the previous test pass for the wrong reason).
    const compare = (VideoMessage as unknown as {
      compare: (a: unknown, b: unknown) => boolean;
    }).compare;

    expect(compare({ message, onPress }, { message: { ...message, mediaKey: 'v2' }, onPress })).toBe(false);
    expect(compare({ message, onPress }, { message: { ...message, mediaThumbnailKey: 't2' }, onPress })).toBe(false);
    expect(compare({ message, onPress }, { message, onPress: () => {} })).toBe(false);
  });

  it('declares no isVisible prop in its source', () => {
    // The props interface is erased at compile time, so this is the only place
    // the type-level half of the contract is observable at runtime.
    expect(readSource('components/VideoMessage.tsx')).not.toMatch(/isVisible/);
  });
});

// ─── 2. ChatScreen wires no per-tick viewability (structural) ────────────────
//
// History: this block originally asserted that the viewability callback wrote no
// React state. On-device profiling (2026-08-12, Xiaomi 2410DPN6CC) then showed the
// deeper defect: with `onViewableItemsChanged` wired at all, FlatList's
// ViewabilityHelper recomputes the visible set on every scroll tick and the cost
// scales with data length — the JS thread pinned at ~100% once a conversation
// loaded past the first screen, starving row mounts ("khựng như đợi load"). The
// callback was removed entirely; the media prefetch it drove was cache-warming
// only and images lazy-load on row mount. The guard below therefore inverts: the
// regression it must catch is the callback (or its config) coming back.

describe('chat list wires no per-tick viewability', () => {
  const chatScreenSource = readSource('screens/chat/ChatScreen.tsx');

  it('does not define or pass onViewableItemsChanged', () => {
    expect(chatScreenSource).not.toMatch(/onViewableItemsChanged/);
  });

  it('does not pass a viewabilityConfig into the list', () => {
    expect(chatScreenSource).not.toMatch(/viewabilityConfig/);
  });

  it('no longer holds the visibleMessageIds state chain anywhere in ChatScreen', () => {
    expect(chatScreenSource).not.toMatch(/visibleMessageIds/);
    expect(chatScreenSource).not.toMatch(/prevVisibleVideoIdsRef/);
  });

  it('no longer passes isVisible to the VideoMessage element', () => {
    // Scoped to `renderMessageVideo` on purpose. ChatScreen also renders
    // `<OfflineBanner isVisible={...} />`, which is an unrelated and entirely
    // legitimate prop — a file-wide match would fail on it and say nothing about
    // the video chain.
    const renderVideoBody = extractCallbackBody(
      chatScreenSource,
      'const renderMessageVideo = useCallback(',
    );

    expect(renderVideoBody).toContain('<VideoMessage');
    expect(renderVideoBody).not.toMatch(/isVisible/);
    // The dead prop was fed by this dependency; its removal is what stopped the
    // callback changing identity mid-scroll.
    expect(renderVideoBody).not.toMatch(/visibleMessageIds/);
  });
});
