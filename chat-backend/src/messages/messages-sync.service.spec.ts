import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Message } from './message.schema';
import { Media } from '../media/media.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Task 3.4 — Integration tests for syncMessages (tombstone-inclusive sync).
 *
 * Scenarios:
 *   1. Happy path — returns messages updated after `since`
 *   2. Tombstones — soft-deleted messages (deleted: true) are included
 *   3. deletedFor — messages deleted for the caller are included (client filters)
 *   4. Membership — user with no conversations gets empty result
 *   5. Pagination — hasMore + nextCursor set when result exceeds limit
 */
describe('MessagesService — syncMessages (tombstone-inclusive)', () => {
  let service: MessagesService;

  const userId = 'user-abc';
  const convId = 'conv-xyz';
  const since = new Date('2026-01-01T00:00:00.000Z').toISOString();

  // ─── Shared mock builders ──────────────────────────────────────────────────

  function makeMsg(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => overrides._id ?? 'msg-1' },
      conversationId: convId,
      senderId: userId,
      content: 'hello',
      deleted: false,
      deletedFor: [],
      readBy: [],
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  // Chainable query mock: find().sort().limit().populate().lean()
  function makeQueryChain(docs: unknown[]) {
    const chain: Record<string, jest.Mock> = {} as any;
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.lean = jest.fn().mockResolvedValue(docs);
    return chain;
  }

  // Chainable findById mock: findById().select().lean()
  function makeFindByIdChain(doc: unknown) {
    return {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(doc),
      }),
    };
  }

  const mockMessageModel = {
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockMediaModel = {
    findOne: jest.fn().mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    }),
  };

  const mockConversationsService = {
    findByIdOrFail: jest.fn(),
    updateLastMessage: jest.fn(),
    getSharedConversationIds: jest.fn(),
  };

  const mockMembershipService = {
    verifyMember: jest.fn(),
    getUserConversationIds: jest.fn(),
  };

  const mockUnreadService = {
    incrementUnreadCount: jest.fn(),
    resetUnreadCount: jest.fn(),
  };

  const mockTypingService = {
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
    setTypingStopCallback: jest.fn(),
  };

  const mockNotificationsService = {
    sendPushNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        { provide: getModelToken(Media.name), useValue: mockMediaModel },
        { provide: ConversationsService, useValue: mockConversationsService },
        { provide: MembershipService, useValue: mockMembershipService },
        { provide: UnreadService, useValue: mockUnreadService },
        { provide: TypingService, useValue: mockTypingService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    jest.clearAllMocks();
  });

  // ─── 1. Happy path ─────────────────────────────────────────────────────────

  it('1. returns messages updated after `since` for member conversations', async () => {
    const msg = makeMsg({ _id: 'msg-1', deleted: false });
    mockConversationsService.getSharedConversationIds.mockResolvedValue([convId]);
    mockMessageModel.find.mockReturnValue(makeQueryChain([msg]));

    const result = await service.syncMessages(userId, since);

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();

    // Verify query uses updatedAt (not createdAt) and does NOT exclude deleted
    const findCall = mockMessageModel.find.mock.calls[0][0];
    expect(findCall).toHaveProperty('updatedAt');
    expect(findCall).not.toHaveProperty('deleted');
    expect(findCall).not.toHaveProperty('deletedFor');
  });

  // ─── 2. Tombstones included ────────────────────────────────────────────────

  it('2. includes soft-deleted messages (tombstones) in sync result', async () => {
    const tombstone = makeMsg({
      _id: 'msg-deleted',
      deleted: true,
      content: '',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    mockConversationsService.getSharedConversationIds.mockResolvedValue([convId]);
    mockMessageModel.find.mockReturnValue(makeQueryChain([tombstone]));

    const result = await service.syncMessages(userId, since);

    expect(result.items).toHaveLength(1);
    const item = result.items[0] as any;
    expect(item.deleted).toBe(true);
  });

  // ─── 3. deletedFor — per-user deletions included ──────────────────────────

  it('3. includes messages where deletedFor contains the caller', async () => {
    const deletedForMe = makeMsg({
      _id: 'msg-deleted-for-me',
      deleted: false,
      deletedFor: [userId],
    });
    mockConversationsService.getSharedConversationIds.mockResolvedValue([convId]);
    mockMessageModel.find.mockReturnValue(makeQueryChain([deletedForMe]));

    const result = await service.syncMessages(userId, since);

    expect(result.items).toHaveLength(1);
    const item = result.items[0] as any;
    expect(item.deletedFor).toContain(userId);
  });

  // ─── 4. Membership enforced — no conversations → empty result ─────────────

  it('4. returns empty result when user has no conversations', async () => {
    mockConversationsService.getSharedConversationIds.mockResolvedValue([]);

    const result = await service.syncMessages(userId, since);

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    // find() should NOT be called — short-circuit on empty conversationIds
    expect(mockMessageModel.find).not.toHaveBeenCalled();
  });

  // ─── 5. Pagination — hasMore + nextCursor ─────────────────────────────────

  it('5. sets hasMore and nextCursor when result exceeds limit', async () => {
    const limit = 2;
    // Return limit+1 docs to trigger hasMore
    const docs = [
      makeMsg({ _id: 'msg-1' }),
      makeMsg({ _id: 'msg-2' }),
      makeMsg({ _id: 'msg-3' }), // the extra one
    ];
    mockConversationsService.getSharedConversationIds.mockResolvedValue([convId]);
    mockMessageModel.find.mockReturnValue(makeQueryChain(docs));

    const result = await service.syncMessages(userId, since, undefined, limit);

    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(limit);
    expect(result.nextCursor).toBe('msg-2'); // last item in trimmed result
  });

  // ─── 6. readBy normalization ───────────────────────────────────────────────

  it('6. normalizes missing readBy field to empty array', async () => {
    const msgWithoutReadBy = makeMsg({ _id: 'msg-no-readby' });
    delete (msgWithoutReadBy as any).readBy;
    mockConversationsService.getSharedConversationIds.mockResolvedValue([convId]);
    mockMessageModel.find.mockReturnValue(makeQueryChain([msgWithoutReadBy]));

    const result = await service.syncMessages(userId, since);

    const item = result.items[0] as any;
    expect(Array.isArray(item.readBy)).toBe(true);
    expect(item.readBy).toHaveLength(0);
  });
});
