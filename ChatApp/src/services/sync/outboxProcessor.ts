/**
 * outboxProcessor.ts
 *
 * Single-flight worker that processes the outbox queue.
 *
 * Design decisions (see design.md):
 *   - Decision 5: Foreground-only execution
 *   - Decision 6: Five trigger sources, single-flight tick
 *   - Decision 7: Per-conversation serial, cross-conversation parallel cap 3, 50ms pacing
 *   - Decision 8: Reply blocking + cascade dead-letter
 *
 * Public API:
 *   tick()          — process one batch of due rows (single-flight)
 *   scheduleTick()  — schedule a tick via InteractionManager (debounced)
 *   start()         — register trigger listeners + periodic backstop
 *   stop()          — remove all listeners + clear interval
 *   pause()         — suspend processing (called before logout wipe)
 *   resume()        — resume processing
 */
import { AppState, AppStateStatus, InteractionManager } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as outboxRepository from '../db/outboxRepository';
import * as messageRepository from '../db/messageRepository';
import { messagesApi } from '../api/apiService';
import { logOutbox } from './outboxLog';

// ─── Types ────────────────────────────────────────────────────────────────────

type Handler = (payload: Record<string, unknown>) => Promise<void>;

interface DispatcherKey {
  op_type: string;
  payload_version: number;
}

// ─── Module-level state ───────────────────────────────────────────────────────

let _isTicking = false;
let _isPaused = false;
let _periodicInterval: ReturnType<typeof setInterval> | null = null;
let _appStateSubscription: { remove: () => void } | null = null;
let _netInfoUnsub: (() => void) | null = null;
let _socketConnectUnsub: (() => void) | null = null;

const PACING_MS = 50;
const PERIODIC_INTERVAL_MS = 30_000;

// ─── Error classifier ─────────────────────────────────────────────────────────

export interface ClassifiedError {
  code: outboxRepository.ErrorCode;
  status?: number;
  hint: string;
  retryable: boolean;
}

const HINT_MAP: Record<string, string> = {
  NETWORK: 'Network unavailable',
  TIMEOUT: 'Request timed out',
  '4XX': 'Client error',
  '5XX': 'Server error',
  '401': 'Authentication required',
  '403': 'Forbidden',
  '404': 'Resource not found',
  '429': 'Rate limit exceeded',
  PARSE: 'Response parse error',
  PARENT_FAILED: 'Parent message failed to send',
  UNSUPPORTED_VERSION: 'Unsupported payload version',
  WATCHDOG_TIMEOUT: 'In-flight too long',
};

export function classifyError(err: unknown): ClassifiedError {
  // AbortError → TIMEOUT
  if (err instanceof Error && err.name === 'AbortError') {
    return { code: 'TIMEOUT', hint: HINT_MAP.TIMEOUT, retryable: true };
  }

  // Network errors (no response)
  if (err instanceof Error && (
    err.message.includes('Network Error') ||
    err.message.includes('network') ||
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ENOTFOUND') ||
    err.message.includes('Failed to fetch')
  )) {
    return { code: 'NETWORK', hint: HINT_MAP.NETWORK, retryable: true };
  }

  // Axios-style error with response
  const axiosErr = err as { response?: { status?: number; headers?: Record<string, string> } };
  if (axiosErr?.response?.status) {
    const status = axiosErr.response.status;

    if (status === 401) {
      return { code: '401', status, hint: HINT_MAP['401'], retryable: true };
    }
    if (status === 403) {
      return { code: '403', status, hint: HINT_MAP['403'], retryable: false };
    }
    if (status === 404) {
      return { code: '404', status, hint: HINT_MAP['404'], retryable: false };
    }
    if (status === 429) {
      return { code: '429', status, hint: HINT_MAP['429'], retryable: true };
    }
    if (status >= 400 && status < 500) {
      return { code: '4XX', status, hint: HINT_MAP['4XX'], retryable: false };
    }
    if (status >= 500) {
      return { code: '5XX', status, hint: HINT_MAP['5XX'], retryable: true };
    }
  }

  // JSON parse error
  if (err instanceof SyntaxError) {
    return { code: 'PARSE', hint: HINT_MAP.PARSE, retryable: false };
  }

  // Default: treat as network error (retryable)
  return { code: 'NETWORK', hint: HINT_MAP.NETWORK, retryable: true };
}

