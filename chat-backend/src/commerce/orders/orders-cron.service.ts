import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CommerceOrder,
  CommerceOrderDocument,
} from './schemas/commerce-order.schema';
import {
  OrdersService,
  type OrderCaller,
} from './orders.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Seller-reminder age: PENDING orders older than this get a push reminder.
 * Exported as an injectable constant so specs can force the paths.
 */
export const ORDER_REMINDER_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Auto-delivery age: SHIPPING orders whose updatedAt is older than this are
 * transitioned to DELIVERED via the same service path as buyer receive
 * (by: 'system'), so history/push/card/soldCount all happen identically.
 */
export const ORDER_AUTO_DELIVER_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7d

const SYSTEM_CALLER: OrderCaller = { sub: 'system' };

/**
 * Order reminders + auto-delivery (commerce-orders D8).
 * Runs every 15 minutes, guarded by the Redis tryAcquireLock pattern
 * (same as media-cron). Lock held ~10 min so a slow run is never doubled.
 */
@Injectable()
export class OrdersCronService {
  private readonly logger = new Logger(OrdersCronService.name);

  private static readonly LOCK_KEY = 'cron:commerce-orders';
  private static readonly LOCK_TTL_SECONDS = 10 * 60;

  constructor(
    @InjectModel(CommerceOrder.name)
    private orderModel: Model<CommerceOrderDocument>,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  @Cron('*/15 * * * *')
  async handleOrdersTick(): Promise<void> {
    const acquired = await this.redisService.tryAcquireLock(
      OrdersCronService.LOCK_KEY,
      OrdersCronService.LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      this.logger.debug(
        '[OrdersCron] Lock held by another instance — skipping this tick.',
      );
      return;
    }

    const now = Date.now();
    await this.remindStalePending(now);
    await this.autoDeliverStaleShipping(now);
  }

  /** Phase 1 (D8): PENDING older than 24h → seller push, no status change. */
  private async remindStalePending(now: number): Promise<void> {
    const cutoff = new Date(now - ORDER_REMINDER_AFTER_MS);
    const stale = await this.orderModel
      .find({
        status: 'PENDING',
        createdAt: { $lt: cutoff },
        $or: [
          { lastReminderAt: null },
          { lastReminderAt: { $lt: cutoff } },
        ],
      })
      .select('_id orderCode sellerId buyerId conversationId')
      .lean<
        Array<{
          _id: Types.ObjectId;
          orderCode: string;
          sellerId: string;
          buyerId: string;
          conversationId: string;
        }>
      >();

    for (const o of stale) {
      const orderId = String(o._id);
      try {
        await this.notificationsService.sendOrderPush({
          recipientUserId: o.sellerId,
          title: `Đơn #${o.orderCode} đang chờ xác nhận`,
          body: `Đơn #${o.orderCode} đã chờ hơn 24 giờ — hãy xác nhận sớm nhé`,
          orderId,
          status: 'PENDING',
          conversationId: o.conversationId,
        });
        await this.orderModel.updateOne(
          { _id: o._id },
          { $set: { lastReminderAt: new Date(now) } },
        );
      } catch (err: unknown) {
        this.logger.warn(
          `[OrdersCron] Reminder failed for ${o.orderCode}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Phase 2 (D8): SHIPPING older than 7d → DELIVERED via the bySystem path. */
  private async autoDeliverStaleShipping(now: number): Promise<void> {
    const cutoff = new Date(now - ORDER_AUTO_DELIVER_AFTER_MS);
    const stale = await this.orderModel
      .find({ status: 'SHIPPING', updatedAt: { $lt: cutoff } })
      .select('_id orderCode')
      .lean<Array<{ _id: Types.ObjectId; orderCode: string }>>();

    for (const o of stale) {
      try {
        await this.ordersService.receiveOrder(
          SYSTEM_CALLER,
          String(o._id),
          { bySystem: true },
        );
      } catch (err: unknown) {
        // 409 = raced out of SHIPPING (buyer received first); anything else is
        // a real failure worth one log line, never a tick crash.
        this.logger.warn(
          `[OrdersCron] Auto-deliver failed for ${o.orderCode}: ${(err as Error).message}`,
        );
      }
    }
  }
}
