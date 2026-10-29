import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter, type SortOrder } from 'mongoose';
import {
  CommerceProduct,
  CommerceProductDocument,
} from './schemas/commerce-product.schema';
import {
  CommerceStore,
  CommerceStoreDocument,
} from './schemas/commerce-store.schema';
import {
  CommerceServiceDoc,
  CommerceServiceDocument,
} from './schemas/commerce-service.schema';
import { User, UserDocument } from '../users/user.schema';
import { Media, MediaDocument } from '../media/media.schema';
import { MediaService } from '../media/media.service';
import {
  SellerVisibilityService,
  isSellerVisible,
} from './seller-visibility/seller-visibility.service';
import {
  buildProductSearchText,
  escapeRegex,
  normalizeSearchText,
} from './commerce-text.util';
import {
  PRODUCT_LIST_DEFAULT_LIMIT,
  type CommerceCategory,
  type CommerceSortKey,
} from './commerce.constants';
import type {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/commerce.dto';

// ─── Public response shapes (commerce-catalog spec) ─────────────────────────

export interface ProductCardSeller {
  id: string;
  displayName: string;
  verified: true;
  province: string | null;
}

export interface ProductCard {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  imageKey: string | null;
  category: CommerceCategory;
  tags: string[];
  deliveryText: string;
  soldCount: number;
  seller: ProductCardSeller;
}

export interface ProductListResponse {
  data: ProductCard[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ProductDetail extends Omit<ProductCard, 'seller'> {
  description: string;
  /** Presigned GET URLs in `imageKeys` order; an entry is null if signing failed. */
  imageUrls: (string | null)[];
  imageKeys: string[];
  seller: {
    id: string;
    displayName: string;
    verified: true;
    province: string | null;
    businessCategory: string | null;
    logoUrl: string | null;
  };
}

export interface SellerStorefront {
  seller: {
    id: string;
    displayName: string;
    verified: true;
    province: string | null;
    businessCategory: string | null;
    tagline: string | null;
    description: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
    // followerCount/totalSoldCount/rating/reviewCount chưa có nguồn dữ liệu
    // thật — trả số bịa sẽ hiển thị sai trên storefront, nên bỏ hẳn.
  };
  productCount: number;
}

export interface ValidateItem {
  id: string;
  available: boolean;
  price: number | null;
  name: string | null;
  imageUrl: string | null;
  seller: { id: string; displayName: string } | null;
}

export type AdminProductVisibility =
  | 'visible'
  | 'inactive'
  | 'seller_hidden'
  | 'missing_seller';

export interface AdminProductItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  imageKeys: string[];
  imageUrls: (string | null)[];
  category: string;
  tags: string[];
  deliveryText: string;
  active: boolean;
  soldCount: number;
  sellerId: string | null;
  sellerActive: boolean;
  seller: { id: string; displayName: string } | null;
  visibility: AdminProductVisibility;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AdminSellerOption {
  id: string;
  displayName: string;
  businessCategory: string | null;
}

// ─── Internals ──────────────────────────────────────────────────────────────

type LeanProduct = CommerceProduct & { _id: Types.ObjectId };
type LeanSeller = Pick<
  User,
  | 'displayName'
  | 'accountType'
  | 'verificationStatus'
  | 'isBanned'
  | 'suspended'
  | 'province'
  | 'businessCategory'
  | 'tagline'
  | 'description'
  | 'logoKey'
  | 'coverKey'
> & { _id: Types.ObjectId };

const SELLER_FIELDS =
  '_id displayName accountType verificationStatus isBanned suspended province businessCategory tagline description logoKey coverKey';

/** Public visibility predicate shared by listing, detail, storefront, validate. */
const PUBLIC_FILTER = { active: true, sellerActive: true } as const;

const PRODUCT_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Strict ObjectId check. `Types.ObjectId.isValid` also accepts any 12-char
 * string, which would let "not-an-objectid"-style garbage through.
 */
function isObjectIdString(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

const SORTS: Record<CommerceSortKey, Record<string, SortOrder>> = {
  // Tie-breakers make paging deterministic for a static dataset (spec).
  newest: { createdAt: -1, _id: -1 },
  bestseller: { soldCount: -1, createdAt: -1, _id: -1 },
  priceLow: { price: 1, _id: 1 },
};

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);

  constructor(
    @InjectModel(CommerceProduct.name)
    private productModel: Model<CommerceProductDocument>,
    @InjectModel(CommerceStore.name)
    private storeModel: Model<CommerceStoreDocument>,
    @InjectModel(CommerceServiceDoc.name)
    private serviceModel: Model<CommerceServiceDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Media.name)
    private mediaModel: Model<MediaDocument>,
    private readonly mediaService: MediaService,
    private readonly sellerVisibility: SellerVisibilityService,
  ) {}

  // ═══ Public catalog ═══════════════════════════════════════════════════════

  async listPublicProducts(
    dto: ListProductsQueryDto,
  ): Promise<ProductListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? PRODUCT_LIST_DEFAULT_LIMIT;
    const sort = SORTS[dto.sort ?? 'newest'];

    const filter: QueryFilter<CommerceProductDocument> = { ...PUBLIC_FILTER };
    if (dto.category) filter.category = dto.category;
    if (dto.tag) filter.tags = dto.tag;
    if (dto.sellerId) filter.sellerId = dto.sellerId;
    const q = dto.q ? normalizeSearchText(dto.q) : '';
    if (q) filter.searchText = { $regex: escapeRegex(q) };

    const [docs, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<LeanProduct[]>(),
      this.productModel.countDocuments(filter),
    ]);

    const sellers = await this.loadSellers(docs.map((d) => d.sellerId));
    const data: ProductCard[] = [];
    const drifted: string[] = [];
    for (const doc of docs) {
      const seller = sellers.get(doc.sellerId);
      // Defense in depth: never serve a product whose seller is not visible,
      // even if `sellerActive` drifted. Heal the flag in the background.
      if (!seller || !isSellerVisible(seller)) {
        drifted.push(doc.sellerId);
        continue;
      }
      data.push(await this.toCard(doc, seller));
    }
    this.healDrift(drifted);

    return { data, total, page, limit, hasMore: page * limit < total };
  }

  async getPublicProduct(id: string): Promise<ProductDetail> {
    if (!isObjectIdString(id)) throw new NotFoundException('Product not found');
    const doc = await this.productModel
      .findOne({ _id: id, ...PUBLIC_FILTER })
      .lean<LeanProduct>();
    if (!doc) throw new NotFoundException('Product not found');

    // Re-check the seller document (design D1) — drift must never expose a
    // hidden seller's product page.
    const seller = await this.findSeller(doc.sellerId);
    if (!seller || !isSellerVisible(seller)) {
      this.healDrift([doc.sellerId]);
      throw new NotFoundException('Product not found');
    }

    const card = await this.toCard(doc, seller);
    const imageUrls = await Promise.all(
      (doc.imageKeys ?? []).map((k) => this.presign(k)),
    );
    return {
      ...card,
      description: doc.description ?? '',
      imageUrls,
      imageKeys: doc.imageKeys ?? [],
      seller: {
        id: String(seller._id),
        displayName: seller.displayName,
        verified: true,
        province: seller.province ?? null,
        businessCategory: seller.businessCategory ?? null,
        logoUrl: seller.logoKey ? await this.presign(seller.logoKey) : null,
      },
    };
  }

  async getSellerStorefront(id: string): Promise<SellerStorefront> {
    if (!isObjectIdString(id)) throw new NotFoundException('Seller not found');
    const seller = await this.findSeller(id);
    if (!seller || !isSellerVisible(seller)) {
      throw new NotFoundException('Seller not found');
    }
    const productCount = await this.productModel.countDocuments({
      ...PUBLIC_FILTER,
      sellerId: id,
    });
    return {
      seller: {
        id: String(seller._id),
        displayName: seller.displayName,
        verified: true,
        province: seller.province ?? null,
        businessCategory: seller.businessCategory ?? null,
        tagline: seller.tagline ?? null,
        description: seller.description ?? null,
        logoUrl: seller.logoKey ? await this.presign(seller.logoKey) : null,
        coverImageUrl: (seller as unknown as Record<string, string | undefined>)
          .coverKey
          ? await this.presign(
              (seller as unknown as Record<string, string>).coverKey,
            )
          : null,
      },
      productCount,
    };
  }

  async validateProducts(ids: string[]): Promise<{ items: ValidateItem[] }> {
    const validIds = Array.from(new Set(ids.filter(isObjectIdString)));
    const docs = validIds.length
      ? await this.productModel
          .find({ _id: { $in: validIds }, ...PUBLIC_FILTER })
          .lean<LeanProduct[]>()
      : [];
    const sellers = await this.loadSellers(docs.map((d) => d.sellerId));
    const byId = new Map(docs.map((d) => [String(d._id), d]));

    const unavailable = (id: string): ValidateItem => ({
      id,
      available: false,
      price: null,
      name: null,
      imageUrl: null,
      seller: null,
    });

    const drifted: string[] = [];
    const items = await Promise.all(
      ids.map(async (id): Promise<ValidateItem> => {
        const doc = isObjectIdString(id) ? byId.get(id) : undefined;
        if (!doc) return unavailable(id);
        const seller = sellers.get(doc.sellerId);
        if (!seller || !isSellerVisible(seller)) {
          drifted.push(doc.sellerId);
          return unavailable(id);
        }
        return {
          id,
          available: true,
          price: doc.price,
          name: doc.name,
          imageUrl: doc.imageKeys?.[0]
            ? await this.presign(doc.imageKeys[0])
            : null,
          seller: { id: String(seller._id), displayName: seller.displayName },
        };
      }),
    );
    this.healDrift(drifted);
    return { items };
  }

  // ═══ Admin products ═══════════════════════════════════════════════════════

  async listAdminProducts(dto: { page?: number; limit?: number }): Promise<{
    data: AdminProductItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const [docs, total] = await Promise.all([
      this.productModel
        .find({})
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<LeanProduct[]>(),
      this.productModel.countDocuments({}),
    ]);
    // One batched lookup for every seller on the page — no populate().
    const sellers = await this.loadSellers(docs.map((d) => d.sellerId));
    const data = await Promise.all(
      docs.map((d) => this.toAdminItem(d, sellers.get(d.sellerId) ?? null)),
    );
    return { data, total, page, limit };
  }

  /** Verified, non-banned, non-suspended businesses for the admin seller picker. */
  async listAdminSellers(): Promise<{ data: AdminSellerOption[] }> {
    const docs = await this.userModel
      .find({
        accountType: 'business',
        verificationStatus: 'verified',
        isBanned: { $ne: true },
        suspended: { $ne: true },
      })
      .select('_id displayName businessCategory')
      .sort({ displayName: 1, _id: 1 })
      .lean<
        Array<
          Pick<User, 'displayName' | 'businessCategory'> & {
            _id: Types.ObjectId;
          }
        >
      >();
    return {
      data: docs.map((d) => ({
        id: String(d._id),
        displayName: d.displayName,
        businessCategory: d.businessCategory ?? null,
      })),
    };
  }

  async createProduct(dto: CreateProductDto): Promise<AdminProductItem> {
    const seller = await this.requireVerifiedSeller(dto.sellerId);
    const originalPrice = dto.originalPrice ?? null;
    this.assertPriceRelation(dto.price, originalPrice);
    const tags = dto.tags ?? [];
    const imageKeys = dto.imageKeys ?? [];
    await this.assertImageKeys(imageKeys);

    const created = await this.productModel.create({
      name: dto.name,
      description: dto.description ?? '',
      price: dto.price,
      originalPrice,
      imageKeys,
      category: dto.category,
      tags,
      deliveryText: dto.deliveryText ?? '',
      active: dto.active ?? true,
      soldCount: 0,
      sellerId: dto.sellerId,
      sellerActive: isSellerVisible(seller),
      searchText: buildProductSearchText(dto.name, tags),
    });
    return this.toAdminItem(created.toObject() as LeanProduct, seller);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
  ): Promise<AdminProductItem> {
    if (!isObjectIdString(id)) throw new NotFoundException('Product not found');
    const existing = await this.productModel.findById(id).lean<LeanProduct>();
    if (!existing) throw new NotFoundException('Product not found');

    const $set: Partial<CommerceProduct> = {};
    if (dto.name !== undefined) $set.name = dto.name;
    if (dto.description !== undefined) $set.description = dto.description;
    if (dto.category !== undefined) $set.category = dto.category;
    if (dto.deliveryText !== undefined) $set.deliveryText = dto.deliveryText;
    if (dto.active !== undefined) $set.active = dto.active;
    if (dto.tags !== undefined) $set.tags = dto.tags;
    if (dto.price !== undefined) $set.price = dto.price;
    if (dto.originalPrice !== undefined) $set.originalPrice = dto.originalPrice;

    if (dto.imageKeys !== undefined) {
      await this.assertImageKeys(dto.imageKeys);
      $set.imageKeys = dto.imageKeys;
    }

    let seller: LeanSeller | null = null;
    if (dto.sellerId !== undefined && dto.sellerId !== existing.sellerId) {
      seller = await this.requireVerifiedSeller(dto.sellerId);
      $set.sellerId = dto.sellerId;
      $set.sellerActive = isSellerVisible(seller);
    }

    // PATCH may change only one side — compare against the stored value.
    const nextPrice = dto.price ?? existing.price;
    const nextOriginal =
      dto.originalPrice !== undefined
        ? dto.originalPrice
        : (existing.originalPrice ?? null);
    if (dto.price !== undefined || dto.originalPrice !== undefined) {
      this.assertPriceRelation(nextPrice, nextOriginal);
    }

    if (dto.name !== undefined || dto.tags !== undefined) {
      $set.searchText = buildProductSearchText(
        dto.name ?? existing.name,
        dto.tags ?? existing.tags ?? [],
      );
    }

    const updated = await this.productModel
      .findByIdAndUpdate(
        id,
        { $set },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<LeanProduct>();
    if (!updated) throw new NotFoundException('Product not found');
    if (!seller && updated.sellerId) {
      seller = await this.findSeller(updated.sellerId);
    }
    return this.toAdminItem(updated, seller);
  }

  async deleteProduct(id: string): Promise<boolean> {
    if (!isObjectIdString(id)) return false;
    const res = await this.productModel.findByIdAndDelete(id);
    return !!res;
  }

  // ═══ Stores (admin/legacy) ════════════════════════════════════════════════

  async listStores(dto: { page?: number; limit?: number }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.storeModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.storeModel.countDocuments({}),
    ]);
    return { data, total, page, limit };
  }
  async createStore(payload: Partial<CommerceStore>) {
    return this.storeModel.create(payload);
  }
  async updateStore(id: string, payload: Partial<CommerceStore>) {
    return this.storeModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
  }
  async deleteStore(id: string) {
    return this.storeModel.findByIdAndDelete(id);
  }

  // ═══ Services ═════════════════════════════════════════════════════════════

  async listServices(dto: {
    page?: number;
    limit?: number;
    category?: string;
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.category) filter['category'] = dto.category;
    const [data, total] = await Promise.all([
      this.serviceModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.serviceModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }
  async createService(payload: Partial<CommerceServiceDoc>) {
    return this.serviceModel.create(payload);
  }
  async updateService(id: string, payload: Partial<CommerceServiceDoc>) {
    return this.serviceModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
  }
  async deleteService(id: string) {
    return this.serviceModel.findByIdAndDelete(id);
  }

  // ═══ Helpers ══════════════════════════════════════════════════════════════

  private async presign(key: string): Promise<string | null> {
    try {
      return await this.mediaService.generatePresignedGetUrl(key);
    } catch {
      // One unsignable key must not fail a whole page — card falls back to
      // its placeholder, and mobile refetches detail on image error.
      return null;
    }
  }

  private async toCard(
    doc: LeanProduct,
    seller: LeanSeller,
  ): Promise<ProductCard> {
    const imageKey = doc.imageKeys?.[0] ?? null;
    return {
      id: String(doc._id),
      name: doc.name,
      price: doc.price,
      originalPrice: doc.originalPrice ?? null,
      imageUrl: imageKey ? await this.presign(imageKey) : null,
      imageKey,
      category: doc.category,
      tags: doc.tags ?? [],
      deliveryText: doc.deliveryText ?? '',
      soldCount: doc.soldCount ?? 0,
      seller: {
        id: String(seller._id),
        displayName: seller.displayName,
        verified: true,
        province: seller.province ?? null,
      },
    };
  }

  private async toAdminItem(
    doc: LeanProduct,
    seller: LeanSeller | null,
  ): Promise<AdminProductItem> {
    let visibility: AdminProductVisibility;
    if (!doc.sellerId || !seller) visibility = 'missing_seller';
    else if (!isSellerVisible(seller)) visibility = 'seller_hidden';
    else if (!doc.active) visibility = 'inactive';
    else visibility = 'visible';

    const imageKeys = doc.imageKeys ?? [];
    return {
      id: String(doc._id),
      name: doc.name,
      description: doc.description ?? '',
      price: doc.price,
      originalPrice: doc.originalPrice ?? null,
      imageKeys,
      imageUrls: await Promise.all(imageKeys.map((k) => this.presign(k))),
      category: doc.category,
      tags: doc.tags ?? [],
      deliveryText: doc.deliveryText ?? '',
      active: doc.active !== false,
      soldCount: doc.soldCount ?? 0,
      sellerId: doc.sellerId ?? null,
      sellerActive: doc.sellerActive === true,
      seller: seller
        ? { id: String(seller._id), displayName: seller.displayName }
        : null,
      visibility,
      createdAt: doc.createdAt ?? null,
      updatedAt: doc.updatedAt ?? null,
    };
  }

  /** One batched `$in` lookup; returns a map keyed by string id. */
  private async loadSellers(
    ids: (string | null | undefined)[],
  ): Promise<Map<string, LeanSeller>> {
    const unique = Array.from(
      new Set(ids.filter((id): id is string => isObjectIdString(id))),
    );
    if (unique.length === 0) return new Map();
    const docs = await this.userModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select(SELLER_FIELDS)
      .lean<LeanSeller[]>();
    return new Map(docs.map((d) => [String(d._id), d]));
  }

  private async findSeller(
    id: string | null | undefined,
  ): Promise<LeanSeller | null> {
    if (!isObjectIdString(id)) return null;
    return this.userModel.findById(id).select(SELLER_FIELDS).lean<LeanSeller>();
  }

  private async requireVerifiedSeller(id: string): Promise<LeanSeller> {
    const seller = await this.findSeller(id);
    if (
      !seller ||
      seller.accountType !== 'business' ||
      seller.verificationStatus !== 'verified'
    ) {
      throw new BadRequestException(
        'sellerId must reference a verified business account',
      );
    }
    if (seller.isBanned === true) {
      throw new BadRequestException('sellerId references a banned business');
    }
    // Tạm ngưng bán: không tạo/sửa sản phẩm cho tới khi admin kích hoạt lại.
    if (seller.suspended === true) {
      throw new BadRequestException('sellerId references a suspended business');
    }
    return seller;
  }

  private assertPriceRelation(price: number, originalPrice: number | null) {
    if (originalPrice !== null && originalPrice <= price) {
      throw new BadRequestException('originalPrice must be greater than price');
    }
  }

  /**
   * Product images must be keys of real, live image uploads that are not
   * attached to a conversation — otherwise an admin could publish a private
   * chat attachment (or a dangling key) through the public catalog.
   */
  private async assertImageKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('imageKeys must be unique');
    }
    const found = await this.mediaModel
      .find({ mediaKey: { $in: keys } })
      .select('mediaKey mimeType deleted conversationId')
      .lean<
        Array<
          Pick<Media, 'mediaKey' | 'mimeType' | 'deleted' | 'conversationId'>
        >
      >();
    const ok = new Set(
      found
        .filter(
          (m) =>
            !m.deleted &&
            !m.conversationId &&
            PRODUCT_IMAGE_MIME.has(m.mimeType),
        )
        .map((m) => m.mediaKey),
    );
    const bad = keys.filter((k) => !ok.has(k));
    if (bad.length > 0) {
      throw new BadRequestException(
        `Invalid image key(s): ${bad.join(', ')} — upload JPEG/PNG/WebP via /media/upload first`,
      );
    }
  }

  /** Fire-and-forget resync for sellers whose `sellerActive` flag drifted. */
  private healDrift(sellerIds: string[]): void {
    const ids = Array.from(new Set(sellerIds.filter(Boolean)));
    if (ids.length === 0) return;
    this.sellerVisibility.syncSellers(ids).catch((err: unknown) => {
      this.logger.warn(
        `sellerActive drift heal failed: ${(err as Error).message}`,
      );
    });
  }
}
