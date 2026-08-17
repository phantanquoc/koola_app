/**
 * mediaIndexService — MMKV-backed persistent index for the media cache.
 *
 * Storage:         MMKV instance id 'media-index', key 'entries'
 * Cache root:      DocumentDir/MediaCache
 * Default cap:     5 GB (configurable 1–20 GB)
 * Eviction floor:  80 % of cap (~4 GB at default)
 * lastAccess debounce: 5 s per key (TOUCH_DEBOUNCE_MS)
 *
 * Design notes:
 *   - MMKV reads are synchronous (mmap-backed) and complete in well under one
 *     millisecond. The in-memory `indexMap` is hydrated from MMKV at module
 *     import time (top-level statement at the bottom of the file), which runs
 *     before any React component renders. As a result, `getFromMemory` returns
 *     a hit on the very first frame after a process restart, eliminating the
 *     Blurhash flash that AsyncStorage's async hydration left behind.
 *   - Persistence is a full-snapshot `JSON.stringify` of `indexMap`, so its cost
 *     grows with index size. Two classes of write therefore behave differently:
 *       · Structural writes (`set`, `deleteEntry`) persist promptly — they carry
 *         the file paths the cache needs to survive a process restart.
 *       · `lastAccess` writes from `touch()` update memory synchronously but
 *         persist deferred and coalesced (see `scheduleLastAccessFlush`). The
 *         per-key 5 s debounce alone did not bound this: the first touch of each
 *         distinct key always passed the gate, so scrolling past N cached images
 *         meant N synchronous whole-map serializations on the JS thread. The
 *         coalescing window bounds it by wall-clock time instead.
 *   - Requires React Native New Architecture (TurboModules + Fabric), which is
 *     enabled in this project (see android/gradle.properties).
 */
import { InteractionManager } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const BlobUtil = require('react-native-blob-util').default;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Root directory for all persistent cached media files. */
export const CACHE_ROOT_DIR: string =
  `${BlobUtil.fs.dirs.DocumentDir}/MediaCache`;

/** Maximum total cache size before LRU eviction triggers (default 5 GB, configurable 1–20 GB). */
export const CACHE_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB default

/** Minimum allowed cap (1 GB). */
const CAP_MIN_BYTES = 1024 * 1024 * 1024; // 1 GB

/** Maximum allowed cap (20 GB). */
const CAP_MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

/** MMKV key for the user-configured cap. */
const CAP_SETTINGS_KEY = 'cache_cap_bytes';

/** Eviction target: stop evicting once total drops below this fraction of cap. */
const EVICTION_FLOOR_RATIO = 0.8;

/** Minimum milliseconds between MMKV writes for the same key on touch(). */
const TOUCH_DEBOUNCE_MS = 5000;

/**
 * Coalescing window for deferred `lastAccess` persistence.
 *
 * All `touch()` writes that land inside one window share a single snapshot
 * write, which is then further deferred until interactions (scrolling) settle.
 * Bounds serialization to at most once per window while scrolling continuously.
 */
const LASTACCESS_FLUSH_MS = 2000;

/** MMKV key holding the serialized index. */
const STORAGE_KEY = 'entries';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaIndexEntry {
  path: string;
  size: number;
  mime?: string;
  addedAt: number;
  lastAccess: number;
}

// ─── MMKV instance ────────────────────────────────────────────────────────────

const mmkv = new MMKV({ id: 'media-index' });

// ─── In-memory mirror ─────────────────────────────────────────────────────────

/** In-memory mirror of the MMKV contents. Populated synchronously by load(). */
const indexMap = new Map<string, MediaIndexEntry>();

/**
 * Per-key timestamp of the last persist write performed by touch().
 * Used to debounce writes when the same key is accessed repeatedly.
 */
const lastWriteTs = new Map<string, number>();

// ─── Persistence helper ───────────────────────────────────────────────────────

/**
 * Synchronously serialize the indexMap and write it to MMKV.
 *
 * This is a FULL snapshot: cost grows with index size, so it must never run on
 * a scroll frame. Callers choose the timing — `persistNow()` for structural
 * writes, `scheduleLastAccessFlush()` for LRU bookkeeping.
 */