// ─── Dispatcher map ───────────────────────────────────────────────────────────

function makeKey(opType: string, payloadVersion: number): string {
  return `${opType}:${payloadVersion}`;
}

const _handlers = new Map<string, Handler>();

function registerHandler(opType: string, payloadVersion: number, handler: Handler): void {
  _handlers.set(makeKey(opType, payloadVersion), handler);
}

function getHandler(opType: string, payloadVersion: number): Handler | undefined {
  return _handlers.get(makeKey(opType, payloadVersion));
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// send_message handler
registerHandler('send_message', 1, async (payload) => {
  const p = payload as unknown as outboxRepository.SendMessagePayloadV1;

  // Resolve replyTo: if it starts with 'temp_', look up the real id
  let replyTo = p.replyTo ?? null;
  if (replyTo && replyTo.startsWith('temp_')) {
    const clientMessageId = replyTo.replace(/^temp_/, '');
    const parentRow = messageRepository.getById(replyTo);
    if (parentRow) {
      // Row still has temp id — parent not yet confirmed; getDue should have blocked this
      // but handle defensively
      replyTo = replyTo;
    } else {
      // Try to find by clientMessageId
      const byClientId = (messageRepository as unknown as {
        getByClientMessageId?: (id: string) => { id: string } | null;
      }).getByClientMessageId?.(clientMessageId);
      replyTo = byClientId?.id ?? replyTo;
    }
  }

  await messagesApi.send(p.conversationId, {
    content: p.content,
    type: p.type,
    clientMessageId: p.clientMessageId,
    mediaUrl: p.mediaUrl ?? undefined,
    mediaMimeType: p.mediaMimeType ?? undefined,
    mediaSize: p.mediaSize ?? undefined,
    mediaDuration: p.mediaDuration ?? undefined,
    replyTo: replyTo ?? undefined,
  });
});

// react handler (Change B: explicit set/clear semantics via setReaction)
registerHandler('react', 1, async (payload) => {
  const p = payload as unknown as outboxRepository.ReactPayloadV1;
  await messagesApi.setReaction(p.conversationId, p.messageId, p.emoji ?? null);
});

// delete handler
registerHandler('delete', 1, async (payload) => {
  const p = payload as unknown as outboxRepository.DeletePayloadV1;
  await messagesApi.deleteMessage(p.conversationId, p.messageId);
});

// delete_for_me handler
registerHandler('delete_for_me', 1, async (payload) => {
  const p = payload as unknown as outboxRepository.DeleteForMePayloadV1;
  await messagesApi.deleteForMe(p.conversationId, p.messageId);
});

// mark_read handler
registerHandler('mark_read', 1, async (payload) => {
  const p = payload as unknown as outboxRepository.MarkReadPayloadV1;
  await messagesApi.markRead(p.conversationId, new Date(p.upToTimestamp).toISOString());
});

// ─── Dispatch a single row ────────────────────────────────────────────────────

async function dispatchRow(row: outboxRepository.OutboxRow): Promise<void> {
  const handler = getHandler(row.op_type, row.payload_version);

  if (!handler) {
    outboxRepository.markDeadLetter(row.id, {
      code: 'UNSUPPORTED_VERSION',
      status: null,
      hint: `No handler for op_type=${row.op_type} payload_version=${row.payload_version}`,
    });
    return;
  }

  outboxRepository.markInFlight(row.id);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    outboxRepository.markDeadLetter(row.id, { code: 'PARSE', status: null, hint: 'Invalid payload JSON' });
    return;
  }

  try {
    await handler(payload);
    outboxRepository.markDone(row.id);

    // For send_message: confirm the optimistic message row
    if (row.op_type === 'send_message') {
      const p = payload as unknown as outboxRepository.SendMessagePayloadV1;
      // confirmSend is called by the socket ack handler; outbox just marks done
      // The /messages/sync reconciliation handles any missed acks
    }
  } catch (err) {
    const classified = classifyError(err);

    // 404 on non-send ops → silent terminal (resource already gone)
    if (classified.code === '404' && row.op_type !== 'send_message') {
      outboxRepository.markDeadLetter(row.id, {
        code: '404',
        status: classified.status ?? null,
        hint: 'Resource not found — silent terminal',
      });
      return;
    }

    // 403 MESSAGE_TOO_OLD on delete → terminal
    if (classified.code === '403' && row.op_type === 'delete') {
      outboxRepository.markDeadLetter(row.id, {
        code: '403',
        status: classified.status ?? null,
        hint: 'Message too old to delete',
      });
      return;
    }

    if (classified.retryable) {
      outboxRepository.markRetryable(row.id, {
        code: classified.code,
        status: classified.status ?? null,
        hint: classified.hint,
      });
    } else {
      outboxRepository.markDeadLetter(row.id, {
        code: classified.code,
        status: classified.status ?? null,
        hint: classified.hint,
      });

      // Cascade dead_letter for send_message failures
      if (row.op_type === 'send_message') {
        const p = payload as unknown as outboxRepository.SendMessagePayloadV1;
        if (p.clientMessageId) {
          outboxRepository.cascadeDeadLetter(p.clientMessageId);
        }
        // Also mark the optimistic message row as failed
        try {
          messageRepository.markFailed(`temp_${p.clientMessageId}`);
        } catch {
          // ignore — message row may not exist
        }
      }
    }
  }
}

