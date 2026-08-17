/**
 * mediaPreloader.ts
 *
 * Socket-driven media preloader (task 6.3).
 *
 * Subscribes to `new_message` socket events. For image/video messages that
 * are not yet cached, enqueues a low-priority background download via
 * mediaCacheService.getOrDownload with a small concurrency cap (2 parallel).
 *
 * Data-saver toggle (task 6.4):
 *   Reads a `data_saver` flag from MMKV settings. When on, skips preload
 *   entirely. The flag is also checked against NetInfo's isConnectionExpensive
 *   (metered connection) — preload is skipped on metered connections when
 *   data saver is enabled.
 *
 * Usage:
 *   Call wireMediaPreloader() once after login.
 *   Returns an unwire function for logout cleanup.
 */

import { MMKV } from 'react-native-mmkv';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { socketService } from '../socket/SocketService';
import { getFromMemory, getOrDownload } from './mediaCacheService';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;
const DATA_SAVER_KEY = 'data_saver';

// ─── MMKV settings instance ───────────────────────────────────────────────────

const settingsMmkv = new MMKV({ id: 'app-settings' });

// ─── State ────────────────────────────────────────────────────────────────────

let _activeDownloads = 0;
let _queue: string[] = [];
let _unwireHandler: (() => void) | null = null;
// Live network state from NetInfo subscription. Updated on every connectivity
// change so the metered-network gate reacts without app restart.
let _netState: { isConnectionExpensive: boolean } = { isConnectionExpensive: false };

// ─── Data-saver helpers (task 6.4) ────────────────────────────────────────────

/**
 * Returns true when data-saver mode is enabled in settings.
 */
export function isDataSaverEnabled(): boolean {
  try {
    return settingsMmkv.getBoolean(DATA_SAVER_KEY) === true;
  } catch {
    return false;
  }
}

/**
 * Set the data-saver toggle.
 */
export function setDataSaver(enabled: boolean): void {
  try {
    settingsMmkv.set(DATA_SAVER_KEY, enabled);
  } catch (err) {
    console.warn('[mediaPreloader] setDataSaver failed:', err);
  }
}

// ─── Queue processor ──────────────────────────────────────────────────────────

function processQueue(): void {
  while (_activeDownloads < MAX_CONCURRENT && _queue.length > 0) {
    const mediaKey = _queue.shift()!;
    _activeDownloads++;
    getOrDownload(mediaKey)
      .catch((err) => {
        console.warn('[mediaPreloader] preload failed for', mediaKey, err);
      })
      .finally(() => {
        _activeDownloads--;
        processQueue();
      });
  }
}

function enqueue(mediaKey: string): void {
  if (!mediaKey) return;
  // Skip if already cached
  if (getFromMemory(mediaKey)) return;
  // Skip if already queued
  if (_queue.includes(mediaKey)) return;
  _queue.push(mediaKey);
  processQueue();
}

// ─── Socket event handler ─────────────────────────────────────────────────────

type NewMessageData = {
  message?: Record<string, unknown>;
  [key: string]: unknown;
};

function handleNewMessage(data: unknown): void {
  // Skip preload only when data saver is on AND the connection is metered.
  // When data saver is off, preload on all networks (existing behavior).
  if (isDataSaverEnabled() && _netState.isConnectionExpensive) return;

  const msg = ((data as NewMessageData).message ?? data) as Record<string, unknown>;
  const type = String(msg.type ?? '');
  const mediaKey = String(msg.mediaUrl ?? msg.mediaKey ?? '');

  if (!mediaKey) return;
  if (type !== 'image' && type !== 'video') return;

  enqueue(mediaKey);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wire the preloader to socket events.
 * Safe to call multiple times — subsequent calls are no-ops until unwired.
 * Returns an unwire function.
 */
export function wireMediaPreloader(): () => void {
  if (_unwireHandler) return () => {};

  const handler = handleNewMessage as (...args: unknown[]) => void;
  socketService.on('new_message', handler);

  // Subscribe to NetInfo so the metered-network gate updates live.
  // Initial fetch seeds _netState before any events arrive.
  let netUnsub: (() => void) | null = null;
  NetInfo.fetch()
    .then((state: NetInfoState) => {
      _netState.isConnectionExpensive =
        'isConnectionExpensive' in state && state.isConnectionExpensive === true;
    })
    .catch(() => {/* best-effort */});
  // addEventListener returns a subscription function that IS the unsubscribe.
  netUnsub = NetInfo.addEventListener((state: NetInfoState) => {
    _netState.isConnectionExpensive =
      'isConnectionExpensive' in state && state.isConnectionExpensive === true;
  });

  _unwireHandler = () => {
    socketService.off('new_message', handler);
    if (netUnsub) {
      netUnsub();
      netUnsub = null;
    }
    _queue = [];
    _activeDownloads = 0;
    _netState = { isConnectionExpensive: false };
    _unwireHandler = null;
  };

  return _unwireHandler;
}