function persistMap(): void {
  const snapshot: Record<string, MediaIndexEntry> = {};
  indexMap.forEach((entry, key) => {
    snapshot[key] = entry;
  });
  try {
    mmkv.set(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[mediaIndexService] MMKV.set failed:', err);
  }
}

// ─── Deferred lastAccess persistence ──────────────────────────────────────────

/** True when touch() has updated memory without the change reaching MMKV yet. */
let lastAccessDirty = false;

/** Coalescing timer for the deferred flush, or null when none is scheduled. */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Pending InteractionManager handle, kept so it can be cancelled. */
let flushInteraction: { cancel: () => void } | null = null;

function cancelScheduledFlush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushInteraction?.cancel();
  flushInteraction = null;
}

/** Write pending lastAccess changes, if any. Safe to call unconditionally. */
function flushLastAccess(): void {
  cancelScheduledFlush();
  if (!lastAccessDirty) return;
  lastAccessDirty = false;
  persistMap();
}

/**
 * Persist immediately, absorbing any pending deferred write.
 *
 * The snapshot contains every current `lastAccess` value, so a prompt write
 * already satisfies whatever the deferred flush was going to persist.
 */
function persistNow(): void {
  cancelScheduledFlush();
  lastAccessDirty = false;
  persistMap();
}

/**
 * Schedule one deferred, coalesced snapshot write for `lastAccess` changes.
 *
 * Runs on the scroll-critical path (via `touch()`), so it stays O(1) and
 * serializes nothing. Calls arriving while a flush is already scheduled are
 * absorbed by it: a burst of touches costs a single write, whatever its size.
 */
function scheduleLastAccessFlush(): void {
  lastAccessDirty = true;
  if (flushTimer !== null || flushInteraction !== null) {
    return; // a flush is already pending — coalesce into it
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    // Yield to any gesture still in progress so the snapshot write cannot land
    // inside a scroll frame. InteractionManager is pure JS (a TaskQueue drained
    // via setImmediate) with no native-module dependency, so it is always
    // available — in the app and under the react-native jest preset alike. No
    // availability fallback is needed.
    flushInteraction = InteractionManager.runAfterInteractions(() => {
      flushInteraction = null;
      flushLastAccess();
    });
  }, LASTACCESS_FLUSH_MS);
}

// ─── load ─────────────────────────────────────────────────────────────────────

let loaded = false;

/**
 * Synchronously populate the in-memory index from MMKV.
 *
 * Idempotent: subsequent calls no-op. Returns a resolved promise to keep the
 * existing async caller signature in App.tsx working without changes.
 *
 * Called at module-import time (bottom of this file) so the index is ready
 * before any consumer of `get`/`getFromMemory` runs. App.tsx calls it again
 * inside its mount-time useEffect as a belt-and-suspenders.
 */
export function load(): Promise<void> {
  if (loaded) return Promise.resolve();

  try {
    const raw = mmkv.getString(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, MediaIndexEntry>;
      Object.entries(parsed).forEach(([key, entry]) => {
        indexMap.set(key, entry);
      });
    }
  } catch (err) {
    console.warn('[mediaIndexService] Failed to load index; starting empty.', err);
    indexMap.clear();
  } finally {
    loaded = true;
  }

  return Promise.resolve();
}

// Eager load at module-import time. MMKV mmap + JSON.parse complete
// synchronously in well under one millisecond, so by the time any React
// component imports a media-cache helper, the in-memory index is already hot.
load();

// ─── get ──────────────────────────────────────────────────────────────────────

/**
 * Return the index entry for a media key, or null if not present.
 */
export function get(mediaKey: string): MediaIndexEntry | null {
  return indexMap.get(mediaKey) ?? null;
}

// ─── set ──────────────────────────────────────────────────────────────────────

/**
 * Insert or update an entry in the index and persist to MMKV.
 *
 * Structural write: persists promptly, because the entry carries the on-disk
 * path that makes the cache usable after a restart.
 */
