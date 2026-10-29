/**
 * Batch-B tests (commerce-orders 3.1): forged order metadata is stripped by
 * MessagesService.sendMessage, and sendMessageWithOrderCard posts a
 * service-only card that fans out through the gateway callback.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MessagesService } from './messages.service';
import { Message, MessageType } from './message.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

describe('MessagesService — order card metadata (commerce-orders 3.1)', () => {
  let service: MessagesService;

  const mockMessageModel = {
    findById: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };
  const mockConversationsService = {
    findByIdOrFail: jest.fn(),
    updateLastMessage: jest.fn(),
    getSharedConversationIds: jest.fn(),
    getClearedAt: jest.fn().mockResolvedValue(null),
    getClearedMap: jest.fn().mockResolvedValue(new Map()),
    getMutedUserIds: jest.fn().mockResolvedValue(new Set()),
  };
  const mockMembershipService = { verifyMember: jest.fn() };
  const mockUnreadService = { incrementUnreadCount: jest.fn() };
  const mockTypingService = { startTyping: jest.fn(), stopTyping: jest.fn() };
  const mockNotificationsService = { sendPushNotification: jest.fn() };
  const mockUsersService = { findByIds: jest.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
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
    mockConversationsService.updateLastMessage.mockResolvedValue(undefined);
    mockUnreadService.incrementUnreadCount.mockResolvedValue(undefined);
    mockTypingService.stopTyping.mockReturnValue(undefined);
    mockMessageModel.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sendMessage strips forged metadata.order — card is never client-writable', async () => {
    mockMessageModel.create.mockResolvedValue({
      _id: 'newmsg',
      conversationId: 'conv1',
      senderId: 'user1',
    });

    await service.sendMessage('conv1', 'user1', {
      type: MessageType.TEXT,
      content: 'hi',
    } as never);

    const payload = mockMessageModel.create.mock.calls[0][0] as {
      metadata: unknown;
    };
    expect(payload.metadata).toBeNull();
  });

  it('sendMessageWithOrderCard sets metadata.order and fans out via the gateway callback', async () => {
    mockMessageModel.create.mockResolvedValue({
      _id: 'card1',
      conversationId: 'conv1',
      senderId: 'buyer1',
    });
    const emitted: Array<{ conv: string; payload: unknown }> = [];
    service.setNewMessageEmitCallback((conv, payload) => {
      emitted.push({ conv, payload });
    });

    const out = await service.sendMessageWithOrderCard(
      'conv1',
      'buyer1',
      'content',
      { orderId: 'o1', code: 'KO-X', status: 'PENDING' },
    );

    const payload = mockMessageModel.create.mock.calls[0][0] as {
      metadata: { order: { orderId: string; code: string; status: string } };
    };
    expect(payload.metadata.order).toEqual({
      orderId: 'o1',
      code: 'KO-X',
      status: 'PENDING',
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].conv).toBe('conv1');
    expect(out.senderId).toBe('buyer1');
  });
});
