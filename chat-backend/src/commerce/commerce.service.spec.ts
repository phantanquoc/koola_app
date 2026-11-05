import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CommerceService } from './commerce.service';
import { CommerceProduct } from './schemas/commerce-product.schema';
import { CommerceStore } from './schemas/commerce-store.schema';
import { CommerceServiceDoc } from './schemas/commerce-service.schema';
import { User } from '../users/user.schema';
import { Media } from '../media/media.schema';
import { SellerVisibilityService } from './seller-visibility/seller-visibility.service';
import { buildProductSearchText } from './commerce-text.util';
import { FakeModel } from './__tests__/fake-model';

import { MediaService } from '../media/media.service';

// MediaService pulls in the uuid ESM build — auto-mock the module (same as the
// admin spec). The imported class is then only used as a DI token.
jest.mock('../media/media.service');

const oid = () => new Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1);

function business(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: oid(),
    accountType: 'business',
    verificationStatus: 'verified',
    isBanned: false,
    displayName: 'Shop',
    province: 'Đà Lạt',
    businessCategory: 'grocery',
    tagline: 'Tươi mỗi ngày',
    description: 'Rau củ',
    logoKey: 'logos/shop.png',
    ...overrides,
  };
}

function product(
  sellerId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const name = (overrides.name as string) ?? 'Sản phẩm';
  const tags = (overrides.tags as string[]) ?? [];
  return {
    _id: oid(),
    name,
    description: '',
    price: 10000,
    originalPrice: null,
    imageKeys: ['img/a.jpg'],
    category: 'grocery',
    tags,
    deliveryText: '',
    active: true,
    soldCount: 0,
    sellerId: sellerId.toHexString(),
    sellerActive: true,
    searchText: buildProductSearchText(name, tags),
    createdAt: new Date(T0),
    ...overrides,
  };
}

