import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Message, MessageType, MessageStatus } from './message.schema';
import { Media } from '../media/media.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Unit tests for MessagesService.getMessagesAround (bidirectional context window).
 * Covers:
 *   1. Happy path: returns before + target + after with correct order
 *   2. hasBefore/hasAfter booleans correct at conversation boundaries
 *   3. Target not found → NotFoundException (404)
 *   4. Non-member → ForbiddenException (403)
 *   5. Cursor param rejection handled at controller level (not tested here)
 */
describe('MessagesService — getMessagesAround', () => {
  let service: MessagesService;

  const mockConversationId = 'conv123';
  const mockUserId = 'user1';
  const mockTargetId = '507f1f77bcf86cd799439011';

  // Helper: create a lean message mock
  const makeLeanMsg = (id: string, createdAt: Date) => ({
    _id: id,
    conversationId: mockConversationId,
    senderId: 'user2',
    content: `msg-${id}`,
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    deleted: false,
    createdAt,
    readBy: [],
  });

  const targetDate = new Date('2026-06-01T12:00:00Z');
  const targetMsg = makeLeanMsg(mockTargetId, targetDate);

  // Generate before/after messages for testing
  const beforeMsgs = Array.from({ length: 12 }, (_, i) =>
    makeLeanMsg(
      `before-${i}`,
      new Date(targetDate.getTime() - (i + 1) * 60000),
    ),
  );
  const afterMsgs = Array.from({ length: 12 }, (_, i) =>
    makeLeanMsg(`after-${i}`, new Date(targetDate.getTime() + (i + 1) * 60000)),
  );

  // Mock chainable query object
  const makeChainableQuery = (results: any[]) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(results),
  });

  const mockMessageModel: any = {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockMembershipService = {
    verifyMember: jest.fn(),
    getUserConversationIds: jest.fn(),
  };

  const mockConversationsService = {
    findByIdOrFail: jest.fn(),
    updateLastMessage: jest.fn(),
    getSharedConversationIds: jest.fn(),
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

  const mockMediaModel = {
    findOne: jest.fn().mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    }),
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

    // Default: membership verification passes
    mockMembershipService.verifyMember.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns context window with hasBefore=true and hasAfter=true when messages exist on both sides', async () => {
    // findOne for target
    mockMessageModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    // find for before (descending) — return 11 (> half=10) to indicate hasBefore
    const beforeChain = makeChainableQuery(beforeMsgs.slice(0, 11));
    // find for after (ascending) — return 11 to indicate hasAfter
    const afterChain = makeChainableQuery(afterMsgs.slice(0, 11));

    mockMessageModel.find
      .mockReturnValueOnce(beforeChain) // before query
      .mockReturnValueOnce(afterChain); // after query

    // findById for populated target
    mockMessageModel.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    const result = await service.getMessagesAround(
      mockConversationId,
      mockUserId,
      mockTargetId,
      20,
    );

    expect(result.hasBefore).toBe(true);
    expect(result.hasAfter).toBe(true);
    // 10 before + target + 10 after = 21
    expect(result.messages.length).toBe(21);
    // Target is in the middle
    expect((result.messages[10] as any)._id).toBe(mockTargetId);
  });

  it('returns hasBefore=false when fewer messages exist before target (backfills from after)', async () => {
    // Only 3 messages before target
    const fewBefore = beforeMsgs.slice(0, 3);

    mockMessageModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    // Before query returns only 3 (no sentinel → hasBefore=false)
    const beforeChain = makeChainableQuery(fewBefore);
    // After query: with backfill, afterLimit = 10 + (10-3) = 17, so query asks for 18
    // Return 12 available (all afterMsgs) — less than afterLimit+1 → hasAfter=false
    const afterChain = makeChainableQuery(afterMsgs);

    mockMessageModel.find
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(afterChain);

    mockMessageModel.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    const result = await service.getMessagesAround(
      mockConversationId,
      mockUserId,
      mockTargetId,
      20,
    );

    expect(result.hasBefore).toBe(false);
    expect(result.hasAfter).toBe(false);
    // Backfill: 3 before + target + 12 after = 16 (all available, up to limit)
    expect(result.messages.length).toBe(16);
  });

  it('throws NotFoundException when target message does not exist in conversation', async () => {
    mockMessageModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.getMessagesAround(
        mockConversationId,
        mockUserId,
        mockTargetId,
        20,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when caller is not a member', async () => {
    mockMembershipService.verifyMember.mockRejectedValue(
      new ForbiddenException('Not a member'),
    );

    await expect(
      service.getMessagesAround(
        mockConversationId,
        mockUserId,
        mockTargetId,
        20,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns hasAfter=false when no messages exist after target', async () => {
    mockMessageModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    const beforeChain = makeChainableQuery(beforeMsgs.slice(0, 11));
    const afterChain = makeChainableQuery([]); // no messages after
    // Backfill: afterDeficit=10, hasBefore=true → extra before query
    const extraBeforeChain = makeChainableQuery(beforeMsgs.slice(10, 12));

    mockMessageModel.find
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(afterChain)
      .mockReturnValueOnce(extraBeforeChain);

    mockMessageModel.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    const result = await service.getMessagesAround(
      mockConversationId,
      mockUserId,
      mockTargetId,
      20,
    );

    // After symmetrical backfill: extraBefore returns 2 items (< afterDeficit=10),
    // so finalHasBefore = false (no more messages before the extended slice).
    expect(result.hasBefore).toBe(false);
    expect(result.hasAfter).toBe(false);
    // Backfill: 10 before + 2 extra before + target + 0 after = 13
    expect(result.messages.length).toBe(13);
  });

  it('returns hasBefore=false when target is near conversation start (few messages before)', async () => {
    // Only 2 messages before target (< half=10), so hasBefore is false from the start.
    // After query returns enough to fill — no symmetrical backfill needed.
    const fewBefore = beforeMsgs.slice(0, 2);

    mockMessageModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    const beforeChain = makeChainableQuery(fewBefore); // 2 items, no sentinel
    // afterLimit = half + (half - 2) = 10 + 8 = 18; return 11 (> afterLimit? no, 11 < 19)
    // Actually afterLimit = 18, sentinel check: afterMessages.length > 18? 11 > 18 = false
    const afterChain = makeChainableQuery(afterMsgs.slice(0, 11));

    mockMessageModel.find
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(afterChain);

    mockMessageModel.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(targetMsg),
    });

    const result = await service.getMessagesAround(
      mockConversationId,
      mockUserId,
      mockTargetId,
      20,
    );

    // Target near start: only 2 messages before → hasBefore must be false
    expect(result.hasBefore).toBe(false);
    // 11 after, afterLimit=18, 11 < 19 → hasAfter=false
    expect(result.hasAfter).toBe(false);
    // 2 before + target + 11 after = 14
    expect(result.messages.length).toBe(14);
  });

  it('normalizes readBy field on returned messages', async () => {
    const targetNoReadBy = { ...targetMsg, readBy: undefined };

    mockMessageModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(targetNoReadBy),
    });

    const beforeChain = makeChainableQuery([]);
    const afterChain = makeChainableQuery([]);

    mockMessageModel.find
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(afterChain);

    mockMessageModel.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(targetNoReadBy),
    });

    const result = await service.getMessagesAround(
      mockConversationId,
      mockUserId,
      mockTargetId,
      20,
    );

    // readBy should be normalized to empty array
    expect((result.messages[0] as any).readBy).toEqual([]);
  });
});
