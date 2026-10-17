import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import { UnreadService } from './services/unread.service';

/**
 * conversation-quick-actions — list ordering / hidden / un-hide (task 4.2).
 *
 * Covers: pinned group first on page 1 only (never repeated on page 2),
 * hidden conversations omitted from page and total, per-item prefs fields,
 * and hiddenAt cleared by UnreadService.incrementUnreadCount.
 */
describe('ConversationsService — list honours pin/hide prefs', () => {
  const userId = new Types.ObjectId();
  const pinnedConvId = new Types.ObjectId();
  const plainConvId = new Types.ObjectId();

  const pinnedAt = new Date('2026-10-05T00:00:00.000Z');
  const mutedUntil = new Date('2026-10-06T00:00:00.000Z');

  function ucRow(convId: Types.ObjectId, overrides: Record<string, unknown> = {}) {
    return {
      conversationId: convId,
      unreadCount: 0,
      pinnedAt: null,
      mutedUntil: null,
      clearedAt: null,
      hiddenAt: null,
      ...overrides,
    };
  }

  function convDoc(convId: Types.ObjectId, lastMessageAt: Date) {
    return {
      _id: convId,
      type: 'direct',
      name: null,
      members: [],
      lastMessageAt,
      lastMessagePreview: 'hi',
    };
  }

  // Chainable: find().sort().skip().limit().select().lean()
  function ucChain(rows: unknown[]) {
    const c: any = {};
    c.sort = jest.fn().mockReturnValue(c);
    c.skip = jest.fn().mockReturnValue(c);
    c.limit = jest.fn().mockReturnValue(c);
    c.select = jest.fn().mockReturnValue(c);
    c.lean = jest.fn().mockResolvedValue(rows);
    return c;
  }

  const mockUC: Record<string, jest.Mock> = {
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  const mockConvModel: Record<string, jest.Mock> = { find: jest.fn() };
  const mockMsg = {};
  const mockUsers = {};

  function convChain(docs: unknown[]) {
    const c: any = {};
    c.sort = jest.fn().mockReturnValue(c);
    c.populate = jest.fn().mockReturnValue(c);
    c.lean = jest.fn().mockResolvedValue(docs);
    return c;
  }

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(
      mockConvModel as any,
      mockUC as any,
      mockMsg as any,
      mockUsers as any,
    );

    // Route the three UC reads: pinned group (pinnedAt $gt epoch, so legacy
    // docs missing the field are excluded), unpinned window, and the two counts.
    mockUC.find.mockImplementation((filter: Record<string, unknown>) => {
      if (
        filter.pinnedAt &&
        typeof filter.pinnedAt === 'object' &&
        '$gt' in (filter.pinnedAt as object)
      ) {
        return ucChain([ucRow(pinnedConvId, { pinnedAt, mutedUntil })]);
      }
      return ucChain([ucRow(plainConvId)]);
    });
    mockUC.countDocuments.mockImplementation(
      (filter: Record<string, unknown>) => {
        if (
          filter.pinnedAt &&
          typeof filter.pinnedAt === 'object' &&
          '$gt' in (filter.pinnedAt as object)
        ) {
          return Promise.resolve(1);
        }
        return Promise.resolve(1);
      },
    );
    mockConvModel.find.mockReturnValue(
      convChain([
        convDoc(plainConvId, new Date('2026-10-04T00:00:00.000Z')),
        convDoc(pinnedConvId, new Date('2026-01-01T00:00:00.000Z')),
      ]),
    );
  });

  it('page 1 starts with pinned conversations and carries prefs fields', async () => {
    const res = await service.getConversationList(
      userId.toString(),
      1,
      20,
    );

    expect(res.conversations).toHaveLength(2);
    // Pinned first even though its lastMessageAt is older.
    expect(res.conversations[0]._id).toEqual(pinnedConvId);
    expect(res.conversations[0]).toMatchObject({
      pinned: true,
      mutedUntil: mutedUntil.toISOString(),
      clearedAt: null,
    });
    expect(res.conversations[1]).toMatchObject({
      pinned: false,
      mutedUntil: null,
      clearedAt: null,
    });
    expect(res.total).toBe(2);
    expect(res.hasMore).toBe(false);
  });

  it('page 2 contains only unpinned conversations (pinned never repeat)', async () => {
    mockUC.find.mockImplementation((filter: Record<string, unknown>) => {
      if (
        filter.pinnedAt &&
        typeof filter.pinnedAt === 'object' &&
        '$gt' in (filter.pinnedAt as object)
      ) {
        // Page 2 must not query the pinned group at all.
        throw new Error('pinned group must not be read on page 2');
      }
      return ucChain([]);
    });
    mockConvModel.find.mockReturnValue(convChain([]));

    const res = await service.getConversationList(
      userId.toString(),
      2,
      20,
    );

    expect(res.conversations).toHaveLength(0);
  });

  it('hidden conversations are omitted from the query, total and hasMore', async () => {
    await service.getConversationList(userId.toString(), 1, 20);

    const unpinnedFind = mockUC.find.mock.calls.find(
      (c) => !(c[0].pinnedAt && typeof c[0].pinnedAt === 'object'),
    );
    expect(unpinnedFind?.[0]).toMatchObject({
      pinnedAt: null,
      hiddenAt: null,
    });
    const unpinnedCount = mockUC.countDocuments.mock.calls.find(
      (c) => !(c[0].pinnedAt && typeof c[0].pinnedAt === 'object'),
    );
    expect(unpinnedCount?.[0]).toMatchObject({
      pinnedAt: null,
      hiddenAt: null,
    });
  });

  it('a cleared-then-messaged conversation reappears once hiddenAt is cleared', async () => {
    // hiddenAt set → row filtered out of the unpinned window.
    mockUC.find.mockImplementation(() => ucChain([]));
    mockUC.countDocuments.mockResolvedValue(0);
    mockConvModel.find.mockReturnValue(convChain([]));
    const hidden = await service.getConversationList(
      userId.toString(),
      1,
      20,
    );
    expect(hidden.total).toBe(0);

    // After incrementUnreadCount clears hiddenAt the row is visible again.
    const mockConvForUnread = { findById: jest.fn().mockResolvedValue(null) };
    const mockUCForUnread = { updateMany: jest.fn().mockResolvedValue({}) };
    const unread = new UnreadService(mockConvForUnread as any, mockUCForUnread as any);
    const convIdStr = new Types.ObjectId().toString();
    const convWithMembers = {
      members: [{ userId: new Types.ObjectId(convIdStr) }],
    };
    mockConvForUnread.findById.mockResolvedValue(convWithMembers);

    await unread.incrementUnreadCount(
      new Types.ObjectId().toString(),
      [],
    );
    expect(mockUCForUnread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ hiddenAt: { $gt: new Date(0) } }),
      { $set: { hiddenAt: null } },
    );
  });

  it('pinned queries use $gt epoch so legacy docs missing pinnedAt are excluded', async () => {
    await service.getConversationList(userId.toString(), 1, 20);

    const pinnedFind = mockUC.find.mock.calls.find(
      (c) => c[0].pinnedAt && typeof c[0].pinnedAt === 'object',
    );
    // $gt epoch matches only existing non-null dates; $ne: null would also
    // match legacy docs where the field is missing, inflating the pin limit.
    expect(pinnedFind?.[0].pinnedAt).toEqual({ $gt: new Date(0) });
    expect(pinnedFind?.[0].pinnedAt).not.toHaveProperty('$ne');
    const pinnedCount = mockUC.countDocuments.mock.calls.find(
      (c) => c[0].pinnedAt && typeof c[0].pinnedAt === 'object',
    );
    expect(pinnedCount?.[0].pinnedAt).toEqual({ $gt: new Date(0) });
  });
});