export function set(mediaKey: string, entry: MediaIndexEntry): void {
  indexMap.set(mediaKey, entry);
  persistNow();
}

// ─── delete ───────────────────────────────────────────────────────────────────

/**
 * Remove an entry from the index and persist to MMKV.
 *
 * Structural write: persists promptly, so an evicted (unlinked) file can never
 * be resurrected from a stale snapshot after a restart.
 */
export function deleteEntry(mediaKey: string): void {
  indexMap.delete(mediaKey);
  lastWriteTs.delete(mediaKey);
  persistNow();
}

// ─── touch ────────────────────────────────────────────────────────────────────

/**
 * Update lastAccess for a key.
 *
 * In-memory update is synchronous: `evictIfNeeded` reads `lastAccess` from the
 * map, so LRU ordering stays correct and current the instant this returns.
 *
 * Persistence is deferred and coalesced, and kept off the scroll-critical path
 * entirely. `getFromMemory` calls this on every cache hit and the chat
 * viewability prefetch calls `getFromMemory` up to 11 times per change, so a
 * synchronous whole-map `JSON.stringify` here showed up directly as scroll jank.
 * The per-key 5 s debounce is retained on top, so a repeatedly-touched key does
 * not keep re-arming the flush timer forever.
 *
 * Durability trade-off: `lastAccess` is LRU bookkeeping, not user data. A hard
 * process kill can lose the last few seconds of timestamps, which at worst makes
 * one eviction pass marginally less optimal. Nothing user-visible is lost, and
 * entry paths — the part that matters across restarts — are written promptly by
 * `set`/`deleteEntry`.
 */
export function touch(mediaKey: string): void {
  const entry = indexMap.get(mediaKey);
  if (!entry) return;

  const now = Date.now();
  entry.lastAccess = now;
  indexMap.set(mediaKey, entry);

  const prev = lastWriteTs.get(mediaKey) ?? 0;
  if (now - prev >= TOUCH_DEBOUNCE_MS) {
    lastWriteTs.set(mediaKey, now);
    scheduleLastAccessFlush();
  }
}

// ─── iterate ──────────────────────────────────────────────────────────────────

/**
 * Return an iterator over all [mediaKey, MediaIndexEntry] pairs.
 */
export function iterate(): IterableIterator<[string, MediaIndexEntry]> {
  return indexMap.entries();
}

// ─── evictIfNeeded ────────────────────────────────────────────────────────────

/**
 * If the total cached size exceeds capBytes, evict files in ascending
 * lastAccess order (LRU) until the total drops below 80 % of capBytes.
 *
 * File unlinks are best-effort; index entries are removed regardless.
 * Runs fire-and-forget after each successful download.
 */
export async function evictIfNeeded(capBytes: number): Promise<void> {
  // Sum total size
  let total = 0;
  indexMap.forEach((entry) => { total += entry.size; });

  if (total <= capBytes) return;

  const floor = capBytes * EVICTION_FLOOR_RATIO;

  // Build sorted array: oldest lastAccess first
  const sorted = Array.from(indexMap.entries()).sort(
    ([, a], [, b]) => a.lastAccess - b.lastAccess,
  );

  for (const [key, entry] of sorted) {
    if (total <= floor) break;
    await BlobUtil.fs.unlink(entry.path).catch(() => {});
    total -= entry.size;
    deleteEntry(key);
    console.warn(`[mediaIndexService] Evicted ${key} (${entry.size} bytes); running total: ${total}`);
  }
}

// ─── clearAll ─────────────────────────────────────────────────────────────────

/**
 * Clear the entire index and delete all cached files.
 *
 * After this call:
 *   - indexMap is empty
 *   - mmkv.getString(STORAGE_KEY) returns undefined
 *   - CACHE_ROOT_DIR does not exist (or is empty)
 */
