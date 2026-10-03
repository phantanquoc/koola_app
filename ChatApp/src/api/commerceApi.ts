/**
 * Thin re-export — the commerce API now lives in `services/api/apiService.ts`
 * (`commerceApi`, built on the authenticated `apiClient`; design D9).
 *
 * The previous raw-`fetch` helpers (`fetchProducts`, `fetchServices`) had no
 * callers and silently swallowed errors, so they were removed. This module is
 * kept only so any out-of-tree import keeps resolving; it has no in-repo
 * importers and is a deletion candidate.
 */
export { commerceApi } from '../services/api/apiService';
export type {
  CommerceCategory,
  CommerceSort,
  ProductCard,
  ProductCardSeller,
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  SellerProfile,
  SellerStorefrontResponse,
  ValidateResult,
} from '../services/api/apiService';
