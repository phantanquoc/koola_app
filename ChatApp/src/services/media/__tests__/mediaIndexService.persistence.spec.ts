/**
 * mediaIndexService.persistence.spec.ts
 *
 * Coverage for the deferred/coalesced `lastAccess` persistence machinery added by
 * the chat-scroll-jank-phase1 change (group 4). `touch` and `persistMap` are both
 * CRITICAL-blast-radius symbols (20 and 30 impacted symbols respectively;
 * `persistMap` participates in App bootstrap and StorageSettingsScreen), and the
 * index is shared app-wide by chat media, Moments and avatars — so the timing
 * rewrite needs its own tests rather than leaning on the pre-existing
 * mediaCache.spec.ts / getOrDownload.concurrency.spec.ts suites, which predate it.
 *
 * Invariants pinned here:
 *   1. A burst of touch() calls coalesces into exactly ONE snapshot write.
 *   2. touch() updates `lastAccess` in memory synchronously — evictIfNeeded's LRU
 *      ordering must be correct the instant touch() returns, with no flush.
 *   3. Structural writes (set / deleteEntry) absorb a pending deferred flush:
 *      nothing is lost, and no redundant second write fires afterwards.
 *   4. clearAll() cancels a queued flush, so it cannot rewrite the storage key
 *      that was just cleared.
 *   5. The on-disk format stays a single "entries" top-level key
 *      (the media-cache-persistence contract).
 *
 * Timing note: jest's modern fake timers drive both the coalescing setTimeout and
 * the setImmediate that InteractionManager's TaskQueue drains, and they advance
 * Date.now() — which is what touch()'s per-key debounce reads.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

/**
 * MMKV mock that records every write, so tests can count snapshot writes rather
 * than only inspecting the final stored value. Named with a `mock` prefix so
 * babel-plugin-jest-hoist allows the reference from inside the hoisted factory.
 */
