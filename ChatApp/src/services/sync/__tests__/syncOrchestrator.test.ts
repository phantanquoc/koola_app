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

beforeEach(() => {
  _appStateHandler = null;
  Object.keys(_socketListeners).forEach((k) => { _socketListeners[k] = []; });
  mockRemove.mockClear();
  (messagesApi.sync as jest.Mock).mockClear();
});

describe('wireSyncTriggers', () => {
  it('registers an AppState listener', () => {
    const { AppState } = require('react-native');
    const unwire = wireSyncTriggers();

    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unwire();
  });

  it('AppState foreground transition fires syncOnForeground (calls messagesApi.sync)', async () => {
    wireSyncTriggers();

    // Simulate app going to foreground
    expect(_appStateHandler).not.toBeNull();
    _appStateHandler!('active');

    // Give the async syncOnForeground a tick to start
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(messagesApi.sync).toHaveBeenCalled();
  });

  it('unwire removes the AppState listener', () => {
    const unwire = wireSyncTriggers();
    unwire();

    expect(mockRemove).toHaveBeenCalled();
  });

  it('unwire removes the socket connect listener', () => {
    const { socketService } = require('../../socket/SocketService');
    wireSyncTriggers();

    // Verify connect listener was registered
    expect(socketService.on).toHaveBeenCalledWith('connect', expect.any(Function));

    // After unwire, off should have been called for connect
    // (we call unwire which calls _socketConnectUnsub)
    // We can verify by checking socketService.off was called
    // Reset and re-wire to get a clean count
    socketService.off.mockClear();
    const unwire2 = wireSyncTriggers();
    unwire2();
    expect(socketService.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });
});
