/**
 * usePinManagement.pinnedContents.spec.tsx — coverage for fix group 8.
 *
 * Fix group 8 replaced a `messages.find(...)` inside the pin loop with a single
 * indexing pass plus O(1) lookups. The old shape rescanned the entire loaded
 * message window once per pinned message, and the memo re-ran on every change to
 * `messages` — i.e. on every incoming message and every page of history.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * A refactor that only changes cost is the dangerous kind: if it also changed
 * behaviour, nothing would throw — the pin banner would just show the wrong text,
 * or none. So correctness is asserted first and hardest, against a reference
 * implementation of the ORIGINAL `find`-based logic kept in this file. Every
 * scenario is run through both and required to agree, which is a stronger claim
 * than any hand-written expectation: it pins the new code to the old code's
 * semantics rather than to my reading of them.
 *
 * The cost improvement is then asserted BEHAVIOURALLY, not by reading the source.
 * `_id` is exposed as a getter on the test messages, so every access is counted.
 * The old implementation reads `_id` once per message per pin (pins x messages);
 * the new one reads each message once regardless of pin count. That difference is
 * observable at runtime, so this is a real measurement of the property the fix
 * claims — not a source match on the word `Map`.
 *
 * The hook is exercised through a real render (`react-test-renderer`) rather than
 * by calling it directly, so `useMemo` behaves as it does in the app and memo
 * caching is part of what is being tested.
 */

import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import type { IMessage } from 'react-native-gifted-chat';
import type { PinnedMessage } from '../../../../types';

// The hook subscribes to socket pin events and calls the pin/unpin endpoints.
// Neither is involved in `pinnedContents`, so both are stubbed to inert doubles.
jest.mock('../../../../services/socket/SocketService', () => ({
  socketService: { on: jest.fn(), off: jest.fn() },
}));
jest.mock('../../../../services/api/apiService', () => ({
  conversationsApi: { pinMessage: jest.fn(), unpinMessage: jest.fn() },
}));

import { usePinManagement } from '../usePinManagement';

/**
 * The original implementation, verbatim from the commit before this change
 * (`git show HEAD:...usePinManagement.ts`), as a behavioural oracle.
 *
 * Kept as executable code rather than as a comment so the parity claim is
 * checked on every run instead of being asserted once by eye.
 */
function pinnedContentsViaFind(
  pinnedMessages: PinnedMessage[],
  messages: IMessage[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pin of pinnedMessages) {
    const msg = messages.find((m) => String(m._id) === pin.messageId);
    if (msg) map[pin.messageId] = msg.text || '📷 Media';
  }
  return map;
}

/** Counts `_id` reads, which is how the per-pin rescan is detected. */
let idReads = 0;

function message(id: string, text: string): IMessage {
  return {
    get _id() {
      idReads++;
      return id;
    },
    text,
    createdAt: new Date(0),
    user: { _id: 'sender-1' },
  } as unknown as IMessage;
}

function pin(messageId: string): PinnedMessage {
  return { messageId, pinnedBy: 'user-1', pinnedAt: '2026-01-01T00:00:00.000Z' } as PinnedMessage;
}

interface HookResult {
  pinnedMessageIds: string[];
  pinnedContents: Record<string, string>;
}

/**
 * Renders the hook and returns its latest result plus a re-render handle.
 *
 * `pinnedMessages` reaches the hook through the `conversation` prop and lands in
 * state via an effect, so the first committed render always has an empty pin list
 * — `act` is what lets that effect settle before anything is read.
 */
function renderHook(pinnedMessages: PinnedMessage[], messages: IMessage[]) {
  const results: HookResult[] = [];

  const Harness: React.FC<{ messages: IMessage[] }> = ({ messages: msgs }) => {
    results.push(
      usePinManagement({
        conversationId: 'conversation-1',
        conversation: { pinnedMessages } as never,
        currentUserId: 'user-1',
        messages: msgs,
      }),
    );
    return null;
  };

  let tree!: { update: (el: React.ReactElement) => void; unmount: () => void };
  act(() => {
    tree = render(<Harness messages={messages} />) as typeof tree;
  });

  return {
    get current() {
      return results[results.length - 1];
    },
    get all() {
      return results;
    },
    rerender(nextMessages: IMessage[] = messages) {
      act(() => {
        tree.update(<Harness messages={nextMessages} />);
      });
    },
    unmount() {
      act(() => tree.unmount());
    },
  };
}

beforeEach(() => {
  idReads = 0;
  jest.clearAllMocks();
});

// ─── 1. Correctness, checked against the original implementation ─────────────

