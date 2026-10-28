/**
 * Batch A unit tests for OrdersService (commerce-orders tasks 1.3, 2.1, 2.2).
 *
 * Purpose-built in-memory fakes (not the catalog FakeModel — orders need
 * findOneAndUpdate/updateOne/bulkWrite). Covers: placement validation,
 * frozen snapshots, idempotent retry, every transition + 409s, D5 role 403s,
 * the D6 cancel matrix, soldCount exactly-once, and admin/read paths.
 *
 * Cron paths (bySystem auto-deliver, reminders) belong to Batch B task 3.4.
 */
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { CommerceOrder } from './schemas/commerce-order.schema';
import { CommerceProduct } from '../schemas/commerce-product.schema';
import { User } from '../../users/user.schema';
import { MediaService } from '../../media/media.service';
import { ConversationsService } from '../../conversations/conversations.service';
import { MessagesService } from '../../messages/messages.service';
import { NotificationsService } from '../../notifications/notifications.service';

const s = (v: unknown) => String((v as { toString(): string }).toString());
const normId = (v: unknown) =>
  v instanceof Types.ObjectId ? v.toHexString() : String(v as string);

function matchesCond(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    const c = cond as Record<string, unknown>;
    if ('$in' in c) {
      const set = (c.$in as unknown[]).map(normId);
      return Array.isArray(value)
        ? value.some((v) => set.includes(normId(v)))
        : set.includes(normId(value));
    }
    if ('$ne' in c) return normId(value) !== normId(c.$ne);
    return normId(value) === normId(cond);
  }
  if (Array.isArray(value)) return value.map(normId).includes(normId(cond));
  return normId(value) === normId(cond);
}

/** Dotted-path getter for `metadata.order.orderId`-style filters. */
function getPath(doc: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, k) =>
        acc !== null && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[k]
          : undefined,
      doc,
    );
}

function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, cond]) =>
    matchesCond(getPath(doc, k), cond),
  );
}

/** Chainable query stub: findOne(...).select(...).lean(). */
function one<T>(row: T | null) {
  const q: Record<string, jest.Mock | (() => unknown)> = {};
  q.select = jest.fn(() => q);
  q.lean = jest.fn(() => Promise.resolve(row ? { ...row } : null));
  return q;
}

class FakeOrders {
  docs: Record<string, unknown>[] = [];
  failNextCreate = false;

  findOne(filter: Record<string, unknown>) {
    const row = this.docs.find((d) => matches(d, filter)) ?? null;
    return one(row);
  }
  findById(id: unknown) {
    const row = this.docs.find((d) => normId(d._id) === normId(id)) ?? null;
    return one(row);
  }
  find(filter: Record<string, unknown> = {}) {
    const rows = this.docs.filter((d) => matches(d, filter));
    const query = {
      skipped: 0,
      limited: null as number | null,
      sorted: rows,
      sort() { return query; },
      skip(n: number) { query.skipped = n; return query; },
      limit(n: number) { query.limited = n; return query; },
      lean() {
        let out = query.sorted.map((r) => ({ ...r }));
        out = out.slice(query.skipped);
        if (query.limited !== null) out = out.slice(0, query.limited);
        return Promise.resolve(out);
      },
    };
    return query;
  }
  countDocuments(filter: Record<string, unknown> = {}) {
    return Promise.resolve(this.docs.filter((d) => matches(d, filter)).length);
  }
  async create(payload: Record<string, unknown>) {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      const err = Object.assign(new Error('duplicate key'), { code: 11000 });
      throw err;
    }
    if (this.docs.some((d) => d.idempotencyKey === payload.idempotencyKey)) {
      const err = Object.assign(new Error('duplicate key'), { code: 11000 });
      throw err;
    }
    if (this.docs.some((d) => d.orderCode === payload.orderCode)) {
      const err = Object.assign(new Error('duplicate key'), { code: 11000 });
      throw err;
    }
    const now = new Date();
    const doc = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...payload };
    this.docs.push(doc);
    return { ...doc, toObject: () => ({ ...doc }) };
  }
  async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (doc) Object.assign(doc, update.$set, { updatedAt: new Date() });
    return { modifiedCount: doc ? 1 : 0 };
  }
  /** Supports the atomic-transition shape: $set + $push.statusHistory. */
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown>; $push: Record<string, unknown> },
  ) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (doc) {
      Object.assign(doc, update.$set, { updatedAt: new Date() });
      const push = update.$push.statusHistory as Record<string, unknown>;
      (doc.statusHistory as Record<string, unknown>[]).push(push);
    }
    return { lean: () => Promise.resolve(doc ? { ...doc } : null) };
  }
}

