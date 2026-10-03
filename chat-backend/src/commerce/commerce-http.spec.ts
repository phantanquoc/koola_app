/**
 * HTTP-boundary tests for the commerce controllers: global ValidationPipe
 * (same options as main.ts), the real AdminGuard, and route wiring.
 * CommerceService is a mock — business rules live in commerce.service.spec.ts.
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
import { CommerceController } from './commerce.controller';
import { AdminCommerceController } from './admin-commerce.controller';
import { CommerceService } from './commerce.service';
import { OrdersService } from './orders/orders.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.schema';

jest.mock('../media/media.service');

const ADMIN_ID = new Types.ObjectId().toHexString();
const USER_ID = new Types.ObjectId().toHexString();
const SELLER_ID = new Types.ObjectId().toHexString();

/** Stands in for passport-jwt: the `x-test-actor` header becomes request.user. */
class FakeJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const actor = req.headers['x-test-actor'];
    if (actor) req.user = { actorId: actor, sub: actor };
    return true;
  }
}

describe('Commerce HTTP boundary', () => {
  let app: INestApplication<App>;
  const commerce = {
    listPublicProducts: jest.fn().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      hasMore: false,
    }),
    getPublicProduct: jest.fn().mockResolvedValue({ id: 'x' }),
    getSellerStorefront: jest
      .fn()
      .mockResolvedValue({ seller: {}, productCount: 0 }),
    validateProducts: jest.fn().mockResolvedValue({ items: [] }),
    listServices: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    listStores: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    listAdminProducts: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    listAdminSellers: jest.fn().mockResolvedValue({ data: [] }),
    createProduct: jest.fn().mockResolvedValue({ id: 'new-id' }),
    updateProduct: jest.fn().mockResolvedValue({ id: 'upd-id' }),
    deleteProduct: jest.fn().mockResolvedValue(true),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const orders = {
    listAdmin: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getAdminById: jest.fn().mockResolvedValue({ order: {} }),
  };
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
      controllers: [CommerceController, AdminCommerceController],
      providers: [
        { provide: CommerceService, useValue: commerce },
        { provide: OrdersService, useValue: orders },
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

  const validProduct = () => ({
    name: 'Gạo ST25',
    price: 100000,
    category: 'grocery',
    sellerId: SELLER_ID,
  });

  // ─── Public listing query validation ──────────────────────────────────────

  describe('GET /commerce/products', () => {
    it('accepts a valid query and passes typed values through', async () => {
      await request(app.getHttpServer())
        .get('/commerce/products')
        .query({
          q: 'rau cu',
          category: 'grocery',
          tag: 'Organic',
          sort: 'priceLow',
          page: '2',
          limit: '10',
        })
        .expect(200)
        .expect('Cache-Control', 'public, max-age=60');
      expect(commerce.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'rau cu',
          category: 'grocery',
          tag: 'Organic',
          sort: 'priceLow',
          page: 2,
          limit: 10,
        }),
      );
    });

    it.each([
      ['sort=random', { sort: 'random' }],
      ['limit=500', { limit: '500' }],
      ['limit=0', { limit: '0' }],
      ['page=0', { page: '0' }],
      ['category=weapons', { category: 'weapons' }],
      ['sellerId=not-an-id', { sellerId: 'not-an-id' }],
      ['unknown param', { storeId: 'abc' }],
      ['q too long', { q: 'x'.repeat(101) }],
    ])('400 for %s', async (_l, query) => {
      await request(app.getHttpServer())
        .get('/commerce/products')
        .query(query)
        .expect(400);
      expect(commerce.listPublicProducts).not.toHaveBeenCalled();
    });

    it('is public (no actor required)', async () => {
      await request(app.getHttpServer()).get('/commerce/products').expect(200);
    });
  });

  describe('public detail / seller / validate', () => {
    it('routes detail and seller ids', async () => {
      await request(app.getHttpServer())
        .get('/commerce/products/abc')
        .expect(200);
      expect(commerce.getPublicProduct).toHaveBeenCalledWith('abc');
      await request(app.getHttpServer())
        .get(`/commerce/sellers/${SELLER_ID}`)
        .expect(200);
      expect(commerce.getSellerStorefront).toHaveBeenCalledWith(SELLER_ID);
    });

    it('validate returns 200 with no-store', async () => {
      await request(app.getHttpServer())
        .post('/commerce/products/validate')
        .send({ ids: ['a', 'b'] })
        .expect(200)
        .expect('Cache-Control', 'no-store');
      expect(commerce.validateProducts).toHaveBeenCalledWith(['a', 'b']);
    });

    it.each([
      ['empty ids', { ids: [] }],
      ['>100 ids', { ids: Array.from({ length: 101 }, (_, i) => `id${i}`) }],
      ['non-string id', { ids: [123] }],
      ['missing ids', {}],
    ])('validate 400 for %s', async (_l, body) => {
      await request(app.getHttpServer())
        .post('/commerce/products/validate')
        .send(body)
        .expect(400);
    });

    it('services and stores endpoints keep working', async () => {
      await request(app.getHttpServer())
        .get('/commerce/services')
        .query({ category: 'delivery', page: '1' })
        .expect(200);
      await request(app.getHttpServer()).get('/commerce/stores').expect(200);
    });
  });

  // ─── Admin writes ─────────────────────────────────────────────────────────

  describe('admin product writes', () => {
    it('admin creates a product and it is audit-logged', async () => {
      await request(app.getHttpServer())
        .post('/admin/commerce/products')
        .set('x-test-actor', ADMIN_ID)
        .send({ ...validProduct(), tags: ['Organic'], originalPrice: 120000 })
        .expect(201);
      expect(commerce.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Gạo ST25', price: 100000 }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          action: 'create_product',
          targetId: 'new-id',
        }),
      );
    });

    it.each(['soldCount', 'sellerActive', 'searchText'])(
      '400 when the body includes %s (create and update)',
      async (field) => {
        await request(app.getHttpServer())
          .post('/admin/commerce/products')
          .set('x-test-actor', ADMIN_ID)
          .send({
            ...validProduct(),
            [field]: field === 'searchText' ? 'x' : 5,
          })
          .expect(400);
        await request(app.getHttpServer())
          .patch('/admin/commerce/products/abc')
          .set('x-test-actor', ADMIN_ID)
          .send({ [field]: field === 'searchText' ? 'x' : 5 })
          .expect(400);
        expect(commerce.createProduct).not.toHaveBeenCalled();
        expect(commerce.updateProduct).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['non-integer price', { price: 10.5 }],
      ['negative price', { price: -1 }],
      ['unknown category', { category: 'general' }],
      ['bad sellerId', { sellerId: 'seller-fresh' }],
      [
        'too many images',
        { imageKeys: Array.from({ length: 9 }, (_, i) => `k${i}`) },
      ],
      [
        'too many tags',
        { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
      ],
      ['tag too long', { tags: ['x'.repeat(41)] }],
      ['empty name', { name: '   ' }],
      ['description too long', { description: 'x'.repeat(2001) }],
      ['deliveryText too long', { deliveryText: 'x'.repeat(101) }],
    ])('400 for %s', async (_l, override) => {
      await request(app.getHttpServer())
        .post('/admin/commerce/products')
        .set('x-test-actor', ADMIN_ID)
        .send({ ...validProduct(), ...override })
        .expect(400);
      expect(commerce.createProduct).not.toHaveBeenCalled();
    });

    it.each([
      ['POST', '/admin/commerce/products'],
      ['PATCH', '/admin/commerce/products/abc'],
      ['DELETE', '/admin/commerce/products/abc'],
      ['GET', '/admin/commerce/products'],
      ['GET', '/admin/commerce/sellers'],
    ])('403 for a non-admin on %s %s', async (method, url) => {
      const server = request(app.getHttpServer());
      const req =
        method === 'POST'
          ? server.post(url).send(validProduct())
          : method === 'PATCH'
            ? server.patch(url).send({ name: 'x' })
            : method === 'DELETE'
              ? server.delete(url)
              : server.get(url);
      await req.set('x-test-actor', USER_ID).expect(403);
      expect(commerce.createProduct).not.toHaveBeenCalled();
      expect(commerce.updateProduct).not.toHaveBeenCalled();
      expect(commerce.deleteProduct).not.toHaveBeenCalled();
    });

    it('403 with no actor at all', async () => {
      await request(app.getHttpServer())
        .post('/admin/commerce/products')
        .send(validProduct())
        .expect(403);
    });

    it('admin lists products and sellers', async () => {
      await request(app.getHttpServer())
        .get('/admin/commerce/products')
        .query({ page: '1', limit: '20' })
        .set('x-test-actor', ADMIN_ID)
        .expect(200);
      expect(commerce.listAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
      await request(app.getHttpServer())
        .get('/admin/commerce/sellers')
        .set('x-test-actor', ADMIN_ID)
        .expect(200);
      expect(commerce.listAdminSellers).toHaveBeenCalled();
    });

    it('delete returns 404 when the product does not exist', async () => {
      commerce.deleteProduct.mockResolvedValueOnce(false);
      await request(app.getHttpServer())
        .delete('/admin/commerce/products/abc')
        .set('x-test-actor', ADMIN_ID)
        .expect(404);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
