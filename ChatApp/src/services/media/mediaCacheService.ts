import { getAccessTokenInMemory } from '../api/apiService';
import ENV from '../../config/env';

const BlobUtil = require('react-native-blob-util').default;

const CACHE_DIR = `${BlobUtil.fs.dirs.CacheDir}/media-cache`;

// In-memory URI map — avoids async flash on re-mount
const memoryCache = new Map<string, string>();

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

/**
 * Get a local file URI for a media key.
 * Returns cached file if available, otherwise downloads via backend proxy and caches.
 */
export async function getOrDownload(mediaKey: string): Promise<string | null> {
  if (!mediaKey) return null;

  // Already a URL or file path — passthrough
  if (mediaKey.startsWith('http') || mediaKey.startsWith('file://')) {
    return mediaKey;
  }

  await ensureCacheDir();

  const cacheFile = `${CACHE_DIR}/${cacheKeyFromMediaKey(mediaKey)}`;

  // Check cache
  const exists = await BlobUtil.fs.exists(cacheFile);
  if (exists) {
    const uri = `file://${cacheFile}`;
    memoryCache.set(mediaKey, uri);
    return uri;
  }

  // Build proxy URL — backend enforces auth via ?token=<JWT>
  const accessToken = getAccessTokenInMemory();
  if (!accessToken) return null;

  const encodedMediaKey = mediaKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  const proxyUrl = `${ENV.API_URL}/media/download/${encodedMediaKey}?token=${accessToken}`;

  console.log('[mediaCacheService] Downloading via proxy for:', mediaKey);

  try {
    const res = await BlobUtil.config({
      path: cacheFile,
      timeout: 120000,
      indicator: false,
      overwrite: true,
    }).fetch('GET', proxyUrl);
    const status = res.info().status;
    console.log('[mediaCacheService] Response status:', status, 'path:', res.path());
    if (status === 200) {
      const uri = `file://${res.path()}`;
      memoryCache.set(mediaKey, uri);
      return uri;
    }
    // Non-200 — remove partial file
    console.warn('[mediaCacheService] Non-200 status:', status);
    await BlobUtil.fs.unlink(cacheFile).catch(() => {});
    return null;
  } catch (err: unknown) {
    console.warn('[mediaCacheService] Download error:', (err as Error)?.message || err);
    await BlobUtil.fs.unlink(cacheFile).catch(() => {});
    return null;
  }
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