export async function clearAll(): Promise<void> {
  indexMap.clear();
  lastWriteTs.clear();
  // Drop any pending lastAccess flush: its snapshot describes an index that no
  // longer exists, and letting it fire would rewrite the storage key this call
  // just cleared.
  cancelScheduledFlush();
  lastAccessDirty = false;
  try {
    mmkv.clearAll();
  } catch (err) {
    console.warn('[mediaIndexService] MMKV.clearAll failed:', err);
  }
  try {
    await BlobUtil.fs.unlink(CACHE_ROOT_DIR);
  } catch {
    // Directory may not exist yet — ignore
  }
}

// ─── Configurable cap (task 6.1) ──────────────────────────────────────────────

/**
 * Return the effective cache cap in bytes.
 * Reads from MMKV settings; falls back to CACHE_CAP_BYTES (5 GB default).
 * Clamped to [CAP_MIN_BYTES, CAP_MAX_BYTES] (1 GB – 20 GB).
 */
export function getCapBytes(): number {
  try {
    const stored = mmkv.getNumber(CAP_SETTINGS_KEY);
    if (stored == null) return CACHE_CAP_BYTES;
    return Math.max(CAP_MIN_BYTES, Math.min(CAP_MAX_BYTES, stored));
  } catch {
    return CACHE_CAP_BYTES;
  }
}

/**
 * Persist a new cap value to MMKV settings.
 * Clamps to [CAP_MIN_BYTES, CAP_MAX_BYTES].
 * Returns the clamped value that was stored.
 */
export function setCapBytes(bytes: number): number {
  const clamped = Math.max(CAP_MIN_BYTES, Math.min(CAP_MAX_BYTES, bytes));
  try {
    mmkv.set(CAP_SETTINGS_KEY, clamped);
  } catch (err) {
    console.warn('[mediaIndexService] setCapBytes failed:', err);
  }
  return clamped;
}

/**
 * Return the current total size of all cached entries in bytes.
 */
export function getTotalCachedBytes(): number {
  let total = 0;
  indexMap.forEach((entry) => { total += entry.size; });
  return total;
}

// ─── Breakdown (task 7.1) ──────────────────────────────────────────────────────

export interface MediaBreakdown {
  /** Bytes occupied by image/* entries (or .jpg/.jpeg/.png/.webp/.gif extension). */
  image: number;
  /** Bytes occupied by video/* entries (or .mp4/.mov/.webm extension). */
  video: number;
  /** Bytes occupied by audio/* entries (or .mp3/.m4a/.wav/.ogg/.aac extension). */
  audio: number;
  /** Bytes occupied by entries whose type cannot be determined from mime or path. */
  other: number;
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac']);

/**
 * Classify an entry by its MIME type first, falling back to the file extension
 * extracted from the on-disk path. Returns one of 'image' | 'video' | 'audio' | 'other'.
 */
function classifyEntry(entry: MediaIndexEntry): 'image' | 'video' | 'audio' | 'other' {
  const mime = (entry.mime ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  // Extension fallback — strip query strings / fragments and pull the last segment.
  const path = entry.path || '';
  const lastSeg = path.split('/').pop() ?? '';
  const dot = lastSeg.lastIndexOf('.');
  if (dot >= 0) {
    const ext = lastSeg.slice(dot + 1).toLowerCase().split('?')[0].split('#')[0];
    if (IMAGE_EXTS.has(ext)) return 'image';
    if (VIDEO_EXTS.has(ext)) return 'video';
    if (AUDIO_EXTS.has(ext)) return 'audio';
  }
  return 'other';
}

/**
 * Sum cached bytes grouped by media category (image / video / audio / other).
 *
 * Used by StorageSettingsScreen to render a per-category breakdown beneath the
 * used-vs-cap meter. Classification prefers the stored MIME type; when absent
 * (legacy entries written before mime was recorded), falls back to the file
 * extension of the on-disk path. Entries with neither are bucketed under `other`.
 */
export function breakdown(): MediaBreakdown {
  const result: MediaBreakdown = { image: 0, video: 0, audio: 0, other: 0 };
  indexMap.forEach((entry) => {
    const bucket = classifyEntry(entry);
    result[bucket] += entry.size;
  });
  return result;
}
