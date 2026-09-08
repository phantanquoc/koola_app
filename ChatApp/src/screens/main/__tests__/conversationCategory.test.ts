/**
 * conversationCategory.test.ts
 *
 * Unit tests for the pure Messages-list demo classifier + filter helper.
 *
 * The rule (must match conversationCategory.ts exactly):
 *   type === 'group'  → 'business'
 *   otherwise the charCode of the LAST character of _id decides:
 *     even → 'personal'   (e.g. '2' = 50, '4' = 52, 'b' = 98, 'd' = 100)
 *     odd  → 'stranger'   (e.g. '1' = 49, '3' = 51, 'a' = 97, 'c' = 99)
 *
 * These are pure-function tests — no screen mount, mirroring the sibling
 * conversationPagination.spec.ts convention.
 */

import {
  classifyConversation,
  filterConversations,
  type ClassifiableConversation,
  type ConversationCategory,
} from '../conversationCategory';

/** Minimal fixture factory: only the two fields the classifier reads. */
function conv(_id: string, type = 'direct'): ClassifiableConversation {
  return { _id, type };
}

describe('classifyConversation', () => {
  it('maps any group conversation to business regardless of id parity', () => {
    // Both an even- and odd-ending id, forced to business by the group rule.
    expect(classifyConversation(conv('group_even_2', 'group'))).toBe('business');
    expect(classifyConversation(conv('group_odd_1', 'group'))).toBe('business');
  });

  it('pins the documented id-parity mapping on concrete fixtures', () => {
    // Last char code even → personal, odd → stranger.
    expect(classifyConversation(conv('conv_2'))).toBe('personal'); // '2' = 50
    expect(classifyConversation(conv('conv_4'))).toBe('personal'); // '4' = 52
    expect(classifyConversation(conv('conv_1'))).toBe('stranger'); // '1' = 49
    expect(classifyConversation(conv('conv_3'))).toBe('stranger'); // '3' = 51
    expect(classifyConversation(conv('ab'))).toBe('personal'); // 'b' = 98
    expect(classifyConversation(conv('ac'))).toBe('stranger'); // 'c' = 99
  });

  it('treats an empty id as personal (defensive branch)', () => {
    expect(classifyConversation(conv(''))).toBe('personal');
  });

  it('is deterministic: repeated calls return the same bucket', () => {
    const samples = [
      conv('conv_1'),
      conv('conv_2'),
      conv('some_group', 'group'),
      conv('hex_deadbeef'),
    ];
    for (const s of samples) {
      const first = classifyConversation(s);
      for (let i = 0; i < 8; i++) {
        expect(classifyConversation(s)).toBe(first);
        // A structurally-equal but distinct object must classify identically.
        expect(classifyConversation({ _id: s._id, type: s.type })).toBe(first);
      }
    }
  });

  it('a mix of direct ids populates BOTH personal and stranger buckets', () => {
    const ids = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];
    const buckets = new Set(ids.map((id) => classifyConversation(conv(id))));
    expect(buckets.has('personal')).toBe(true);
    expect(buckets.has('stranger')).toBe(true);
    // None of these are groups, so business must not appear here.
    expect(buckets.has('business')).toBe(false);
  });
});

describe('filterConversations', () => {
  const rows: ClassifiableConversation[] = [
    conv('a1'), // stranger ('1' odd)
    conv('b2'), // personal  ('2' even)
    conv('team', 'group'), // business
    conv('c3'), // stranger ('3' odd)
    conv('d4'), // personal  ('4' even)
  ];

  it("returns the exact same array (reference-equal) for 'all'", () => {
    const result = filterConversations(rows, 'all');
    expect(result).toBe(rows);
    expect(result).toHaveLength(rows.length);
  });

  it.each(['personal', 'business', 'stranger'] as const)(
    "returns exactly the subset matching '%s'",
    (category) => {
      const result = filterConversations(rows, category);
      const expected = rows.filter((r) => classifyConversation(r) === category);
      expect(result).toEqual(expected);
      // Sanity: at least the fixtures were designed so every bucket is non-empty.
      expect(result.length).toBeGreaterThan(0);
    },
  );

  it('preserves original order within a filtered bucket', () => {
    expect(filterConversations(rows, 'stranger').map((r) => r._id)).toEqual([
      'a1',
      'c3',
    ]);
    expect(filterConversations(rows, 'personal').map((r) => r._id)).toEqual([
      'b2',
      'd4',
    ]);
  });

  it('returns an empty array for a category with no members', () => {
    const onlyPersonal = [conv('x2'), conv('y4')];
    expect(filterConversations(onlyPersonal, 'business')).toEqual([]);
    expect(filterConversations(onlyPersonal, 'stranger')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const before = [...rows];
    filterConversations(rows, 'personal');
    filterConversations(rows, 'stranger');
    expect(rows).toEqual(before);
  });

  it("an empty input returns empty for every non-'all' category", () => {
    const categories: ConversationCategory[] = [
      'all',
      'personal',
      'business',
      'stranger',
    ];
    for (const c of categories) {
      expect(filterConversations([], c)).toEqual([]);
    }
  });
});
