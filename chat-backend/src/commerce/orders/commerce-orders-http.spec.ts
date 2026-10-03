/**
 * HTTP-boundary tests for the orders controllers (commerce-orders task 2.4):
 * global ValidationPipe (same options as main.ts), route wiring, guards.
 * OrdersService is a mock — business rules live in commerce-orders.service.spec.ts.
 */
import { Test } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Types } from 'mongoose';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OrdersController } from './orders.controller';
import { AdminCommerceController } from '../admin-commerce.controller';
import { CommerceService } from '../commerce.service';
import { OrdersService } from './orders.service';
import { AdminAuditService } from '../../admin/admin-audit.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../users/user.schema';

jest.mock('../../media/media.service');

const ADMIN_ID = new Types.ObjectId().toHexString();
const USER_ID = new Types.ObjectId().toHexString();
const SELLER_ID = new Types.ObjectId().toHexString();
const ORDER_ID = new Types.ObjectId().toHexString();
const KEY = '11111111-1111-4111-8111-111111111111';

/**
 * Stands in for passport-jwt: `x-test-actor` becomes sub, `x-test-type`
 * becomes accountType (business|personal).
 */
class FakeJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const actor = req.headers['x-test-actor'];
    if (actor) {
      req.user = {
        actorId: actor,
        sub: actor,
        accountType: req.headers['x-test-type'] ?? 'personal',
      };
    }
    return true;
  }
}

