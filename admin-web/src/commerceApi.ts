/**
 * Typed admin commerce API helpers (openspec change `commerce-catalog-live`).
 *
 * All backend calls go through the shared `apiClient` (Bearer token + 401/403
 * redirect). The presigned PUT to MinIO deliberately does NOT: it is a
 * third-party URL signed for a specific request, and adding an Authorization
 * header would break the S3 signature.
 */
import axios from 'axios';
import apiClient from './apiClient';

// ─── Shared rules (mirror chat-backend/src/commerce/commerce.constants.ts) ───

export const COMMERCE_CATEGORIES = [
  { id: 'grocery', label: 'Tạp hóa' },
  { id: 'food', label: 'Đồ ăn' },
  { id: 'electronics', label: 'Điện tử' },
  { id: 'home', label: 'Nhà cửa' },
  { id: 'beauty', label: 'Làm đẹp' },
] as const;
export type CommerceCategory = (typeof COMMERCE_CATEGORIES)[number]['id'];

export const PRODUCT_LIMITS = {
  nameMax: 200,
  descriptionMax: 2000,
  deliveryTextMax: 100,
  maxImages: 8,
  maxTags: 10,
  tagMax: 40,
} as const;

export const PRODUCT_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Same per-image cap the backend applies to images (MAX_IMAGE_BYTES). */
export const PRODUCT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProductVisibility = 'visible' | 'inactive' | 'seller_hidden' | 'missing_seller';

export interface AdminProduct {
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
  visibility: ProductVisibility;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminSellerOption {
  id: string;
  displayName: string;
  businessCategory: string | null;
}

/** Every writable product field (soldCount / sellerActive / searchText are server-owned). */
export interface ProductWritePayload {
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  imageKeys: string[];
  category: CommerceCategory;
  tags: string[];
  deliveryText: string;
  active: boolean;
  sellerId: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export const commerceAdminApi = {
  async listProducts(page: number, limit = 20): Promise<Paginated<AdminProduct>> {
    const { data } = await apiClient.get<Paginated<AdminProduct>>('/admin/commerce/products', {
      params: { page, limit },
    });
    return data;
  },

  async listSellers(): Promise<AdminSellerOption[]> {
    const { data } = await apiClient.get<{ data: AdminSellerOption[] }>('/admin/commerce/sellers');
    return data.data;
  },

  async createProduct(payload: ProductWritePayload): Promise<AdminProduct> {
    const { data } = await apiClient.post<AdminProduct>('/admin/commerce/products', payload);
    return data;
  },

  async updateProduct(id: string, payload: Partial<ProductWritePayload>): Promise<AdminProduct> {
    const { data } = await apiClient.patch<AdminProduct>(`/admin/commerce/products/${id}`, payload);
    return data;
  },

  async deleteProduct(id: string): Promise<void> {
    await apiClient.delete(`/admin/commerce/products/${id}`);
  },
};

export const mediaAdminApi = {
  /**
   * Upload one image: request a presigned PUT (`POST /media/upload`), PUT the
   * bytes straight to MinIO, return the media key. Throws on any failure so
   * the caller never saves a key whose upload did not complete.
   */
  async uploadImage(file: File): Promise<string> {
    const { data } = await apiClient.post<{ uploadUrl: string; mediaKey: string }>(
      '/media/upload',
      { filename: file.name, mimeType: file.type, size: file.size },
    );
    const res = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`Tải ảnh lên thất bại (HTTP ${res.status})`);
    }
    return data.mediaKey;
  },
};

// ─── Orders (commerce-orders D9) ─────────────────────────────────────────────

export const ORDER_STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUS_OPTIONS)[number];

