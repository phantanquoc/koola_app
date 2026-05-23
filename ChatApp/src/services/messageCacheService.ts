/**
 * messageCacheService — MMKV-backed synchronous cache of recent chat messages.
 *
 * Purpose:
 *   When the user opens a previously-visited conversation, ChatScreen used to
 *   render an empty white area for ~500 ms while `useMessages` fetched the
 *   initial page over REST. This service makes the *first* frame paint with
 *   the messages that were already on screen during the previous session.
 *
 * Storage:
 *   MMKV instance id 'message-cache'
 *   Key per conversation: `conv:<conversationId>` → JSON.stringify(IMessage[])
 *
 * Capacity:
 *   Each conversation caches up to MAX_MESSAGES_PER_CONV (50) of its most
 *   recent messages. When `write()` is called with more, only the head slice
 *   is persisted. Older history is fetched on-demand via the existing
 *   `loadEarlier` REST path — it is not the cache's job.
 *
 * Date handling:
 *   IMessage.createdAt is a Date. JSON.stringify converts it to an ISO string,
 *   so `read()` walks the array and re-hydrates it back into a Date. Other
 *   message fields are JSON-friendly.
 *
 * What is NOT cached:
 *   - Optimistic messages (`pending: true` or `_id` starting with `temp_`).
 *     They are short-lived and can produce duplicate IDs once the real
 *     server-acked message arrives. Excluding them keeps the cache canonical.
 *   - Earlier-loaded pages (anything beyond the first MAX_MESSAGES_PER_CONV).
 *
 * Why MMKV:
 *   `read()` runs inside `useState` lazy initializer in useMessages. It MUST
 *   complete synchronously before the first render or the white-flash
 *   reappears. MMKV's mmap-backed reads finish in well under a millisecond
 *   even for the largest message arrays we cache.
 */
import { MMKV } from 'react-native-mmkv';
import type { IMessage } from 'react-native-gifted-chat';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max messages persisted per conversation. */
const MAX_MESSAGES_PER_CONV = 50;

/** Key prefix for per-conversation entries inside the MMKV instance. */
const KEY_PREFIX = 'conv:';

// ─── MMKV instance ────────────────────────────────────────────────────────────

const mmkv = new MMKV({ id: 'message-cache' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function keyFor(conversationId: string): string {
  return `${KEY_PREFIX}${conversationId}`;
}

/**
 * Return true if the message is an optimistic/pending one that should NOT
 * be persisted (its _id is a client-only temp string and will mutate when
 * the server ack arrives).
 */
function isOptimistic(msg: IMessage): boolean {
  if (typeof msg._id === 'string' && msg._id.startsWith('temp_')) return true;
  if ((msg as IMessage & { pending?: boolean }).pending === true) return true;
  return false;
}

/**
 * Re-hydrate a parsed JSON object back into IMessage shape. Specifically
 * rebuilds `createdAt` as a Date — JSON only knows strings.
 */
function reviveMessage(raw: unknown): IMessage {
  const obj = raw as IMessage & { createdAt: string | number | Date };
  return {
    ...obj,
    createdAt: obj.createdAt instanceof Date ? obj.createdAt : new Date(obj.createdAt),
  } as IMessage;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronously read the cached messages for a conversation.
 *
 * Returns an empty array on cache miss, parse error, or any other failure —
 * callers should treat the result as "best effort, fall back to network".
 */
export function read(conversationId: string): IMessage[] {
  try {
    const raw = mmkv.getString(keyFor(conversationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(reviveMessage);
  } catch (err) {
    console.warn('[messageCacheService] read failed for', conversationId, err);
    return [];
  }
}

/**
 * Persist the most recent slice of messages for a conversation.
 *
 * - Optimistic / pending messages are filtered out.
 * - The array is sliced to the first MAX_MESSAGES_PER_CONV entries
 *   (useMessages keeps newest-first ordering, so this preserves the head).
 * - If the resulting list is empty, the entry is deleted instead of writing
 *   an empty array.
 */
export function write(conversationId: string, messages: IMessage[]): void {
  try {
    const filtered = messages.filter((m) => !isOptimistic(m));
    const sliced = filtered.slice(0, MAX_MESSAGES_PER_CONV);

    if (sliced.length === 0) {
      mmkv.delete(keyFor(conversationId));
      return;
    }

    mmkv.set(keyFor(conversationId), JSON.stringify(sliced));
  } catch (err) {
    console.warn('[messageCacheService] write failed for', conversationId, err);
  }
}

/**
 * Remove the cached entry for a single conversation.
 */
export function clear(conversationId: string): void {
  try {
    mmkv.delete(keyFor(conversationId));
  } catch (err) {
    console.warn('[messageCacheService] clear failed for', conversationId, err);
  }
}

/**
 * Wipe every cached conversation. Used on logout to keep per-account
 * isolation: a new login starts with an empty message cache.
 */
export function clearAll(): void {
  try {
    mmkv.clearAll();
  } catch (err) {
    console.warn('[messageCacheService] clearAll failed', err);
  }
}
