/**
 * ChatScreen.scrollOnSend.spec.tsx — regression guard for the scroll-on-send fix.
 *
 * Sending never goes through GiftedChat: `onSend` is the stable `NOOP_SEND`
 * no-op and real sends flow ChatComposer -> handleSend -> useMessages ->
 * messageRepository.insertOptimistic -> repository notify -> a fresh array in
 * `messages`. GiftedChat's internal `_onSend` scroll-to-bottom therefore never
 * runs, and before this fix nothing else moved the list — a message typed
 * while scrolled up landed off-screen with no jump to it.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * ChatScreen cannot be rendered in jest (the GiftedChat/Fabric dependency
 * chain does not survive the Node test environment), so this follows the same
 * instrument as ChatScreen.viewability.spec.tsx: STRUCTURAL assertions over
 * ChatScreen's source. A source assertion is a weaker tool than a render, and
 * it is used only where a render is unavailable — but it targets these defect
 * regressions exactly, because each failure mode is literally "the code comes
 * back" or "the code goes away":
 *
 *   1. The scroll-to-newest path exists — an effect that calls
 *      `scrollToOffset({ offset: 0, animated: false })` when the rendered
 *      head `_id` changes to a fresh own-authored row.
 *   2. That effect guards on the sender's identity (head message authored by
 *      `currentUserId`) AND on a head `_id` change vs the tracked one. The
 *      send path is a LIMIT-capped full reload (window length does NOT grow),
 *      so a length-growth guard would never fire. Incoming messages change
 *      the head the same way and are excluded by the identity check;
 *      `loadEarlier` appends to the TAIL so index 0 never moves. The animated
 *      flag must stay false: animating across hundreds of unmounted rows
 *      remounts them in one pass and re-creates the jank this screen's
 *      tuning exists to prevent.
 *   3. `NOOP_SEND` stays in place and stays wired as GiftedChat's `onSend`.
 *      Re-wiring a real send through GiftedChat would re-create the identity
 *      churn the memo boundary was built to absorb, and would fight this
 *      effect with GiftedChat's own scroll heuristics.
 */

import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');

/**
 * Extracts the arrow-function body that follows `anchor`, by brace matching.
 *
 * Same rationale as in ChatScreen.viewability.spec.tsx: source assertions are
 * scoped to one callback rather than run over the whole file, because an
 * unscoped match both passes for the wrong reasons and fails for irrelevant
 * ones — ChatScreen's `onScrollToIndexFailed` retry helper also calls
 * `scrollToOffset` (with a computed offset and `animated: true`), which has
 * nothing to do with the send path this file is about.
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

describe('ChatScreen scrolls back to newest on own send', () => {
  const chatScreenSource = readSource('screens/chat/ChatScreen.tsx');

  it('calls scrollToOffset with offset 0 — the scroll-to-newest path exists', () => {
    // File-wide existence check first: `offset: 0` cannot match the retry
    // helper's `scrollToOffset({ offset, animated: true })`, so this string
    // only the send effect can supply.
    expect(chatScreenSource).toMatch(/scrollToOffset\(\{\s*offset: 0/);
  });

  it('the send effect snaps instantly — animated stays false', () => {
    // Scoped to the effect itself via its tracked-head ref declaration.
    // Animating across hundreds of unmounted rows remounts every one of them
    // in a single pass — the exact jank the scroll tuning fixed.
    const effectBody = extractCallbackBody(
      chatScreenSource,
      'const prevRenderedHeadIdRef = useRef',
    );

    expect(effectBody).toContain('scrollToOffset({ offset: 0, animated: false })');
  });

  it('guards on the sender identity so incoming messages never trigger the jump', () => {
    const effectBody = extractCallbackBody(
      chatScreenSource,
      'const prevRenderedHeadIdRef = useRef',
    );

    // The head message must be authored by the current user. Incoming
    // messages from the other user prepend at the head the exact same way,
    // and this comparison is what excludes them.
    expect(effectBody).toContain('.user?._id === currentUserId');
  });

  it('guards on head-id change so loadEarlier pagination never triggers the jump', () => {
    const effectBody = extractCallbackBody(
      chatScreenSource,
      'const prevRenderedHeadIdRef = useRef',
    );

    // The send path is a LIMIT-capped full reload — window length does not
    // grow — so the send signature is the head `_id` changing. loadEarlier
    // appends older rows to the TAIL of the newest-first array, so index 0
    // never moves and this comparison reads "no send happened".
    expect(effectBody).toContain(
      'String(first._id) !== prevRenderedHeadIdRef.current',
    );
  });

  it('keeps the target-message context window out of the jump path', () => {
    const effectBody = extractCallbackBody(
      chatScreenSource,
      'const prevRenderedHeadIdRef = useRef',
    );

    // While a search navigation's context snapshot is rendered, it has its
    // own scroll-to-target effect and the send jump must not fight it.
    // Exact-string match, consistent with the sibling assertions: the guard
    // is the negation of "snapshot is non-empty".
    expect(effectBody).toContain(
      '!targetContextMessages || targetContextMessages.length === 0',
    );
  });

  it('keeps NOOP_SEND in place and still wired as GiftedChat onSend', () => {
    // Guards against someone wiring GiftedChat's onSend back to a real send
    // handler: that would re-create prop-identity churn at the memo boundary
    // and fight this effect with GiftedChat's internal scroll heuristics.
    expect(chatScreenSource).toMatch(/const NOOP_SEND = \(\) => \{\};/);
    expect(chatScreenSource).toContain('onSend={NOOP_SEND}');
  });
});