// ─── Threshold constants ──────────────────────────────────────────────────────

const THRESHOLD_INFO = 0.02;   // 2% → info log
const THRESHOLD_ERROR = 0.03;  // 3% → error log
const THRESHOLD_PAUSE = 0.05;  // 5% → auto-pause + rollback log

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Process one batch of due rows.
 * Single-flight: concurrent calls are no-ops.
 * Foreground-only: paused flag prevents processing during logout.
 */
export async function tick(): Promise<void> {
  if (_isTicking || _isPaused) return;
  if (AppState.currentState !== 'active') return;

  _isTicking = true;
  logOutbox('tick_start', {});

  try {
    // Watchdog reset at start of every tick
    outboxRepository.watchdogReset({ now: Date.now() });

    const due = outboxRepository.getDue({ now: Date.now(), conversationLimit: 3 });

    if (due.length === 0) {
      // No work — stop periodic interval if no active rows remain
      if (outboxRepository.countActive() === 0) {
        _stopPeriodicInterval();
      }
      return;
    }

    // Process each due row (one per conversation) with 50ms pacing
    for (let i = 0; i < due.length; i++) {
      if (_isPaused) break;
      await dispatchRow(due[i]);
      if (i < due.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, PACING_MS));
      }
    }

    // Threshold check after processing rows
    _checkThreshold();
  } finally {
    _isTicking = false;
    logOutbox('tick_end', {});
  }
}

/**
 * Check dead-letter rate and emit threshold logs.
 * Auto-pauses the processor at 5%.
 * Suppresses output when sample < 10.
 */
function _checkThreshold(): void {
  const { rate, doneCount, deadLetterCount, sample } =
    outboxRepository.getDeadLetterRate();

  if (sample < 10) return; // insufficient data — suppress

  const snapshot = { rate, doneCount, deadLetterCount, sample };

  if (rate >= THRESHOLD_PAUSE) {
    // 5%+ → rollback only (no threshold:error at this level)
    logOutbox('rollback', { reason: 'dead_letter_rate >= 5%', ...snapshot });
    pause();
  } else if (rate >= THRESHOLD_ERROR) {
    logOutbox('threshold:error', { ...snapshot, threshold: THRESHOLD_ERROR });
  } else if (rate >= THRESHOLD_INFO) {
    logOutbox('threshold:info', { ...snapshot, threshold: THRESHOLD_INFO });
  }
}

