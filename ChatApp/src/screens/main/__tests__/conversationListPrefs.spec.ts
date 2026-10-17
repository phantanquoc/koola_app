/**
 * conversationListPrefs.spec.ts
 *
 * Pure helpers for conversation-list prefs (task 7.2):
 * - conversationFingerprint changes on pin/mute
 * - sortConversations pins first, stable, identity-preserving when no pins
 * - isConversationMuted read-time evaluation
 */
import {
  conversationFingerprint,
  isConversationMuted,
  sortConversations,
} from '../conversationListPrefs';
import type { Conversation } from '../../../types';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    _id: `c_${Math.random().toString(36).slice(2)}`,
    type: 'direct',
    members: [],
    createdBy: 'u1',
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('conversationFingerprint', () => {
  it('changes when the conversation is pinned', () => {
    const before = makeConv();
    const after = makeConv({ _id: before._id, pinned: true });
    expect(conversationFingerprint(after)).not.toBe(
      conversationFingerprint(before),
    );
  });

  it('changes when mutedUntil changes', () => {
    const before = makeConv();
    const after = makeConv({
      _id: before._id,
      mutedUntil: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(conversationFingerprint(after)).not.toBe(
      conversationFingerprint(before),
    );
  });

  it('is stable for identical prefs', () => {
    const a = makeConv({ pinned: true, mutedUntil: null });
    const b = makeConv({ ...a });
    expect(conversationFingerprint(a)).toBe(conversationFingerprint(b));
  });
});

describe('sortConversations', () => {
  it('returns the same reference when nothing is pinned', () => {
    const list = [makeConv(), makeConv()];
    expect(sortConversations(list)).toBe(list);
  });

  it('moves pinned rows first, preserving relative order', () => {
    const u1 = makeConv();
    const p1 = makeConv({ pinned: true });
    const u2 = makeConv();
    const p2 = makeConv({ pinned: true });
    const sorted = sortConversations([u1, p1, u2, p2]);
    expect(sorted.map((c) => c._id)).toEqual([
      p1._id,
      p2._id,
      u1._id,
      u2._id,
    ]);
  });

  it('keeps a bumped unpinned row below pinned rows', () => {
    const pinned = makeConv({ pinned: true });
    const old = makeConv();
    const bumped = makeConv();
    // new_message unshifts the bumped row to the front…
    const afterBump = [bumped, pinned, old];
    expect(sortConversations(afterBump).map((c) => c._id)).toEqual([
      pinned._id,
      bumped._id,
      old._id,
    ]);
  });
});

describe('isConversationMuted', () => {
  it('is false when mutedUntil is null or missing', () => {
    expect(isConversationMuted(makeConv())).toBe(false);
    expect(isConversationMuted(makeConv({ mutedUntil: null }))).toBe(false);
  });

  it('is true for a future mutedUntil (incl. the forever sentinel)', () => {
    expect(
      isConversationMuted(
        makeConv({ mutedUntil: new Date(Date.now() + 1000).toISOString() }),
      ),
    ).toBe(true);
    expect(
      isConversationMuted(makeConv({ mutedUntil: '9999-12-31T23:59:59.999Z' })),
    ).toBe(true);
  });

  it('is false once mutedUntil has passed (no timer needed)', () => {
    expect(
      isConversationMuted(
        makeConv({ mutedUntil: new Date(Date.now() - 1000).toISOString() }),
      ),
    ).toBe(false);
  });
});
