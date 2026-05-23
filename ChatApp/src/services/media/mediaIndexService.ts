/**
 * mediaIndexService — MMKV-backed persistent index for the media cache.
 *
 * Storage:         MMKV instance id 'media-index', key 'entries'
 * Cache root:      DocumentDir/MediaCache
 * LRU cap:         1 GB (CACHE_CAP_BYTES)
 * Eviction floor:  80 % of cap (~800 MB)
 * lastAccess debounce: 5 s per key (TOUCH_DEBOUNCE_MS)
 *
 * Design notes:
 *   - MMKV reads are synchronous (mmap-backed) and complete in well under one
 *     millisecond. The in-memory `indexMap` is hydrated from MMKV at module
 *     import time (top-level statement at the bottom of the file), which runs
 *     before any React component renders. As a result, `getFromMemory` returns
 *     a hit on the very first frame after a process restart, eliminating the
 *     Blurhash flash that AsyncStorage's async hydration left behind.
 *   - Writes update `indexMap` synchronously and persist via MMKV.set(). Touch
 *     writes are debounced per-key (5s) so list-scroll bursts don't translate
 *     into hundreds of mmap flushes per second.
 *   - Requires React Native New Architecture (TurboModules + Fabric), which is
 *     enabled in this project (see android/gradle.properties).
 */
import { MMKV } from 'react-native-mmkv';

const BlobUtil = require('react-native-blob-util').default;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Root directory for all persistent cached media files. */
export const CACHE_ROOT_DIR: string =
  `${BlobUtil.fs.dirs.DocumentDir}/MediaCache`;

/** Maximum total cache size before LRU eviction triggers (1 GB). */
export const CACHE_CAP_BYTES = 1024 * 1024 * 1024; // 1 GB

/** Eviction target: stop evicting once total drops below this fraction of cap. */
const EVICTION_FLOOR_RATIO = 0.8;

/** Minimum milliseconds between MMKV writes for the same key on touch(). */
const TOUCH_DEBOUNCE_MS = 5000;

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
 * MMKV.set is synchronous and mmap-backed, so a full snapshot write of even
 * a few thousand entries completes in well under one millisecond. No need for
 * coalescing or async batching like the previous AsyncStorage implementation.
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
 */
export function set(mediaKey: string, entry: MediaIndexEntry): void {
  indexMap.set(mediaKey, entry);
  persistMap();
}

// ─── delete ───────────────────────────────────────────────────────────────────

/**
 * Remove an entry from the index and persist to MMKV.
 */
export function deleteEntry(mediaKey: string): void {
  indexMap.delete(mediaKey);
  lastWriteTs.delete(mediaKey);
  persistMap();
}

// ─── touch ────────────────────────────────────────────────────────────────────

/**
 * Update lastAccess for a key.
 *
 * Persists only if the previous write for this key was more than
 * TOUCH_DEBOUNCE_MS ago; otherwise updates only the in-memory Map.
 * This prevents a burst of MMKV writes when scrolling a list of cached
 * images.
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
    persistMap();
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
