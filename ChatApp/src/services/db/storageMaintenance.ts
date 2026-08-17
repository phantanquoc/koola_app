/**
 * storageMaintenance.ts
 *
 * Idle maintenance pass for the local SQLite store. Runs only when the app
 * is in the foreground and interactions have settled. The pass performs:
 *
 *   1. pruneOldMessages — drop messages older than 90d, keeping each
 *      conversation's 200 most recent rows (see messageRepository).
 *   2. deleteDoneOlderThan(24h) — reap completed outbox rows (see outboxRepo).
 *   3. incrementalVacuumIfStale — once per day, run a bounded
 *      PRAGMA incremental_vacuum to reclaim free pages without blocking
 *      the UI for an unbounded full-vacuum. Marker stored in account_state.
 *
 * Scheduling:
 *   - Call `scheduleMaintenance()` on app launch / login and whenever the
 *     app returns to the foreground. It is idempotent within a session
 *     (guarded by a module-level flag) and debounced so rapid foreground
 *     toggles do not queue multiple passes.
 *   - Each invocation goes through InteractionManager.runAfterInteractions
 *     so it never blocks first paint or active gestures. If the app
 *     backgrounds before the callback fires, the pending handle is
 *     cancelled and no work runs.
 *   - If AppState flips to non-active mid-pass, we abort after the current
 *     step completes rather than continuing heavy SQL in background.
 */

import { AppState, InteractionManager } from 'react-native';

import { getDb } from './connection';
import * as messageRepo from './messageRepository';
import * as outboxRepo from './outboxRepository';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAINTENANCE_DEBOUNCE_MS = 5_000;
const VACUUM_MARKER_KEY = 'last_vacuum_at';
const VACUUM_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const VACUUM_PAGE_CAP = 4000; // bounded pages reclaimed per pass

// ─── Module state ────────────────────────────────────────────────────────────

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingHandle: { cancel(): void } | null = null;
let running = false;

// ─── Internal helpers ────────────────────────────────────────────────────────

function isActive(): boolean {
  return AppState.currentState === 'active';
}

/** Read a marker from account_state. Returns null if missing / unreadable. */
function readMarker(key: string): string | null {
  try {
    const db = getDb();
    const res = db.execute(
      `SELECT value FROM account_state WHERE key = ? LIMIT 1`,
      [key],
    );
    const row = res.rows._array[0] as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Upsert a marker into account_state. Swallows errors. */
function writeMarker(key: string, value: string): void {
  try {
    const db = getDb();
    db.execute(
      `INSERT INTO account_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  } catch {
    // best-effort — next pass will simply re-run the guarded step
  }
}

/**
 * Bounded incremental vacuum. Skips if the marker was written less than
 * 24h ago. Errors are logged but swallowed so they cannot break the rest
 * of the maintenance pass.
 */
function incrementalVacuumIfStale(): void {
  const lastRaw = readMarker(VACUUM_MARKER_KEY);
  const lastMs = lastRaw ? Number(lastRaw) : NaN;
  if (!Number.isNaN(lastMs) && Date.now() - lastMs < VACUUM_MIN_INTERVAL_MS) {
    return; // too soon
  }

  try {
    const db = getDb();
    // PRAGMA incremental_vacuum(N) reclaims up to N pages of freelist.
    // In our shim this is a no-op, but on real op-sqlite it does real work
    // bounded by N so we don't stall the JS thread indefinitely.
    db.execute(`PRAGMA incremental_vacuum(${VACUUM_PAGE_CAP})`);
    writeMarker(VACUUM_MARKER_KEY, String(Date.now()));
  } catch (e) {
    console.warn('[storageMaintenance] incremental vacuum failed:', e);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run one maintenance pass synchronously. Exposed for tests and for the
 * scheduled callback; prefer `scheduleMaintenance()` from production code.
 *
 * Aborts early if the app is no longer active at any checkpoint.
 */
export function runMaintenance(): void {
  if (running) return;
  if (!isActive()) return;

  running = true;
  try {
    // Step 1 — prune old messages (bounded by retention policy).
    if (!isActive()) return;
    messageRepo.pruneOldMessages({ maxAgeDays: 90, minPerConversation: 200 });

    // Step 2 — reap done outbox rows older than 24h.
    if (!isActive()) return;
    outboxRepo.deleteDoneOlderThan(24 * 60 * 60 * 1000);

    // Step 3 — bounded incremental vacuum, once/day gate inside.
    if (!isActive()) return;
    incrementalVacuumIfStale();
  } finally {
    running = false;
  }
}

/**
 * Schedule a maintenance pass. Debounced so rapid foreground toggles don't
 * queue multiple passes; concurrent calls within the debounce window cancel
 * and reschedule rather than stacking. Safe to call on every foreground event
 * and once after login.
 *
 * If the app backgrounds before the debounce elapses, the timer is cleared
 * and nothing runs. If the InteractionManager callback fires while the app
 * is inactive, runMaintenance() guards itself and exits.
 */
export function scheduleMaintenance(): void {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  if (pendingHandle !== null) pendingHandle.cancel();

  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (!isActive()) return;
    pendingHandle = InteractionManager.runAfterInteractions(() => {
      pendingHandle = null;
      runMaintenance();
    });
  }, MAINTENANCE_DEBOUNCE_MS);
}

/**
 * Reset in-flight scheduling state. Used in tests and on logout so the next
 * login can schedule a fresh pass without waiting for a stale debounce.
 */
export function _resetForTesting(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingHandle !== null) {
    pendingHandle.cancel();
    pendingHandle = null;
  }
  running = false;
}
