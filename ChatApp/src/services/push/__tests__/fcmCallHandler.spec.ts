/**
 * fcmCallHandler.spec.ts
 *
 * Task 7.7 (fix-miss-call-reliability): the expiresAt guard in
 * consumePendingIncomingCall must discard server-expired payloads even while
 * the local _receivedAt window (45s) is still fresh, and return the payload
 * only when BOTH windows are fresh.
 *
 * Local AsyncStorage mock (overrides the global one from jest/setup.js) so the
 * stored payload is fully controlled per-test.
 */

const mockStore: { value: string | null } = { value: null };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => mockStore.value),
    setItem: jest.fn(async (_k: string, v: string) => {
      mockStore.value = v;
    }),
    removeItem: jest.fn(async () => {
      mockStore.value = null;
    }),
  },
}));

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    setBackgroundMessageHandler: jest.fn(),
    onMessage: jest.fn(() => jest.fn()),
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { consumePendingIncomingCall } from '../fcmCallHandler';

const NOW = 1_000_000;

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'sess-1',
    callerId: 'user-A',
    callerName: 'Alice',
    callType: 'audio' as const,
    conversationId: 'conv-1',
    expiresAt: NOW + 10_000,
    _receivedAt: NOW - 1_000,
    ...overrides,
  };
}

async function seed(payload: unknown): Promise<void> {
  mockStore.value =
    typeof payload === 'string' ? payload : JSON.stringify(payload);
}

describe('fcmCallHandler — consumePendingIncomingCall', () => {
  let dateSpy: jest.SpyInstance;

  beforeEach(() => {
    mockStore.value = null;
    dateSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('returns null when nothing is stored and still clears the key', async () => {
    await expect(consumePendingIncomingCall()).resolves.toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('pendingIncomingCall');
  });

  it('returns the payload when BOTH expiresAt and _receivedAt are fresh', async () => {
    const payload = makePayload();
    await seed(payload);
    await expect(consumePendingIncomingCall()).resolves.toEqual(payload);
  });

  it('discards a server-expired payload (expiresAt past) even when _receivedAt is fresh', async () => {
    // expiresAt already past, but the local 45s window is still fresh —
    // the expiresAt guard must win and drop the payload.
    await seed(makePayload({ expiresAt: NOW - 1, _receivedAt: NOW - 1_000 }));
    await expect(consumePendingIncomingCall()).resolves.toBeNull();
    // Single-use: storage entry removed regardless of validity
    expect(mockStore.value).toBeNull();
  });

  it('discards a locally-stale payload (_receivedAt > 45s) even when expiresAt is fresh', async () => {
    await seed(
      makePayload({ expiresAt: NOW + 10_000, _receivedAt: NOW - 46_000 }),
    );
    await expect(consumePendingIncomingCall()).resolves.toBeNull();
  });

  it('discards a payload missing _receivedAt (malformed shape)', async () => {
    await seed(makePayload({ _receivedAt: undefined }));
    await expect(consumePendingIncomingCall()).resolves.toBeNull();
  });

  it('returns null for malformed JSON without throwing', async () => {
    await seed('not-json{{{');
    await expect(consumePendingIncomingCall()).resolves.toBeNull();
  });

  it('is single-use: second consume returns null', async () => {
    await seed(makePayload());
    const first = await consumePendingIncomingCall();
    expect(first).not.toBeNull();
    await expect(consumePendingIncomingCall()).resolves.toBeNull();
  });
});
