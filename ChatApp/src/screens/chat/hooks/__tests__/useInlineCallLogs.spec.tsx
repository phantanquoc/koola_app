/**
 * useInlineCallLogs.spec.ts
 *
 * Unit tests for the useInlineCallLogs hook, covering the BUG 1 fix:
 * ChatScreen is mounted under presentation:'fullScreenModal', so it never
 * blurs when CallModal/IncomingCallModal opens. useFocusEffect alone never
 * re-fires after a call ends. The fix: subscribe to webrtcService terminal
 * events (call_ended, call_missed, call_declined, call_cancelled, call_busy,
 * call_failed, call_timeout) and trigger a reset fetch when any fires.
 *
 * Test strategy:
 *  - Mock callLogsApi.getHistory to return controlled data.
 *  - Mock webrtcService on/off with a tiny fake emitter so tests can fire events.
 *  - Mock useFocusEffect: invoke the callback once on mount.
 *  - Use react-test-renderer (create/act) to run the hook in a real React context
 *    so useEffect/useMemo behavior is correct.
 *  - Use jest.useFakeTimers to control the trailing debounce.
 *
 * Coverage:
 *  1. Mount fetches page 1 with correct params
 *  2. Terminal event triggers reset fetch (debounced)
 *  3. Unmount cleans up listeners (no fetch after unmount)
 *  4. Conversation change resets state + re-subscribes (no stale conversationId)
 *  5. Fetch error logs warning, retains prior callLogs, resets loading/refreshing
 */

import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import type { CallLogEntry, CallLogsResponse } from '../../../../services/api/apiService';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// IMPORTANT: jest.mock factories are hoisted above imports and above the
// `const` declarations below, so every mock is defined INSIDE its factory and
// then re-imported + cast. Referencing an out-of-scope `const` from a factory
// hits the Temporal Dead Zone and silently yields `undefined`.

jest.mock('../../../../services/api/apiService', () => ({
  callLogsApi: {
    getHistory: jest.fn(),
  },
}));

jest.mock('../../../../services/webrtc/WebRTCService', () => {
  // jest.mock factories are hoisted: no out-of-scope references AND no custom
  // type aliases (babel-plugin-jest-hoist rejects even type-only identifier
  // references such as a local `type Listener = ...`). Use inline built-in
  // type annotations and untyped Map/Set containers instead.
  const listeners = new Map();
  return {
    webrtcService: {
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(cb);
      },
      off(event: string, cb: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(cb);
      },
      // Test-only helper: emit an event to all registered listeners.
      fire(event: string, ...args: unknown[]) {
        listeners.get(event)?.forEach((cb: (...args: unknown[]) => void) => cb(...args));
      },
      // Test-only: expose the registry for assertions.
      __listeners: listeners,
      // Test-only: clear all listeners between tests.
      __reset() {
        listeners.clear();
      },
    },
  };
});

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void | undefined)) => {
      // Defer to an effect — calling cb() synchronously during render (as an
      // earlier version of this mock did) triggers state updates while React
      // is still rendering and causes the "Too many re-renders" guard under
      // React 18's test renderer. Using an effect faithfully models the real
      // @react-navigation/native scheduling, which only fires after commit.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [cb]);
    },
  };
});

// ─── Import the hook after all mocks are in place ────────────────────────────
import { useInlineCallLogs } from '../useInlineCallLogs';
import type { UseInlineCallLogsResult } from '../useInlineCallLogs';
import { callLogsApi } from '../../../../services/api/apiService';
import { webrtcService } from '../../../../services/webrtc/WebRTCService';

// Grab typed handles on the mocked modules.
const mockGetHistory = callLogsApi.getHistory as unknown as jest.Mock;

interface FakeWebrtcService {
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
  fire(event: string, ...args: unknown[]): void;
  __listeners: Map<string, Set<(...args: unknown[]) => void>>;
  __reset(): void;
}
const fakeWebrtcService = webrtcService as unknown as FakeWebrtcService;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCallLog(id: string, status: CallLogEntry['status']): CallLogEntry {
  return {
    _id: id,
    sessionId: 'session-' + id,
    initiatorId: 'user-A',
    targetUserId: 'user-B',
    conversationId: 'conv-1',
    callType: 'audio',
    status,
    startedAt: new Date().toISOString(),
    duration: 120,
  } as CallLogEntry;
}

function makeResponse(
  items: CallLogEntry[],
  total: number,
  page: number,
  limit: number,
): CallLogsResponse {
  return { items, total, page, limit };
}

/**
 * Renders the hook and returns its latest result plus a rerender handle.
 * The hook reaches state via effects, so `act` is required for the initial
 * fetch to settle before reading the result.
 */
function renderHook(conversationId: string, transitionDone = true) {
  const results: UseInlineCallLogsResult[] = [];

  const Harness: React.FC<{ conversationId: string; transitionDone: boolean }> = ({
    conversationId: cid,
    transitionDone: td,
  }) => {
    results.push(useInlineCallLogs(cid, td));
    return null;
  };

  let tree!: { update: (el: React.ReactElement) => void; unmount: () => void };
  act(() => {
    tree = render(<Harness conversationId={conversationId} transitionDone={transitionDone} />) as typeof tree;
  });

  return {
    get current() {
      return results[results.length - 1];
    },
    get all() {
      return results;
    },
    rerender(nextConversationId: string = conversationId, nextTransitionDone = true) {
      act(() => {
        tree.update(<Harness conversationId={nextConversationId} transitionDone={nextTransitionDone} />);
      });
    },
    unmount() {
      act(() => tree.unmount());
    },
  };
}