describe('CommerceService', () => {
  let service: CommerceService;
  let products: FakeModel;
  let users: FakeModel;
  let media: FakeModel;
  const sync = jest.fn().mockResolvedValue({ modified: 0 });
  const presign = jest.fn((key: string) =>
    Promise.resolve(`https://minio.test/${key}?sig`),
  );

  let shop: Record<string, unknown>;
  let shopId: Types.ObjectId;

  async function build(
    productDocs: Record<string, unknown>[],
    userDocs: Record<string, unknown>[],
    mediaDocs: Record<string, unknown>[] = [],
  ) {
    products = new FakeModel(productDocs);
    users = new FakeModel(userDocs);
    media = new FakeModel(mediaDocs);
    const mod = await Test.createTestingModule({
      providers: [
        CommerceService,
        { provide: getModelToken(CommerceProduct.name), useValue: products },
        {
          provide: getModelToken(CommerceStore.name),
          useValue: new FakeModel(),
        },
        {
          provide: getModelToken(CommerceServiceDoc.name),
          useValue: new FakeModel(),
        },
        { provide: getModelToken(User.name), useValue: users },
        { provide: getModelToken(Media.name), useValue: media },
        {
          provide: MediaService,
          useValue: { generatePresignedGetUrl: presign },
        },
        { provide: SellerVisibilityService, useValue: { syncSellers: sync } },
      ],
    }).compile();
    service = mod.get(CommerceService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    shop = business({ displayName: 'Koola Fresh Market' });
    shopId = shop._id as Types.ObjectId;
  });

  // ─── Listing: visibility ──────────────────────────────────────────────────

  describe('listPublicProducts visibility', () => {
    it('excludes inactive products and products of hidden sellers', async () => {
      const pending = business({ verificationStatus: 'pending' });
      const rejected = business({ verificationStatus: 'rejected' });
      const banned = business({ isBanned: true });
      const personal = business({ accountType: 'personal' });
      const visible = product(shopId, { name: 'Visible' });
      await build(
        [
          visible,
          product(shopId, { name: 'Inactive', active: false }),
          product(pending._id as Types.ObjectId, { sellerActive: false }),
          product(rejected._id as Types.ObjectId, { sellerActive: false }),
          product(banned._id as Types.ObjectId, { sellerActive: false }),
          product(personal._id as Types.ObjectId, { sellerActive: false }),
          // legacy seller-less doc: no sellerActive at all
          {
            _id: oid(),
            name: 'Legacy',
            price: 1,
            category: 'grocery',
            active: true,
          },
        ],
        [shop, pending, rejected, banned, personal],
      );

      const res = await service.listPublicProducts({});
      expect(res.data.map((p) => p.name)).toEqual(['Visible']);
      expect(res.total).toBe(1);
    });

    it('drops a product whose sellerActive drifted and heals the seller', async () => {
      const banned = business({ isBanned: true });
      await build(
        [product(banned._id as Types.ObjectId, { name: 'Drifted' })],
        [banned],
      );
      const res = await service.listPublicProducts({});
      expect(res.data).toHaveLength(0);
      expect(sync).toHaveBeenCalledWith([
        (banned._id as Types.ObjectId).toHexString(),
      ]);
    });

    it('maps a card with presigned first image and seller block', async () => {
      await build(
        [
          product(shopId, {
            name: 'Combo rau',
            imageKeys: ['img/1.jpg', 'img/2.jpg'],
            originalPrice: 119000,
            price: 89000,
            soldCount: 12,
            tags: ['Organic'],
            deliveryText: 'Giao 2h',
          }),
        ],
        [shop],
      );
      const [card] = (await service.listPublicProducts({})).data;
      expect(card).toMatchObject({
        name: 'Combo rau',
        price: 89000,
        originalPrice: 119000,
        imageKey: 'img/1.jpg',
        imageUrl: 'https://minio.test/img/1.jpg?sig',
        tags: ['Organic'],
        deliveryText: 'Giao 2h',
        soldCount: 12,
        seller: {
          id: shopId.toHexString(),
          displayName: 'Koola Fresh Market',
          verified: true,
          province: 'Đà Lạt',
        },
      });
      expect(presign).toHaveBeenCalledTimes(1);
    });

    it('returns imageUrl null for a product without images', async () => {
      await build([product(shopId, { imageKeys: [] })], [shop]);
      const [card] = (await service.listPublicProducts({})).data;
      expect(card.imageUrl).toBeNull();
      expect(card.imageKey).toBeNull();
    });
  });

  // ─── Listing: search / filter ────────────────────────────────────────────

  describe('listPublicProducts search and filters', () => {
    it('search is diacritic- and case-insensitive', async () => {
      await build(
        [
          product(shopId, { name: 'Combo Rau Củ Đà Lạt' }),
          product(shopId, { name: 'Tai nghe Bluetooth' }),
        ],
        [shop],
      );
      const res = await service.listPublicProducts({ q: 'rau cu' });
      expect(res.data.map((p) => p.name)).toEqual(['Combo Rau Củ Đà Lạt']);
      const res2 = await service.listPublicProducts({ q: 'ĐÀ LẠT' });
      expect(res2.data).toHaveLength(1);
    });

    it('search matches tags', async () => {
      await build(
        [
          product(shopId, { name: 'Gạo', tags: ['Chính hãng'] }),
          product(shopId, { name: 'Mắm' }),
        ],
        [shop],
      );
      const res = await service.listPublicProducts({ q: 'chinh hang' });
      expect(res.data.map((p) => p.name)).toEqual(['Gạo']);
    });

    it('regex metacharacters in q are treated literally', async () => {
      await build([product(shopId, { name: 'Bình 1.5L' })], [shop]);
      expect((await service.listPublicProducts({ q: '.*' })).data).toHaveLength(
        0,
      );
      expect(
        (await service.listPublicProducts({ q: '1.5' })).data,
      ).toHaveLength(1);
    });

    it('category and tag filters combine', async () => {
      await build(
        [
          product(shopId, {
            name: 'A',
            category: 'grocery',
            tags: ['Organic'],
          }),
          product(shopId, {
            name: 'B',
            category: 'grocery',
            tags: ['Chính hãng'],
          }),
          product(shopId, { name: 'C', category: 'beauty', tags: ['Organic'] }),
        ],
        [shop],
      );
      const res = await service.listPublicProducts({
        category: 'grocery',
        tag: 'Organic',
      });
      expect(res.data.map((p) => p.name)).toEqual(['A']);
      for (const p of res.data) {
        expect(p.category).toBe('grocery');
        expect(p.tags).toContain('Organic');
      }
    });

    it('filters by sellerId', async () => {
      const other = business({ displayName: 'Other' });
      await build(
        [
          product(shopId, { name: 'Mine' }),
          product(other._id as Types.ObjectId, { name: 'Theirs' }),
        ],
        [shop, other],
      );
      const res = await service.listPublicProducts({
        sellerId: shopId.toHexString(),
      });
      expect(res.data.map((p) => p.name)).toEqual(['Mine']);
    });
  });

  // ─── Listing: sort ───────────────────────────────────────────────────────

  describe('listPublicProducts sort', () => {
    // Fixed ids so tie-breaks on _id are deterministic and assertable.
    const id1 = new Types.ObjectId('000000000000000000000001');
    const id2 = new Types.ObjectId('000000000000000000000002');
    const id3 = new Types.ObjectId('000000000000000000000003');
    const id4 = new Types.ObjectId('000000000000000000000004');

    async function seed() {
      await build(
        [
          product(shopId, {
            _id: id1,
            name: 'p1',
            price: 50,
            soldCount: 5,
            createdAt: new Date(T0),
          }),
          product(shopId, {
            _id: id2,
            name: 'p2',
            price: 30,
            soldCount: 9,
            createdAt: new Date(T0 + DAY),
          }),
          // p3 ties p2 on soldCount; newer createdAt wins
          product(shopId, {
            _id: id3,
            name: 'p3',
            price: 30,
            soldCount: 9,
            createdAt: new Date(T0 + 2 * DAY),
          }),
          // p4 ties p3 on soldCount AND createdAt → _id desc decides
          product(shopId, {
            _id: id4,
            name: 'p4',
            price: 30,
            soldCount: 9,
            createdAt: new Date(T0 + 2 * DAY),
          }),
        ],
        [shop],
      );
    }

    it('newest (default): createdAt desc, then _id desc', async () => {
      await seed();
      const res = await service.listPublicProducts({});
      expect(res.data.map((p) => p.name)).toEqual(['p4', 'p3', 'p2', 'p1']);
    });

    it('bestseller: soldCount desc, then createdAt desc, then _id desc', async () => {
      await seed();
      const res = await service.listPublicProducts({ sort: 'bestseller' });
      expect(res.data.map((p) => p.name)).toEqual(['p4', 'p3', 'p2', 'p1']);
    });

    it('priceLow: price asc, ties by _id asc', async () => {
      await seed();
      // Store in reverse _id order so a missing _id tie-breaker cannot pass
      // by accident on insertion order.
      products.docs.reverse();
      const res = await service.listPublicProducts({ sort: 'priceLow' });
      expect(res.data.map((p) => p.name)).toEqual(['p2', 'p3', 'p4', 'p1']);
    });

    it('newest/bestseller tie-breakers do not depend on insertion order', async () => {
      await seed();
      products.docs.reverse();
      const newest = await service.listPublicProducts({});
      const best = await service.listPublicProducts({ sort: 'bestseller' });
      expect(newest.data.map((p) => p.name)).toEqual(['p4', 'p3', 'p2', 'p1']);
      expect(best.data.map((p) => p.name)).toEqual(['p4', 'p3', 'p2', 'p1']);
    });
  });

  // ─── Listing: pagination ─────────────────────────────────────────────────

  describe('listPublicProducts pagination', () => {
    async function seed(n: number) {
      await build(
        Array.from({ length: n }, (_, i) =>
          product(shopId, {
            name: `p${i}`,
            createdAt: new Date(T0 + i * 1000),
          }),
        ),
        [shop],
      );
    }

    it('page=3&limit=20 of 45 returns 5 items and hasMore false', async () => {
      await seed(45);
      const res = await service.listPublicProducts({ page: 3, limit: 20 });
      expect(res.data).toHaveLength(5);
      expect(res).toMatchObject({
        total: 45,
        page: 3,
        limit: 20,
        hasMore: false,
      });
    });

    it('reports hasMore true on earlier pages and pages never overlap', async () => {
      await seed(45);
      const p1 = await service.listPublicProducts({ page: 1, limit: 20 });
      const p2 = await service.listPublicProducts({ page: 2, limit: 20 });
      const p3 = await service.listPublicProducts({ page: 3, limit: 20 });
      expect(p1.hasMore).toBe(true);
      expect(p2.hasMore).toBe(true);
      const ids = [...p1.data, ...p2.data, ...p3.data].map((p) => p.id);
      expect(new Set(ids).size).toBe(45);
    });

    it('defaults to page 1, limit 20', async () => {
      await seed(25);
      const res = await service.listPublicProducts({});
      expect(res).toMatchObject({ page: 1, limit: 20, hasMore: true });
      expect(res.data).toHaveLength(20);
    });
  });

  // ─── Detail ──────────────────────────────────────────────────────────────

  describe('getPublicProduct', () => {
    it('returns full detail with presigned imageUrls in imageKeys order', async () => {
      const p = product(shopId, {
        name: 'Combo',
        description: 'Mô tả',
        imageKeys: ['img/2.jpg', 'img/1.jpg'],
      });
      await build([p], [shop]);
      const d = await service.getPublicProduct(
        (p._id as Types.ObjectId).toHexString(),
      );
      expect(d.description).toBe('Mô tả');
      expect(d.imageKeys).toEqual(['img/2.jpg', 'img/1.jpg']);
      expect(d.imageUrls).toEqual([
        'https://minio.test/img/2.jpg?sig',
        'https://minio.test/img/1.jpg?sig',
      ]);
      expect(d.seller).toEqual({
        id: shopId.toHexString(),
        displayName: 'Koola Fresh Market',
        verified: true,
        province: 'Đà Lạt',
        businessCategory: 'grocery',
        logoUrl: 'https://minio.test/logos/shop.png?sig',
      });
    });

    it('returns logoUrl null when the seller has no logo', async () => {
      const noLogo = business({ logoKey: undefined });
      const p = product(noLogo._id as Types.ObjectId);
      await build([p], [noLogo]);
      const d = await service.getPublicProduct(
        (p._id as Types.ObjectId).toHexString(),
      );
      expect(d.seller.logoUrl).toBeNull();
    });

    it('404 for a malformed id (not 500)', async () => {
      await build([], [shop]);
      await expect(service.getPublicProduct('not-an-objectid')).rejects.toThrow(
        NotFoundException,
      );
      // 12-char strings are accepted by ObjectId.isValid — must still 404.
      await expect(service.getPublicProduct('abcdefghijkl')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 for a missing or inactive product', async () => {
      const inactive = product(shopId, { active: false });
      await build([inactive], [shop]);
      await expect(
        service.getPublicProduct(oid().toHexString()),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getPublicProduct(
          (inactive._id as Types.ObjectId).toHexString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('404 when the seller is hidden even if sellerActive drifted to true', async () => {
      const rejected = business({ verificationStatus: 'rejected' });
      const p = product(rejected._id as Types.ObjectId, { sellerActive: true });
      await build([p], [rejected]);
      await expect(
        service.getPublicProduct((p._id as Types.ObjectId).toHexString()),
      ).rejects.toThrow(NotFoundException);
      expect(sync).toHaveBeenCalled();
    });

    it('404 when the seller document no longer exists', async () => {
      const p = product(oid());
      await build([p], []);
      await expect(
        service.getPublicProduct((p._id as Types.ObjectId).toHexString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Storefront ──────────────────────────────────────────────────────────

  describe('getSellerStorefront', () => {
    it('returns profile and visible product count', async () => {
      await build(
        [product(shopId), product(shopId), product(shopId, { active: false })],
        [shop],
      );
      const s = await service.getSellerStorefront(shopId.toHexString());
      expect(s.productCount).toBe(2);
      expect(s.seller).toEqual({
        id: shopId.toHexString(),
        displayName: 'Koola Fresh Market',
        verified: true,
        province: 'Đà Lạt',
        businessCategory: 'grocery',
        tagline: 'Tươi mỗi ngày',
        description: 'Rau củ',
        logoUrl: 'https://minio.test/logos/shop.png?sig',
        // Shop fixture không có coverKey → null, không lộ key thô.
        coverImageUrl: null,
      });
    });

    it.each([
      ['personal user', { accountType: 'personal' }],
      ['pending business', { verificationStatus: 'pending' }],
      ['rejected business', { verificationStatus: 'rejected' }],
      ['banned business', { isBanned: true }],
    ])('404 for a %s', async (_label, overrides) => {
      const u = business(overrides);
      await build([], [u]);
      await expect(
        service.getSellerStorefront((u._id as Types.ObjectId).toHexString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('404 for no user and for a malformed id', async () => {
      await build([], []);
      await expect(
        service.getSellerStorefront(oid().toHexString()),
      ).rejects.toThrow(NotFoundException);
      await expect(service.getSellerStorefront('garbage')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Validate ────────────────────────────────────────────────────────────

  describe('validateProducts', () => {
    it('returns items in request order with availability', async () => {
      const visible = product(shopId, { name: 'Rau', price: 95000 });
      const inactive = product(shopId, { active: false });
      await build([visible, inactive], [shop]);
      const visibleId = (visible._id as Types.ObjectId).toHexString();
      const inactiveId = (inactive._id as Types.ObjectId).toHexString();

      const { items } = await service.validateProducts([
        visibleId,
        inactiveId,
        'garbage',
      ]);
      expect(items.map((i) => i.id)).toEqual([
        visibleId,
        inactiveId,
        'garbage',
      ]);
      expect(items.map((i) => i.available)).toEqual([true, false, false]);
      expect(items[0]).toEqual({
        id: visibleId,
        available: true,
        price: 95000,
        name: 'Rau',
        imageUrl: 'https://minio.test/img/a.jpg?sig',
        seller: { id: shopId.toHexString(), displayName: 'Koola Fresh Market' },
      });
      for (const i of items.slice(1)) {
        expect(i).toEqual({
          id: i.id,
          available: false,
          price: null,
          name: null,
          imageUrl: null,
          seller: null,
        });
      }
    });

    it('marks products of hidden sellers and missing ids unavailable', async () => {
      const banned = business({ isBanned: true });
      const p = product(banned._id as Types.ObjectId, { sellerActive: true });
      await build([p], [banned]);
      const { items } = await service.validateProducts([
        (p._id as Types.ObjectId).toHexString(),
        oid().toHexString(),
      ]);
      expect(items.map((i) => i.available)).toEqual([false, false]);
    });

    it('keeps duplicate ids in place', async () => {
      const p = product(shopId);
      await build([p], [shop]);
      const id = (p._id as Types.ObjectId).toHexString();
      const { items } = await service.validateProducts([id, id]);
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.available)).toBe(true);
    });
  });

  // ─── Admin create / update ───────────────────────────────────────────────

  describe('admin createProduct / updateProduct', () => {
    const goodMedia = {
      mediaKey: 'uploads/admin/a.jpg',
      mimeType: 'image/jpeg',
      deleted: false,
      conversationId: null,
    };

    const base = () => ({
      name: 'Gạo ST25',
      price: 100000,
      category: 'grocery' as const,
      sellerId: shopId.toHexString(),
    });

    it('creates with sellerActive true, searchText and soldCount 0', async () => {
      await build([], [shop], [goodMedia]);
      const item = await service.createProduct({
        ...base(),
        tags: ['Chính hãng'],
        imageKeys: ['uploads/admin/a.jpg'],
        originalPrice: 120000,
      });
      expect(item).toMatchObject({
        sellerActive: true,
        soldCount: 0,
        visibility: 'visible',
        seller: { id: shopId.toHexString(), displayName: 'Koola Fresh Market' },
      });
      expect(products.docs[0].searchText).toBe('gao st25 chinh hang');
      // Now visible publicly.
      const res = await service.listPublicProducts({});
      expect(res.data.map((p) => p.name)).toEqual(['Gạo ST25']);
    });

    it.each([
      ['a personal user', { accountType: 'personal' }],
      ['an unverified business', { verificationStatus: 'pending' }],
      ['a rejected business', { verificationStatus: 'rejected' }],
      ['a banned business', { isBanned: true }],
    ])('400 when sellerId is %s', async (_l, overrides) => {
      const u = business(overrides);
      await build([], [u]);
      await expect(
        service.createProduct({
          ...base(),
          sellerId: (u._id as Types.ObjectId).toHexString(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(products.docs).toHaveLength(0);
    });

    it('400 when sellerId does not exist', async () => {
      await build([], []);
      await expect(
        service.createProduct({ ...base(), sellerId: oid().toHexString() }),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 when originalPrice <= price on create', async () => {
      await build([], [shop]);
      await expect(
        service.createProduct({ ...base(), originalPrice: 100000 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createProduct({ ...base(), originalPrice: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(products.docs).toHaveLength(0);
    });

    it('PATCH compares one-sided price changes against stored values', async () => {
      const p = product(shopId, { price: 100, originalPrice: 200 });
      await build([p], [shop]);
      const id = (p._id as Types.ObjectId).toHexString();
      // raising price above the stored originalPrice
      await expect(service.updateProduct(id, { price: 250 })).rejects.toThrow(
        BadRequestException,
      );
      // lowering originalPrice below the stored price
      await expect(
        service.updateProduct(id, { originalPrice: 50 }),
      ).rejects.toThrow(BadRequestException);
      expect(products.docs[0]).toMatchObject({
        price: 100,
        originalPrice: 200,
      });
      // valid one-sided change
      const ok = await service.updateProduct(id, { price: 150 });
      expect(ok.price).toBe(150);
      // clearing originalPrice is always allowed
      const cleared = await service.updateProduct(id, {
        originalPrice: null,
        price: 999,
      });
      expect(cleared).toMatchObject({ price: 999, originalPrice: null });
    });

    it('recomputes searchText when name or tags change', async () => {
      const p = product(shopId, { name: 'Cũ', tags: ['A'] });
      await build([p], [shop]);
      const id = (p._id as Types.ObjectId).toHexString();
      await service.updateProduct(id, { name: 'Mới Đẹp' });
      expect(products.docs[0].searchText).toBe('moi dep a');
      await service.updateProduct(id, { tags: ['Chứng nhận'] });
      expect(products.docs[0].searchText).toBe('moi dep chung nhan');
    });

    it('400 when PATCH moves the product to an unverified seller', async () => {
      const pending = business({ verificationStatus: 'pending' });
      const p = product(shopId);
      await build([p], [shop, pending]);
      await expect(
        service.updateProduct((p._id as Types.ObjectId).toHexString(), {
          sellerId: (pending._id as Types.ObjectId).toHexString(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(products.docs[0].sellerId).toBe(shopId.toHexString());
    });

    it('404 for update of a missing or malformed id', async () => {
      await build([], [shop]);
      await expect(
        service.updateProduct(oid().toHexString(), { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.updateProduct('bad', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ['an unknown key', []],
      ['a deleted upload', [{ ...goodMedia, deleted: true }]],
      ['a chat attachment', [{ ...goodMedia, conversationId: 'conv-1' }]],
      ['a non-image upload', [{ ...goodMedia, mimeType: 'application/pdf' }]],
    ])('400 when an imageKey is %s', async (_l, mediaDocs) => {
      await build([], [shop], mediaDocs);
      await expect(
        service.createProduct({
          ...base(),
          imageKeys: ['uploads/admin/a.jpg'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Admin listing ───────────────────────────────────────────────────────

  describe('admin listings', () => {
    it('lists every product with seller name and visibility state', async () => {
      const rejected = business({
        verificationStatus: 'rejected',
        displayName: 'Rejected Co',
      });
      await build(
        [
          product(shopId, { name: 'vis', createdAt: new Date(T0 + 4000) }),
          product(shopId, {
            name: 'off',
            active: false,
            createdAt: new Date(T0 + 3000),
          }),
          product(rejected._id as Types.ObjectId, {
            name: 'hidden',
            sellerActive: false,
            createdAt: new Date(T0 + 2000),
          }),
          {
            _id: oid(),
            name: 'legacy',
            price: 1,
            category: 'grocery',
            createdAt: new Date(T0 + 1000),
          },
        ],
        [shop, rejected],
      );
      const res = await service.listAdminProducts({ page: 1, limit: 20 });
      expect(
        res.data.map((p) => [
          p.name,
          p.visibility,
          p.seller?.displayName ?? null,
        ]),
      ).toEqual([
        ['vis', 'visible', 'Koola Fresh Market'],
        ['off', 'inactive', 'Koola Fresh Market'],
        ['hidden', 'seller_hidden', 'Rejected Co'],
        ['legacy', 'missing_seller', null],
      ]);
      expect(res.total).toBe(4);
    });

    it('seller picker lists only verified, non-banned businesses', async () => {
      await build(
        [],
        [
          shop,
          business({ displayName: 'Pending', verificationStatus: 'pending' }),
          business({ displayName: 'Banned', isBanned: true }),
          business({ displayName: 'Personal', accountType: 'personal' }),
        ],
      );
      const { data } = await service.listAdminSellers();
      expect(data).toEqual([
        {
          id: shopId.toHexString(),
          displayName: 'Koola Fresh Market',
          businessCategory: 'grocery',
        },
      ]);
    });
  });
});
