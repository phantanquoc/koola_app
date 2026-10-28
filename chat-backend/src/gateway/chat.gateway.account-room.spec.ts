import { ChatGateway } from './chat.gateway';
import { JwtService } from '@nestjs/jwt';

/**
 * `account:personal` / `account:business` là đích duy nhất của broadcast theo
 * loại tài khoản. Trước đây gateway chỉ join `user:<id>` nên BroadcastService
 * phải `ns.emit()` cho toàn bộ socket trong khi log ghi "gửi cho nhóm" —
 * moderator tưởng đã gửi đúng nhóm.
 */
describe('ChatGateway — room theo loại tài khoản khi handshake', () => {
  const SUB = '507f1f77bcf86cd799439001';

  function makeGateway(tokenPayload: Record<string, unknown>) {
    const jwt = {
      verify: jest.fn().mockReturnValue(tokenPayload),
    } as unknown as JwtService;
    const usersService = {
      updateOnlineStatus: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = new ChatGateway(
      usersService as never,
      {} as never, // conversationsService
      {} as never, // membershipService
      {} as never, // messagesService
      {} as never, // typingService
      jwt,
    );
    // Presence không thuộc phạm vi test này.
    jest
      .spyOn(
        gateway as unknown as { broadcastPresence: () => Promise<void> },
        'broadcastPresence',
      )
      .mockResolvedValue(undefined);
    jest
      .spyOn(
        gateway as unknown as { resetHeartbeat: () => void },
        'resetHeartbeat',
      )
      .mockImplementation(() => undefined);
    return gateway;
  }

  function makeClient() {
    return {
      id: 's1',
      handshake: { query: { token: 't' } },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
  }

  it.each([
    ['personal', 'account:personal'],
    ['business', 'account:business'],
  ])('token accountType=%s → join %s', async (accountType, room) => {
    const gateway = makeGateway({ sub: SUB, phone: '0900000000', accountType });
    const client = makeClient();

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith(`user:${SUB}`);
    expect(client.join).toHaveBeenCalledWith(room);
  });

  // Token cũ không có claim accountType → phải rơi vào personal, không phải
  // không join room nào (nếu không, broadcast personal sẽ không tới được họ).
  it('token không có accountType → mặc định account:personal', async () => {
    const gateway = makeGateway({ sub: SUB, phone: '0900000000' });
    const client = makeClient();

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith('account:personal');
  });
});