/**
 * Schedule a tick via InteractionManager to yield to user gestures.
 * Multiple rapid calls coalesce — only one tick runs at a time.
 */
export function scheduleTick(): void {
  if (_isPaused) return;
  // Guard against environments where InteractionManager is not available (e.g. tests)
  if (!InteractionManager?.runAfterInteractions) {
    tick().catch((err) =>
      console.warn('[outboxProcessor] tick error:', err),
    );
    return;
  }
  InteractionManager.runAfterInteractions(() => {
    tick().catch((err) =>
      console.warn('[outboxProcessor] tick error:', err),
    );
  });
}

// ─── Periodic backstop ────────────────────────────────────────────────────────

function _startPeriodicInterval(): void {
  if (_periodicInterval) return;
  _periodicInterval = setInterval(() => {
    if (outboxRepository.countActive() > 0) {
      scheduleTick();
    } else {
      _stopPeriodicInterval();
    }
  }, PERIODIC_INTERVAL_MS);
}

function _stopPeriodicInterval(): void {
  if (_periodicInterval) {
    clearInterval(_periodicInterval);
    _periodicInterval = null;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Start the processor: register trigger listeners and periodic backstop.
 * Called from App.tsx after initDb when LOCAL_FIRST_SQLITE is on.
 */
export function start(): void {
  if (_appStateSubscription || _netInfoUnsub) {
    // Already started — idempotent
    return;
  }

  _isPaused = false;

  // Trigger 4.1: NetInfo isConnected false→true
  _netInfoUnsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      scheduleTick();
    }
  });

  // Trigger 4.3: AppState active transition
  _appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        scheduleTick();
      }
    },
  );

  // Trigger 4.5: Periodic 30s backstop
  if (outboxRepository.countActive() > 0) {
    _startPeriodicInterval();
  }

  logOutbox('processor_started', {});
}

/**
 * Stop the processor: remove all listeners and clear interval.
 */
export function stop(): void {
  _netInfoUnsub?.();
  _netInfoUnsub = null;
  _appStateSubscription?.remove();
  _appStateSubscription = null;
  _socketConnectUnsub?.();
  _socketConnectUnsub = null;
  _stopPeriodicInterval();
  logOutbox('processor_stopped', {});
}

/**
 * Pause processing. Called before logout wipe (Decision 13).
 * Idempotent — safe to call multiple times.
 */
export function pause(): void {
  _isPaused = true;
  logOutbox('processor_paused', {});
}

/**
 * Resume processing after pause.
 */
export function resume(): void {
  _isPaused = false;
  scheduleTick();
  logOutbox('processor_resumed', {});
}

/**
 * Returns true if the processor is currently paused.
 * Used by the __DEV__ panel to reflect current state.
 */
export function isPaused(): boolean {
  return _isPaused;
}

/**
 * Wire the socket reconnect trigger.
 * Called from syncOrchestrator.wireSyncTriggers() (Phase 4.2).
 * Returns an unwire function.
 */
export function wireSocketReconnectTrigger(
  onConnect: (cb: () => void) => () => void,
): () => void {
  const unsub = onConnect(() => {
    scheduleTick();
  });
  _socketConnectUnsub = unsub;
  return unsub;
}

/**
 * Ensure the periodic backstop interval is running.
 * Called from outboxRepository.enqueue() after a successful insert so that
 * the 30s backstop starts even if start() hasn't been called yet (e.g. during
 * boot before the processor is fully wired).
 * Idempotent — safe to call multiple times.
 */
export function ensurePeriodicInterval(): void {
  if (outboxRepository.countActive() > 0) {
    _startPeriodicInterval();
  }
}

/**
 * Reset module-level state for testing.
 * Called in beforeEach to ensure clean state between tests.
 */
export function _resetStateForTesting(): void {
  _isTicking = false;
  _isPaused = false;
  _stopPeriodicInterval();
  _appStateSubscription?.remove();
  _appStateSubscription = null;
  _netInfoUnsub?.();
  _netInfoUnsub = null;
  _socketConnectUnsub?.();
  _socketConnectUnsub = null;
}
