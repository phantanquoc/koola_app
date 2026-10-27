/**
 * Batch-B tests (commerce-orders 3.3): sendOrderPush eligibility gates,
 * dedup key shape, and payload deepLink/account context.
 */
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';

describe('NotificationsService — sendOrderPush (commerce-orders 3.3)', () => {
  let service: NotificationsService;
  let users: { findById: jest.Mock };
  let redis: { setNXEX: jest.Mock };
  let multicastSpy: jest.SpyInstance;
  let getMessagingMock: jest.Mock;

  const token = 'tok-1';

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
    };
    redis = { setNXEX: jest.fn().mockResolvedValue(true) };

    // Mock firebase admin messaging per-call so sendMulticast does not throw.
    // Patch the fcm-client lazy import by installing a usable messaging double
    // on the NotificationsService after construction would be complex — instead
    // replace getMessaging at module resolution time would require moduleNameMapper.
    // Simpler: override sendMulticast visibility via a spy that captures the payload.
    getMessagingMock = jest.fn();

    const mod = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: UsersService, useValue: users },
        { provide: RedisService, useValue: { setNXEX: redis.setNXEX } },
      ],
    }).compile();

    service = mod.get(NotificationsService);
    multicastSpy = jest
      .spyOn(
        service as unknown as {
          sendMulticast: (...a: unknown[]) => Promise<void>;
        },
        'sendMulticast',
      )
      .mockResolvedValue(undefined as unknown as void);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const freshUser = (overrides: Record<string, unknown> = {}) => ({
    _id: 'user-1',
    settings: { notificationsEnabled: true },
    isOnline: false,
    fcmTokens: [{ token }],
    accountType: 'personal',
    ...overrides,
  });

  it('pushes once with deepLink koola://orders/<id> and account context', async () => {
    users.findById.mockResolvedValue(
      freshUser({ _id: 'user-1', accountType: 'business' }),
    );
    redis.setNXEX.mockResolvedValue(true);

    await service.sendOrderPush({
      recipientUserId: 'user-1',
      title: 'T',
      body: 'B',
      orderId: 'order-42',
      status: 'CONFIRMED',
      conversationId: 'conv-1',
    });

    expect(multicastSpy).toHaveBeenCalledTimes(1);
    const [, , payload] = multicastSpy.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    const data = payload.data as Record<string, string>;
    expect(data.type).toBe('order_update');
    expect(data.orderId).toBe('order-42');
    expect(data.status).toBe('CONFIRMED');
    expect(data.conversationId).toBe('conv-1');
    expect(data.deepLink).toBe('koola://orders/order-42');
    expect(data.accountId).toBe('user-1');
    expect(data.accountType).toBe('business');
    expect(redis.setNXEX).toHaveBeenCalledWith(
      'notif:order:user-1:order-42:CONFIRMED',
      expect.any(String),
      86400,
    );
  });

  it('skips when dedup key is held (no second push for same order+status)', async () => {
    users.findById.mockResolvedValue(freshUser());
    redis.setNXEX.mockResolvedValue(false);

    await service.sendOrderPush({
      recipientUserId: 'user-1',
      title: 'T',
      body: 'B',
      orderId: 'order-42',
      status: 'CONFIRMED',
      conversationId: 'conv-1',
    });

    expect(multicastSpy).not.toHaveBeenCalled();
  });

  it('skips when the user disabled notifications', async () => {
    users.findById.mockResolvedValue(
      freshUser({ settings: { notificationsEnabled: false } }),
    );

    await service.sendOrderPush({
      recipientUserId: 'user-1',
      title: 'T',
      body: 'B',
      orderId: 'order-42',
      status: 'PENDING',
      conversationId: 'conv-1',
    });

    expect(multicastSpy).not.toHaveBeenCalled();
    expect(redis.setNXEX).not.toHaveBeenCalled();
  });

  it('different status values produce different dedup keys', async () => {
    users.findById.mockResolvedValue(freshUser());
    redis.setNXEX.mockResolvedValue(true);

    await service.sendOrderPush({
      recipientUserId: 'u1',
      title: 'T',
      body: 'B',
      orderId: 'o1',
      status: 'CONFIRMED',
      conversationId: 'c1',
    });
    await service.sendOrderPush({
      recipientUserId: 'u1',
      title: 'T',
      body: 'B',
      orderId: 'o1',
      status: 'SHIPPING',
      conversationId: 'c1',
    });

    const keys = redis.setNXEX.mock.calls.map((c: unknown[]) => c[0]);
    expect(keys).toContain('notif:order:u1:o1:CONFIRMED');
    expect(keys).toContain('notif:order:u1:o1:SHIPPING');
  });
});
