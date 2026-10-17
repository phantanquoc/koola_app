/**
 * conversationListPrefs.ts
 *
 * Pure helpers for per-conversation prefs (pin / mute) on the conversation
 * list — extracted so they can be tested without mounting the screen (same
 * pattern as conversationPagination.ts).
 */
import type { Conversation } from '../../types';

/** Muted iff mutedUntil is set and in the future (evaluated at read time). */
export function isConversationMuted(c: Conversation): boolean {
  if (!c.mutedUntil) return false;
  const ms = new Date(c.mutedUntil).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

/**
 * Pure pinned-first ordering for the flag-off (in-memory) path.
 * Stable: pinned rows keep their relative order, then unpinned rows keep
 * theirs. The server already returns page 1 pinned-first; this is applied
 * after local optimistic updates and new_message bumps so a bumped unpinned
 * row can never jump above a pinned one.
 */
export function sortConversations<T extends { pinned?: boolean }>(
  list: T[],
): T[] {
  let hasPinned = false;
  for (const c of list) {
    if (c.pinned) {
      hasPinned = true;
      break;
    }
  }
  if (!hasPinned) return list;
  const pinned = list.filter((c) => c.pinned);
  const unpinned = list.filter((c) => !c.pinned);
  return [...pinned, ...unpinned];
}

/**
 * Fingerprint of exactly the fields that drive a conversation row's render.
 * The row-reference cache compares this across SQLite reads so unchanged rows
 * keep the SAME object reference and React.memo(ConversationListItem) hits.
 * Pinned / mutedUntil are part of the fingerprint so the row re-renders when
 * prefs change (indicators appear/disappear).
 */
export function conversationFingerprint(c: Conversation): string {
  const members = (c.members || [])
    .map(
      (m) =>
        `${m.userId}|${m.user?.displayName ?? ''}|${m.user?.avatar ?? ''}|${
          m.user?.isOnline ? 1 : 0
        }`,
    )
    .join(';');
  return `${c.type}|${c.name ?? ''}|${c.avatar ?? ''}|${c.lastMessagePreview ?? ''}|${
    c.lastMessageAt ?? ''
  }|${c.unreadCount ?? 0}||${members}|${c.pinned ? 1 : 0}|${c.mutedUntil ?? ''}`;
}