class FakeProducts {
  docs: Record<string, unknown>[] = [];
  bulkWriteCalls: unknown[][] = [];
  find(filter: Record<string, unknown>) {
    const rows = this.docs.filter((d) => matches(d, filter));
    return { lean: () => Promise.resolve(rows.map((r) => ({ ...r }))) };
  }
  async bulkWrite(ops: unknown[]) {
    this.bulkWriteCalls.push(ops);
    for (const op of ops) {
      const u = (op as { updateOne: { filter: Record<string, unknown>; update: { $inc: Record<string, number> } } }).updateOne;
      const doc = this.docs.find((d) => matches(d, u.filter));
      if (doc) {
        for (const [k, v] of Object.entries(u.update.$inc)) {
          (doc as Record<string, number>)[k] = ((doc as Record<string, number>)[k] ?? 0) + v;
        }
      }
    }
    return { modifiedCount: ops.length };
  }
}

class FakeUsers {
  docs: Record<string, unknown>[] = [];
  findById(id: unknown) {
    const row = this.docs.find((d) => normId(d._id) === normId(id)) ?? null;
    return { select: () => ({ lean: () => Promise.resolve(row ? { ...row } : null) }) };
  }
  find(filter: Record<string, unknown>) {
    const rows = this.docs.filter((d) => matches(d, filter));
    return { select: () => ({ lean: () => Promise.resolve(rows.map((r) => ({ ...r }))) }) };
  }
}

class FakeMessages {
  docs: Record<string, unknown>[] = [];
  updateOneCalls: unknown[] = [];
  findOne(filter: Record<string, unknown>) {
    const row = this.docs.find((d) => matches(d, filter)) ?? null;
    return one(row);
  }
  async create(payload: Record<string, unknown>) {
    const doc = { _id: new Types.ObjectId(), ...payload };
    this.docs.push(doc);
    return doc;
  }
  async updateOne(filter: Record<string, unknown>, update: unknown) {
    this.updateOneCalls.push({ filter, update });
    const doc = this.docs.find((d) => matches(d, filter));
    if (doc && update && typeof update === 'object' && '$set' in update) {
      for (const [k, v] of Object.entries((update as { $set: Record<string, unknown> }).$set)) {
        const parts = k.split('.');
        let target = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (target[parts[i]] === undefined) target[parts[i]] = {};
          target = target[parts[i]] as Record<string, unknown>;
        }
        target[parts[parts.length - 1]] = v;
      }
    }
    return { modifiedCount: doc ? 1 : 0 };
  }
}

const oid = () => new Types.ObjectId();
const hex = (o: Types.ObjectId) => o.toHexString();

function verifiedSeller(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    displayName: 'Shop Ngon',
    accountType: 'business',
    verificationStatus: 'verified',
    isBanned: false,
    ...overrides,
  };
}

function product(sellerId: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    name: 'Gạo ST25',
    price: 100000,
    originalPrice: null,
    imageKeys: ['img/gao.jpg'],
    category: 'grocery',
    active: true,
    soldCount: 0,
    sellerId,
    sellerActive: true,
    ...overrides,
  };
}

const BUYER = oid();
const SELLER = oid();

function placeDto(sellerId: string, productId: string, key?: string) {
  return {
    sellerId,
    items: [{ productId, qty: 2 }],
    buyerInfo: { name: 'Lan', phone: '0901', address: '1 Đà Lạt' },
    payment: 'cod' as const,
    idempotencyKey: key ?? `11111111-1111-4111-8111-${String(placeDtoSeq++).padStart(12, '0')}`,
  };
}
let placeDtoSeq = 1;

