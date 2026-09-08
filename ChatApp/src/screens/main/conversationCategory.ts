/**
 * conversationCategory.ts
 *
 * Pure client-side demo classifier behind the Messages filter pill row.
 * The backend has NO category field — this splits the already-loaded
 * conversation array into demo buckets at the render layer only.
 *
 * Heuristic B (locked):
 *   - `type === 'group'`  → 'business'
 *   - otherwise (direct)  → 'personal' | 'stranger', derived DETERMINISTICALLY
 *     from `_id` (charCode parity of the last character).
 *
 * No Math.random() / Date: the same conversation must always map to the same
 * bucket, otherwise every render would reshuffle rows and defeat the screen's
 * row-reference cache + React.memo(ConversationListItem) scroll optimisations.
 */

export type ConversationCategory = 'all' | 'personal' | 'business' | 'stranger';

/**
 * The minimum shape both `Conversation` (screen path) and test fixtures satisfy.
 * Kept loose on purpose so `filterConversations` can run over `Conversation[]`
 * without casting while remaining unit-testable with plain literals.
 */
export interface ClassifiableConversation {
  _id: string;
  type: string;
}

/**
 * Classify a single conversation into one of the three concrete buckets.
 *
 * Deterministic rule (locked, do not change — tests pin concrete fixtures to it):
 *   group                    → business
 *   _id charCode(odd)        → stranger
 *   _id charCode(even)       → personal
 *   empty _id                → personal   (defensive, id is always non-empty in prod)
 */
export function classifyConversation(
  conv: ClassifiableConversation,
): Exclude<ConversationCategory, 'all'> {
  if (conv.type === 'group') return 'business';
  const id = conv._id ?? '';
  if (id.length === 0) return 'personal';
  const lastCode = id.charCodeAt(id.length - 1);
  return lastCode % 2 === 0 ? 'personal' : 'stranger';
}

/**
 * Filter a conversation array by category.
 *
 * `all` returns the input array itself (reference-equal) so the FlatList `data`
 * prop, and therefore every downstream memo, behaves exactly as it did before
 * the pill row existed whenever no filter is active. Any other category returns
 * a new array containing only the matching rows, in the original order.
 */
export function filterConversations<T extends ClassifiableConversation>(
  conversations: T[],
  category: ConversationCategory,
): T[] {
  if (category === 'all') return conversations;
  return conversations.filter((c) => classifyConversation(c) === category);
}
