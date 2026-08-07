import { ChatGateway } from './chat.gateway';

/**
 * Coverage for `broadcastNewMessage` — the `new_message` fan-out.
 *
 * WHY THIS EXISTS
 * The conversation room alone is not a sufficient audience for `new_message`.
 * A client only joins `conversation:<id>` while ChatScreen is mounted, so a
 * recipient sitting on the conversation list (or any other tab) never received
 * the event: `socketEventRouter` never ran, `bumpFromMessage` never ran, and the
 * list could not update until a manual refresh. The fix adds each member's
 * personal `user:<id>` room to the same broadcast.
 *
 * THE LOAD-BEARING DETAIL — ONE `.to()` CALL
 * A recipient WITH the chat open is in BOTH `conversation:<id>` and
 * `user:<their id>`. Socket.IO dedupes recipients across the rooms of a single
 * broadcast (in-memory-adapter `apply()` keeps an `ids` Set; the Redis adapter
 * delegates local delivery to that same path), so such a socket receives exactly
 * one copy. That is why every room must go into ONE `.to([...])` call: splitting
 * it into a second `.to()` would emit a second, independent broadcast, the
 * client would apply `new_message` twice, and `bumpFromMessage` would
 * double-count unread. The "single call" assertions below are guarding that
 * invariant, not the syntax.
 */
describe('ChatGateway.broadcastNewMessage — member fan-out', () => {
  const convId = '507f1f77bcf86cd799439011';
  const senderId = '507f1f77bcf86cd799439012';
  const recipientId = '507f1f77bcf86cd799439013';

  const message = { _id: 'm1', conversationId: convId, content: 'hi' };

  let emit: jest.Mock;
  let exceptEmit: jest.Mock;
  let except: jest.Mock;
  // Typed on the argument so reading `to.mock.calls[0][0]` stays type-safe —
  // the room list is the whole point of these assertions.
  let to: jest.Mock<{ emit: jest.Mock; except: jest.Mock }, [string[]]>;
  let mockIo: { to: typeof to };
  let getMemberIds: jest.Mock;
  let gateway: ChatGateway;

  beforeEach(() => {
    emit = jest.fn();
    exceptEmit = jest.fn();
    except = jest.fn().mockReturnValue({ emit: exceptEmit });
    to = jest
      .fn<{ emit: jest.Mock; except: jest.Mock }, [string[]]>()
      .mockReturnValue({ emit, except });
    mockIo = { to };

    getMemberIds = jest.fn().mockResolvedValue([senderId, recipientId]);

    gateway = new ChatGateway(
      {} as never, // usersService — untouched by this path
      {} as never, // conversationsService
      { getMemberIds } as never, // membershipService
      {} as never, // messagesService
      {} as never, // typingService
      {} as never, // jwtService
    );
    (gateway as unknown as { io: unknown }).io = mockIo;
  });

  it('emits to the conversation room AND every member user room', async () => {
    await gateway.broadcastNewMessage(convId, message);

    expect(to).toHaveBeenCalledTimes(1);
    const rooms = to.mock.calls[0][0];
    expect(rooms).toContain(`conversation:${convId}`);
    expect(rooms).toContain(`user:${senderId}`);
    expect(rooms).toContain(`user:${recipientId}`);
    expect(emit).toHaveBeenCalledWith('new_message', { message });
  });

  it('passes every room in ONE .to() call so Socket.IO dedupes recipients', async () => {
    // A recipient with the chat open is in the conversation room AND their user
    // room. One `.to([...])` → one deduped delivery. Two `.to()` calls → two
    // deliveries → unread counted twice on the client.
    await gateway.broadcastNewMessage(convId, message);

    expect(to).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('excludes the sending socket, which already received message_ack', async () => {
    await gateway.broadcastNewMessage(convId, message, 'socket-sender');

    expect(except).toHaveBeenCalledWith('socket-sender');
    expect(exceptEmit).toHaveBeenCalledWith('new_message', { message });
    // The un-excepted channel must not also fire, or the sender's socket would
    // get the broadcast it was meant to be excluded from.
    expect(emit).not.toHaveBeenCalled();
  });

  it('still emits to the conversation room when the member lookup fails', async () => {
    // Degrade, never drop: clients with the chat open must still update, and the
    // sync loop backfills everyone else.
    getMemberIds.mockRejectedValue(new Error('mongo down'));

    await gateway.broadcastNewMessage(convId, message);

    expect(to).toHaveBeenCalledWith([`conversation:${convId}`]);
    expect(emit).toHaveBeenCalledWith('new_message', { message });
  });

  it('does not reject when the member lookup fails', async () => {
    getMemberIds.mockRejectedValue(new Error('mongo down'));

    await expect(
      gateway.broadcastNewMessage(convId, message),
    ).resolves.toBeUndefined();
  });
});
