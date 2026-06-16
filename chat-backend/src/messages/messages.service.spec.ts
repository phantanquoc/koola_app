import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Message, MessageType, MessageStatus } from './message.schema';
import { Media } from '../media/media.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    setTypingStopCallback: jest.fn(),
  };

  const mockNotificationsService = {
    sendPushNotification: jest.fn(),
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