describe('pinnedContents preserves the original find-based semantics', () => {
  const scenarios: Array<{ name: string; pins: PinnedMessage[]; messages: IMessage[] }> = [
    {
      name: 'a pin whose message is present',
      pins: [pin('m2')],
      messages: [message('m1', 'first'), message('m2', 'second'), message('m3', 'third')],
    },
    {
      name: 'a pin whose message is absent from the loaded window',
      // The common real case: the pinned message is older than the loaded page.
      pins: [pin('m-older-than-window')],
      messages: [message('m1', 'first'), message('m2', 'second')],
    },
    {
      name: 'multiple pins, some present and some absent',
      pins: [pin('m3'), pin('m-missing'), pin('m1')],
      messages: [message('m1', 'first'), message('m2', 'second'), message('m3', 'third')],
    },
    {
      name: 'a pinned media message with empty text',
      // Falls back to the media label rather than an empty banner.
      pins: [pin('m1')],
      messages: [message('m1', '')],
    },
    {
      name: 'no pins at all',
      pins: [],
      messages: [message('m1', 'first')],
    },
    {
      name: 'pins with an empty message window',
      pins: [pin('m1'), pin('m2')],
      messages: [],
    },
    {
      name: 'duplicate message ids',
      // Shouldn't occur, but `find` returns the first match and parity must not
      // depend on the assumption that ids are unique.
      pins: [pin('dup')],
      messages: [message('dup', 'first copy'), message('dup', 'second copy')],
    },
    {
      name: 'the same message pinned twice',
      pins: [pin('m1'), pin('m1')],
      messages: [message('m1', 'first')],
    },
  ];

  it.each(scenarios)('matches the find-based result for $name', ({ pins, messages }) => {
    const hook = renderHook(pins, messages);

    expect(hook.current.pinnedContents).toEqual(pinnedContentsViaFind(pins, messages));
  });

  it('resolves the text once a pinned message enters the loaded window', () => {
    // History paging is the path here: the pin exists before its message is
    // loaded, so the memo must pick it up when `messages` grows.
    const pins = [pin('m-old')];
    const initial = [message('m1', 'recent')];
    const hook = renderHook(pins, initial);

    expect(hook.current.pinnedContents).toEqual({});

    const afterPaging = [message('m-old', 'the pinned one'), ...initial];
    hook.rerender(afterPaging);

    expect(hook.current.pinnedContents).toEqual({ 'm-old': 'the pinned one' });
  });

  it('still lists every pin id, including pins outside the loaded window', () => {
    // `pinnedContents` is deliberately sparse while `pinnedMessageIds` is not:
    // the banner counts pins from the ids, so dropping an unresolved pin here
    // would silently undercount.
    const hook = renderHook([pin('m1'), pin('m-missing')], [message('m1', 'first')]);

    expect(hook.current.pinnedMessageIds).toEqual(['m1', 'm-missing']);
    expect(hook.current.pinnedContents).toEqual({ m1: 'first' });
  });
});

// ─── 2. The indexing pass replaces the per-pin rescan ────────────────────────

describe('pinnedContents indexes the window once instead of rescanning per pin', () => {
  it('reads each message id at most once no matter how many pins there are', () => {
    // Every pin misses, so `find` would scan the whole window for each one:
    // 4 pins x 12 messages = 48 reads, against 12 for a single indexing pass.
    const messages = Array.from({ length: 12 }, (_, i) => message(`m${i}`, `text ${i}`));
    const pins = [pin('x1'), pin('x2'), pin('x3'), pin('x4')];

    const hook = renderHook(pins, messages);

    expect(hook.current.pinnedContents).toEqual({});
    expect(idReads).toBeLessThanOrEqual(messages.length);

    // Stated as a comparison too, so the intent survives a change in window size.
    idReads = 0;
    pinnedContentsViaFind(pins, messages);
    const findReads = idReads;
    expect(findReads).toBeGreaterThan(messages.length);
  });

  it('does not recompute while pins and messages are unchanged', () => {
    // The memo's whole purpose: an unrelated parent re-render must not re-index
    // the window. Identity is the observable signal.
    const hook = renderHook([pin('m1')], [message('m1', 'first')]);
    const first = hook.current.pinnedContents;

    hook.rerender();

    expect(hook.current.pinnedContents).toBe(first);
  });

  it('returns the same empty object identity when nothing is pinned', () => {
    // The early return for zero pins must still be memo-stable, otherwise every
    // re-render would hand ChatScreen a new object and defeat downstream memos.
    const hook = renderHook([], [message('m1', 'first')]);
    const first = hook.current.pinnedContents;

    hook.rerender();

    expect(hook.current.pinnedContents).toEqual({});
    expect(hook.current.pinnedContents).toBe(first);
  });
});
