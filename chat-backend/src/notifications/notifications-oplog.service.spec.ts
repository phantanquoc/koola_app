import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';
import { OpsLogService } from '../ops/ops-log.service';
import { MessageType } from '../messages/message.schema';
import { ConversationType } from '../conversations/conversation.schema';

/** Push log: một dòng mỗi người nhận, kể cả khi không có token nào. */
describe('NotificationsService — push log', () => {
  let service: NotificationsService;
  let users: { findByIds: jest.Mock };
  let opsLog: { logPush: jest.Mock; logOtp: jest.Mock };

  const baseParams = {
    senderId: 'sender',
    senderName: 'An',
    conversationId: 'conv-1',
    conversationType: ConversationType.DIRECT,
    messageId: 'm1',
    messageType: MessageType.TEXT,
    messageContent: 'Chào bạn',
    recipientIds: ['u1'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    users = { findByIds: jest.fn() };
    opsLog = { logPush: jest.fn(), logOtp: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: UsersService, useValue: users },
        {
          provide: RedisService,
          useValue: { setNXEX: jest.fn().mockResolvedValue(true) },
        },
        { provide: OpsLogService, useValue: opsLog },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  const user = (overrides: Record<string, unknown> = {}) => ({
    _id: 'u1',
    settings: { notificationsEnabled: true },
    isOnline: false,
    fcmTokens: [{ token: 't1' }, { token: 't2' }],
    accountType: 'personal',
    ...overrides,
  });

  it('ghi 1 dòng với số token thật sau khi gửi', async () => {
    users.findByIds.mockResolvedValue([user()]);
    jest
      .spyOn(
        service as unknown as {
          sendMulticast: (...a: unknown[]) => Promise<unknown>;
        },
        'sendMulticast',
      )
      .mockResolvedValue({ successCount: 1, failureCount: 1 });

    await service.sendPushNotification(baseParams);

    expect(opsLog.logPush).toHaveBeenCalledTimes(1);
    expect(opsLog.logPush).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        tokenCount: 2,
        successCount: 1,
        failureCount: 1,
        title: 'An',
        kind: 'message',
      }),
    );
  });

  it('vẫn ghi dòng 0 token khi người dùng chưa đăng ký thiết bị', async () => {
    users.findByIds.mockResolvedValue([user({ fcmTokens: [] })]);

    await service.sendPushNotification(baseParams);

    expect(opsLog.logPush).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        tokenCount: 0,
        successCount: 0,
        failureCount: 0,
      }),
    );
  });

  it('ghi failureCount = số token khi FCM ném lỗi', async () => {
    users.findByIds.mockResolvedValue([user()]);
    jest
      .spyOn(
        service as unknown as {
          sendMulticast: (...a: unknown[]) => Promise<unknown>;
        },
        'sendMulticast',
      )
      .mockRejectedValue(new Error('fcm down'));

    await service.sendPushNotification(baseParams);

    expect(opsLog.logPush).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenCount: 2,
        successCount: 0,
        failureCount: 2,
      }),
    );
  });

  it('không ghi log khi người nhận đang online (không có lần gửi nào)', async () => {
    users.findByIds.mockResolvedValue([user({ isOnline: true })]);

    await service.sendPushNotification(baseParams);

    expect(opsLog.logPush).not.toHaveBeenCalled();
  });
});