describe('OrdersService (Batch A)', () => {
  let service: OrdersService;
  let orders: FakeOrders;
  let products: FakeProducts;
  let users: FakeUsers;
  let messages: FakeMessages;
  let convs: {
    createDirect: jest.Mock;
    createSystemMessage: jest.Mock;
    updateLastMessage: jest.Mock;
  };
  let media: { generatePresignedGetUrl: jest.Mock };

  let sellerId: string;
  let buyerId: string;
  let productId: string;

  async function build(opts: { seller?: Record<string, unknown>; prods?: Record<string, unknown>[] } = {}) {
    orders = new FakeOrders();
    products = new FakeProducts();
    users = new FakeUsers();
    messages = new FakeMessages();
    convs = {
      createDirect: jest.fn(async (a: string, _b: string) => ({
        conversation: { _id: oid() },
        isNew: true,
      })),
      createSystemMessage: jest.fn(async () => ({ _id: oid() })),
      updateLastMessage: jest.fn(async () => undefined),
    };
    media = { generatePresignedGetUrl: jest.fn(async (k: string) => `https://cdn.test/${k}`) };
    const messagesService = {
      findOrderCard: jest.fn(async () => null),
      sendMessageWithOrderCard: jest.fn(async (_cid: string, _sid: string) => {
        const doc = { _id: oid(), metadata: {} };
        messages.docs.push(doc as unknown as Record<string, unknown>);
        return { _id: doc._id } as unknown as Record<string, unknown>;
      }),
      updateOrderCardStatus: jest.fn(async () => undefined),
    };
    const notificationsService = {
      sendOrderPush: jest.fn(async () => undefined),
    };

    const mod = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(CommerceOrder.name), useValue: orders },
        { provide: getModelToken(CommerceProduct.name), useValue: products },
        { provide: getModelToken(User.name), useValue: users },
        { provide: MediaService, useValue: media },
        { provide: ConversationsService, useValue: convs },
        { provide: MessagesService, useValue: messagesService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = mod.get(OrdersService);

    buyerId = hex(BUYER);
    const sellerDoc = opts.seller ?? verifiedSeller({ _id: SELLER });
    users.docs.push(sellerDoc);
    users.docs.push({ _id: BUYER, displayName: 'Lan' });
    sellerId = normId(sellerDoc._id);
    const prodDocs = opts.prods ?? [product(sellerId)];
    for (const p of prodDocs) products.docs.push(p);
    productId = normId(prodDocs[0]._id);
  }

  async function placed(status: 'PENDING' | 'CONFIRMED' | 'SHIPPING' = 'PENDING') {
    const res = await service.placeOrder(buyerId, placeDto(sellerId, productId));
    const id = String((res.order as Record<string, unknown>).id);
    if (status !== 'PENDING') {
      await service.confirmOrder(
        { sub: sellerId, accountType: 'business' },
        id,
        { shippingFee: 20000, expectedDeliveryDate: new Date(Date.now() + 86400000).toISOString() },
      );
    }
    if (status === 'SHIPPING') {
      await service.shipOrder({ sub: sellerId, accountType: 'business' }, id, {});
    }
    return id;
  }

  const sellerCaller = () => ({ sub: sellerId, accountType: 'business' as const });
  const buyerCaller = () => ({ sub: buyerId, accountType: 'personal' as const });

  // ─── Placement ────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    it('creates a PENDING order with frozen snapshot + card + system line', async () => {
      await build();
      const res = await service.placeOrder(buyerId, placeDto(sellerId, productId));
      const o = res.order as Record<string, unknown>;
      expect(o.status).toBe('PENDING');
      expect(o.subtotal).toBe(200000);
      expect(String(o.orderCode)).toMatch(/^KO-/);
      expect(res.conversationId).toBeTruthy();
      expect(convs.createDirect).toHaveBeenCalledWith(buyerId, sellerId);
      expect(messages.docs).toHaveLength(1);
      expect(convs.createSystemMessage).toHaveBeenCalledWith(
        res.conversationId,
        expect.stringContaining(String(o.orderCode)),
      );
      expect(convs.createSystemMessage).toHaveBeenCalledTimes(1);
    });

    it('rejects ordering from your own shop', async () => {
      await build();
      await expect(service.placeOrder(sellerId, placeDto(sellerId, productId))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an unverified seller (400, no order)', async () => {
      await build({ seller: verifiedSeller({ _id: SELLER, verificationStatus: 'pending' }) });
      await expect(service.placeOrder(buyerId, placeDto(sellerId, productId))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(orders.docs).toHaveLength(0);
    });

    it('rejects a banned seller (400, no order)', async () => {
      await build({ seller: verifiedSeller({ _id: SELLER, isBanned: true }) });
      await expect(service.placeOrder(buyerId, placeDto(sellerId, productId))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(orders.docs).toHaveLength(0);
    });

    it('rejects a non-business seller (400)', async () => {
      await build({ seller: verifiedSeller({ _id: SELLER, accountType: 'personal' }) });
      await expect(service.placeOrder(buyerId, placeDto(sellerId, productId))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an inactive product naming it (400, no order)', async () => {
      const deadSeller = oid();
      await build({
        seller: verifiedSeller({ _id: deadSeller }),
        prods: [product(hex(deadSeller), { active: false, name: 'Hết hàng' })],
      });
      await expect(
        service.placeOrder(buyerId, placeDto(hex(deadSeller), productId)),
      ).rejects.toThrow(/Hết hàng/);
      expect(orders.docs).toHaveLength(0);
    });

    it('rejects missing products (400)', async () => {
      await build();
      await expect(
        service.placeOrder(buyerId, placeDto(sellerId, hex(oid()))),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(orders.docs).toHaveLength(0);
    });

    it('rejects mixed-seller items (400)', async () => {
      await build();
      const other = oid();
      users.docs.push(verifiedSeller({ _id: other }));
      products.docs.push(product(hex(other)));
      const otherPid = s(products.docs[1]._id);
      await expect(
        service.placeOrder(buyerId, {
          ...placeDto(sellerId, productId),
          items: [
            { productId, qty: 1 },
            { productId: otherPid, qty: 1 },
          ],
        }),
      ).rejects.toThrow(/same seller/);
      expect(orders.docs).toHaveLength(0);
    });

    it('duplicate idempotencyKey returns the same order (200-shape) with one card', async () => {
      await build();
      const dto = placeDto(sellerId, productId, '11111111-1111-4111-8111-111111111111');
      const first = await service.placeOrder(buyerId, dto);
      orders.failNextCreate = true; // simulate the unique-index violation path
      const second = await service.placeOrder(buyerId, dto);
      expect(String((second.order as Record<string, unknown>).id)).toBe(
        String((first.order as Record<string, unknown>).id),
      );
      expect(orders.docs).toHaveLength(1);
      expect(messages.docs).toHaveLength(1);
      expect(convs.createDirect).toHaveBeenCalledTimes(1);
    });

    it('freezes prices: later price change does not alter the order', async () => {
      await build();
      await service.placeOrder(buyerId, placeDto(sellerId, productId));
      (products.docs[0] as Record<string, unknown>).price = 999999;
      const stored = orders.docs[0];
      expect((stored.items as Record<string, unknown>[])[0].price).toBe(100000);
      expect(stored.subtotal).toBe(200000);
    });
  });

  // ─── Transitions ──────────────────────────────────────────────────────────

  describe('confirm/reject/ship', () => {
    it('seller confirms with fee + date; buyer gets 403', async () => {
      await build();
      const id = await placed();
      const out = (await service.confirmOrder(sellerCaller(), id, {
        shippingFee: 20000,
        expectedDeliveryDate: new Date(Date.now() + 86400000).toISOString(),
      })) as Record<string, unknown>;
      expect(out.status).toBe('CONFIRMED');
      expect((out.shipping as Record<string, unknown>).fee).toBe(20000);
      expect((out.statusHistory as unknown[])).toHaveLength(2);
      await expect(
        service.confirmOrder(buyerCaller(), id, {
          shippingFee: 0,
          expectedDeliveryDate: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('confirm on a non-PENDING order → 409', async () => {
      await build();
      const id = await placed('CONFIRMED');
      await expect(
        service.confirmOrder(sellerCaller(), id, {
          shippingFee: 0,
          expectedDeliveryDate: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('seller rejects with reason → CANCELLED', async () => {
      await build();
      const id = await placed();
      const out = (await service.rejectOrder(sellerCaller(), id, { reason: 'Hết hàng' })) as Record<string, unknown>;
      expect(out.status).toBe('CANCELLED');
      expect(((out.statusHistory as Record<string, unknown>[]).at(-1) as Record<string, unknown>).note).toBe('Hết hàng');
    });

    it('ship on PENDING → 409; ship on CONFIRMED → SHIPPING', async () => {
      await build();
      const pending = await placed();
      await expect(service.shipOrder(sellerCaller(), pending, {})).rejects.toBeInstanceOf(ConflictException);
      const id = await placed('CONFIRMED');
      const out = (await service.shipOrder(sellerCaller(), id, {
        carrier: 'GHN',
        trackingCode: 'ABC123',
      })) as Record<string, unknown>;
      expect(out.status).toBe('SHIPPING');
      expect((out.shipping as Record<string, unknown>).trackingCode).toBe('ABC123');
    });

    it('buyer cannot ship (403)', async () => {
      await build();
      const id = await placed('CONFIRMED');
      await expect(service.shipOrder(buyerCaller(), id, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('receive + soldCount exactly-once', () => {
    it('buyer receive → DELIVERED and increments soldCount once', async () => {
      await build();
      const id = await placed('SHIPPING');
      await service.receiveOrder(buyerCaller(), id);
      const stored = orders.docs[0];
      expect(stored.status).toBe('DELIVERED');
      expect(stored.soldCountApplied).toBe(true);
      expect(products.bulkWriteCalls).toHaveLength(1);
      expect((products.docs[0] as Record<string, unknown>).soldCount).toBe(2);
      // Second receive → 409, no second increment.
      await expect(service.receiveOrder(buyerCaller(), id)).rejects.toBeInstanceOf(ConflictException);
      expect(products.bulkWriteCalls).toHaveLength(1);
      expect((products.docs[0] as Record<string, unknown>).soldCount).toBe(2);
    });

    it('seller cannot receive (403)', async () => {
      await build();
      const id = await placed('SHIPPING');
      await expect(service.receiveOrder(sellerCaller(), id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('receive on CONFIRMED → 409', async () => {
      await build();
      const id = await placed('CONFIRMED');
      await expect(service.receiveOrder(buyerCaller(), id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('system receive path works without role check', async () => {
      await build();
      const id = await placed('SHIPPING');
      const out = (await service.receiveOrder({ sub: 'system' }, id, { bySystem: true })) as Record<string, unknown>;
      expect(out.status).toBe('DELIVERED');
      expect(((out.statusHistory as Record<string, unknown>[]).at(-1) as Record<string, unknown>).by).toBe('system');
    });
  });

  describe('cancel matrix (D6)', () => {
    it('buyer cancels PENDING and CONFIRMED without reason', async () => {
      await build();
      const p = await placed();
      expect(((await service.cancelOrder(buyerCaller(), p)) as Record<string, unknown>).status).toBe('CANCELLED');
      const c = await placed('CONFIRMED');
      expect(((await service.cancelOrder(buyerCaller(), c)) as Record<string, unknown>).status).toBe('CANCELLED');
    });

    it('buyer cannot cancel SHIPPING (409)', async () => {
      await build();
      const id = await placed('SHIPPING');
      await expect(service.cancelOrder(buyerCaller(), id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('seller cancels PENDING with reason; seller cancel without reason → 400', async () => {
      await build();
      const id = await placed();
      await expect(service.cancelOrder(sellerCaller(), id, '  ')).rejects.toBeInstanceOf(BadRequestException);
      const out = (await service.cancelOrder(sellerCaller(), id, 'Kho hết')) as Record<string, unknown>;
      expect(out.status).toBe('CANCELLED');
    });

    it('seller cannot cancel CONFIRMED (409)', async () => {
      await build();
      const id = await placed('CONFIRMED');
      await expect(service.cancelOrder(sellerCaller(), id, 'Đổi ý')).rejects.toBeInstanceOf(ConflictException);
    });

    it('stranger cancel → 403', async () => {
      await build();
      const id = await placed();
      await expect(
        service.cancelOrder({ sub: hex(oid()), accountType: 'personal' }, id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── Reads ────────────────────────────────────────────────────────────────

  describe('reads', () => {
    it('getById: stranger → 403; parties can read; missing → 404', async () => {
      await build();
      const id = await placed();
      await expect(
        service.getById({ sub: hex(oid()), accountType: 'personal' }, id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getById(buyerCaller(), id)).resolves.toBeTruthy();
      await expect(service.getById(sellerCaller(), id)).resolves.toBeTruthy();
      await expect(service.getById(buyerCaller(), hex(oid()))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getById includes names + item image URLs', async () => {
      await build();
      const id = await placed();
      const detail = await service.getById(buyerCaller(), id);
      expect(detail.seller?.displayName).toBe('Shop Ngon');
      expect(detail.buyer?.displayName).toBe('Lan');
      expect(detail.itemImageUrls).toEqual(['https://cdn.test/img/gao.jpg']);
    });

    it('listSeller: personal token → 403', async () => {
      await build();
      await placed();
      await expect(service.listSeller(buyerCaller(), {})).rejects.toBeInstanceOf(ForbiddenException);
      const res = await service.listSeller(sellerCaller(), {});
      expect(res.total).toBe(1);
    });

    it('listMine filters by buyer with status filter + pagination', async () => {
      await build();
      await placed();
      await placed('CONFIRMED');
      const all = await service.listMine(buyerId, {});
      expect(all.total).toBe(2);
      expect(all.hasMore).toBe(false);
      const pending = await service.listMine(buyerId, { status: 'PENDING' });
      expect(pending.total).toBe(1);
      const page2 = await service.listMine(buyerId, { page: 2, limit: 1 });
      expect(page2.data).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it('admin list/detail read without party checks', async () => {
      await build();
      const id = await placed();
      expect((await service.listAdmin({})).total).toBe(1);
      expect((await service.listAdmin({ status: 'PENDING' })).total).toBe(1);
      expect((await service.listAdmin({ status: 'SHIPPING' })).total).toBe(0);
      await expect(service.getAdminById(id)).resolves.toBeTruthy();
    });
  });
});
