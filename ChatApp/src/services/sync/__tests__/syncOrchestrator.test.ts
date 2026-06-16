/**
 * syncOrchestrator.test.ts
 *
 * Verifies that wireSyncTriggers() installs the AppState foreground listener
 * and that transitioning to 'active' fires syncOnForeground.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Capture AppState listeners
type AppStateHandler = (state: string) => void;
let _appStateHandler: AppStateHandler | null = null;
const mockRemove = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, handler: AppStateHandler) => {
      _appStateHandler = handler;
      return { remove: mockRemove };
    }),
    currentState: 'active',
  },
}));

// Mock SocketService
const _socketListeners: Record<string, Array<(...args: unknown[]) => void>> = {};

jest.mock('../../socket/SocketService', () => ({
  socketService: {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!_socketListeners[event]) _socketListeners[event] = [];
      _socketListeners[event].push(handler);
    }),
    off: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (_socketListeners[event]) {
        _socketListeners[event] = _socketListeners[event].filter((h) => h !== handler);
      }
    }),
  },
}));

// Mock messagesApi.sync so runDelta doesn't make real HTTP calls
jest.mock('../../api/apiService', () => ({
  messagesApi: {
    sync: jest.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
  },
}));

// Mock repositories
jest.mock('../../db/messageRepository', () => ({
  upsertMany: jest.fn(),
}));

jest.mock('../../db/syncStateRepository', () => ({
  getCursor: jest.fn().mockReturnValue(null),
  setCursor: jest.fn(),
  clearAll: jest.fn(),
}));

// Mock asyncStorage
jest.mock('../../storage/asyncStorage', () => ({
  asyncStorage: {
    getLastSyncAt: jest.fn().mockResolvedValue(null),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

import { wireSyncTriggers, syncOnForeground } from '../syncOrchestrator';
import { messagesApi } from '../../api/apiService';

// Track the unwire function so each test can clean up after itself.
// Without this, the idempotent guard would make the second test's
// wireSyncTriggers() call a no-op.
let _unwire: (() => void) | null = null;

beforeEach(() => {
  _appStateHandler = null;
  Object.keys(_socketListeners).forEach((k) => { _socketListeners[k] = []; });
  mockRemove.mockClear();
  (messagesApi.sync as jest.Mock).mockClear();
});

afterEach(() => {
  // Always unwire so the idempotent guard resets between tests
  if (_unwire) {
    _unwire();
    _unwire = null;
  }
});

describe('wireSyncTriggers', () => {
  it('registers an AppState listener', () => {
    const { AppState } = require('react-native');
    _unwire = wireSyncTriggers();

    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('AppState foreground transition fires syncOnForeground (calls messagesApi.sync)', async () => {
    _unwire = wireSyncTriggers();

    // Simulate app going to foreground
    expect(_appStateHandler).not.toBeNull();
    _appStateHandler!('active');

    // Give the async syncOnForeground a tick to start
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(messagesApi.sync).toHaveBeenCalled();
  });

  it('unwire removes the AppState listener', () => {
    _unwire = wireSyncTriggers();
    _unwire();
    _unwire = null;

    expect(mockRemove).toHaveBeenCalled();
  });

  it('unwire removes the socket connect listener', () => {
    const { socketService } = require('../../socket/SocketService');
    _unwire = wireSyncTriggers();

    // Verify connect listener was registered
    expect(socketService.on).toHaveBeenCalledWith('connect', expect.any(Function));

    // After unwire, off should have been called for connect
    socketService.off.mockClear();
    _unwire();
    _unwire = null;
    expect(socketService.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('calling wireSyncTriggers twice registers AppState.addEventListener only once', () => {
    const { AppState } = require('react-native');
    (AppState.addEventListener as jest.Mock).mockClear();

    _unwire = wireSyncTriggers();
    const noopUnwire = wireSyncTriggers(); // second call — should be no-op

    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);

    // The no-op unwire should not remove the real listener
    noopUnwire();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('calling wireSyncTriggers twice registers socketService.on("connect") only once', () => {
    const { socketService } = require('../../socket/SocketService');
    (socketService.on as jest.Mock).mockClear();

    _unwire = wireSyncTriggers();
    wireSyncTriggers(); // second call — no-op

    const connectCalls = (socketService.on as jest.Mock).mock.calls.filter(
      ([event]: [string]) => event === 'connect',
    );
    expect(connectCalls).toHaveLength(1);
  });

  it('no-op unwire from second wireSyncTriggers call does nothing', () => {
    _unwire = wireSyncTriggers();
    const noopUnwire = wireSyncTriggers();

    // Calling the no-op should not throw and should not remove the real listener
    expect(() => noopUnwire()).not.toThrow();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
