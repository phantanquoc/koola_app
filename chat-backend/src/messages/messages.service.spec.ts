import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Message, MessageType, MessageStatus } from './message.schema';
import { Media } from '../media/media.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationType } from '../conversations/conversation.schema';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

/**
 * Task 3.6: Unit tests for reply validation in MessagesService.sendMessage
 * Covers the 5 validation branches:
 *   1. Source not found → REPLY_SOURCE_NOT_FOUND
 *   2. Cross-conversation → REPLY_CROSS_CONVERSATION
 *   3. Deleted for everyone → REPLY_SOURCE_DELETED
 *   4. Deleted for user → REPLY_SOURCE_DELETED_FOR_USER
 *   5. Happy path — preview shape correct for text vs media source
 */
describe('MessagesService — reply validation', () => {
  let service: MessagesService;

  const mockConversationId = 'conv123';
  const mockSenderId = 'user1';
  const mockReplyToId = '507f1f77bcf86cd799439011';

  const mockMessageModel = {
    findById: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };

  // Task 1.6: mock Media model for mediaThumbnailKey resolution
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
    getTypingUsers: jest.fn(),
  };

  const mockNotificationsService = {
    sendPushNotification: jest.fn(),
  };

  const mockUsersService = {
    findByIds: jest.fn().mockResolvedValue([]),
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
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);

    // Default: member verification passes
    mockMembershipService.verifyMember.mockResolvedValue(undefined);
    mockConversationsService.updateLastMessage.mockResolvedValue(undefined);
    mockUnreadService.incrementUnreadCount.mockResolvedValue(undefined);
    mockTypingService.stopTyping.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseDto = {
    type: MessageType.TEXT,
    content: 'Hello',
    replyTo: mockReplyToId,
  };

  it('1. throws REPLY_SOURCE_NOT_FOUND when source message does not exist', async () => {
    mockMessageModel.findById.mockReturnValue({
      lean: () => Promise.resolve(null),
    });

    await expect(
      service.sendMessage(mockConversationId, mockSenderId, baseDto),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.sendMessage(mockConversationId, mockSenderId, baseDto);
    } catch (e: unknown) {
      expect((e as { response?: { code?: string } }).response?.code).toBe(
        'REPLY_SOURCE_NOT_FOUND',
      );
    }
  });

  it('2. throws REPLY_CROSS_CONVERSATION when source is in a different conversation', async () => {
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: mockReplyToId,
          conversationId: 'other_conv',
          senderId: 'user2',
          type: MessageType.TEXT,
          content: 'Original',
          deleted: false,
          deletedFor: [],
        }),
    });

    await expect(
      service.sendMessage(mockConversationId, mockSenderId, baseDto),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.sendMessage(mockConversationId, mockSenderId, baseDto);
    } catch (e: unknown) {
      expect((e as { response?: { code?: string } }).response?.code).toBe(
        'REPLY_CROSS_CONVERSATION',
      );
    }
  });

  it('3. throws REPLY_SOURCE_DELETED when source is deleted for everyone', async () => {
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: mockReplyToId,
          conversationId: mockConversationId,
          senderId: 'user2',
          type: MessageType.TEXT,
          content: 'Original',
          deleted: true,
          deletedFor: [],
        }),
    });

    await expect(
      service.sendMessage(mockConversationId, mockSenderId, baseDto),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.sendMessage(mockConversationId, mockSenderId, baseDto);
    } catch (e: unknown) {
      expect((e as { response?: { code?: string } }).response?.code).toBe(
        'REPLY_SOURCE_DELETED',
      );
    }
  });

  it('4. throws REPLY_SOURCE_DELETED_FOR_USER when source is in caller deletedFor', async () => {
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: mockReplyToId,
          conversationId: mockConversationId,
          senderId: 'user2',
          type: MessageType.TEXT,
          content: 'Original',
          deleted: false,
          deletedFor: [mockSenderId],
        }),
    });

    await expect(
      service.sendMessage(mockConversationId, mockSenderId, baseDto),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.sendMessage(mockConversationId, mockSenderId, baseDto);
    } catch (e: unknown) {
      expect((e as { response?: { code?: string } }).response?.code).toBe(
        'REPLY_SOURCE_DELETED_FOR_USER',
      );
    }
  });

  it('5a. happy path — text source: preview has text, no mediaType', async () => {
    const sourceContent = 'We ship Friday';
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: mockReplyToId,
          conversationId: mockConversationId,
          senderId: 'user2',
          type: MessageType.TEXT,
          content: sourceContent,
          deleted: false,
          deletedFor: [],
        }),
    });

    const createdMsg = {
      _id: 'newmsg1',
      conversationId: mockConversationId,
      senderId: mockSenderId,
      type: MessageType.TEXT,
      content: 'Hello',
      status: MessageStatus.SENT,
      replyTo: mockReplyToId,
      replyToPreview: { senderId: 'user2', text: sourceContent },
    };
    mockMessageModel.create.mockResolvedValue(createdMsg);

    const result = await service.sendMessage(
      mockConversationId,
      mockSenderId,
      baseDto,
    );
    expect(result.message).toBeDefined();

    // Verify create was called with correct replyToPreview
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const createCall = mockMessageModel.create.mock.calls[0][0] as {
      replyToPreview: { senderId: string; text?: string; mediaType?: string };
    };
    expect(createCall.replyToPreview).toMatchObject({
      senderId: 'user2',
      text: sourceContent,
    });
    expect(createCall.replyToPreview.mediaType).toBeUndefined();
  });

  it('5b. happy path — image source: preview has mediaType, no text', async () => {
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: mockReplyToId,
          conversationId: mockConversationId,
          senderId: 'user2',
          type: MessageType.IMAGE,
          content: '',
          deleted: false,
          deletedFor: [],
        }),
    });

    const createdMsg = {
      _id: 'newmsg2',
      conversationId: mockConversationId,
      senderId: mockSenderId,
      type: MessageType.TEXT,
      content: 'Hello',
      status: MessageStatus.SENT,
      replyTo: mockReplyToId,
      replyToPreview: { senderId: 'user2', mediaType: MessageType.IMAGE },
    };
    mockMessageModel.create.mockResolvedValue(createdMsg);

    await service.sendMessage(mockConversationId, mockSenderId, baseDto);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const createCall5b = mockMessageModel.create.mock.calls[0][0] as {
      replyToPreview: { senderId: string; text?: string; mediaType?: string };
    };
    expect(createCall5b.replyToPreview).toMatchObject({
      senderId: 'user2',
      mediaType: MessageType.IMAGE,
    });
    expect(createCall5b.replyToPreview.text).toBeUndefined();
  });

  it('5c. happy path — text truncated at 100 chars', async () => {
    const longContent = 'A'.repeat(150);
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: mockReplyToId,
          conversationId: mockConversationId,
          senderId: 'user2',
          type: MessageType.TEXT,
          content: longContent,
          deleted: false,
          deletedFor: [],
        }),
    });

    mockMessageModel.create.mockResolvedValue({
      _id: 'newmsg3',
      conversationId: mockConversationId,
      senderId: mockSenderId,
    });

    await service.sendMessage(mockConversationId, mockSenderId, baseDto);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const createCall5c = mockMessageModel.create.mock.calls[0][0] as {
      replyToPreview: { senderId: string; text?: string; mediaType?: string };
    };
    expect(createCall5c.replyToPreview.text).toHaveLength(100);
  });
});