describe('Orders HTTP boundary', () => {
  let app: INestApplication<App>;
  const orders = {
    placeOrder: jest.fn().mockResolvedValue({ order: { id: ORDER_ID }, conversationId: 'c1' }),
    listMine: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, hasMore: false }),
    listSeller: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, hasMore: false }),
    getById: jest.fn().mockResolvedValue({ order: { id: ORDER_ID } }),
    confirmOrder: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    rejectOrder: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    shipOrder: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    receiveOrder: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    cancelOrder: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    listAdmin: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, hasMore: false }),
    getAdminById: jest.fn().mockResolvedValue({ order: { id: ORDER_ID } }),
  };
  const commerce = {
    listPublicProducts: jest.fn(),
    getPublicProduct: jest.fn(),
    getSellerStorefront: jest.fn(),
    validateProducts: jest.fn(),
    listServices: jest.fn(),
    listStores: jest.fn(),
    listAdminProducts: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    listAdminSellers: jest.fn().mockResolvedValue({ data: [] }),
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
    deleteProduct: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const userModel = {
    findById: jest.fn((id: string) => ({
      select: () => ({
        lean: () =>
          Promise.resolve(
            id === ADMIN_ID
              ? { isPlatformAdmin: true }
              : id === USER_ID
                ? { isPlatformAdmin: false }
                : null,
          ),
      }),
    })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [OrdersController, AdminCommerceController],
      providers: [
        { provide: OrdersService, useValue: orders },
        { provide: CommerceService, useValue: commerce },
        { provide: AdminAuditService, useValue: audit },
        { provide: getModelToken(User.name), useValue: userModel },
        AdminGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const validPlace = () => ({
    sellerId: SELLER_ID,
    items: [{ productId: new Types.ObjectId().toHexString(), qty: 2 }],
    buyerInfo: { name: 'Lan', phone: '0901', address: '1 Đà Lạt' },
    payment: 'cod',
    idempotencyKey: KEY,
  });

  describe('POST /commerce/orders', () => {
    it('accepts a valid placement (201)', async () => {
      await request(app.getHttpServer())
        .post('/commerce/orders')
        .set('x-test-actor', USER_ID)
        .send(validPlace())
        .expect(201);
      expect(orders.placeOrder).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ sellerId: SELLER_ID, payment: 'cod' }),
      );
    });

    it.each([
      ['empty items', { items: [] }],
      ['51 items', { items: Array.from({ length: 51 }, () => ({ productId: SELLER_ID, qty: 1 })) }],
      ['qty 0', { qtyZero: true }],
      ['bad payment', { payment: 'momo' }],
      ['bad uuid', { idempotencyKey: 'not-a-uuid' }],
      ['bad sellerId', { sellerId: 'nope' }],
      ['note too long', { longNote: true }],
      ['unknown param', { hacked: true }],
    ])('400 for %s', async (_l, patch) => {
      const body: Record<string, unknown> = validPlace();
      if ('qtyZero' in patch) body.items = [{ productId: SELLER_ID, qty: 0 }];
      if ('longNote' in patch) {
        (body.buyerInfo as Record<string, unknown>).note = 'x'.repeat(501);
      }
      for (const [k, v] of Object.entries(patch)) {
        if (['qtyZero', 'longNote'].includes(k)) continue;
        body[k] = v;
      }
      await request(app.getHttpServer())
        .post('/commerce/orders')
        .set('x-test-actor', USER_ID)
        .send(body)
        .expect(400);
      expect(orders.placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    it('GET /commerce/orders/mine passes through', async () => {
      await request(app.getHttpServer())
        .get('/commerce/orders/mine')
        .set('x-test-actor', USER_ID)
        .query({ status: 'PENDING', page: '1', limit: '20' })
        .expect(200);
      expect(orders.listMine).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ status: 'PENDING' }),
      );
    });

    it('GET /commerce/orders/seller passes the full caller (sub+type)', async () => {
      await request(app.getHttpServer())
        .get('/commerce/orders/seller')
        .set('x-test-actor', SELLER_ID)
        .set('x-test-type', 'business')
        .expect(200);
      expect(orders.listSeller).toHaveBeenCalledWith(
        expect.objectContaining({ sub: SELLER_ID, accountType: 'business' }),
        expect.anything(),
      );
    });

    it('GET /commerce/orders/:id routes the id', async () => {
      await request(app.getHttpServer())
        .get(`/commerce/orders/${ORDER_ID}`)
        .set('x-test-actor', USER_ID)
        .expect(200);
      expect(orders.getById).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID }),
        ORDER_ID,
      );
    });

    it('400 for bad status filter', async () => {
      await request(app.getHttpServer())
        .get('/commerce/orders/mine')
        .set('x-test-actor', USER_ID)
        .query({ status: 'NOPE' })
        .expect(400);
    });
  });

  describe('transitions', () => {
    it('confirm requires fee + ISO date', async () => {
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/confirm`)
        .set('x-test-actor', SELLER_ID)
        .send({ shippingFee: 20000, expectedDeliveryDate: new Date().toISOString() })
        .expect(200);
      expect(orders.confirmOrder).toHaveBeenCalled();
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/confirm`)
        .set('x-test-actor', SELLER_ID)
        .send({ shippingFee: -1, expectedDeliveryDate: 'not-a-date' })
        .expect(400);
    });

    it('reject requires a reason', async () => {
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/reject`)
        .set('x-test-actor', SELLER_ID)
        .send({ reason: 'Hết hàng' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/reject`)
        .set('x-test-actor', SELLER_ID)
        .send({ reason: '' })
        .expect(400);
    });

    it('ship accepts empty body; cancel accepts empty body', async () => {
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/ship`)
        .set('x-test-actor', SELLER_ID)
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/cancel`)
        .set('x-test-actor', USER_ID)
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/receive`)
        .set('x-test-actor', USER_ID)
        .send({})
        .expect(200);
    });

    it('cancel rejects an overlong reason', async () => {
      await request(app.getHttpServer())
        .patch(`/commerce/orders/${ORDER_ID}/cancel`)
        .set('x-test-actor', SELLER_ID)
        .send({ reason: 'x'.repeat(501) })
        .expect(400);
    });
  });

  describe('admin orders (read-only)', () => {
    it('admin can list + read; non-admin gets 403; no mutation routes exist', async () => {
      await request(app.getHttpServer())
        .get('/admin/commerce/orders')
        .set('x-test-actor', ADMIN_ID)
        .query({ status: 'PENDING' })
        .expect(200);
      expect(orders.listAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' }),
      );
      await request(app.getHttpServer())
        .get(`/admin/commerce/orders/${ORDER_ID}`)
        .set('x-test-actor', ADMIN_ID)
        .expect(200);
      expect(orders.getAdminById).toHaveBeenCalledWith(ORDER_ID);
      await request(app.getHttpServer())
        .get('/admin/commerce/orders')
        .set('x-test-actor', USER_ID)
        .expect(403);
      // No admin mutation: POST/PATCH/DELETE on /admin/commerce/orders → 404.
      await request(app.getHttpServer())
        .post('/admin/commerce/orders')
        .set('x-test-actor', ADMIN_ID)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/admin/commerce/orders/${ORDER_ID}`)
        .set('x-test-actor', ADMIN_ID)
        .send({})
        .expect(404);
    });
  });
});
