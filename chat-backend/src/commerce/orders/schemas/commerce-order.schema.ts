import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Order lifecycle statuses (commerce-orders spec, locked D6 matrix). */
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'SHIPPING',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type CommerceOrderDocument = CommerceOrder & Document;

export interface OrderItemSnapshot {
  productId: string;
  name: string;
  /** Frozen unit price (VND) at placement — never changes afterwards. */
  price: number;
  imageKey: string | null;
  qty: number;
}

export interface OrderStatusEntry {
  status: OrderStatus;
  at: Date;
  /** Caller user id, or 'system' for cron/system-driven transitions. */
  by: string;
  note?: string | null;
}

@Schema({ _id: false })
export class OrderItemSnapshotDoc {
  @Prop({ required: true, type: String })
  productId: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Number, min: 0 })
  price: number;

  @Prop({ type: String, default: null })
  imageKey: string | null;

  @Prop({ required: true, type: Number, min: 1, max: 99 })
  qty: number;
}

@Schema({ _id: false })
export class OrderStatusHistoryDoc {
  @Prop({ required: true, type: String, enum: ORDER_STATUSES })
  status: OrderStatus;

  @Prop({ required: true, type: Date })
  at: Date;

  @Prop({ required: true, type: String })
  by: string;

  @Prop({ type: String, default: null })
  note: string | null;
}

@Schema({ _id: false })
export class OrderBuyerInfoDoc {
  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String })
  phone: string;

  @Prop({ required: true, type: String })
  address: string;

  @Prop({ type: String, default: null })
  note: string | null;
}

@Schema({ _id: false })
export class OrderShippingDoc {
  /** Null until the seller confirms (design D-order: fee set on confirm). */
  @Prop({ type: Number, default: null })
  fee: number | null;

  @Prop({ type: String, default: null })
  carrier: string | null;

  @Prop({ type: String, default: null })
  trackingCode: string | null;

  @Prop({ type: Date, default: null })
  expectedDeliveryDate: Date | null;
}

const OrderItemSnapshotSchema =
  SchemaFactory.createForClass(OrderItemSnapshotDoc);
const OrderStatusHistorySchema = SchemaFactory.createForClass(
  OrderStatusHistoryDoc,
);
const OrderBuyerInfoSchema = SchemaFactory.createForClass(OrderBuyerInfoDoc);
const OrderShippingSchema = SchemaFactory.createForClass(OrderShippingDoc);

/**
 * One structured order per seller per checkout (commerce-orders D1).
 *
 * Prices are frozen snapshots in `items[]` — a later product price change
 * never alters an existing order. `conversationId` links the buyer↔seller
 * direct conversation where the order card lives.
 */
@Schema({ timestamps: true })
export class CommerceOrder {
  /** Human-readable, unique: `KO-` + base36 timestamp + 4 random chars. */
  @Prop({ required: true, type: String })
  orderCode: string;

  /** Personal-token caller id who placed the order. */
  @Prop({ required: true, type: String })
  buyerId: string;

  /** Business `User._id` (string form). */
  @Prop({ required: true, type: String })
  sellerId: string;

  @Prop({ required: true, type: [OrderItemSnapshotSchema] })
  items: OrderItemSnapshot[];

  /** Sum of frozen (price × qty). Excludes shipping fee. */
  @Prop({ required: true, type: Number, min: 0 })
  subtotal: number;

  @Prop({ required: true, type: OrderBuyerInfoSchema })
  buyerInfo: { name: string; phone: string; address: string; note: string | null };

  @Prop({ required: true, type: String, enum: ['cod', 'bank'] })
  payment: 'cod' | 'bank';

  @Prop({ required: true, type: OrderShippingSchema })
  shipping: {
    fee: number | null;
    carrier: string | null;
    trackingCode: string | null;
    expectedDeliveryDate: Date | null;
  };

  @Prop({ required: true, type: String, enum: ORDER_STATUSES, default: 'PENDING' })
  status: OrderStatus;

  @Prop({ required: true, type: [OrderStatusHistorySchema], default: [] })
  statusHistory: OrderStatusEntry[];

  /** Buyer↔seller direct conversation holding the order card. */
  @Prop({ required: true, type: String })
  conversationId: string;

  /** UUID, unique — duplicate POST returns the existing order (200). */
  @Prop({ required: true, type: String })
  idempotencyKey: string;

  /** Last 24h-reminder push to the seller; null until the first reminder. */
  @Prop({ type: Date, default: null })
  lastReminderAt: Date | null;

  /**
   * Defense-in-depth for exactly-once soldCount (design D7). The atomic
   * `{ status: SHIPPING }` filter already makes double-DELIVERED impossible;
   * this flag additionally guards the bulkWrite path itself.
   */
  @Prop({ type: Boolean, default: false })
  soldCountApplied: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CommerceOrderSchema = SchemaFactory.createForClass(CommerceOrder);

// ─── Indexes (commerce-orders spec) — schema.index() only ─────────────────────
CommerceOrderSchema.index({ buyerId: 1, createdAt: -1 });
CommerceOrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
CommerceOrderSchema.index({ conversationId: 1 });
CommerceOrderSchema.index({ idempotencyKey: 1 }, { unique: true });
CommerceOrderSchema.index({ orderCode: 1 }, { unique: true });
