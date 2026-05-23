/**
 * mediaIndexService — AsyncStorage-backed persistent index for the media cache.
 *
 * Storage key:     'media-index:entries'
 * Cache root:      DocumentDir/MediaCache
 * LRU cap:         1 GB (CACHE_CAP_BYTES)
 * Eviction floor:  80 % of cap (~800 MB)
 * lastAccess debounce: 5 s per key (TOUCH_DEBOUNCE_MS)
 *
 * Design notes:
 *   - The in-memory `indexMap` is the source of truth for synchronous reads
 *     (getFromMemory / get / touch). It is hydrated by load() from AsyncStorage
 *     during App mount, before any media component renders.
 *   - Writes update `indexMap` synchronously and schedule a fire-and-forget
 *     AsyncStorage write via `persistMap()`. Concurrent writes are coalesced
 *     so we never have more than one AsyncStorage round-trip in flight.
 *   - AsyncStorage was chosen over MMKV because MMKV v2.x's bridge install
 *     path is incompatible with React Native New Architecture (Fabric +
 *     TurboModules), which is enabled in this project. Synchronous-read
 *     value of MMKV is preserved by keeping the in-memory mirror.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BlobUtil = require('react-native-blob-util').default;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Root directory for all persistent cached media files. */
export const CACHE_ROOT_DIR: string =
  `${BlobUtil.fs.dirs.DocumentDir}/MediaCache`;

/** Maximum total cache size before LRU eviction triggers (1 GB). */
export const CACHE_CAP_BYTES = 1024 * 1024 * 1024; // 1 GB

/** Eviction target: stop evicting once total drops below this fraction of cap. */
const EVICTION_FLOOR_RATIO = 0.8;

/** Minimum milliseconds between AsyncStorage writes for the same key on touch(). */
const TOUCH_DEBOUNCE_MS = 5000;

/** AsyncStorage key holding the serialized index. */
const STORAGE_KEY = 'media-index:entries';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaIndexEntry {
  path: string;
  size: number;
  mime?: string;
  addedAt: number;
  lastAccess: number;
}

// ─── In-memory mirror ─────────────────────────────────────────────────────────

/** In-memory mirror of the AsyncStorage contents. Populated by load(). */
const indexMap = new Map<string, MediaIndexEntry>();

/**
 * Per-key timestamp of the last persist write performed by touch().
 * Used to debounce writes when the same key is accessed repeatedly.
 */
const lastWriteTs = new Map<string, number>();

// ─── Persistence helpers (fire-and-forget, coalesced) ─────────────────────────

let persistInFlight = false;
let persistDirty = false;

/**
 * Schedule an AsyncStorage write of the current indexMap.
 *
 * Coalesces concurrent calls: if a write is already in progress, the dirty
 * flag is set and a follow-up write runs after the current one completes.
 * This guarantees the persisted state eventually reflects the latest in-memory
 * state without serializing every single mutation through AsyncStorage.
 */
function persistMap(): void {
  if (persistInFlight) {
    persistDirty = true;
    return;
  }
  persistInFlight = true;
  persistDirty = false;

  // Serialize a snapshot synchronously so concurrent mutations after this
  // point fall into the dirty path and trigger another write.
  const snapshot: Record<string, MediaIndexEntry> = {};
  indexMap.forEach((entry, key) => {
    snapshot[key] = entry;
  });
  const serialized = JSON.stringify(snapshot);

  AsyncStorage.setItem(STORAGE_KEY, serialized)
    .catch((err) => {
      console.warn('[mediaIndexService] AsyncStorage.setItem failed:', err);
    })
    .finally(() => {
      persistInFlight = false;
      if (persistDirty) {
        // Re-snapshot to capture mutations that happened during the previous write.
        persistMap();
      }
    });
}

// ─── load ─────────────────────────────────────────────────────────────────────

let loaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Populate the in-memory index from AsyncStorage.
 *
 * Idempotent: subsequent calls return the same in-flight promise (or resolve
 * immediately if already loaded). Called by App.tsx inside its mount-time
 * useEffect, before any media component can render.
 */
export function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

// ─── get ──────────────────────────────────────────────────────────────────────

/**
 * Return the index entry for a media key, or null if not present.
 */
export function get(mediaKey: string): MediaIndexEntry | null {
  return indexMap.get(mediaKey) ?? null;
}

// ─── set ──────────────────────────────────────────────────────────────────────

/**
 * Insert or update an entry in the index and schedule a persist.
 */
export function set(mediaKey: string, entry: MediaIndexEntry): void {
  indexMap.set(mediaKey, entry);
  persistMap();
}

// ─── delete ───────────────────────────────────────────────────────────────────

/**
 * Remove an entry from the index and schedule a persist.
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
 * This prevents a burst of AsyncStorage writes when scrolling a list of
 * cached images.
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
 *   - AsyncStorage.getItem(STORAGE_KEY) returns null
 *   - CACHE_ROOT_DIR does not exist (or is empty)
 */
export async function clearAll(): Promise<void> {
  indexMap.clear();
  lastWriteTs.clear();
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  try {
    await BlobUtil.fs.unlink(CACHE_ROOT_DIR);
  } catch {
    // Directory may not exist yet — ignore
  }
}
