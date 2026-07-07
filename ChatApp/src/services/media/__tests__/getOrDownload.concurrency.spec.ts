/**
 * getOrDownload.concurrency.spec.ts
 *
 * Covers the concurrency semaphore + dedupe added to
 * mediaCacheService.getOrDownload:
 *   1. Concurrency cap — no more than MAX_CONCURRENT_DOWNLOADS run at once.
 *   2. Dedupe — two callers for the same key share one network fetch.
 *
 * Note: downloads are intentionally NOT cancellable on unmount — a download
 * always runs to completion and caches so scrolling back is an instant hit.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../api/apiService', () => ({
  getAccessTokenInMemory: () => 'test-token',
  refreshAccessTokenInMemory: jest.fn().mockResolvedValue('test-token'),
}));

jest.mock('../../../config/env', () => ({
  __esModule: true,
  default: { API_URL: 'http://test.local' },
}));

jest.mock('../mediaIndexService', () => ({
  CACHE_ROOT_DIR: '/mock/cache',
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  touch: jest.fn(),
  deleteEntry: jest.fn(),
  evictIfNeeded: jest.fn().mockResolvedValue(undefined),
  getCapBytes: jest.fn().mockReturnValue(5 * 1024 * 1024 * 1024),
}));

// Controllable blob-util fetch: each call returns a task whose resolution we
// drive manually so we can observe how many run concurrently.
// Must be `mock`-prefixed so the hoisted jest.mock factory may reference it.
type Deferred = {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
};
const mockBlob = {
  pendingTasks: [] as Deferred[],
  concurrentNow: 0,
  concurrentPeak: 0,
  reset() {
    this.pendingTasks.length = 0;
    this.concurrentNow = 0;
    this.concurrentPeak = 0;
  },
  makeTask() {
    this.concurrentNow++;
    this.concurrentPeak = Math.max(this.concurrentPeak, this.concurrentNow);
    let resolveFn!: (v: unknown) => void;
    let rejectFn!: (e: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    const deferred: Deferred = {
      resolve: (v) => { mockBlob.concurrentNow--; resolveFn(v); },
      reject: (e) => { mockBlob.concurrentNow--; rejectFn(e); },
      cancelled: false,
    };
    this.pendingTasks.push(deferred);
    const task = promise as Promise<unknown> & {
      cancel: (cb?: (r: unknown) => void) => void;
    };
    task.cancel = () => {
      deferred.cancelled = true;
      deferred.reject(new Error('Download interrupted.'));
    };
    return task;
  },
};

jest.mock('react-native-blob-util', () => ({
  default: {
    fs: {
      isDir: jest.fn().mockResolvedValue(true),
      mkdir: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      stat: jest.fn().mockResolvedValue({ size: 1024 }),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
    config: jest.fn().mockReturnValue({
      fetch: jest.fn(() => mockBlob.makeTask()),
    }),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function resolveTaskOk(d: Deferred) {
  d.resolve({ info: () => ({ status: 200 }), path: () => '/mock/cache/x' });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getOrDownload — concurrency semaphore', () => {
  let svc: typeof import('../mediaCacheService');

  beforeEach(() => {
    jest.resetModules();
    mockBlob.reset();
    svc = require('../mediaCacheService');
  });

  it('caps concurrent downloads at 3 (4th waits for a slot)', async () => {
    const p1 = svc.getOrDownload('uploads/a.jpg');
    const p2 = svc.getOrDownload('uploads/b.jpg');
    const p3 = svc.getOrDownload('uploads/c.jpg');
    const p4 = svc.getOrDownload('uploads/d.jpg');

    await flush();

    // Only 3 tasks should be in flight; the 4th is queued behind the semaphore.
    expect(mockBlob.pendingTasks.length).toBe(3);
    expect(mockBlob.concurrentPeak).toBe(3);

    // Complete one → the 4th acquires the freed slot.
    resolveTaskOk(mockBlob.pendingTasks[0]);
    await flush();
    expect(mockBlob.pendingTasks.length).toBe(4);

    // Drain the rest to avoid dangling promises.
    resolveTaskOk(mockBlob.pendingTasks[1]);
    resolveTaskOk(mockBlob.pendingTasks[2]);
    resolveTaskOk(mockBlob.pendingTasks[3]);
    await Promise.all([p1, p2, p3, p4]);
  });

  it('dedupes two callers for the same key into one fetch', async () => {
    const a = svc.getOrDownload('uploads/same.jpg');
    const b = svc.getOrDownload('uploads/same.jpg');
    await flush();

    // Only one underlying task despite two callers.
    expect(mockBlob.pendingTasks.length).toBe(1);

    resolveTaskOk(mockBlob.pendingTasks[0]);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe('file:///mock/cache/uploads/same.jpg');
    expect(rb).toBe(ra);
  });
});