// ─── setReaction tests ────────────────────────────────────────────────────────

describe('MessagesService — setReaction', () => {
  let service: MessagesService;

  const mockConversationId = 'conv123';
  const mockMessageId = 'msg456';
  const mockUserId = 'user1';

  const mockMessageModel = {
    findById: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
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
    getTypingUsers: jest.fn(),
  };

  const mockNotificationsService = {
    sendPushNotification: jest.fn(),
  };

  const mockUsersService = {
    findByIds: jest.fn().mockResolvedValue([]),
  };

  function makeMessage(reactions: { userId: string; emoji: string }[]) {
    return {
      _id: mockMessageId,
      conversationId: mockConversationId,
      reactions,
    };
  }

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
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    mockMembershipService.verifyMember.mockResolvedValue(undefined);
    mockMessageModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('set new reaction — adds emoji when user has no existing reaction', async () => {
    mockMessageModel.findById.mockResolvedValue(makeMessage([]));

    const result = await service.setReaction(
      mockConversationId,
      mockMessageId,
      mockUserId,
      '👍',
    );

    expect(result).toEqual({ action: 'add', emoji: '👍' });
    expect(mockMessageModel.updateOne).toHaveBeenCalledWith(
      { _id: mockMessageId },
      { $push: { reactions: { userId: mockUserId, emoji: '👍' } } },
    );
  });

  it('replace existing reaction — changes emoji when user already reacted', async () => {
    mockMessageModel.findById.mockResolvedValue(
      makeMessage([{ userId: mockUserId, emoji: '❤️' }]),
    );

    const result = await service.setReaction(
      mockConversationId,
      mockMessageId,
      mockUserId,
      '😂',
    );

    expect(result).toEqual({ action: 'add', emoji: '😂' });
    expect(mockMessageModel.updateOne).toHaveBeenCalledWith(
      { _id: mockMessageId, 'reactions.userId': mockUserId },
      { $set: { 'reactions.$.emoji': '😂' } },
    );
  });

  it('clear with null — removes existing reaction', async () => {
    mockMessageModel.findById.mockResolvedValue(
      makeMessage([{ userId: mockUserId, emoji: '👍' }]),
    );

    const result = await service.setReaction(
      mockConversationId,
      mockMessageId,
      mockUserId,
      null,
    );

    expect(result).toEqual({ action: 'remove', emoji: null });
    expect(mockMessageModel.updateOne).toHaveBeenCalledWith(
      { _id: mockMessageId },
      { $pull: { reactions: { userId: mockUserId } } },
    );
  });

  it('idempotent set — same emoji twice is a no-op (no updateOne call)', async () => {
    mockMessageModel.findById.mockResolvedValue(
      makeMessage([{ userId: mockUserId, emoji: '👍' }]),
    );

    const result = await service.setReaction(
      mockConversationId,
      mockMessageId,
      mockUserId,
      '👍',
    );

    expect(result).toEqual({ action: 'add', emoji: '👍' });
    expect(mockMessageModel.updateOne).not.toHaveBeenCalled();
  });

  it('idempotent clear — null when no reaction is a no-op (no updateOne call)', async () => {
    mockMessageModel.findById.mockResolvedValue(makeMessage([]));

    const result = await service.setReaction(
      mockConversationId,
      mockMessageId,
      mockUserId,
      null,
    );

    expect(result).toEqual({ action: 'remove', emoji: null });
    expect(mockMessageModel.updateOne).not.toHaveBeenCalled();
  });
});

