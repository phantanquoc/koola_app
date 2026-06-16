/**
 * syncOrchestrator.ts
 *
 * Drives incremental delta sync between the backend and the local SQLite store.
 *
 * Entry points:
 *   syncOnForeground()          — called when app returns to foreground
 *   syncOnReconnect()           — called when socket reconnects
 *   syncOnOpen(conversationId)  — called when a ChatScreen mounts
 *
 * All three funnel into runDelta(), which:
 *   1. Checks the freshness window (default 60 s) — skips if cursor is recent
 *   2. Paginates GET /messages/sync until hasMore = false
 *   3. Upserts each page into messageRepository inside a transaction
 *   4. Advances the global cursor only after all pages commit
 *   5. Retries with exponential backoff (cap 30 s) on transient failures
 *
 * Task 4.8 — AsyncStorage migration:
 *   On first run, if sync_state has no 'global' cursor but AsyncStorage has
 *   'last_sync_at', the value is migrated into SQLite and the AS key deleted.
 */

import { AppState, AppStateStatus } from 'react-native';
import { messagesApi } from '../api/apiService';
import * as messageRepository from '../db/messageRepository';
import * as syncStateRepository from '../db/syncStateRepository';
import { asyncStorage } from '../storage/asyncStorage';
import { socketService } from '../socket/SocketService';
import { scheduleTick as outboxScheduleTick } from './outboxProcessor';

// ─── Config ───────────────────────────────────────────────────────────────────

const FRESHNESS_WINDOW_MS = 60_000; // 60 s — skip sync if cursor is this recent
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

// ─── Dogfooding metrics (task 5.9) ────────────────────────────────────────────

let _syncAttempts = 0;
let _syncErrors = 0;

function logSyncMetrics(ok: boolean, durationMs: number): void {
  _syncAttempts++;
  if (!ok) _syncErrors++;
  const errorRate = _syncAttempts > 0
    ? ((_syncErrors / _syncAttempts) * 100).toFixed(1)
    : '0.0';
  console.log(
    `[PERF syncOrchestrator] ok=${ok} durationMs=${durationMs} attempts=${_syncAttempts} errorRate=${errorRate}%`,
  );
}

// ─── State ────────────────────────────────────────────────────────────────────

let _isRunning = false;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryAttempt = 0;
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let _socketConnectUnsub: (() => void) | null = null;
let _migrationDone = false;

// ─── AsyncStorage cursor migration (task 4.8) ─────────────────────────────────

async function migrateAsyncStorageCursor(): Promise<void> {
  if (_migrationDone) return;
  _migrationDone = true;

  try {
    const existing = syncStateRepository.getCursor('global');
    if (existing) return; // already migrated

    const legacyValue = await asyncStorage.getLastSyncAt();
    if (!legacyValue) return;

    syncStateRepository.setCursor('global', legacyValue);
    // Delete the AsyncStorage key after successful migration
    await AsyncStorage_removeLastSyncAt();
    console.log('[syncOrchestrator] Migrated lastSyncAt from AsyncStorage to SQLite');
  } catch (err) {
    console.warn('[syncOrchestrator] cursor migration failed (non-fatal):', err);
  }
}

/**
 * Remove the legacy lastSyncAt key from AsyncStorage.
 * Isolated here so it can be mocked in tests.
 */
async function AsyncStorage_removeLastSyncAt(): Promise<void> {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  await AsyncStorage.removeItem('last_sync_at');
}

// ─── Core delta worker ────────────────────────────────────────────────────────

/**
 * Run a full delta sync: paginate /messages/sync until hasMore = false,
 * upsert each page, then advance the cursor.
 *
 * Returns true if sync completed successfully, false on error.
 */
