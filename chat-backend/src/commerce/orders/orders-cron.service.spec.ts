/**
 * Batch-B tests (commerce-orders 3.4): cron reminder + auto-deliver paths
 * with fake timers, Redis lock deduplication, and bySystem reuse.
 *
 * Two phases in lock scope: (1) PENDING > 24h → push + lastReminderAt,
 * no status change; (2) SHIPPING > 7d → receiveOrder bySystem branch
 * so history/push/card/soldCount match the buyer path.
 *
 * The OrdersService and message/push fan-out are mocked — we assert only
 * the cron's wall-persistence + the branch it calls, consistent with the
 * spec requirement that the cron reuse the service transition path.
 */
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CommerceOrder } from './schemas/commerce-order.schema';
import { OrdersService } from './orders.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  OrdersCronService,
  ORDER_REMINDER_AFTER_MS,
  ORDER_AUTO_DELIVER_AFTER_MS,
} from './orders-cron.service';

describe('OrdersCronService (commerce-orders 3.4)', () => {
  let service: OrdersCronService;
  let orderModel: { find: jest.Mock; updateOne: jest.Mock };
  let ordersService: { receiveOrder: jest.Mock };
  let notificationsService: { sendOrderPush: jest.Mock };
  let redis: { tryAcquireLock: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));

    orderModel = {
      find: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    ordersService = { receiveOrder: jest.fn().mockResolvedValue({}) };
    notificationsService = { sendOrderPush: jest.fn().mockResolvedValue(undefined) };
    redis = { tryAcquireLock: jest.fn().mockResolvedValue(true) };

    const mod = await Test.createTestingModule({
      providers: [
        OrdersCronService,
        { provide: getModelToken(CommerceOrder.name), useValue: orderModel },
        { provide: OrdersService, useValue: ordersService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = mod.get(OrdersCronService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function chain(rows: unknown[]) {
    return {
      select: jest.fn(() => ({
        lean: jest.fn(() => Promise.resolve(rows)),
      })),
    };
  }

  it('reminder: pushes PENDING orders older than 24h and stamps lastReminderAt; no status change', async () => {
    const oid = '507f1f77bcf86cd799439021';
    orderModel.find
      // Phase 1: one PENDING stale row.
      .mockReturnValueOnce(chain([{ _id: oid, orderCode: 'KO-A', sellerId: 's1', buyerId: 'b1' }]))
      // Phase 2: no SHIPPING rows.
      .mockReturnValueOnce(chain([]));

    await service.handleOrdersTick();

    expect(notificationsService.sendOrderPush).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: oid, status: 'PENDING' }),
    );
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: oid },
      { $set: { lastReminderAt: expect.any(Date) } },
    );
    expect(ordersService.receiveOrder).not.toHaveBeenCalled();
  });

  it('auto-deliver: SHIPPING orders older than 7d are delivered via receiveOrder bySystem', async () => {
    const oid = '507f1f77bcf86cd799439099';
    orderModel.find
      // Phase 1: no PENDING rows.
      .mockReturnValueOnce(chain([]))
      // Phase 2: one SHIPPING row stale beyond 7d (updatedAt check is in find filter).
      .mockReturnValueOnce(chain([{ _id: oid, orderCode: 'KO-B' }]));

    await service.handleOrdersTick();

    expect(ordersService.receiveOrder).toHaveBeenCalledWith(
      { sub: 'system' },
      oid,
      { bySystem: true },
    );
    expect(notificationsService.sendOrderPush).not.toHaveBeenCalled();
  });

  it('skips a tick when the Redis lock is not acquired', async () => {
    redis.tryAcquireLock.mockResolvedValue(false);

    await service.handleOrdersTick();

    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('exports injectable thresholds', () => {
    expect(ORDER_REMINDER_AFTER_MS).toBe(24 * 60 * 60 * 1000);
    expect(ORDER_AUTO_DELIVER_AFTER_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('404/409 on stale SHIPPING rows is swallowed — the tick never throws', async () => {
    orderModel.find
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ _id: '507f1f77bcf86cd799439100', orderCode: 'KO-C' }]));
    ordersService.receiveOrder.mockRejectedValue(new Error('Not in SHIPPING'));

    await expect(service.handleOrdersTick()).resolves.toBeUndefined();
  });
});
