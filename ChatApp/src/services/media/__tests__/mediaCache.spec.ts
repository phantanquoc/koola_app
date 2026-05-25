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

describe('mediaPreloader — data-saver skip (task 6.4)', () => {
  let mediaPreloader: typeof import('../mediaPreloader');

  beforeEach(() => {
    jest.resetModules();
    Object.keys(mmkvStore).forEach((k) => delete mmkvStore[k]);
    Object.keys(socketListeners).forEach((k) => delete socketListeners[k]);
    mockGetFromMemory.mockReturnValue(null);
    mockGetOrDownload.mockClear();
    mediaPreloader = require('../mediaPreloader');
  });

  afterEach(() => {
    // Unwire if wired
    try { mediaPreloader.wireMediaPreloader()(); } catch {}
  });

  it('skips preload when data saver is enabled', async () => {
    mediaPreloader.setDataSaver(true);
    const unwire = mediaPreloader.wireMediaPreloader();

    // Simulate new_message event with image
    const handlers = socketListeners['new_message'];
    expect(handlers).toBeDefined();
    handlers?.forEach((h) =>
      h({ message: { type: 'image', mediaUrl: 'uploads/test.jpg' } }),
    );

    // Wait a tick
    await Promise.resolve();

    expect(mockGetOrDownload).not.toHaveBeenCalled();
    unwire();
  });

  it('enqueues preload when data saver is disabled', async () => {
    mediaPreloader.setDataSaver(false);
    const unwire = mediaPreloader.wireMediaPreloader();

    const handlers = socketListeners['new_message'];
    handlers?.forEach((h) =>
      h({ message: { type: 'image', mediaUrl: 'uploads/test.jpg' } }),
    );

    // Wait for async download
    await new Promise((r) => setTimeout(r, 10));

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
