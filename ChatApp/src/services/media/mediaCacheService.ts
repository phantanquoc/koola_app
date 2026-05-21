import { Image } from 'react-native';
import { getAccessTokenInMemory, refreshAccessTokenInMemory } from '../api/apiService';
import ENV from '../../config/env';

const BlobUtil = require('react-native-blob-util').default;

const CACHE_DIR = `${BlobUtil.fs.dirs.CacheDir}/media-cache`;

// In-memory URI map — avoids async flash on re-mount
const memoryCache = new Map<string, string>();

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

function cacheKeyFromMediaKey(mediaKey: string): string {
  return mediaKey.replace(/[/\\:?*"<>|]/g, '_');
}

/**
 * Synchronous lookup — returns cached URI instantly or null.
 */
export function getFromMemory(mediaKey: string): string | null {
  if (!mediaKey) return null;
  if (mediaKey.startsWith('http') || mediaKey.startsWith('file://')) return mediaKey;
  return memoryCache.get(mediaKey) ?? null;
}

let cacheInitialized = false;

async function ensureCacheDir(): Promise<void> {
  if (cacheInitialized) return;
  const exists = await BlobUtil.fs.isDir(CACHE_DIR);
  if (!exists) {
    await BlobUtil.fs.mkdir(CACHE_DIR);
  }
  cacheInitialized = true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invalidate a specific media key from both memory and disk cache.
 * Use when a resource has been updated (e.g. avatar change).
 */
export async function invalidateKey(mediaKey: string): Promise<void> {
  if (!mediaKey) return;
  memoryCache.delete(mediaKey);
  try {
    await ensureCacheDir();
    const cacheFile = `${CACHE_DIR}/${cacheKeyFromMediaKey(mediaKey)}`;
    const exists = await BlobUtil.fs.exists(cacheFile);
    if (exists) {
      await BlobUtil.fs.unlink(cacheFile);
    }
  } catch {
    // ignore — best effort
  }
}

/**
 * Pre-warm memory cache from disk for a batch of media keys.
 * Call this after loading a list (e.g. conversations) so that
 * subsequent synchronous getFromMemory() calls return instantly.
 */
export async function warmMemoryCache(mediaKeys: string[]): Promise<void> {
  await ensureCacheDir();
  const prefetchPromises: Promise<boolean>[] = [];
  for (const key of mediaKeys) {
    if (!key || memoryCache.has(key)) continue;
    if (key.startsWith('http') || key.startsWith('file://')) continue;
    const cacheFile = `${CACHE_DIR}/${cacheKeyFromMediaKey(key)}`;
    try {
      const exists = await BlobUtil.fs.exists(cacheFile);
      if (exists) {
        const uri = `file://${cacheFile}`;
        memoryCache.set(key, uri);
        // Pre-decode image so RN Image renders instantly without flash
        prefetchPromises.push(Image.prefetch(uri).catch(() => false));
      }
    } catch {
      // skip
    }
  }
  // Wait for all prefetch to complete (image decode into RN cache)
  if (prefetchPromises.length > 0) {
    await Promise.all(prefetchPromises);
  }
}

/**
 * Get a local file URI for a media key.
 * Returns cached file if available, otherwise downloads via backend proxy and caches.
 * Retries up to 3 times with exponential backoff on failure.
 */
export async function getOrDownload(mediaKey: string): Promise<string | null> {
  if (!mediaKey) return null;

  // Already a URL or file path — passthrough
  if (mediaKey.startsWith('http') || mediaKey.startsWith('file://')) {
    return mediaKey;
  }

  await ensureCacheDir();

  const cacheFile = `${CACHE_DIR}/${cacheKeyFromMediaKey(mediaKey)}`;

  // Check cache — verify file is non-empty to avoid returning corrupt downloads
  const exists = await BlobUtil.fs.exists(cacheFile);
  if (exists) {
    const stat = await BlobUtil.fs.stat(cacheFile);
    if (stat && Number(stat.size) > 0) {
      const uri = `file://${cacheFile}`;
      memoryCache.set(mediaKey, uri);
      return uri;
    }
    // Corrupt/empty file — remove and re-download
    await BlobUtil.fs.unlink(cacheFile).catch(() => {});
  }

  let tokenWasRefreshed = false;

  // Download with retry
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const accessToken = getAccessTokenInMemory();
    if (!accessToken) return null;

    const encodedMediaKey = mediaKey
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
    const proxyUrl = `${ENV.API_URL}/media/download/${encodedMediaKey}`;

    if (attempt === 0) {
      console.log('[mediaCacheService] Downloading via proxy for:', mediaKey);
    }

    try {
      const res = await BlobUtil.config({
        path: cacheFile,
        timeout: 120000,
        indicator: false,
        overwrite: true,
      }).fetch('GET', proxyUrl, {
        Authorization: `Bearer ${accessToken}`,
      });
      const status = res.info().status;

      if (status === 200) {
        const fileStat = await BlobUtil.fs.stat(res.path());
        if (fileStat && Number(fileStat.size) > 0) {
          const uri = `file://${res.path()}`;
          memoryCache.set(mediaKey, uri);
          return uri;
        }
        // Empty response body — treat as failure
        await BlobUtil.fs.unlink(cacheFile).catch(() => {});
      }

      // Non-200 — remove partial file
      console.warn(`[mediaCacheService] Non-200 status: ${status} (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await BlobUtil.fs.unlink(cacheFile).catch(() => {});

      if (status === 401 && !tokenWasRefreshed) {
        tokenWasRefreshed = true;
        const refreshedToken = await refreshAccessTokenInMemory();
        if (!refreshedToken) return null;
        continue;
      }

      // Don't retry on 4xx (client errors) — only on 5xx/network issues
      if (status >= 400 && status < 500) return null;
    } catch (err: unknown) {
      console.warn(`[mediaCacheService] Download error (attempt ${attempt + 1}/${MAX_RETRIES}):`, (err as Error)?.message || err);
      await BlobUtil.fs.unlink(cacheFile).catch(() => {});
    }

    // Wait before retry (skip delay on last attempt)
    if (attempt < MAX_RETRIES - 1) {
      await delay(RETRY_DELAYS[attempt]);
    }
  }

  return null;
}

/**
 * Clear the entire media cache.
 */
export async function clearCache(): Promise<void> {
  try {
    await BlobUtil.fs.unlink(CACHE_DIR);
    cacheInitialized = false;
    memoryCache.clear();
  } catch {
    // ignore
  }
}
