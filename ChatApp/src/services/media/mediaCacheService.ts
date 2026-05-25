import { getAccessTokenInMemory, refreshAccessTokenInMemory } from '../api/apiService';
import ENV from '../../config/env';
import * as mediaIndexService from './mediaIndexService';
import { CACHE_ROOT_DIR } from './mediaIndexService';

const BlobUtil = require('react-native-blob-util').default;

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff (ms)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a mediaKey to an absolute disk path under CACHE_ROOT_DIR.
 *
 * Path-mirror layout: uploads/<userId>/<uuid>.jpg becomes
 *   ${CACHE_ROOT_DIR}/uploads/<userId>/<uuid>.jpg
 *
 * Only FS-illegal characters (:?*"<>|) are sanitized to '_'.
 * Forward slashes are intentionally preserved so the mapping is reversible.
 */
function mediaKeyToDiskPath(mediaKey: string): string {
  const sanitized = mediaKey.replace(/[:?*"<>|]/g, '_');
  return `${CACHE_ROOT_DIR}/${sanitized}`;
}

let cacheRootInitialized = false;

async function ensureCacheDir(): Promise<void> {
  if (cacheRootInitialized) return;
  const exists = await BlobUtil.fs.isDir(CACHE_ROOT_DIR);
  if (!exists) {
    await BlobUtil.fs.mkdir(CACHE_ROOT_DIR);
  }
  cacheRootInitialized = true;
}

/**
 * Recursively create the parent directory of a target file path.
 * Required because path-mirror layout may nest files several levels deep.
 */
async function ensureParentDir(filePath: string): Promise<void> {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash <= 0) return;
  const parentDir = filePath.substring(0, lastSlash);
  const exists = await BlobUtil.fs.isDir(parentDir);
  if (!exists) {
    await BlobUtil.fs.mkdir(parentDir);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── In-flight dedupe map ─────────────────────────────────────────────────────

/**
 * Tracks pending download promises by mediaKey.
 * When two components request the same uncached key in the same frame,
 * the second caller receives the first caller's promise instead of
 * starting a duplicate network request.
 */
const inFlight = new Map<string, Promise<string | null>>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous lookup — returns a cached file:// URI instantly or null.
 *
 * On a hit, touch() is called to update lastAccess (debounced to avoid
 * excessive MMKV writes during list scrolling).
 */
export function getFromMemory(mediaKey: string): string | null {
  if (!mediaKey) return null;
  if (mediaKey.startsWith('http') || mediaKey.startsWith('file://')) return mediaKey;

  const entry = mediaIndexService.get(mediaKey);
  if (entry) {
    mediaIndexService.touch(mediaKey);
    return `file://${entry.path}`;
  }
  return null;
}

/**
 * Pre-warm memory cache from disk for a batch of media keys.
 *
 * This function is intentionally a no-op: the in-memory index is hydrated
 * once at App mount via mediaIndexService.load(), so getFromMemory() returns
 * synchronous hits without any per-batch warm-up loop. The export is preserved
 * so existing callers (useMessages.ts and any future consumers) do not need
 * to change their imports.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function warmMemoryCache(_keys: string[]): Promise<void> {}

/**
 * Get a local file:// URI for a media key.
 *
 * Returns a cached file if available, otherwise downloads via the backend
 * proxy and registers the result in the persistent index.
 *
 * Concurrent requests for the same key collapse into a single download via
 * the inFlight dedupe map.
 *
 * Retry policy: up to 3 attempts with 1s/2s/4s exponential backoff.
 * 401 triggers a single token refresh and immediate retry.
 * 4xx (other than 401) are not retried.
 */
export async function getOrDownload(mediaKey: string): Promise<string | null> {
  if (!mediaKey) return null;

  // Passthrough for absolute URIs
  if (mediaKey.startsWith('http') || mediaKey.startsWith('file://')) {
    return mediaKey;
  }

  // Return existing in-flight promise if one is already running for this key
  const existing = inFlight.get(mediaKey);
  if (existing) return existing;

  // Build the actual work as an inner async IIFE so we can assign the promise
  // to inFlight before any await, ensuring concurrent callers always get the
  // same promise object.
  const promise = (async (): Promise<string | null> => {
    // ── Index hit path ──────────────────────────────────────────────────────
    const indexEntry = mediaIndexService.get(mediaKey);
    if (indexEntry) {
      const fileExists = await BlobUtil.fs.exists(indexEntry.path);
      if (fileExists) {
        mediaIndexService.touch(mediaKey);
        return `file://${indexEntry.path}`;
      }
      // Stale index entry — file was removed externally; fall through to download
      mediaIndexService.deleteEntry(mediaKey);
    }

    // ── Download path ───────────────────────────────────────────────────────
    await ensureCacheDir();
    const diskPath = mediaKeyToDiskPath(mediaKey);
    await ensureParentDir(diskPath);

    let tokenWasRefreshed = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const accessToken = getAccessTokenInMemory();
      if (!accessToken) return null;

      const encodedMediaKey = mediaKey
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const proxyUrl = `${ENV.API_URL}/media/download/${encodedMediaKey}`;

      if (attempt === 0) {
        console.log('[mediaCacheService] Downloading via proxy for:', mediaKey);
      }

      try {
        const res = await BlobUtil.config({
          path: diskPath,
          timeout: 120000,
          indicator: false,
          overwrite: true,
        }).fetch('GET', proxyUrl, {
          Authorization: `Bearer ${accessToken}`,
        });
        const status = res.info().status;

        if (status === 200) {
          const fileStat = await BlobUtil.fs.stat(res.path());
          const size = fileStat ? Number(fileStat.size) : 0;
          if (size > 0) {
            // Register in persistent index
            mediaIndexService.set(mediaKey, {
              path: diskPath,
              size,
              addedAt: Date.now(),
              lastAccess: Date.now(),
            });
            // Fire-and-forget LRU eviction check using configurable cap
            mediaIndexService.evictIfNeeded(mediaIndexService.getCapBytes()).catch(() => {});
            return `file://${diskPath}`;
          }
          // Empty response body — treat as failure
          await BlobUtil.fs.unlink(diskPath).catch(() => {});
        }

        // Non-200 — remove partial file
        console.warn(
          `[mediaCacheService] Non-200 status: ${status} (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await BlobUtil.fs.unlink(diskPath).catch(() => {});

        if (status === 401 && !tokenWasRefreshed) {
          tokenWasRefreshed = true;
          const refreshedToken = await refreshAccessTokenInMemory();
          if (!refreshedToken) return null;
          continue;
        }

        // Don't retry on 4xx (client errors) — only on 5xx/network issues
        if (status >= 400 && status < 500) return null;
      } catch (err: unknown) {
        console.warn(
          `[mediaCacheService] Download error (attempt ${attempt + 1}/${MAX_RETRIES}):`,
          (err as Error)?.message || err,
        );
        await BlobUtil.fs.unlink(diskPath).catch(() => {});
      }

      // Wait before retry (skip delay on last attempt)
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAYS[attempt]);
      }
    }

    return null;
  })();

  inFlight.set(mediaKey, promise);
  promise.finally(() => inFlight.delete(mediaKey));

  return promise;
}

/**
 * Invalidate a specific media key from both the index and disk.
 * Use when a resource has been updated (e.g. avatar change).
 */
export async function invalidateKey(mediaKey: string): Promise<void> {
  if (!mediaKey) return;
  try {
    const entry = mediaIndexService.get(mediaKey);
    if (entry) {
      await BlobUtil.fs.unlink(entry.path).catch(() => {});
    }
    mediaIndexService.deleteEntry(mediaKey);
  } catch {
    // ignore — best effort
  }
}

/**
 * Clear the entire media cache (index + all files on disk).
 * Delegates to mediaIndexService.clearAll().
 */
export async function clearCache(): Promise<void> {
  cacheRootInitialized = false;
  await mediaIndexService.clearAll();
}
