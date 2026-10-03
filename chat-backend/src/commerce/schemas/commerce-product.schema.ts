import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  COMMERCE_CATEGORIES,
  PRODUCT_DELIVERY_TEXT_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  type CommerceCategory,
} from '../commerce.constants';

export type CommerceProductDocument = CommerceProduct & Document;

/**
 * Seller-owned catalog product (commerce-catalog spec "Product data model").
 *
 * Visibility rule (design D1): a product is public only when
 * `active === true && sellerActive === true`. `sellerActive` is a denormalized
 * copy of "seller is a verified, non-banned business", maintained by
 * SellerVisibilityService — never written by clients.
 *
 * Legacy documents created before this change may still carry `storeId` /
 * `imageKey` in MongoDB; those fields are no longer part of the model and are
 * left untouched in the stored documents. Legacy docs have no `sellerId`, so
 * `sellerActive` is absent → they are never served publicly.
 */
@Schema({ timestamps: true })
export class CommerceProduct {
  @Prop({
    required: true,
    type: String,
    minlength: 1,
    maxlength: PRODUCT_NAME_MAX,
  })
  name: string;

  @Prop({ type: String, default: '', maxlength: PRODUCT_DESCRIPTION_MAX })
  description: string;

  /** Integer VND ≥ 0. */
  @Prop({ required: true, type: Number, min: 0 })
  price: number;

  /** Integer VND > price, or null (validated in CommerceService). */
  @Prop({ type: Number, default: null })
  originalPrice: number | null;

  /** 0–8 MinIO media keys; first one is the card image. */
  @Prop({ type: [String], default: [] })
  imageKeys: string[];

  @Prop({ required: true, type: String, enum: COMMERCE_CATEGORIES })
  category: CommerceCategory;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, default: '', maxlength: PRODUCT_DELIVERY_TEXT_MAX })
  deliveryText: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  /** Incremented only by `commerce-orders` on delivery. Not client-writable. */
  @Prop({ type: Number, default: 0, min: 0 })
  soldCount: number;

  /** Business `User._id` (string form). */
  @Prop({ required: true, type: String })
  sellerId: string;

  /** Denormalized: seller is a verified, non-banned business (design D1). */
  @Prop({ type: Boolean, default: false })
  sellerActive: boolean;

  /** Normalized name + tags for diacritic-insensitive search (design D3). */
  @Prop({ type: String, default: '' })
  searchText: string;

  /** Marker set only by scripts/seed-commerce-catalog.ts (scoped --wipe). */
  @Prop({ type: String })
  seedTag?: string;

  /** Deterministic seed upsert key (mock product id). */
  @Prop({ type: String })
  seedKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CommerceProductSchema =
  SchemaFactory.createForClass(CommerceProduct);

// ─── Indexes (design D2) — schema.index() only, no `index: true` on @Prop ────
// Default listing (newest)
CommerceProductSchema.index({
  active: 1,
  sellerActive: 1,
  createdAt: -1,
  _id: -1,
});
// Bestseller
CommerceProductSchema.index({
  active: 1,
  sellerActive: 1,
  soldCount: -1,
  createdAt: -1,
  _id: -1,
});
// Lowest price
CommerceProductSchema.index({ active: 1, sellerActive: 1, price: 1, _id: 1 });
// Category filter
CommerceProductSchema.index({
  active: 1,
  sellerActive: 1,
  category: 1,
  createdAt: -1,
});
// Storefront + admin + visibility sync
CommerceProductSchema.index({ sellerId: 1, active: 1, createdAt: -1 });
// Tag filter (multikey)
CommerceProductSchema.index({ tags: 1 });
