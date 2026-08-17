/**
 * mediaCache.spec.ts
 *
 * Task 6.5 — Unit tests for:
 *   1. Cap-change eviction: setCapBytes + evictIfNeeded removes LRU entries
 *   2. Preloader skip-on-data-saver: wireMediaPreloader skips when data saver on
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock MMKV
const mmkvStore: Record<string, unknown> = {};
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: (key: string) => mmkvStore[key] as string | undefined,
    getNumber: (key: string) => mmkvStore[key] as number | undefined,
    getBoolean: (key: string) => mmkvStore[key] as boolean | undefined,
    set: (key: string, value: unknown) => { mmkvStore[key] = value; },
    delete: (key: string) => { delete mmkvStore[key]; },
    clearAll: () => { Object.keys(mmkvStore).forEach((k) => delete mmkvStore[k]); },
    getAllKeys: () => Object.keys(mmkvStore),
  })),
}));

// Mock react-native-blob-util
jest.mock('react-native-blob-util', () => ({
  default: {
    fs: {
      dirs: { DocumentDir: '/mock/docs' },
      unlink: jest.fn().mockResolvedValue(undefined),
      isDir: jest.fn().mockResolvedValue(true),
      mkdir: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      stat: jest.fn().mockResolvedValue({ size: 1024 }),
    },
    config: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue({
        info: () => ({ status: 200 }),
        path: () => '/mock/path',
      }),
    }),
  },
}));

// Mock SocketService
const socketListeners: Record<string, Set<(...args: unknown[]) => void>> = {};
jest.mock('../../socket/SocketService', () => ({
  socketService: {
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!socketListeners[event]) socketListeners[event] = new Set();
      socketListeners[event].add(cb);
    }),
    off: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      socketListeners[event]?.delete(cb);
    }),
  },
}));

// Mock @react-native-community/netinfo — controllable metered state for tests.
const mockNetInfoListeners: Set<(state: { isConnectionExpensive: boolean }) => void> = new Set();
const mockNetState = { isConnectionExpensive: false, isConnected: true };
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ ...mockNetState })),
    // Real NetInfoSubscription is the unsubscribe function itself (not { remove }).
    addEventListener: jest.fn((cb: (state: { isConnectionExpensive: boolean }) => void) => {
      mockNetInfoListeners.add(cb);
      return () => { mockNetInfoListeners.delete(cb); };
    }),
  },
}));

// Simulate a network-state change through all registered NetInfo listeners.
function simulateNetChange(state: { isConnectionExpensive: boolean }): void {
  mockNetInfoListeners.forEach((cb) => cb(state));
}

// Mock mediaCacheService.getFromMemory and getOrDownload
const mockGetFromMemory = jest.fn().mockReturnValue(null);
const mockGetOrDownload = jest.fn().mockResolvedValue('file:///mock/path');
jest.mock('../mediaCacheService', () => ({
  getFromMemory: (...args: unknown[]) => mockGetFromMemory(...args),
  getOrDownload: (...args: unknown[]) => mockGetOrDownload(...args),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mediaIndexService — configurable cap (task 6.1)', () => {
  let mediaIndexService: typeof import('../mediaIndexService');

  beforeEach(() => {
    jest.resetModules();
    Object.keys(mmkvStore).forEach((k) => delete mmkvStore[k]);
    mediaIndexService = require('../mediaIndexService');
  });

  it('getCapBytes returns default 5 GB when no setting stored', () => {
    const cap = mediaIndexService.getCapBytes();
    expect(cap).toBe(5 * 1024 * 1024 * 1024);
  });

  it('setCapBytes persists and getCapBytes returns the clamped value', () => {
    const stored = mediaIndexService.setCapBytes(2 * 1024 * 1024 * 1024); // 2 GB
    expect(stored).toBe(2 * 1024 * 1024 * 1024);
    expect(mediaIndexService.getCapBytes()).toBe(2 * 1024 * 1024 * 1024);
  });

  it('setCapBytes clamps below minimum to 1 GB', () => {
    const stored = mediaIndexService.setCapBytes(100); // too small
    expect(stored).toBe(1024 * 1024 * 1024);
  });

  it('setCapBytes clamps above maximum to 20 GB', () => {
    const stored = mediaIndexService.setCapBytes(100 * 1024 * 1024 * 1024); // too large
    expect(stored).toBe(20 * 1024 * 1024 * 1024);
  });
});

describe('mediaIndexService — evictIfNeeded with cap change (task 6.2)', () => {
  let mediaIndexService: typeof import('../mediaIndexService');

  beforeEach(() => {
    jest.resetModules();
    Object.keys(mmkvStore).forEach((k) => delete mmkvStore[k]);
    mediaIndexService = require('../mediaIndexService');
  });

  it('evicts LRU entries when total exceeds new cap', async () => {
    const GB = 1024 * 1024 * 1024;

    // Add 3 entries totalling 3 GB (each 1 GB)
    mediaIndexService.set('key1', { path: '/p1', size: GB, addedAt: 1000, lastAccess: 1000 });
    mediaIndexService.set('key2', { path: '/p2', size: GB, addedAt: 2000, lastAccess: 2000 });
    mediaIndexService.set('key3', { path: '/p3', size: GB, addedAt: 3000, lastAccess: 3000 });

    expect(mediaIndexService.getTotalCachedBytes()).toBe(3 * GB);

    // Set cap to 2 GB — eviction floor is 80% of 2 GB = 1.6 GB
    // Starting at 3 GB: evict key1 (1 GB) → 2 GB, evict key2 (1 GB) → 1 GB <= 1.6 GB
    const newCap = mediaIndexService.setCapBytes(2 * GB);
    expect(newCap).toBe(2 * GB);
    await mediaIndexService.evictIfNeeded(newCap);

    // After eviction, total should be <= 80% of 2 GB = 1.6 GB
    expect(mediaIndexService.getTotalCachedBytes()).toBeLessThanOrEqual(Math.floor(2 * GB * 0.8));
    // key1 should be evicted (oldest lastAccess)
    expect(mediaIndexService.get('key1')).toBeNull();
  });
});

describe('mediaIndexService — breakdown by category (task 7.1)', () => {
  let mediaIndexService: typeof import('../mediaIndexService');

  beforeEach(() => {
    jest.resetModules();
    Object.keys(mmkvStore).forEach((k) => delete mmkvStore[k]);
    mediaIndexService = require('../mediaIndexService');
  });

  it('categorizes entries by MIME type', () => {
    mediaIndexService.set('a', { path: '/img/a.jpg', size: 100, mime: 'image/jpeg', addedAt: 1, lastAccess: 1 });
    mediaIndexService.set('b', { path: '/vid/b.mp4', size: 200, mime: 'video/mp4', addedAt: 2, lastAccess: 2 });
    mediaIndexService.set('c', { path: '/aud/c.mp3', size: 300, mime: 'audio/mpeg', addedAt: 3, lastAccess: 3 });

    const result = mediaIndexService.breakdown();
    expect(result.image).toBe(100);
    expect(result.video).toBe(200);
    expect(result.audio).toBe(300);
    expect(result.other).toBe(0);
  });

  it('falls back to file extension for legacy entries without mime', () => {
    mediaIndexService.set('a', { path: '/c/a.png', size: 10, addedAt: 1, lastAccess: 1 });
    mediaIndexService.set('b', { path: '/c/b.mov', size: 20, addedAt: 2, lastAccess: 2 });
    mediaIndexService.set('c', { path: '/c/c.m4a', size: 30, addedAt: 3, lastAccess: 3 });

    const result = mediaIndexService.breakdown();
    expect(result.image).toBe(10);
    expect(result.video).toBe(20);
    expect(result.audio).toBe(30);
    expect(result.other).toBe(0);
  });

  it('buckets unknown extensions into other', () => {
    mediaIndexService.set('a', { path: '/c/doc.pdf', size: 50, addedAt: 1, lastAccess: 1 });
    mediaIndexService.set('b', { path: '/c/notes.txt', size: 25, addedAt: 2, lastAccess: 2 });

    const result = mediaIndexService.breakdown();
    expect(result.image).toBe(0);
    expect(result.video).toBe(0);
    expect(result.audio).toBe(0);
    expect(result.other).toBe(75);
  });

  it('sums to the same total as getTotalCachedBytes', () => {
    mediaIndexService.set('a', { path: '/c/a.webp', size: 5, addedAt: 1, lastAccess: 1 });
    mediaIndexService.set('b', { path: '/c/b.webm', size: 15, mime: 'video/webm', addedAt: 2, lastAccess: 2 });
    mediaIndexService.set('c', { path: '/c/c.bin', size: 99, addedAt: 3, lastAccess: 3 });

    const result = mediaIndexService.breakdown();
    const sum = result.image + result.video + result.audio + result.other;
    expect(sum).toBe(mediaIndexService.getTotalCachedBytes());
    expect(sum).toBe(119);
  });

  it('returns all zeros for an empty index', () => {
    const result = mediaIndexService.breakdown();
    expect(result).toEqual({ image: 0, video: 0, audio: 0, other: 0 });
  });
});

describe('mediaPreloader — data-saver + metered gate (task 6.1)', () => {
  let mediaPreloader: typeof import('../mediaPreloader');

  beforeEach(() => {
    jest.resetModules();
    Object.keys(mmkvStore).forEach((k) => delete mmkvStore[k]);
    Object.keys(socketListeners).forEach((k) => delete socketListeners[k]);
    mockNetInfoListeners.clear();
    mockNetState.isConnectionExpensive = false;
    mockGetFromMemory.mockReturnValue(null);
    mockGetOrDownload.mockClear();
    mediaPreloader = require('../mediaPreloader');
  });

  afterEach(() => {
    // Unwire if wired
    try { mediaPreloader.wireMediaPreloader()(); } catch {}
  });

  function emitNewMessage(): void {
    const handlers = socketListeners['new_message'];
    handlers?.forEach((h) =>
      h({ message: { type: 'image', mediaUrl: 'uploads/test.jpg' } }),
    );
  }

  it('data saver on + metered → no enqueue', async () => {
    mediaPreloader.setDataSaver(true);
    const unwire = mediaPreloader.wireMediaPreloader();
    simulateNetChange({ isConnectionExpensive: true });

    emitNewMessage();
    await Promise.resolve();

    expect(mockGetOrDownload).not.toHaveBeenCalled();
    unwire();
  });

  it('data saver on + unmetered → enqueue', async () => {
    mediaPreloader.setDataSaver(true);
    const unwire = mediaPreloader.wireMediaPreloader();
    simulateNetChange({ isConnectionExpensive: false });

    emitNewMessage();
    await new Promise<void>((r) => setTimeout(() => r(), 10));

    expect(mockGetOrDownload).toHaveBeenCalledWith('uploads/test.jpg');
    unwire();
  });

  it('data saver off + metered → enqueue', async () => {
    mediaPreloader.setDataSaver(false);
    const unwire = mediaPreloader.wireMediaPreloader();
    simulateNetChange({ isConnectionExpensive: true });

    emitNewMessage();
    await new Promise<void>((r) => setTimeout(() => r(), 10));

    expect(mockGetOrDownload).toHaveBeenCalledWith('uploads/test.jpg');
    unwire();
  });

  it('network switch updates decision live without restart', async () => {
    mediaPreloader.setDataSaver(true);
    const unwire = mediaPreloader.wireMediaPreloader();

    // Start metered — should skip
    simulateNetChange({ isConnectionExpensive: true });
    emitNewMessage();
    await Promise.resolve();
    expect(mockGetOrDownload).not.toHaveBeenCalled();

    // Switch to unmetered — should now enqueue without rewiring
    simulateNetChange({ isConnectionExpensive: false });
    emitNewMessage();
    await new Promise<void>((r) => setTimeout(() => r(), 10));
    expect(mockGetOrDownload).toHaveBeenCalledWith('uploads/test.jpg');

    unwire();
  });

  it('skips non-image/video messages', async () => {
    mediaPreloader.setDataSaver(false);
    const unwire = mediaPreloader.wireMediaPreloader();

    const handlers = socketListeners['new_message'];
    handlers?.forEach((h) =>
      h({ message: { type: 'text', mediaUrl: '' } }),
    );

    await Promise.resolve();
    expect(mockGetOrDownload).not.toHaveBeenCalled();
    unwire();
  });
});
