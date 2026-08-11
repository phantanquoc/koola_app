/**
 * invalidationBroadcaster.ts
 *
 * In-process pub/sub for SQLite row mutations.
 * Repositories call `notify(conversationId)` after any write.
 * UI hooks call `subscribe(conversationId, callback)` to react to changes.
 *
 * Coalescing: multiple notifications within one animation frame are collapsed
 * into a single callback invocation to avoid redundant re-queries.
 */

export interface InvalidationPayload {
  conversationId: string;
  kind: 'insert' | 'update' | 'delete' | 'reaction' | 'ack' | 'batch';
  messageIds: string[];
  orderChanged: boolean;
}

type Callback = (payload: InvalidationPayload | undefined) => void;

// Map from conversationId → Set of callbacks
const subscribers = new Map<string, Set<Callback>>();

// Pending notification map — conversationId → payload (undefined for legacy full reload)
const pending = new Map<string, InvalidationPayload | undefined>();
let frameScheduled = false;

function flushPending(): void {
  frameScheduled = false;
  const toNotify = Array.from(pending.entries());
  pending.clear();

  for (const [conversationId, payload] of toNotify) {
    const cbs = subscribers.get(conversationId);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(payload);
        } catch (err) {
          console.warn('[invalidationBroadcaster] callback error', err);
        }
      }
    }
  }
}

/**
 * Notify all subscribers for a given conversationId.
 * Coalesces multiple calls within one frame.
 */
export function notify(conversationId: string, payload?: InvalidationPayload): void {
  pending.set(conversationId, payload);
  if (!frameScheduled) {
    frameScheduled = true;
    // Use Promise.resolve (microtask) — works in both RN and Node/Jest.
    // requestAnimationFrame is not reliably available in all RN environments
    // and causes "environment torn down" errors in Jest.
    Promise.resolve().then(flushPending);
  }
}

/**
 * Subscribe to invalidations for a specific conversation.
 * Returns an unsubscribe function.
 */
export function subscribe(conversationId: string, callback: Callback): () => void {
  if (!subscribers.has(conversationId)) {
    subscribers.set(conversationId, new Set());
  }
  subscribers.get(conversationId)!.add(callback);

  return () => {
    const cbs = subscribers.get(conversationId);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) {
        subscribers.delete(conversationId);
      }
    }
  };
}

/**
 * Remove all subscribers. Used on logout / DB wipe.
 */
export function clearAll(): void {
  subscribers.clear();
  pending.clear();
  frameScheduled = false;
}