export interface AdminOrderSummary {
  id: string;
  orderCode: string;
  buyerId: string;
  sellerId: string;
  buyerName: string | null;
  sellerName: string | null;
  items: Array<{ productId: string; name: string; price: number; imageKey: string | null; qty: number }>;
  itemCount: number;
  subtotal: number;
  shippingFee: number | null;
  total: number;
  payment: string;
  status: OrderStatus;
  conversationId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminOrderDetailResponse {
  order: AdminOrderSummary & {
    buyerInfo: { name: string; phone: string; address: string; note: string | null };
    shipping: { fee: number | null; carrier: string | null; trackingCode: string | null; expectedDeliveryDate: string | null };
    statusHistory: Array<{ status: string; at: string; by: string; note: string | null }>;
  };
  seller: { id: string; displayName: string } | null;
  buyer: { id: string; displayName: string } | null;
  itemImageUrls: (string | null)[];
}

export interface AdminListOrdersParams {
  status?: string;
  sellerId?: string;
  buyerId?: string;
  page?: number;
  limit?: number;
}

export const commerceOrdersAdminApi = {
  async listOrders(params: AdminListOrdersParams): Promise<Paginated<AdminOrderSummary>> {
    const { data } = await apiClient.get<Paginated<AdminOrderSummary>>('/admin/commerce/orders', { params });
    return data;
  },
  async getOrder(id: string): Promise<AdminOrderDetailResponse> {
    const { data } = await apiClient.get<AdminOrderDetailResponse>(`/admin/commerce/orders/${id}`);
    return data;
  },
};

/** Extract the human-readable message from a NestJS error response. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: unknown } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join('; ');
    if (typeof msg === 'string' && msg) return msg;
    if (!err.response) return 'Không kết nối được máy chủ';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ─── Client-side validation (mirrors the server DTO + service rules) ─────────

export type ProductFormErrors = Partial<Record<keyof ProductWritePayload | 'form', string>>;

export function validateProductPayload(p: ProductWritePayload): ProductFormErrors {
  const e: ProductFormErrors = {};
  const name = p.name.trim();
  if (!name) e.name = 'Tên là bắt buộc';
  else if (name.length > PRODUCT_LIMITS.nameMax) e.name = `Tối đa ${PRODUCT_LIMITS.nameMax} ký tự`;

  if (p.description.length > PRODUCT_LIMITS.descriptionMax) {
    e.description = `Tối đa ${PRODUCT_LIMITS.descriptionMax} ký tự`;
  }
  if (!Number.isInteger(p.price) || p.price < 0) e.price = 'Giá phải là số nguyên VND ≥ 0';
  if (p.originalPrice !== null) {
    if (!Number.isInteger(p.originalPrice) || p.originalPrice < 1) {
      e.originalPrice = 'Giá gốc phải là số nguyên VND';
    } else if (p.originalPrice <= p.price) {
      e.originalPrice = 'Giá gốc phải lớn hơn giá bán';
    }
  }
  if (!COMMERCE_CATEGORIES.some((c) => c.id === p.category)) e.category = 'Chọn phân loại';
  if (p.tags.length > PRODUCT_LIMITS.maxTags) e.tags = `Tối đa ${PRODUCT_LIMITS.maxTags} tag`;
  else if (p.tags.some((t) => t.length > PRODUCT_LIMITS.tagMax)) {
    e.tags = `Mỗi tag tối đa ${PRODUCT_LIMITS.tagMax} ký tự`;
  }
  if (p.deliveryText.length > PRODUCT_LIMITS.deliveryTextMax) {
    e.deliveryText = `Tối đa ${PRODUCT_LIMITS.deliveryTextMax} ký tự`;
  }
  if (p.imageKeys.length > PRODUCT_LIMITS.maxImages) {
    e.imageKeys = `Tối đa ${PRODUCT_LIMITS.maxImages} ảnh`;
  }
  if (!/^[a-f0-9]{24}$/i.test(p.sellerId)) e.sellerId = 'Chọn người bán';
  return e;
}

/** "Organic, Chính hãng ,, " → ["Organic", "Chính hãng"] (trimmed, deduped). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const t = raw.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
