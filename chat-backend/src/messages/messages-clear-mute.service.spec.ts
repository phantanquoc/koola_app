import { MessagesService } from './messages.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

/**
 * conversation-quick-actions — cleared-history filters + mute push (task 4.3).
 *
 * Covers: listMessages / getMessagesAround / syncMessages exclude
 * createdAt <= clearedAt for the clearer only; push recipients exclude muted
 * users while socket delivery is untouched.
 */
describe('MessagesService — clear cutoff and mute push', () => {
  const userId = 'user-1';
  const otherId = 'user-2';
  const convId = 'conv-1';
  const clearedAt = new Date('2026-10-01T00:00:00.000Z');

  function listChain(docs: unknown[] = []) {
    const c: any = {};
    c.sort = jest.fn().mockReturnValue(c);
    c.limit = jest.fn().mockReturnValue(c);
    c.lean = jest.fn().mockResolvedValue(docs);
    return c;
  }

  const mockMessageModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };
  const mockConversationsService = {
    findByIdOrFail: jest.fn(),
    updateLastMessage: jest.fn(),
    getSharedConversationIds: jest.fn(),
    getClearedAt: jest.fn(),
    getClearedMap: jest.fn(),
    getMutedUserIds: jest.fn(),
  };
  const mockMembershipService = { verifyMember: jest.fn() };
  const mockUnreadService = { incrementUnreadCount: jest.fn() };
  const mockTypingService = { startTyping: jest.fn(), stopTyping: jest.fn() };
  const mockNotificationsService = { sendPushNotification: jest.fn() };
  const mockUsersService = { findByIds: jest.fn().mockResolvedValue([]) };

  let service: MessagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MessagesService(
      mockMessageModel as any,
      mockConversationsService as unknown as ConversationsService,
      mockMembershipService as unknown as MembershipService,
      mockUnreadService as unknown as UnreadService,
      mockTypingService as unknown as TypingService,
      mockNotificationsService as unknown as NotificationsService,
      mockUsersService as unknown as UsersService,
    );
    mockMembershipService.verifyMember.mockResolvedValue(undefined);
    mockConversationsService.getClearedAt.mockResolvedValue(null);
    mockConversationsService.getClearedMap.mockResolvedValue(new Map());
    mockConversationsService.getMutedUserIds.mockResolvedValue(new Set());
    mockMessageModel.find.mockReturnValue(listChain([]));
  });

  it('listMessages adds createdAt > clearedAt for the clearer', async () => {
    mockConversationsService.getClearedAt.mockResolvedValue(clearedAt);

    await service.listMessages(convId, userId);

    expect(mockMessageModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: convId,
        createdAt: { $gt: clearedAt },
      }),
    );
  });

  it('listMessages merges the clear cutoff with a cursor bound', async () => {
    mockConversationsService.getClearedAt.mockResolvedValue(clearedAt);
    const cursor = new Date('2026-10-05T00:00:00.000Z').toISOString();

    await service.listMessages(convId, userId, cursor);

    expect(mockMessageModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: { $lt: new Date(cursor), $gt: clearedAt },
      }),
    );
  });

  it('listMessages is unchanged for a member who never cleared', async () => {
    await service.listMessages(convId, otherId);

    const query = mockMessageModel.find.mock.calls[0][0];
    expect(query).not.toHaveProperty('createdAt');
  });

  it('getMessagesAround 404s when the target predates the clear point', async () => {
    mockConversationsService.getClearedAt.mockResolvedValue(clearedAt);
    mockMessageModel.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'msg-old',
          conversationId: convId,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
    });

    await expect(
      service.getMessagesAround(convId, userId, 'msg-old'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('getMessagesAround bounds the before-window at the clear point', async () => {
    mockConversationsService.getClearedAt.mockResolvedValue(clearedAt);
    const targetCreated = new Date('2026-10-05T00:00:00.000Z');
    mockMessageModel.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'msg-new',
          conversationId: convId,
          createdAt: targetCreated,
        }),
    });
    const beforeChain = listChain([]);
    const afterChain = listChain([]);
    mockMessageModel.find
      .mockReturnValueOnce(beforeChain)
      .mockReturnValueOnce(afterChain);
    mockMessageModel.findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'msg-new',
          conversationId: convId,
          createdAt: targetCreated,
          readBy: [],
        }),
    });

    await service.getMessagesAround(convId, userId, 'msg-new');

    expect(mockMessageModel.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        createdAt: { $lt: targetCreated, $gt: clearedAt },
      }),
    );
  });

  it('syncMessages wraps cleared conversations in a per-conversation createdAt clause', async () => {
    mockConversationsService.getSharedConversationIds.mockResolvedValue([
      convId,
      'conv-2',
    ]);
    mockConversationsService.getClearedMap.mockResolvedValue(
      new Map([[convId, clearedAt]]),
    );
    mockMessageModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ lean: () => Promise.resolve([]) }),
      }),
    });

    await service.syncMessages(
      userId,
      new Date('2026-01-01T00:00:00.000Z').toISOString(),
    );

    const query = mockMessageModel.find.mock.calls[0][0];
    expect(query.$and).toHaveLength(2);
    expect(query.$and[0]).toEqual({
      $or: [
        { conversationId: { $in: ['conv-2'] } },
        { conversationId: convId, createdAt: { $gt: clearedAt } },
      ],
    });
    expect(query.$and[1]).toMatchObject({ updatedAt: expect.anything() });
  });

  it('syncMessages keeps the legacy shape when nobody cleared', async () => {
    mockConversationsService.getSharedConversationIds.mockResolvedValue([
      convId,
    ]);
    mockMessageModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ lean: () => Promise.resolve([]) }),
      }),
    });

    await service.syncMessages(
      userId,
      new Date('2026-01-01T00:00:00.000Z').toISOString(),
    );

    expect(mockMessageModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: { $in: [convId] },
        updatedAt: expect.anything(),
      }),
    );
  });

  it('push skips muted recipients but keeps everyone else', async () => {
    mockConversationsService.findByIdOrFail.mockResolvedValue({
      type: 'group',
      name: 'g',
      members: [
        { userId: { toString: () => userId } },
        { userId: { toString: () => otherId } },
        { userId: { toString: () => 'user-3' } },
      ],
    });
    // otherId muted the conversation.
    mockConversationsService.getMutedUserIds.mockResolvedValue(
      new Set([otherId]),
    );
    mockNotificationsService.sendPushNotification.mockResolvedValue(undefined);

    await service.triggerPushNotifications(
      { _id: { toString: () => 'm1' }, type: 'text', content: 'hi' } as any,
      convId,
      userId,
      'Sender',
    );

    // Flush the fire-and-forget push.
    await new Promise((r) => setImmediate(r));
    expect(
      mockNotificationsService.sendPushNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['user-3'] }),
    );
  });

  it('push still fires to everyone when nobody is muted', async () => {
    mockConversationsService.findByIdOrFail.mockResolvedValue({
      type: 'direct',
      name: null,
      members: [
        { userId: { toString: () => userId } },
        { userId: { toString: () => otherId } },
      ],
    });
    mockNotificationsService.sendPushNotification.mockResolvedValue(undefined);

    await service.triggerPushNotifications(
      { _id: { toString: () => 'm1' }, type: 'text', content: 'hi' } as any,
      convId,
      userId,
      'Sender',
    );

    await new Promise((r) => setImmediate(r));
    expect(
      mockNotificationsService.sendPushNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [otherId] }),
    );
  });
});