/**
 * Wait for pending microtasks (async fetches) to settle inside `act`.
 * Fake timers only control setTimeout; promises still resolve via microtasks,
 * so a few `await Promise.resolve()` turns are enough for the mock to land.
 */
async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  fakeWebrtcService.__reset();
  jest.useRealTimers(); // default to real timers unless a test opts in to fake
});

describe('useInlineCallLogs — mount fetch', () => {
  it('fetches page 1 on mount with correct params', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([makeCallLog('log1', 'ended')], 1, 1, 50));

    const hook = renderHook('conv-1', true);
    await flushPromises();

    expect(mockGetHistory).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      page: 1,
      limit: 50,
    });
    expect(hook.current.callLogs).toHaveLength(1);
    expect(hook.current.callLogs[0]._id).toBe('log1');
  });

  it('does not fetch when transitionDone is false', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([], 0, 1, 50));

    renderHook('conv-1', false);
    await flushPromises();

    // The mount/conversation-change effect guards on transitionDone.
    expect(mockGetHistory).not.toHaveBeenCalled();
  });
});

describe('useInlineCallLogs — terminal event subscription', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('subscribes to all 7 terminal events', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([], 0, 1, 50));

    renderHook('conv-1', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    const events = [
      'call_ended',
      'call_missed',
      'call_declined',
      'call_cancelled',
      'call_busy',
      'call_failed',
      'call_timeout',
    ];

    for (const ev of events) {
      expect(fakeWebrtcService.__listeners.get(ev)?.size ?? 0).toBeGreaterThan(0);
    }
  });

  it('terminal event triggers reset fetch after debounce', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([makeCallLog('log1', 'ended')], 1, 1, 50));

    renderHook('conv-1', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    // Fire a terminal event.
    act(() => {
      fakeWebrtcService.fire('call_ended', { sessionId: 'session-x' });
    });

    // Debounce not yet elapsed — fetch not called again.
    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    // Advance past the debounce window (~350ms).
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Reset fetch triggered.
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
    expect(mockGetHistory).toHaveBeenLastCalledWith({
      conversationId: 'conv-1',
      page: 1,
      limit: 50,
    });
  });

  it('coalesces a burst of terminal events into one fetch', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([], 0, 1, 50));

    renderHook('conv-1', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    // Fire 3 events in quick succession.
    act(() => {
      fakeWebrtcService.fire('call_ended', {});
      fakeWebrtcService.fire('call_failed', {});
      fakeWebrtcService.fire('call_timeout', {});
    });

    // Advance past the debounce window.
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only one additional fetch despite 3 events.
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
  });
});

describe('useInlineCallLogs — cleanup on unmount', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cleans up listeners on unmount, no fetch after unmount', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([], 0, 1, 50));

    const hook = renderHook('conv-1', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    // Unmount.
    hook.unmount();

    // Fire event after unmount.
    act(() => {
      fakeWebrtcService.fire('call_ended', {});
    });

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    // No additional fetch.
    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    // All listeners removed.
    expect(fakeWebrtcService.__listeners.get('call_ended')?.size ?? 0).toBe(0);
  });
});

describe('useInlineCallLogs — conversation change', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets state and re-subscribes on conversation change', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([makeCallLog('log1', 'ended')], 1, 1, 50));

    const hook = renderHook('conv-1', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(hook.current.callLogs).toHaveLength(1);
    expect(mockGetHistory).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      page: 1,
      limit: 50,
    });

    // Change conversation.
    mockGetHistory.mockResolvedValue(makeResponse([makeCallLog('log2', 'missed')], 1, 1, 50));

    hook.rerender('conv-2', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    // State reset + new fetch for the new conversation.
    expect(hook.current.callLogs).toHaveLength(1);
    expect(hook.current.callLogs[0]._id).toBe('log2');
    expect(mockGetHistory).toHaveBeenCalledWith({
      conversationId: 'conv-2',
      page: 1,
      limit: 50,
    });
  });

  it('does not capture a stale conversationId in the listener', async () => {
    mockGetHistory.mockResolvedValue(makeResponse([], 0, 1, 50));

    const hook = renderHook('conv-1', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Change conversation.
    hook.rerender('conv-2', true);
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Fire a terminal event — should fetch conv-2, not the stale conv-1.
    act(() => {
      fakeWebrtcService.fire('call_ended', {});
    });

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetHistory).toHaveBeenLastCalledWith({
      conversationId: 'conv-2',
      page: 1,
      limit: 50,
    });
  });
});

describe('useInlineCallLogs — error handling', () => {
  it('logs a warning on fetch error and retains prior callLogs', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // First fetch succeeds.
    mockGetHistory.mockResolvedValue(makeResponse([makeCallLog('log1', 'ended')], 1, 1, 50));

    const hook = renderHook('conv-1', true);
    await flushPromises();

    expect(hook.current.callLogs).toHaveLength(1);

    // Second fetch fails.
    mockGetHistory.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      await hook.current.refresh();
    });

    // Warning logged.
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[useInlineCallLogs] fetch failed:',
      expect.any(Error),
    );

    // Prior callLogs retained.
    expect(hook.current.callLogs).toHaveLength(1);
    expect(hook.current.callLogs[0]._id).toBe('log1');

    // loading/refreshing reset.
    expect(hook.current.loading).toBe(false);
    expect(hook.current.refreshing).toBe(false);

    consoleWarnSpy.mockRestore();
  });
});