async function runDelta(opts: { force?: boolean } = {}): Promise<boolean> {
  await migrateAsyncStorageCursor();

  const cursor = syncStateRepository.getCursor('global');
  const since = cursor ?? new Date(0).toISOString();

  // Freshness check — skip if cursor is recent enough (unless forced)
  if (!opts.force && cursor) {
    const cursorMs = new Date(cursor).getTime();
    if (Date.now() - cursorMs < FRESHNESS_WINDOW_MS) {
      return true; // fresh enough, skip
    }
  }

  const t0 = Date.now();
  try {
    let pageCursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const data = await messagesApi.sync(since, pageCursor, 100);

      if (data.items.length > 0) {
        // Map API response shape to MessageInput
        const inputs = data.items.map((msg: any) => ({
          id: String(msg._id ?? msg.id ?? ''),
          conversationId: String(msg.conversationId ?? ''),
          senderId: String(msg.senderId?._id ?? msg.senderId ?? ''),
          clientMessageId: msg.clientMessageId ?? null,
          type: msg.type ?? 'text',
          content: msg.content ?? '',
          mediaKey: msg.mediaUrl ?? null,
          mediaMimeType: msg.mediaMimeType ?? null,
          mediaSize: msg.mediaSize ?? null,
          mediaDuration: msg.mediaDuration ?? null,
          mediaThumbnailKey: msg.mediaThumbnailKey ?? null,
          imageWidth: msg.imageWidth ?? null,
          imageHeight: msg.imageHeight ?? null,
          blurhash: msg.blurhash ?? null,
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt ?? msg.createdAt,
          status: msg.status ?? 'sent',
          deleted: Boolean(msg.deleted),
          deletedFor: Array.isArray(msg.deletedFor) ? msg.deletedFor : [],
          readBy: Array.isArray(msg.readBy) ? msg.readBy : [],
          reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
          replyTo: msg.replyTo ?? null,
          replyToPreview: msg.replyToPreview ?? null,
        }));

        messageRepository.upsertMany(inputs);
      }

      hasMore = data.hasMore;
      pageCursor = data.nextCursor ?? undefined;
    }

    // Advance cursor only after all pages committed
    syncStateRepository.setCursor('global', new Date().toISOString());
    _retryAttempt = 0;
    logSyncMetrics(true, Date.now() - t0);
    return true;
  } catch (err) {
    console.error('[syncOrchestrator] sync error:', err);
    logSyncMetrics(false, Date.now() - t0);
    return false;
  }
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

function scheduleRetry(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }

  const delay = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, _retryAttempt),
    BACKOFF_CAP_MS,
  );
  _retryAttempt++;

  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    const ok = await runDelta();
    if (!ok) scheduleRetry();
  }, delay);
}

function cancelRetry(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  _retryAttempt = 0;
}

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Trigger sync when the app returns to foreground.
 * Cancels any pending retry (foreground supersedes backoff).
 */
export async function syncOnForeground(): Promise<void> {
  cancelRetry();
  if (_isRunning) return;
  _isRunning = true;
  try {
    const ok = await runDelta();
    if (!ok) scheduleRetry();
  } finally {
    _isRunning = false;
  }
}

/**
 * Trigger sync when the socket reconnects.
 * Uses force=true to bypass the freshness window (reconnect implies gap).
 */
export async function syncOnReconnect(): Promise<void> {
  cancelRetry();
  if (_isRunning) return;
  _isRunning = true;
  try {
    const ok = await runDelta({ force: true });
    if (!ok) scheduleRetry();
  } finally {
    _isRunning = false;
  }
}

/**
 * Trigger sync when a ChatScreen mounts for a specific conversation.
 * Respects the freshness window — no-ops if cursor is recent.
 */
export async function syncOnOpen(_conversationId: string): Promise<void> {
  if (_isRunning) return;
  _isRunning = true;
  try {
    const ok = await runDelta();
    if (!ok) scheduleRetry();
  } finally {
    _isRunning = false;
  }
}

// ─── Wiring: AppState + socket connect (task 4.3) ────────────────────────────

/**
 * Wire AppState changes and socket reconnect events.
 * Call once from AuthContext after login/session restore.
 * Returns an unwire function for logout cleanup.
 *
 * Idempotent: if already wired, returns a no-op unwire without registering
 * duplicate listeners. This prevents double-sync on re-login (Bug #7).
 */
export function wireSyncTriggers(): () => void {
  // Guard: already wired — return no-op so callers can safely call twice
  if (_appStateSubscription || _socketConnectUnsub) {
    return () => {};
  }

  // AppState: foreground trigger
  _appStateSubscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') {
        syncOnForeground().catch((err) =>
          console.warn('[syncOrchestrator] foreground sync error:', err),
        );
        // Phase 4.3: also trigger outbox processor on foreground
        outboxScheduleTick();
      }
    },
  );

  // Socket: reconnect trigger
  const onConnect = () => {
    syncOnReconnect().catch((err) =>
      console.warn('[syncOrchestrator] reconnect sync error:', err),
    );
    // Phase 4.2: also trigger outbox processor on socket reconnect
    outboxScheduleTick();
  };
  socketService.on('connect', onConnect);
  _socketConnectUnsub = () => socketService.off('connect', onConnect);

  return () => {
    _appStateSubscription?.remove();
    _appStateSubscription = null;
    _socketConnectUnsub?.();
    _socketConnectUnsub = null;
    cancelRetry();
    _isRunning = false;
    _migrationDone = false;
  };
}