// ─── searchMessages enrichment tests ────────────────────────────────────────

describe('MessagesService — searchMessages enrichment', () => {
  let service: MessagesService;

  // Real 24-hex ObjectId strings so Types.ObjectId.isValid() passes and the
  // user batch-fetch is not silently dropped.
  const requesterId = '507f1f77bcf86cd799439011';
  const otherUserId = '507f1f77bcf86cd799439012';
  const senderId = '507f1f77bcf86cd799439013';
  const convGroupId = '607f1f77bcf86cd799439021';
  const convDirectId = '607f1f77bcf86cd799439022';
  const convMissingId = '607f1f77bcf86cd799439023';

  const mockMessageModel = {
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
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
    getConversationsByIds: jest.fn(),
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
    getTypingUsers: jest.fn(),
  };

  const mockNotificationsService = {
    sendPushNotification: jest.fn(),
  };

  const mockUsersService = {
    findByIds: jest.fn(),
  };

  // find(filter).sort().skip().limit().select().lean() → resolves to the raw docs.
  // `populate` is exposed on the chain so tests can assert it is NEVER called
  // (task 2.5 — senderId has no ref, populating it was a bogus query).
  function mockFindReturns(rawItems: unknown[]) {
    mockMessageModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rawItems),
    });
  }

  function makeRawMsg(overrides: Record<string, unknown> = {}) {
    return {
      _id: 'msg-1',
      conversationId: convGroupId,
      senderId,
      content: 'xin chào',
      type: MessageType.TEXT,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      ...overrides,
    };
  }

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
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);

    // Default happy-path stubs — individual tests override as needed.
    mockMembershipService.getUserConversationIds.mockResolvedValue([
      convGroupId,
    ]);
    mockMessageModel.countDocuments.mockResolvedValue(1);
    mockConversationsService.getConversationsByIds.mockResolvedValue([]);
    mockUsersService.findByIds.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a GROUP conversation to its own name', async () => {
    mockFindReturns([makeRawMsg()]);
    mockConversationsService.getConversationsByIds.mockResolvedValue([
      {
        _id: convGroupId,
        type: ConversationType.GROUP,
        name: 'Team Rocket',
        members: [
          { userId: requesterId, role: 'admin' },
          { userId: senderId, role: 'member' },
        ],
      },
    ]);
    mockUsersService.findByIds.mockResolvedValue([
      { _id: senderId, displayName: 'Bob', phone: '', email: '' },
    ]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    expect(res.items).toHaveLength(1);
    expect(res.items[0].conversationName).toBe('Team Rocket');
    expect(res.items[0].senderDisplayName).toBe('Bob');
    expect(res.items[0].createdAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('resolves a DIRECT conversation to the OTHER member, never the requester', async () => {
    mockMembershipService.getUserConversationIds.mockResolvedValue([
      convDirectId,
    ]);
    mockFindReturns([makeRawMsg({ conversationId: convDirectId })]);
    mockConversationsService.getConversationsByIds.mockResolvedValue([
      {
        _id: convDirectId,
        type: ConversationType.DIRECT,
        name: null,
        members: [
          { userId: requesterId, role: 'member' },
          { userId: otherUserId, role: 'member' },
        ],
      },
    ]);
    mockUsersService.findByIds.mockResolvedValue([
      { _id: senderId, displayName: 'Bob', phone: '', email: '' },
      { _id: otherUserId, displayName: 'Alice', phone: '', email: '' },
      { _id: requesterId, displayName: 'Me', phone: '', email: '' },
    ]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    // Title is the other participant, not the person doing the search.
    expect(res.items[0].conversationName).toBe('Alice');
    expect(res.items[0].conversationName).not.toBe('Me');
  });

  it('falls back to non-empty placeholders when person and conversation are missing', async () => {
    mockMembershipService.getUserConversationIds.mockResolvedValue([
      convMissingId,
    ]);
    mockFindReturns([
      makeRawMsg({
        conversationId: convMissingId,
        senderId: '507f1f77bcf86cd799439099',
      }),
    ]);
    // getConversationsByIds returns nothing for this id, findByIds returns nobody.
    mockConversationsService.getConversationsByIds.mockResolvedValue([]);
    mockUsersService.findByIds.mockResolvedValue([]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    expect(res.items[0].conversationName).toBe('Trò chuyện');
    expect(res.items[0].senderDisplayName).toBe('Người dùng');
    // Never empty strings — the UI would render blank rows.
    expect(res.items[0].conversationName).not.toBe('');
    expect(res.items[0].senderDisplayName).not.toBe('');
  });

  it('follows the displayName || phone || email fallback chain', async () => {
    mockFindReturns([makeRawMsg()]);
    mockConversationsService.getConversationsByIds.mockResolvedValue([
      {
        _id: convGroupId,
        type: ConversationType.GROUP,
        name: 'G',
        members: [{ userId: senderId, role: 'member' }],
      },
    ]);
    mockUsersService.findByIds.mockResolvedValue([
      { _id: senderId, displayName: '', phone: '+84900000000', email: 'x@y.z' },
    ]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    // displayName is empty → phone wins over email.
    expect(res.items[0].senderDisplayName).toBe('+84900000000');
  });

  it('batches lookups: findByIds + getConversationsByIds called ONCE for a multi-item page (no N+1)', async () => {
    mockMembershipService.getUserConversationIds.mockResolvedValue([
      convGroupId,
      convDirectId,
    ]);
    mockFindReturns([
      makeRawMsg({ _id: 'm1', conversationId: convGroupId, senderId }),
      makeRawMsg({ _id: 'm2', conversationId: convGroupId, senderId }),
      makeRawMsg({ _id: 'm3', conversationId: convDirectId, senderId }),
    ]);
    mockMessageModel.countDocuments.mockResolvedValue(3);
    mockConversationsService.getConversationsByIds.mockResolvedValue([
      {
        _id: convGroupId,
        type: ConversationType.GROUP,
        name: 'G',
        members: [{ userId: senderId, role: 'member' }],
      },
      {
        _id: convDirectId,
        type: ConversationType.DIRECT,
        name: null,
        members: [
          { userId: requesterId, role: 'member' },
          { userId: otherUserId, role: 'member' },
        ],
      },
    ]);
    mockUsersService.findByIds.mockResolvedValue([
      { _id: senderId, displayName: 'Bob', phone: '', email: '' },
      { _id: otherUserId, displayName: 'Alice', phone: '', email: '' },
    ]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    expect(res.items).toHaveLength(3);
    // One batched read each, regardless of page size.
    expect(
      mockConversationsService.getConversationsByIds,
    ).toHaveBeenCalledTimes(1);
    expect(mockUsersService.findByIds).toHaveBeenCalledTimes(1);
    // The single user query carries the de-duped id set (sender + other member).
    const idsArg = mockUsersService.findByIds.mock.calls[0][0] as string[];
    expect(idsArg).toEqual(expect.arrayContaining([senderId, otherUserId]));
  });

  it('preserves total and emits a nextCursor when the page overflows the limit', async () => {
    // limit 1, but find returns 2 (limit+1) → hasMore, so a cursor is emitted.
    mockFindReturns([
      makeRawMsg({ _id: 'first' }),
      makeRawMsg({ _id: 'overflow' }),
    ]);
    mockMessageModel.countDocuments.mockResolvedValue(42);
    mockConversationsService.getConversationsByIds.mockResolvedValue([
      {
        _id: convGroupId,
        type: ConversationType.GROUP,
        name: 'G',
        members: [{ userId: senderId, role: 'member' }],
      },
    ]);
    mockUsersService.findByIds.mockResolvedValue([
      { _id: senderId, displayName: 'Bob', phone: '', email: '' },
    ]);

    const res = await service.searchMessages(requesterId, 'chào', 1);

    expect(res.total).toBe(42);
    expect(res.items).toHaveLength(1); // page trimmed to limit
    // Relevance sort cannot be keyset-paginated, so the cursor is an
    // offset pointer: base64(JSON { o: offset + limit }) — here 0 + 1.
    expect(res.nextCursor).toBe(
      Buffer.from(JSON.stringify({ o: 1 })).toString('base64'),
    );
  });

  it('task 2.5 — issues no populate on the search chain and keeps senderId a string', async () => {
    mockFindReturns([makeRawMsg()]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    // Message.senderId is a plain String (no ref) — populating was a bogus
    // query; guard that the fixed path never calls populate again.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const chain = mockMessageModel.find.mock.results[0].value as {
      populate: jest.Mock;
    };
    expect(chain.populate).not.toHaveBeenCalled();
    // Response shape: senderId stays a plain string, never an object.
    expect(typeof res.items[0].senderId).toBe('string');
    expect(res.items[0].senderId).toBe(senderId);
  });

  it('returns empty (no cursor) when the user has no conversations', async () => {
    mockMembershipService.getUserConversationIds.mockResolvedValue([]);

    const res = await service.searchMessages(requesterId, 'chào', 20);

    expect(res).toEqual({ items: [], nextCursor: null, total: 0 });
    expect(mockUsersService.findByIds).not.toHaveBeenCalled();
  });
});