const mockMmkvStore = new Map<string, unknown>();
const mockMmkvWrites: Array<{ key: string; value: unknown }> = [];

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: (key: string) => {
      const v = mockMmkvStore.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (key: string) => {
      const v = mockMmkvStore.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean: (key: string) => {
      const v = mockMmkvStore.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    set: (key: string, value: unknown) => {
      mockMmkvWrites.push({ key, value });
      mockMmkvStore.set(key, value);
    },
    delete: (key: string) => mockMmkvStore.delete(key),
    clearAll: () => mockMmkvStore.clear(),
    getAllKeys: () => Array.from(mockMmkvStore.keys()),
    contains: (key: string) => mockMmkvStore.has(key),
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Must match LASTACCESS_FLUSH_MS in mediaIndexService. */
const FLUSH_MS = 2000;
/** Must match TOUCH_DEBOUNCE_MS in mediaIndexService. */
const DEBOUNCE_MS = 5000;
/** Fixed wall clock, far above the small lastAccess seeds used below. */
const BASE_TIME = Date.UTC(2026, 7, 3, 12, 0, 0);

const STORAGE_KEY = 'entries';

type Svc = typeof import('../mediaIndexService');
type MediaIndexEntry = import('../mediaIndexService').MediaIndexEntry;

/** Writes recorded against the snapshot key only. */
function snapshotWrites(): Array<{ key: string; value: unknown }> {
  return mockMmkvWrites.filter((w) => w.key === STORAGE_KEY);
}

/** Parse the currently-stored snapshot, or null when the key is absent. */
function storedSnapshot(): Record<string, MediaIndexEntry> | null {
  const raw = mockMmkvStore.get(STORAGE_KEY);
  return typeof raw === 'string' ? JSON.parse(raw) : null;
}

/**
 * Drive the deferred flush all the way through: the coalescing setTimeout, then
 * the setImmediate that InteractionManager's TaskQueue uses to drain.
 *
 * Note this advances the fake clock by FLUSH_MS, which matters when asserting
 * against touch()'s per-key debounce — hence `advanceToOffset` below.
 */
function runDeferredFlush(): void {
  jest.advanceTimersByTime(FLUSH_MS);
  jest.runAllTimers();
}

/**
 * Advance the fake clock to an absolute offset from BASE_TIME.
 *
 * The debounce gate compares `Date.now()` against the last *touch* that passed
 * it, while `runDeferredFlush` also moves the clock — so relative advances are
 * easy to misread. Absolute offsets keep each step's clock position explicit.
 */
function advanceToOffset(msFromBase: number): void {
  const delta = BASE_TIME + msFromBase - Date.now();
  if (delta > 0) jest.advanceTimersByTime(delta);
}

function entry(size: number, lastAccess: number) {
  return { path: `/mock/documents/MediaCache/f${lastAccess}`, size, addedAt: 1, lastAccess };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('mediaIndexService — deferred lastAccess persistence', () => {
  let svc: Svc;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    mockMmkvStore.clear();
    mockMmkvWrites.length = 0;
    jest.resetModules();
    svc = require('../mediaIndexService');
    // Discard anything the module-import-time load() may have recorded so each
    // assertion counts only writes caused by the test body.
    mockMmkvWrites.length = 0;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ── 1. Coalescing ──────────────────────────────────────────────────────────

  describe('coalescing window', () => {
    it('collapses a burst of touch() calls into exactly one snapshot write', () => {
      const KEYS = Array.from({ length: 12 }, (_, i) => `key${i}`);
      KEYS.forEach((k, i) => svc.set(k, entry(1000, 1000 + i)));

      // Ignore the structural writes from set(); measure only the touch burst.
      mockMmkvWrites.length = 0;
      expect(jest.getTimerCount()).toBe(0);

      // Every key is distinct, so every touch clears the per-key 5 s debounce
      // gate — this is precisely the scroll case that used to serialize N times.
      KEYS.forEach((k) => svc.touch(k));

      // Nothing may reach MMKV on the scroll-critical path. A regression that
      // persists inline from touch() would land 12 writes here.
      expect(snapshotWrites()).toHaveLength(0);
      // Exactly one coalescing timer for the whole burst — a regression that
      // armed a timer per touch would leave 12 pending.
      expect(jest.getTimerCount()).toBe(1);

      runDeferredFlush();

      expect(snapshotWrites()).toHaveLength(1);

      // The single write must carry every touched key's new timestamp: coalescing
      // may not drop updates.
      const stored = storedSnapshot();
      expect(stored).not.toBeNull();
      KEYS.forEach((k) => {
        expect(stored![k].lastAccess).toBe(BASE_TIME);
      });
    });

    it('does not re-arm the flush timer while a key is inside its 5 s debounce', () => {
      svc.set('key1', entry(1000, 1000));
      mockMmkvWrites.length = 0;

      // T+0: first touch of key1 passes the debounce gate and arms a flush.
      svc.touch('key1');
      expect(jest.getTimerCount()).toBe(1);
      runDeferredFlush(); // clock is now at T+FLUSH_MS
      expect(snapshotWrites()).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);

      // Re-touch inside the debounce window (measured from the T+0 touch, not
      // from the flush): memory updates, but no new flush is armed.
      advanceToOffset(DEBOUNCE_MS - 1);
      const midpoint = Date.now();
      expect(midpoint).toBe(BASE_TIME + DEBOUNCE_MS - 1);
      svc.touch('key1');
      expect(svc.get('key1')?.lastAccess).toBe(midpoint);
      expect(jest.getTimerCount()).toBe(0);
      runDeferredFlush();
      expect(snapshotWrites()).toHaveLength(1);

      // Once the debounce elapses, the next touch does arm a flush again.
      advanceToOffset(2 * DEBOUNCE_MS);
      svc.touch('key1');
      expect(jest.getTimerCount()).toBe(1);
      runDeferredFlush();
      expect(snapshotWrites()).toHaveLength(2);
    });
  });

  // ── 2. Synchronous in-memory update ────────────────────────────────────────

  describe('touch() in-memory synchronicity', () => {
    it('updates lastAccess in memory before any flush occurs', () => {
      svc.set('key1', entry(1000, 1000));
      mockMmkvWrites.length = 0;

      svc.touch('key1');

      // Authoritative and current the instant touch() returns...
      expect(svc.get('key1')?.lastAccess).toBe(BASE_TIME);
      // ...and independent of persistence: nothing has been written yet.
      expect(snapshotWrites()).toHaveLength(0);
      // The still-stored snapshot proves the memory value did not come from disk.
      expect(storedSnapshot()!.key1.lastAccess).toBe(1000);
    });

    it('makes evictIfNeeded evict LRU-correctly using the un-flushed timestamp', async () => {
      // key1 is the oldest on disk; touching it must make it the newest in memory.
      svc.set('key1', entry(1000, 1000));
      svc.set('key2', entry(1000, 2000));
      svc.set('key3', entry(1000, 3000));
      mockMmkvWrites.length = 0;

      svc.touch('key1');
      // Deliberately do NOT flush: the LRU decision must rely on memory alone.
      expect(snapshotWrites()).toHaveLength(0);

      // total 3000 > cap 2000; floor = 1600, so two entries are evicted and the
      // most-recently-used one survives.
      await svc.evictIfNeeded(2000);

      expect(svc.get('key1')).not.toBeNull();
      expect(svc.get('key2')).toBeNull();
      expect(svc.get('key3')).toBeNull();
      expect(svc.getTotalCachedBytes()).toBe(1000);
      // Were the touch deferred to flush time, key1 would still look oldest and
      // key3 would have been the survivor instead.
    });
  });

  // ── 3. Structural writes absorb the pending flush ──────────────────────────

  describe('structural writes absorb a pending deferred flush', () => {
    it('set() persists the touched timestamp and fires no redundant second write', () => {
      svc.set('key1', entry(1000, 1000));
      mockMmkvWrites.length = 0;

      svc.touch('key1');
      expect(jest.getTimerCount()).toBe(1);
      expect(snapshotWrites()).toHaveLength(0);

      svc.set('key2', entry(2000, 4000));

      // One prompt write that cancelled the pending flush...
      expect(snapshotWrites()).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
      // ...carrying both the structural insert and the touched timestamp.
      const stored = storedSnapshot()!;
      expect(stored.key1.lastAccess).toBe(BASE_TIME);
      expect(stored.key2.size).toBe(2000);

      // Draining timers must not produce a second, redundant snapshot write.
      runDeferredFlush();
      expect(snapshotWrites()).toHaveLength(1);
    });

    it('deleteEntry() persists the touched timestamp and fires no redundant second write', () => {
      svc.set('key1', entry(1000, 1000));
      svc.set('key2', entry(1000, 2000));
      mockMmkvWrites.length = 0;

      svc.touch('key1');
      expect(jest.getTimerCount()).toBe(1);
      expect(snapshotWrites()).toHaveLength(0);

      svc.deleteEntry('key2');

      expect(snapshotWrites()).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
      const stored = storedSnapshot()!;
      expect(stored.key2).toBeUndefined();
      expect(stored.key1.lastAccess).toBe(BASE_TIME);

      runDeferredFlush();
      expect(snapshotWrites()).toHaveLength(1);
    });
  });

  // ── 4. clearAll cancels the queued flush ───────────────────────────────────

  describe('clearAll() cancels a queued flush', () => {
    it('leaves the storage key cleared even though a flush was pending', async () => {
      svc.set('key1', entry(1000, 1000));
      svc.set('key2', entry(1000, 2000));
      mockMmkvWrites.length = 0;

      svc.touch('key1');
      expect(jest.getTimerCount()).toBe(1);

      await svc.clearAll();

      expect(mockMmkvStore.get(STORAGE_KEY)).toBeUndefined();

      // Drain first, then assert: the primary harm is a surviving flush
      // rewriting the storage key clearAll() just cleared.
      const writesAtClear = mockMmkvWrites.length;
      runDeferredFlush();

      expect(mockMmkvStore.get(STORAGE_KEY)).toBeUndefined();
      expect(mockMmkvWrites.length).toBe(writesAtClear);
      expect(svc.get('key1')).toBeNull();

      // And the timer must be cancelled outright, not merely left to fire into a
      // defanged no-op.
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  // ── 5. On-disk format contract ─────────────────────────────────────────────

  describe('on-disk format (media-cache-persistence contract)', () => {
    it('stores a single "entries" top-level key holding a flat mediaKey map', () => {
      svc.set('uploads/a.jpg', entry(1234, 1000));
      svc.set('uploads/b.mp4', entry(5678, 2000));

      // Exactly one MMKV key — not one key per entry, not a versioned wrapper.
      expect(Array.from(mockMmkvStore.keys())).toEqual([STORAGE_KEY]);

      const raw = mockMmkvStore.get(STORAGE_KEY);
      expect(typeof raw).toBe('string');

      const parsed = JSON.parse(raw as string);
      expect(Object.keys(parsed).sort()).toEqual(['uploads/a.jpg', 'uploads/b.mp4']);
      // Values are the entries themselves, keyed directly by mediaKey.
      expect(parsed['uploads/a.jpg']).toEqual({
        path: '/mock/documents/MediaCache/f1000',
        size: 1234,
        addedAt: 1,
        lastAccess: 1000,
      });
    });

    it('keeps the same shape when written by the deferred flush path', () => {
      svc.set('uploads/a.jpg', entry(1234, 1000));
      mockMmkvWrites.length = 0;

      svc.touch('uploads/a.jpg');
      runDeferredFlush();
      expect(snapshotWrites()).toHaveLength(1);

      // The deferred path must not introduce a delta/partial format of its own.
      expect(Array.from(mockMmkvStore.keys())).toEqual([STORAGE_KEY]);
      const parsed = JSON.parse(mockMmkvStore.get(STORAGE_KEY) as string);
      expect(Object.keys(parsed)).toEqual(['uploads/a.jpg']);
      expect(parsed['uploads/a.jpg']).toEqual({
        path: '/mock/documents/MediaCache/f1000',
        size: 1234,
        addedAt: 1,
        lastAccess: BASE_TIME,
      });
    });

    it('round-trips a deferred-flush snapshot back into memory on reload', () => {
      svc.set('uploads/a.jpg', entry(1234, 1000));
      svc.touch('uploads/a.jpg');
      runDeferredFlush();

      // Fresh module instance reads the snapshot the deferred flush produced.
      jest.resetModules();
      const reloaded: Svc = require('../mediaIndexService');
      expect(reloaded.get('uploads/a.jpg')?.lastAccess).toBe(BASE_TIME);
      expect(reloaded.getTotalCachedBytes()).toBe(1234);
    });
  });
});
