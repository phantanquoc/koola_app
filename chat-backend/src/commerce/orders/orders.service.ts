import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import {
  CommerceOrder,
  CommerceOrderDocument,
  type OrderStatus,
} from './schemas/commerce-order.schema';
import {
  CommerceProduct,
  CommerceProductDocument,
} from '../schemas/commerce-product.schema';
import { User, UserDocument } from '../../users/user.schema';
import { MediaService } from '../../media/media.service';
import { ConversationsService } from '../../conversations/conversations.service';
import { MessagesService } from '../../messages/messages.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type {
  AdminListOrdersQueryDto,
  ConfirmOrderDto,
  ExportOrdersDto,
  ListOrdersQueryDto,
  PlaceOrderDto,
  RejectOrderDto,
  ShipOrderDto,
} from './dto/orders.dto';
import type {
  AdminCancelOrderDto,
  AdminOrderNoteDto,
  AdminRefundOrderDto,
} from '../dto/admin-order-actions.dto';

// ─── Public response shapes ─────────────────────────────────────────────────

export interface OrderCardResponse {
  order: Record<string, unknown>;
  conversationId: string;
}

export interface OrderListResponse {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface OrderDetailResponse {
  order: Record<string, unknown>;
  seller: { id: string; displayName: string } | null;
  buyer: { id: string; displayName: string } | null;
  /** Presigned GET URLs aligned with each item's imageKey; null when unsignable. */
  itemImageUrls: (string | null)[];
}

/** Caller identity from JwtStrategy: sub = active account, act = root owner. */
export interface OrderCaller {
  sub: string;
  act?: string;
  accountType?: 'personal' | 'business';
}

type LeanOrder = CommerceOrder & { _id: Types.ObjectId };
type LeanSeller = Pick<
  User,
  'displayName' | 'accountType' | 'verificationStatus' | 'isBanned' | 'suspended'
> & { _id: Types.ObjectId };

const ORDER_CODE_MAX_RETRIES = 5;

/**
 * Order lifecycle service (commerce-orders D1/D2/D5/D6/D7/D9).
 *
 * Placement is a coordinated create-then-reconcile write: the order is created
 * first (idempotencyKey unique index is the backstop), then the conversation,
 * card message, system line and push happen. A retry with the same key returns
 * the existing order; card/system posting checks for an existing card first so
 * duplicates are impossible.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(CommerceOrder.name)
    private orderModel: Model<CommerceOrderDocument>,
    @InjectModel(CommerceProduct.name)
    private productModel: Model<CommerceProductDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly mediaService: MediaService,
    private readonly conversations: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ═══ Placement (D2) ═════════════════════════════════════════════════════════

  async placeOrder(
    buyerId: string,
    dto: PlaceOrderDto,
  ): Promise<OrderCardResponse> {
    if (buyerId === dto.sellerId) {
      throw new BadRequestException('Cannot order from your own shop');
    }

    // (1) Validate seller: verified, non-banned business.
    const seller = await this.requireVerifiedSeller(dto.sellerId);

    // (2) Validate products: all exist, active, visible, same seller.
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .lean<Array<CommerceProduct & { _id: Types.ObjectId }>>();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const snapshots: LeanOrder['items'] = [];
    let subtotal = 0;
    for (const line of dto.items) {
      const p = byId.get(line.productId);
      if (!p || p.active !== true || p.sellerActive !== true) {
        throw new BadRequestException(
          `Product unavailable: ${p?.name ?? line.productId}`,
        );
      }
      if (p.sellerId !== dto.sellerId) {
        throw new BadRequestException(
          'All items must belong to the same seller (one order per shop)',
        );
      }
      snapshots.push({
        productId: String(p._id),
        name: p.name,
        price: p.price,
        imageKey: p.imageKeys?.[0] ?? null,
        qty: line.qty,
      });
      subtotal += p.price * line.qty;
    }

    // (3) Create the order (duplicate idempotencyKey → return existing 200).
    const now = new Date();
    let order: LeanOrder;
    let alreadyExisted = false;
    try {
      const created = await this.orderModel.create({
        orderCode: await this.generateOrderCode(),
        buyerId,
        sellerId: dto.sellerId,
        items: snapshots,
        subtotal,
        buyerInfo: {
          name: dto.buyerInfo.name,
          phone: dto.buyerInfo.phone,
          address: dto.buyerInfo.address,
          note: dto.buyerInfo.note?.trim() ? dto.buyerInfo.note : null,
        },
        payment: dto.payment,
        shipping: { fee: null, carrier: null, trackingCode: null, expectedDeliveryDate: null },
        status: 'PENDING',
        statusHistory: [{ status: 'PENDING', at: now, by: buyerId, note: null }],
        conversationId: '',
        idempotencyKey: dto.idempotencyKey,
        lastReminderAt: null,
        soldCountApplied: false,
      });
      order = created.toObject ? (created.toObject() as LeanOrder) : (created as unknown as LeanOrder);
    } catch (err: unknown) {
      const existing = await this.findByIdempotencyKey(dto.idempotencyKey);
      if (!existing) throw err;
      alreadyExisted = true;
      order = existing;
    }

    // Idempotent retry: the order already exists — its conversation/card were
    // (or are being) posted. Return it without creating anything new.
    if (alreadyExisted) {
      return { order: this.toPublic(order), conversationId: order.conversationId };
    }

    // (4) Find-or-create the buyer↔seller direct conversation, then persist it
    // on the order so retries and reads always find it.
    const { conversation } = await this.conversations.createDirect(
      buyerId,
      dto.sellerId,
    );
    const conversationId = String(conversation._id);
    await this.orderModel.updateOne(
      { _id: order._id },
      { $set: { conversationId } },
    );
    order = { ...order, conversationId };

    // (5) Card message + (6) system line, both idempotent (D2 reconcile).
    await this.postOrderCardIfMissing(order, buyerId);
    await this.conversations.createSystemMessage(
      conversationId,
      `Đơn #${order.orderCode} đã được tạo`,
    );

    // (7) Seller push — stub seam for Batch B.
    await this.notifySeller(dto.sellerId, order);

    void seller;
    return { order: this.toPublic(order), conversationId };
  }

  // ═══ Transitions (D5/D6/D7) ════════════════════════════════════════════════

  /** Seller confirms: PENDING → CONFIRMED, sets shipping fee + date. */
  async confirmOrder(
    caller: OrderCaller,
    orderId: string,
    dto: ConfirmOrderDto,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    this.requireSeller(caller, order);
    if (order.status !== 'PENDING') {
      throw new ConflictException(
        `Cannot confirm an order in status ${order.status}`,
      );
    }
    const updated = await this.atomicTransition(orderId, 'PENDING', {
      status: 'CONFIRMED',
      shipping: {
        ...shippingOf(order),
        fee: dto.shippingFee,
        expectedDeliveryDate: new Date(dto.expectedDeliveryDate),
      },
      by: caller.sub,
      note: null,
    });
    await this.afterTransition(updated, {
      systemLine: `Shop đã xác nhận đơn #${updated.orderCode} · Phí ship ${formatVnd(dto.shippingFee)}`,
      notifyUserId: updated.buyerId,
    });
    return this.toPublic(updated);
  }

