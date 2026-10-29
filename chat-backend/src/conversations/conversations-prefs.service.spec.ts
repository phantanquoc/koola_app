import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ConversationsService,
  ConversationPrefsPayload,
  MUTE_FOREVER,
  PIN_LIMIT,
} from './conversations.service';

/**
 * conversation-quick-actions — prefs API (tasks 4.1).
 *
 * Covers: pin/unpin, pin limit 5 (6th rejected, re-pin allowed), mute
 * durations incl. forever sentinel and off, both-absent 400, non-member 404,
 * clear semantics (fields set, other members untouched), emit callback payload.
 */
describe('ConversationsService — conversation prefs (pin/mute/clear)', () => {
  const convId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  function ucDoc(overrides: Record<string, unknown> = {}) {
    const base = {
      _id: new Types.ObjectId().toString(),
      pinnedAt: null,
      mutedUntil: null,
      clearedAt: null,
      hiddenAt: null,
      unreadCount: 3,
      ...overrides,
    };
    return { ...base, toObject: () => ({ ...base }) };
  }

  const mockUC: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    updateMany: jest.fn(),
  };
  const mockConv = { find: jest.fn(), findById: jest.fn() };
  const mockMsg = { find: jest.fn() };
  const mockUsers = { findById: jest.fn() };

  let service: ConversationsService;
  let emitted: Array<{ userId: string; payload: ConversationPrefsPayload }>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(
      mockConv as any,
      mockUC as any,
      mockMsg as any,
      mockUsers as any,
    );
    emitted = [];
    service.setPrefsEmitCallback((uid, payload) => {
      emitted.push({ userId: uid, payload });
    });
  });

  function mockUpdateReturning(doc: Record<string, unknown>) {
    mockUC.findOneAndUpdate.mockReturnValue({
      lean: () => Promise.resolve(doc),
    });
  }

  // ─── Pin ────────────────────────────────────────────────────────────────

  it('pin sets pinnedAt and emits { conversationId, pinned: true, mutedUntil, clearedAt }', async () => {
    mockUC.findOne.mockResolvedValue(ucDoc());
    mockUC.countDocuments.mockResolvedValue(2);
    const pinnedAt = new Date('2026-10-01T00:00:00.000Z');
    mockUpdateReturning(ucDoc({ pinnedAt }));

    const res = await service.updatePrefs(convId, userId, { pinned: true });

    expect(mockUC.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { pinnedAt: expect.any(Date) } },
      { new: true },
    );
    expect(res).toEqual({
      conversationId: convId,
      pinned: true,
      mutedUntil: null,
      clearedAt: null,
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ userId, payload: res });
  });

  it(`rejects the 6th pin with PIN_LIMIT_REACHED and changes nothing`, async () => {
    mockUC.findOne.mockResolvedValue(ucDoc());
    mockUC.countDocuments.mockResolvedValue(PIN_LIMIT);

    const err = await service
      .updatePrefs(convId, userId, { pinned: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      code: 'PIN_LIMIT_REACHED',
    });
    expect(mockUC.findOneAndUpdate).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it('re-pinning an already pinned conversation is allowed (no limit check)', async () => {
    const pinnedAt = new Date('2026-09-01T00:00:00.000Z');
    mockUC.findOne.mockResolvedValue(ucDoc({ pinnedAt }));
    mockUC.countDocuments.mockResolvedValue(PIN_LIMIT);
    // No $set needed — service returns the existing row as-is.
    const res = await service.updatePrefs(convId, userId, { pinned: true });

    expect(mockUC.countDocuments).not.toHaveBeenCalled();
    expect(mockUC.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.pinned).toBe(true);
    expect(emitted).toHaveLength(1);
  });

  it('pin-limit count uses $gt epoch so docs missing pinnedAt do not count', async () => {
    mockUC.findOne.mockResolvedValue(ucDoc());
    mockUC.countDocuments.mockResolvedValue(0);
    mockUpdateReturning(ucDoc({ pinnedAt: new Date() }));

    await service.updatePrefs(convId, userId, { pinned: true });

    expect(mockUC.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedAt: { $gt: new Date(0) } }),
    );
  });

  it('unpin sets pinnedAt to null', async () => {
    mockUC.findOne.mockResolvedValue(
      ucDoc({ pinnedAt: new Date('2026-09-01T00:00:00.000Z') }),
    );
    mockUpdateReturning(ucDoc({ pinnedAt: null }));

    const res = await service.updatePrefs(convId, userId, { pinned: false });

    expect(mockUC.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { pinnedAt: null } },
      { new: true },
    );
    expect(res.pinned).toBe(false);
  });

  // ─── Mute ───────────────────────────────────────────────────────────────

  it.each([
    ['1h', 60 * 60 * 1000],
    ['8h', 8 * 60 * 60 * 1000],
    ['24h', 24 * 60 * 60 * 1000],
  ] as const)('mute %s sets mutedUntil ≈ now + duration', async (d, ms) => {
    mockUC.findOne.mockResolvedValue(ucDoc());
    mockUpdateReturning(ucDoc({ mutedUntil: new Date(Date.now() + ms) }));

    const before = Date.now();
    const res = await service.updatePrefs(convId, userId, {
      muteDuration: d,
    });

    const mutedMs = new Date(res.mutedUntil as string).getTime();
    expect(mutedMs).toBeGreaterThanOrEqual(before + ms - 5000);
    expect(mutedMs).toBeLessThanOrEqual(Date.now() + ms + 5000);
    expect(res.pinned).toBe(false);
  });

  it('mute forever sets the far-future sentinel', async () => {
    mockUC.findOne.mockResolvedValue(ucDoc());
    mockUpdateReturning(ucDoc({ mutedUntil: new Date(MUTE_FOREVER) }));

    const res = await service.updatePrefs(convId, userId, {
      muteDuration: 'forever',
    });

    expect(res.mutedUntil).toBe(MUTE_FOREVER.toISOString());
  });

  it('mute off clears mutedUntil', async () => {
    mockUC.findOne.mockResolvedValue(
      ucDoc({ mutedUntil: new Date(Date.now() + 3600_000) }),
    );
    mockUpdateReturning(ucDoc({ mutedUntil: null }));

    const res = await service.updatePrefs(convId, userId, {
      muteDuration: 'off',
    });

    expect(mockUC.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { mutedUntil: null } },
      { new: true },
    );
    expect(res.mutedUntil).toBeNull();
  });

  it('pin + mute can be applied together', async () => {
    mockUC.findOne.mockResolvedValue(ucDoc());
    mockUC.countDocuments.mockResolvedValue(0);
    const pinnedAt = new Date();
    const mutedUntil = new Date(Date.now() + 3600_000);
    mockUpdateReturning(ucDoc({ pinnedAt, mutedUntil }));

    const res = await service.updatePrefs(convId, userId, {
      pinned: true,
      muteDuration: '1h',
    });

    expect(res.pinned).toBe(true);
    expect(res.mutedUntil).not.toBeNull();
  });

  // ─── Validation / membership ──────────────────────────────────────────

  it('400 when neither pinned nor muteDuration is given', async () => {
    const err = await service.updatePrefs(convId, userId, {}).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(mockUC.findOne).not.toHaveBeenCalled();
  });

  it('404 when the caller has no UserConversation (non-member)', async () => {
    mockUC.findOne.mockResolvedValue(null);

    const err = await service
      .updatePrefs(convId, userId, { pinned: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(mockUC.findOneAndUpdate).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it('404 for an invalid conversation id', async () => {
    const err = await service
      .updatePrefs('not-an-id', userId, { pinned: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });

  // ─── Clear for me ─────────────────────────────────────────────────────

  it('clear sets clearedAt/hiddenAt, zeroes unread, unpins; leaves other members untouched', async () => {
    mockUC.findOne.mockResolvedValue(
      ucDoc({
        pinnedAt: new Date('2026-09-01T00:00:00.000Z'),
        unreadCount: 7,
      }),
    );
    const now = new Date();
    mockUpdateReturning(
      ucDoc({ clearedAt: now, hiddenAt: now, unreadCount: 0, pinnedAt: null }),
    );

    const res = await service.clearForMe(convId, userId);

    const update = mockUC.findOneAndUpdate.mock.calls[0];
    // Targets only the caller's row…
    expect(update[0]).toMatchObject({ _id: expect.anything() });
    // …never touches messages, membership or other users.
    expect(update[1].$set.clearedAt).toBeInstanceOf(Date);
    expect(update[1].$set.hiddenAt).toBeInstanceOf(Date);
    expect(update[1].$set.unreadCount).toBe(0);
    expect(update[1].$set.pinnedAt).toBeNull();
    expect(res).toEqual({
      conversationId: convId,
      pinned: false,
      mutedUntil: null,
      clearedAt: now.toISOString(),
    });
    expect(emitted).toEqual([{ userId, payload: res }]);
  });

  it('clear 404s for a non-member and emits nothing', async () => {
    mockUC.findOne.mockResolvedValue(null);

    const err = await service.clearForMe(convId, userId).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(mockUC.findOneAndUpdate).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });
});
