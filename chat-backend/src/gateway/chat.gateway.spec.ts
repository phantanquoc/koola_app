import { ChatGateway } from './chat.gateway';
import { ConversationsService } from '../conversations/conversations.service';
import {
  ConversationType,
  MemberRole,
} from '../conversations/conversation.schema';

/**
 * Integrated coverage for membership-revocation room eviction.
 *
 * A REAL ConversationsService (with mocked Mongoose models) is wired to a REAL
 * ChatGateway (with a mocked `io`) through the gateway's real `afterInit()`.
 * That is deliberate: the only thing connecting "a member was kicked/left" to
 * "their sockets leave the conversation room" is
 *   ConversationsService.setMembershipRevokedCallback  ← afterInit
 *   membershipRevokedCallback?.(convId, userIds)        ← the service methods
 * so exercising both together means the tests go RED if EITHER the afterInit
 * wiring OR any of the three callback invocations is removed.
 *
 * Room naming under test: `user:<id>` (target of eviction) and
 * `conversation:<id>` (room the socket is removed from).
 */
describe('ChatGateway — membership revocation room eviction (integrated)', () => {
  // Valid ObjectId hex strings — findByIdOrFail validates the id and
  // removeMember/leaveGroup build `new Types.ObjectId(...)` for deleteOne.
  const convId = '507f1f77bcf86cd799439011';
  const adminId = '507f1f77bcf86cd799439012';
  const targetId = '507f1f77bcf86cd799439013';
  const userA = '507f1f77bcf86cd799439014';
  const userB = '507f1f77bcf86cd799439015';

  let conversationsService: ConversationsService;
  let gateway: ChatGateway;

  let conversationModel: any;
  let userConversationModel: any;
  let messageModel: any;
  let usersService: any;

  let socketsLeave: jest.Mock;
  let roomEmit: jest.Mock;
  let mockIo: any;

  // The doc returned by findById(id) with no projection (findByIdOrFail path).
  let currentConv: any;
  // The lean members doc returned by findById(id, {members:1}).lean()
  // (deleteConversation captures members BEFORE the delete).
  let leanMembers: Array<{ userId: { toString: () => string } }>;

  const member = (userId: string, role: MemberRole) => ({
    userId: { toString: () => userId },
    role,
    joinedAt: new Date(),
  });

  beforeEach(() => {
    conversationModel = {
      findById: jest.fn((id: string, projection?: unknown) => {
        if (projection) {
          // deleteConversation: findById(id, { members: 1 }).lean()
          return { lean: () => Promise.resolve({ members: leanMembers }) };
        }
        // findByIdOrFail: await findById(id)
        return Promise.resolve(currentConv);
      }),
      findByIdAndDelete: jest.fn().mockResolvedValue(undefined),
    };
    userConversationModel = {
      deleteOne: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    messageModel = {
      // createSystemMessage
      create: jest.fn().mockResolvedValue({}),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue({
        displayName: 'Someone',
        phone: null,
        email: null,
      }),
    };

    conversationsService = new ConversationsService(
      conversationModel,
      userConversationModel,
      messageModel,
      usersService,
    );

    // `io.in(room).socketsLeave(room2)` and `io.to(room).emit(evt, payload)`
    // land on separate spies so we can assert both halves of the eviction.
    socketsLeave = jest.fn();
    roomEmit = jest.fn();
    mockIo = {
      in: jest.fn().mockReturnValue({ socketsLeave }),
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
    };

    // afterInit also registers typing/blurhash/new-message/pin/unpin callbacks;
    // stub just enough for those setters to exist.
    const typingService = { setTypingStopCallback: jest.fn() };
    const messagesService = {
      setBlurhashCallback: jest.fn(),
      setNewMessageEmitCallback: jest.fn(),
    };

    gateway = new ChatGateway(
      usersService,
      conversationsService,
      {} as any, // membershipService — untouched by afterInit
      messagesService as any,
      typingService as any,
      {} as any, // jwtService — untouched by afterInit
    );
    (gateway as any).io = mockIo;

    // Wire the REAL callback onto the REAL service. Remove this line (or the
    // service-side callback invocation) and every assertion below fails.
    gateway.afterInit();
  });

  it('kick (removeMember) evicts the kicked user from conversation:<id>', async () => {
    currentConv = {
      _id: convId,
      type: ConversationType.GROUP,
      members: [
        member(adminId, MemberRole.ADMIN),
        member(targetId, MemberRole.MEMBER),
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };

    await conversationsService.removeMember(convId, targetId, adminId);

    expect(mockIo.in).toHaveBeenCalledWith(`user:${targetId}`);
    expect(socketsLeave).toHaveBeenCalledWith(`conversation:${convId}`);
    expect(mockIo.to).toHaveBeenCalledWith(`user:${targetId}`);
    expect(roomEmit).toHaveBeenCalledWith('conversation_access_revoked', {
      conversationId: convId,
    });
    // Only the kicked member is evicted — the admin keeps their room.
    expect(mockIo.in).not.toHaveBeenCalledWith(`user:${adminId}`);
  });

  it('self-leave (leaveGroup on a GROUP) evicts the leaving user', async () => {
    currentConv = {
      _id: convId,
      type: ConversationType.GROUP,
      members: [
        member(adminId, MemberRole.ADMIN),
        member(targetId, MemberRole.MEMBER),
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };

    await conversationsService.leaveGroup(convId, targetId);

    expect(mockIo.in).toHaveBeenCalledWith(`user:${targetId}`);
    expect(socketsLeave).toHaveBeenCalledWith(`conversation:${convId}`);
    expect(roomEmit).toHaveBeenCalledWith('conversation_access_revoked', {
      conversationId: convId,
    });
  });

  it('conversation-delete (leaveGroup on a DIRECT) evicts every member', async () => {
    currentConv = {
      _id: convId,
      type: ConversationType.DIRECT,
      members: [
        member(userA, MemberRole.MEMBER),
        member(userB, MemberRole.MEMBER),
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };
    // deleteConversation reads members via the projected lean() BEFORE deleting.
    leanMembers = [
      { userId: { toString: () => userA } },
      { userId: { toString: () => userB } },
    ];

    await conversationsService.leaveGroup(convId, userA);

    // Both participants are evicted (the delete path was newly reachable only
    // after the /members/me route fix — Task 3 — so it gets explicit coverage).
    expect(conversationModel.findByIdAndDelete).toHaveBeenCalledWith(convId);
    expect(mockIo.in).toHaveBeenCalledWith(`user:${userA}`);
    expect(mockIo.in).toHaveBeenCalledWith(`user:${userB}`);
    expect(socketsLeave).toHaveBeenCalledWith(`conversation:${convId}`);
    expect(socketsLeave).toHaveBeenCalledTimes(2);
    expect(roomEmit).toHaveBeenCalledWith('conversation_access_revoked', {
      conversationId: convId,
    });
  });
});