  /** Seller rejects: PENDING → CANCELLED with required reason. */
  async rejectOrder(
    caller: OrderCaller,
    orderId: string,
    dto: RejectOrderDto,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    this.requireSeller(caller, order);
    if (order.status !== 'PENDING') {
      throw new ConflictException(
        `Cannot reject an order in status ${order.status}`,
      );
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Rejection reason is required');
    const updated = await this.atomicTransition(orderId, 'PENDING', {
      status: 'CANCELLED',
      by: caller.sub,
      note: reason,
    });
    await this.afterTransition(updated, {
      systemLine: `Shop đã từ chối đơn #${updated.orderCode}: ${reason}`,
      notifyUserId: updated.buyerId,
    });
    return this.toPublic(updated);
  }

  /** Seller ships: CONFIRMED → SHIPPING with optional carrier/tracking. */
  async shipOrder(
    caller: OrderCaller,
    orderId: string,
    dto: ShipOrderDto,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    this.requireSeller(caller, order);
    if (order.status !== 'CONFIRMED') {
      throw new ConflictException(
        `Cannot ship an order in status ${order.status}`,
      );
    }
    const updated = await this.atomicTransition(orderId, 'CONFIRMED', {
      status: 'SHIPPING',
      shipping: {
        ...shippingOf(order),
        carrier: dto.carrier?.trim() ? dto.carrier.trim() : null,
        trackingCode: dto.trackingCode?.trim() ? dto.trackingCode.trim() : null,
      },
      by: caller.sub,
      note: null,
    });
    await this.afterTransition(updated, {
      systemLine: trackingLine(updated),
      notifyUserId: updated.buyerId,
    });
    return this.toPublic(updated);
  }

  /**
   * Buyer receives (or system auto-delivers): SHIPPING → DELIVERED.
   * Runs the exactly-once soldCount increment (D7).
   */
  async receiveOrder(
    caller: OrderCaller,
    orderId: string,
    opts: { bySystem?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    if (opts.bySystem) {
      // Cron path: no role check — the caller is the system scheduler.
    } else {
      this.requireBuyer(caller, order);
    }
    if (order.status !== 'SHIPPING') {
      throw new ConflictException(
        `Cannot mark delivered an order in status ${order.status}`,
      );
    }
    const updated = await this.atomicTransition(orderId, 'SHIPPING', {
      status: 'DELIVERED',
      soldCountApplied: true,
      by: opts.bySystem ? 'system' : caller.sub,
      note: opts.bySystem ? 'Tự động xác nhận sau 7 ngày giao hàng' : null,
    });
    // Exactly-once soldCount (D7): the atomic filter above already makes a
    // second DELIVERED impossible; the flag is defense in depth.
    if (!order.soldCountApplied) {
      await this.applySoldCount(updated);
    }
    await this.afterTransition(updated, {
      systemLine: `Đơn #${updated.orderCode} đã hoàn tất. Cảm ơn bạn đã mua hàng!`,
      notifyUserId: opts.bySystem ? updated.buyerId : updated.sellerId,
    });
    return this.toPublic(updated);
  }

  /** Cancel per the locked D6 matrix. */
  async cancelOrder(
    caller: OrderCaller,
    orderId: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    const isSeller = caller.sub === order.sellerId;
    const isBuyer = caller.sub === order.buyerId;
    if (!isSeller && !isBuyer) {
      throw new ForbiddenException('Not a party to this order');
    }
    if (isSeller) {
      // Seller: PENDING only, reason required.
      if (order.status !== 'PENDING') {
        throw new ConflictException(
          `Seller cannot cancel an order in status ${order.status}`,
        );
      }
      const r = reason?.trim() ?? '';
      if (!r) throw new BadRequestException('Cancellation reason is required');
      const updated = await this.atomicTransition(orderId, 'PENDING', {
        status: 'CANCELLED',
        by: caller.sub,
        note: r,
      });
      await this.afterTransition(updated, {
        systemLine: `Shop đã huỷ đơn #${updated.orderCode}: ${r}`,
        notifyUserId: updated.buyerId,
      });
      return this.toPublic(updated);
    }
    // Buyer: PENDING or CONFIRMED (covers "disagrees with ship fee"), no reason.
    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      throw new ConflictException(
        `Cannot cancel an order in status ${order.status}`,
      );
    }
    const from = order.status;
    const updated = await this.atomicTransition(orderId, from, {
      status: 'CANCELLED',
      by: caller.sub,
      note: null,
    });
    await this.afterTransition(updated, {
      systemLine: `Khách đã huỷ đơn #${updated.orderCode}`,
      notifyUserId: updated.sellerId,
    });
    return this.toPublic(updated);
  }

  // ═══ Reads (D5/D9) ══════════════════════════════════════════════════════════

  /** Buyer's own orders, newest first. */
  async listMine(
    buyerId: string,
    dto: ListOrdersQueryDto,
  ): Promise<OrderListResponse> {
    return this.listWithFilter({ buyerId }, dto);
  }

  /**
   * Seller's orders. Requires a business token whose sub IS the seller id
   * (D5) — a personal token never equals a business id, so it 403s naturally;
   * an explicit accountType check makes the reason clear.
   */
  async listSeller(
    caller: OrderCaller,
    dto: ListOrdersQueryDto,
  ): Promise<OrderListResponse> {
    if (caller.accountType !== 'business') {
      throw new ForbiddenException('Seller orders require a business account');
    }
    return this.listWithFilter({ sellerId: caller.sub }, dto);
  }

  /** Buyer or seller of the order only, else 403. */
  async getById(
    caller: OrderCaller,
    orderId: string,
  ): Promise<OrderDetailResponse> {
    const order = await this.loadOrderOrFail(orderId);
    if (caller.sub !== order.buyerId && caller.sub !== order.sellerId) {
      throw new ForbiddenException('Not a party to this order');
    }
    return this.toDetail(order);
  }

  /** Admin list with filters + batched name lookups (gồm cả field can thiệp). */
  async listAdmin(dto: AdminListOrdersQueryDto): Promise<OrderListResponse> {
    return this.listWithFilter(this.adminFilter(dto), dto, true);
  }

  /** Admin detail — kèm ghi chú nội bộ + dấu vết huỷ/hoàn tiền. */
  async getAdminById(orderId: string): Promise<OrderDetailResponse> {
    return this.toDetail(await this.loadOrderOrFail(orderId), true);
  }

  /**
   * Xuất CSV phía admin: cùng bộ lọc, cap 500 dòng/lần. `truncated` cho UI
   * biết còn dữ liệu — không im lặng cắt mất phần kế toán cần.
   */
  async exportAdmin(dto: ExportOrdersDto): Promise<{
    data: Record<string, unknown>[];
    total: number;
    truncated: boolean;
  }> {
    const limit = Math.min(dto.limit ?? 500, 500);
    const [docs, total] = await Promise.all([
      this.orderModel
        .find(this.adminFilter(dto))
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean<LeanOrder[]>(),
      this.orderModel.countDocuments(this.adminFilter(dto)),
    ]);
    const names = await this.loadDisplayNames(
      docs.flatMap((d) => [d.buyerId, d.sellerId]),
    );
    return {
      data: docs.map((d) => this.toAdminPublic(d, names)),
      total,
      truncated: total > docs.length,
    };
  }

  // ═══ Admin intervention (#20) ══════════════════════════════════════════════

  /**
   * Admin huỷ đơn: chỉ PENDING/CONFIRMED. SHIPPING/DELIVERED phải đi đường
   * hoàn tiền — huỷ sau khi đã giao sẽ làm sai lệch đối soát.
   */
  async adminCancelOrder(
    actorId: string,
    orderId: string,
    dto: AdminCancelOrderDto,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Chỉ huỷ được đơn Chờ xác nhận/Đã xác nhận (đơn đang ${order.status})`,
      );
    }
    const reason = dto.reason.trim();
    const updated = await this.atomicTransition(orderId, order.status, {
      status: 'CANCELLED',
      by: actorId,
      note: reason,
      extra: { cancelledBy: actorId, cancelReason: reason },
    });
    await this.afterTransition(updated, {
      systemLine: `Admin đã huỷ đơn #${updated.orderCode}: ${reason}`,
      notifyUserId: updated.buyerId,
    });
    return this.toAdminPublic(updated);
  }

  /**
   * Hoàn tiền KHÔNG đổi status (mobile `ChatApp` switch chỉ có 5 trạng thái).
   * Chỉ DELIVERED/CANCELLED; mỗi đơn hoàn tối đa một lần để không cộng trùng
   * vào đối soát.
   */
  async adminRefundOrder(
    actorId: string,
    orderId: string,
    dto: AdminRefundOrderDto,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadOrderOrFail(orderId);
    if (order.status !== 'DELIVERED' && order.status !== 'CANCELLED') {
      throw new BadRequestException(
        `Chỉ hoàn tiền đơn Đã giao hoặc Đã huỷ (đơn đang ${order.status})`,
      );
    }
    if (order.refundedAt) {
      throw new BadRequestException('Đơn này đã được hoàn tiền');
    }
    const total = orderTotal(order);
    if (dto.amount > total) {
      throw new BadRequestException(
        `Số tiền hoàn vượt tổng đơn (${formatVnd(total)})`,
      );
    }
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(orderId), refundedAt: null },
        {
          $set: {
            refundedAt: new Date(),
            refundedBy: actorId,
            refundReason: dto.reason.trim(),
            refundAmount: dto.amount,
          },
        },
        { returnDocument: 'after' },
      )
      .lean<LeanOrder | null>();
    if (!updated) {
      throw new ConflictException('Đơn vừa được hoàn tiền bởi thao tác khác');
    }
    return this.toAdminPublic(updated);
  }

  /** Ghi chú nội bộ — không đổi status, chuỗi rỗng để xoá ghi chú. */
  async adminNoteOrder(
    _actorId: string,
    orderId: string,
    dto: AdminOrderNoteDto,
  ): Promise<Record<string, unknown>> {
    const note = dto.internalNote.trim();
    const updated = await this.orderModel
      .findByIdAndUpdate(
        orderId,
        { $set: { internalNote: note ? note : null } },
        { returnDocument: 'after' },
      )
      .lean<LeanOrder | null>();
    if (!updated) throw new NotFoundException('Order not found');
    return this.toAdminPublic(updated);
  }

  // ═══ Helpers ════════════════════════════════════════════════════════════════

  private async listWithFilter(
    filter: QueryFilter<CommerceOrderDocument>,
    dto: ListOrdersQueryDto,
    admin = false,
  ): Promise<OrderListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: QueryFilter<CommerceOrderDocument> = { ...filter };
    if (dto.status) where.status = dto.status;
    const [docs, total] = await Promise.all([
      this.orderModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<LeanOrder[]>(),
      this.orderModel.countDocuments(where),
    ]);
    const names = await this.loadDisplayNames(
      docs.flatMap((d) => [d.buyerId, d.sellerId]),
    );
    return {
      data: docs.map((d) =>
        admin ? this.toAdminPublic(d, names) : this.toPublic(d, names),
      ),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /** Bộ lọc dùng chung cho list/export (một nguồn, tránh lệch kết quả). */
  private adminFilter(
    dto: AdminListOrdersQueryDto,
  ): QueryFilter<CommerceOrderDocument> {
    const filter: QueryFilter<CommerceOrderDocument> = {};
    if (dto.status) filter.status = dto.status;
    if (dto.buyerId) filter.buyerId = dto.buyerId;
    if (dto.sellerId) filter.sellerId = dto.sellerId;
    return filter;
  }

  private toPublic(
    order: LeanOrder,
    names?: Map<string, string>,
  ): Record<string, unknown> {
    const total =
      order.subtotal + (order.shipping?.fee ?? 0);
    return {
      id: String(order._id),
      orderCode: order.orderCode,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      buyerName: names?.get(order.buyerId) ?? null,
      sellerName: names?.get(order.sellerId) ?? null,
      items: order.items,
      itemCount: order.items.reduce((n, i) => n + i.qty, 0),
      subtotal: order.subtotal,
      shippingFee: order.shipping?.fee ?? null,
      total,
      buyerInfo: order.buyerInfo,
      payment: order.payment,
      shipping: order.shipping,
      status: order.status,
      statusHistory: order.statusHistory,
      conversationId: order.conversationId,
      createdAt: order.createdAt ?? null,
      updatedAt: order.updatedAt ?? null,
    };
  }

  private async toDetail(
    order: LeanOrder,
    admin = false,
  ): Promise<OrderDetailResponse> {
    const names = await this.loadDisplayNames([order.buyerId, order.sellerId]);
    const itemImageUrls = await Promise.all(
      order.items.map((i) => (i.imageKey ? this.presign(i.imageKey) : null)),
    );
    return {
      order: admin
        ? this.toAdminPublic(order, names)
        : this.toPublic(order, names),
      seller: {
        id: order.sellerId,
        displayName: names.get(order.sellerId) ?? 'Shop',
      },
      buyer: {
        id: order.buyerId,
        displayName: names.get(order.buyerId) ?? 'Khách',
      },
      itemImageUrls,
    };
  }

  /**
   * Mở rộng của `toPublic` cho admin: ghi chú nội bộ + dấu vết huỷ/hoàn tiền.
   * Buyer/seller không bao giờ thấy các field này.
   */
  private toAdminPublic(
    order: LeanOrder,
    names?: Map<string, string>,
  ): Record<string, unknown> {
    return {
      ...this.toPublic(order, names),
      internalNote: order.internalNote ?? null,
      cancelledBy: order.cancelledBy ?? null,
      cancelReason: order.cancelReason ?? null,
      refundedAt: order.refundedAt ?? null,
      refundedBy: order.refundedBy ?? null,
      refundReason: order.refundReason ?? null,
      refundAmount: order.refundAmount ?? null,
    };
  }

  /** One batched `$in` lookup; keyed by string id. */
  private async loadDisplayNames(
    ids: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = Array.from(
      new Set(ids.filter((id): id is string => isObjectIdString(id))),
    );
    if (unique.length === 0) return new Map();
    const docs = await this.userModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select('_id displayName')
      .lean<Array<{ _id: Types.ObjectId; displayName?: string }>>();
    return new Map(
      docs.map((d) => [String(d._id), d.displayName ?? 'Unknown']),
    );
  }

  private async requireVerifiedSeller(sellerId: string): Promise<LeanSeller> {
    if (!isObjectIdString(sellerId)) {
      throw new BadRequestException('sellerId must be a valid user id');
    }
    const seller = await this.userModel
      .findById(sellerId)
      .select('_id displayName accountType verificationStatus isBanned suspended')
      .lean<LeanSeller | null>();
    if (
      !seller ||
      seller.accountType !== 'business' ||
      seller.verificationStatus !== 'verified'
    ) {
      throw new BadRequestException(
        'Seller is not a verified business account',
      );
    }
    if (seller.isBanned === true || seller.suspended === true) {
      throw new BadRequestException('Seller account is not available');
    }
    return seller;
  }

  private async loadOrderOrFail(orderId: string): Promise<LeanOrder> {
    if (!isObjectIdString(orderId)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderModel.findById(orderId).lean<LeanOrder | null>();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async findByIdempotencyKey(key: string): Promise<LeanOrder | null> {
    return this.orderModel.findOne({ idempotencyKey: key }).lean<LeanOrder | null>();
  }

  private requireSeller(caller: OrderCaller, order: LeanOrder): void {
    if (caller.sub !== order.sellerId) {
      throw new ForbiddenException('Only the seller can perform this action');
    }
  }

  private requireBuyer(caller: OrderCaller, order: LeanOrder): void {
    if (caller.sub !== order.buyerId) {
      throw new ForbiddenException('Only the buyer can perform this action');
    }
  }

  /**
   * Atomic status transition: the `{ status: from }` filter makes a second
   * concurrent call a no-op (returns null → 409). Appends statusHistory and
   * applies the partial update in the same write.
   */
  private async atomicTransition(
    orderId: string,
    from: OrderStatus,
    patch: {
      status: OrderStatus;
      shipping?: LeanOrder['shipping'];
      soldCountApplied?: boolean;
      by: string;
      note: string | null;
      /** Field phụ ghi cùng transition (vd. cancelledBy/cancelReason của admin). */
      extra?: Record<string, unknown>;
    },
  ): Promise<LeanOrder> {
    const now = new Date();
    const $set: Record<string, unknown> = { status: patch.status };
    if (patch.shipping !== undefined) $set.shipping = patch.shipping;
    if (patch.soldCountApplied !== undefined) {
      $set.soldCountApplied = patch.soldCountApplied;
    }
    if (patch.extra) Object.assign($set, patch.extra);
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(orderId), status: from },
        {
          $set,
          $push: {
            statusHistory: { status: patch.status, at: now, by: patch.by, note: patch.note },
          },
        },
        { returnDocument: 'after' },
      )
      .lean<LeanOrder | null>();
    if (!updated) {
      throw new ConflictException(
        `Order is no longer in status ${from} (concurrent update or invalid transition)`,
      );
    }
    return updated;
  }

  /** Post-transition fan-out: card refresh → system line → push. */
  private async afterTransition(
    order: LeanOrder,
    opts: { systemLine: string; notifyUserId: string },
  ): Promise<void> {
    await this.updateCardStatus(order);
    await this.conversations.createSystemMessage(
      order.conversationId,
      opts.systemLine,
    );
    await this.notifyBuyerOrSeller(opts.notifyUserId, order);
  }

  private async applySoldCount(order: LeanOrder): Promise<void> {
    await this.productModel.bulkWrite(
      order.items.map((i) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(i.productId) },
          update: { $inc: { soldCount: i.qty } },
        },
      })),
    );
  }

  private async generateOrderCode(): Promise<string> {
    for (let attempt = 0; attempt < ORDER_CODE_MAX_RETRIES; attempt++) {
      const code = `KO-${Date.now().toString(36).toUpperCase()}${randomSuffix()}`;
      const clash = await this.orderModel
        .findOne({ orderCode: code })
        .select('_id')
        .lean<{ _id: unknown } | null>();
      if (!clash) return code;
    }
    // Unique index is the backstop — this is effectively unreachable.
    throw new ConflictException('Could not generate a unique order code');
  }

  private async presign(key: string): Promise<string | null> {
    try {
      return await this.mediaService.generatePresignedGetUrl(key);
    } catch {
      return null;
    }
  }

  // ─── Batch-B messaging/push seams (commerce-orders D3/D4) ─────────────────

  /**
   * Posts the order card via MessagesService.sendMessageWithOrderCard (D3),
   * which fans out `new_message` through the existing gateway callback — no
   * gateway changes. Keeps the D2 "card already exists" pre-check so
   * idempotent retries never post a second card.
   */
  private async postOrderCardIfMissing(
    order: LeanOrder,
    senderId: string,
  ): Promise<void> {
    const exists =
      await this.messagesService.findOrderCard(order.conversationId, String(order._id));
    if (exists) return;
    const itemCount = order.items.reduce((n, i) => n + i.qty, 0);
    const content =
      `Đơn #${order.orderCode} · ${itemCount} sản phẩm · ${formatVnd(order.subtotal)}`;
    await this.messagesService.sendMessageWithOrderCard(
      order.conversationId,
      senderId,
      content,
      {
        orderId: String(order._id),
        code: order.orderCode,
        status: order.status,
      },
    );
  }

  /**
   * Refreshes the card's metadata.order snapshot and emits through the
   * gateway `message_updated` path via MessagesService.updateOrderCardStatus
   * (D3). Non-fatal: a failed refresh never fails a status transition — the
   * system line already records the new status and the card refreshes on the
   * next fetch, so this is a graceful fallback, not a silent gap.
   */
  private async updateCardStatus(order: LeanOrder): Promise<void> {
    try {
      await this.messagesService.updateOrderCardStatus(
        order.conversationId,
        String(order._id),
        order.orderCode,
        order.status,
      );
    } catch (err: unknown) {
      // Card refresh must never fail a status transition — the system line
      // already records the new status and the card refreshes on next fetch.
      this.logger.warn(
        `order card refresh failed for ${order.orderCode}: ${(err as Error).message}`,
      );
    }
  }

  /** Seller push on placement (D4). Push failures never fail placement. */
  private async notifySeller(sellerId: string, order: LeanOrder): Promise<void> {
    try {
      const itemCount = order.items.reduce((n, i) => n + i.qty, 0);
      await this.notificationsService.sendOrderPush({
        recipientUserId: sellerId,
        title: `Đơn mới #${order.orderCode}`,
        body: `Đơn mới #${order.orderCode} · ${itemCount} sp · ${formatVnd(orderTotal(order))}`,
        orderId: String(order._id),
        status: order.status,
        conversationId: order.conversationId,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `order push failed for ${order.orderCode}: ${(err as Error).message}`,
      );
    }
  }

  /** Counterparty push after every transition (D4), once per status. */
  private async notifyBuyerOrSeller(
    userId: string,
    order: LeanOrder,
  ): Promise<void> {
    try {
      await this.notificationsService.sendOrderPush({
        recipientUserId: userId,
        title: `Đơn #${order.orderCode}`,
        body: statusPushLine(order),
        orderId: String(order._id),
        status: order.status,
        conversationId: order.conversationId,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `order push failed for ${order.orderCode}: ${(err as Error).message}`,
      );
    }
  }
}

// ─── Module-local helpers ───────────────────────────────────────────────────

function isObjectIdString(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

function shippingOf(order: LeanOrder): LeanOrder['shipping'] {
  return {
    fee: order.shipping?.fee ?? null,
    carrier: order.shipping?.carrier ?? null,
    trackingCode: order.shipping?.trackingCode ?? null,
    expectedDeliveryDate: order.shipping?.expectedDeliveryDate ?? null,
  };
}

/** 4 random uppercase alphanumerics (order-code suffix). */
function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function formatVnd(n: number): string {
  return `${n.toLocaleString('vi-VN')}đ`;
}

/** Total owed: subtotal + confirmed shipping fee (null fee → 0). */
function orderTotal(order: LeanOrder): number {
  return order.subtotal + (order.shipping?.fee ?? 0);
}

/** Buyer-facing push line per status (seller placement uses its own copy). */
function statusPushLine(order: LeanOrder): string {
  switch (order.status) {
    case 'CONFIRMED':
      return `Shop đã xác nhận đơn #${order.orderCode} · Phí ship ${formatVnd(order.shipping?.fee ?? 0)}`;
    case 'SHIPPING':
      return trackingLine(order);
    case 'DELIVERED':
      return `Đơn #${order.orderCode} đã hoàn tất`;
    case 'CANCELLED':
      return `Đơn #${order.orderCode} đã bị huỷ`;
    default:
      return `Đơn #${order.orderCode} có cập nhật mới`;
  }
}

function trackingLine(order: LeanOrder): string {
  const base = `Shop đã gửi đơn #${order.orderCode}`;
  const tracking = order.shipping?.trackingCode
    ? ` · Mã vận đơn ${order.shipping.trackingCode}`
    : '';
  const carrier = order.shipping?.carrier ? ` (${order.shipping.carrier})` : '';
  return `${base}${carrier}${tracking}`;
}
