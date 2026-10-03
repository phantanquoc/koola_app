## 1. Backend data model

- [x] 1.1 Add `commerce/commerce.constants.ts` (`COMMERCE_CATEGORIES`, sort keys) and `commerce/commerce-text.util.ts` (`normalizeSearchText`: lowercase, NFD strip marks, `đ→d`; `escapeRegex`) with unit tests (Vietnamese diacritics, `Đ`, regex metacharacters)
- [x] 1.2 Rewrite `schemas/commerce-product.schema.ts`: fields per spec (`name`, `description`, `price` int, `originalPrice`, `imageKeys`, `category`, `tags`, `deliveryText`, `active`, `soldCount`, `sellerId`, `sellerActive`, `searchText`, `seedTag`/`seedKey` optional), remove `storeId`/`imageKey` from the schema, define the D2 indexes via `schema.index()` only ← (verify: indexes match design D2 exactly, no `index: true` duplicates)

## 2. Seller visibility

- [x] 2.1 Create `commerce/seller-visibility/seller-visibility.service.ts` + `seller-visibility.module.ts` (User + CommerceProduct models only) exporting `syncSellers(ids)` that sets `sellerActive = (accountType business && verified && !isBanned)` on all products of those sellers
- [x] 2.2 Import the module into `AdminModule` and call `syncSellers` after approveBusiness, bulkApproveBusiness, rejectBusiness, bulkRejectBusiness, banUser, unbanUser (business targets) in `admin/admin.service.ts`; extend `admin.service.spec.ts` to assert each mutator triggers sync ← (verify: every verification/ban mutator in admin.service.ts calls sync; no circular module import)

## 3. Public catalog API

- [x] 3.1 DTOs in `dto/commerce.dto.ts`: `ListProductsQueryDto`, `ValidateProductsDto`, full `CreateProductDto`/`UpdateProductDto` (no `soldCount`/`sellerActive`/`searchText`)
- [x] 3.2 `CommerceModule` imports `MediaModule` + `CommerceSellerVisibilityModule`; `CommerceService.listPublicProducts` (filters, 3 sorts with tie-breakers, page/limit/total/hasMore, card mapping with presigned first image URL and batched seller lookup)
- [x] 3.3 `getPublicProduct(id)` (404 for malformed/inactive/hidden, re-check seller doc, presigned `imageUrls`, seller block with `logoUrl`)
- [x] 3.4 `getSellerStorefront(id)` (404 for non-business/unverified/banned; productCount) and `validateProducts(ids)` (ordered results, malformed → unavailable)
- [x] 3.5 `commerce.controller.ts`: `GET /commerce/products`, `GET /commerce/products/:id`, `GET /commerce/sellers/:id`, `POST /commerce/products/validate` (`no-store`), all `@Public()` + throttled, no `dto as any`; services/stores endpoints keep working
- [x] 3.6 `commerce.service.spec.ts`: hidden sellers excluded, inactive excluded, diacritic search, category+tag combine, each sort order incl. ties, pagination `hasMore`, malformed id 404, validate ordering/availability ← (verify: all commerce-catalog listing/detail/storefront/validate scenarios covered by tests and passing)

## 4. Admin API

- [x] 4.1 Admin create/update validate seller is verified business (400 otherwise), enforce `originalPrice > price` on create and PATCH (compare against stored values), compute `searchText` + `sellerActive`, keep audit logging
- [x] 4.2 `GET /admin/commerce/products` returns seller displayName + visibility (batched lookup); new `GET /admin/commerce/sellers`; tests for 400 on personal/unverified seller and 403 for non-admin ← (verify: admin scenarios in spec; soldCount in body rejected 400)

## 5. Seed

- [x] 5.1 Create `chat-backend/scripts/seed-commerce-catalog.ts` per design D8 (required `--owner-email`, 6 retail businesses, MinIO upload of 6 images + Media docs, upsert products by `seedKey`, owner business limit check, `--wipe` scoped by marker); parse mock data from `ChatApp/src/screens/shopping/shoppingMockData.ts` without importing RN (`require()` image paths mapped to filenames)
- [x] 5.2 Remove the product section from `scripts/seed-commerce-from-mocks.ts` (keep services) ← (verify: script idempotent on 2 runs, wipe scoped, refuses without owner — run against local Mongo/MinIO if available, else report)

## 6. admin-web

- [x] 6.1 API helpers for products/sellers/media upload in `admin-web/src` following `apiClient.ts`
- [x] 6.2 Rewrite `pages/CommerceProductsPage.tsx`: list (name, seller, category, price, active, visibility) + create/edit form with all fields, seller picker, image upload (≤ 8, JPEG/PNG/WebP via presigned PUT), client validation mirroring server, server error display ← (verify: admin-web tsc passes; form covers every writable field)

## 7. Mobile API + formatting

- [x] 7.1 Add typed `commerceApi` to `ChatApp/src/services/api/apiService.ts` (list, detail, seller, validate); make `ChatApp/src/api/commerceApi.ts` re-export or report it for deletion
- [x] 7.2 Add `ChatApp/src/utils/formatVnd.ts` (+ test); remove `parsePriceVnd`, `toNum`, local `formatVnd` from shopping screens

## 8. Mobile cart store

- [x] 8.1 `ChatApp/src/services/shopping/cartStore.ts` (MMKV `shopping-cart`, per-account key, external store, qty cap 99, applyValidation) + `useCart()` hook (lines, groups by seller, totalQuantity) with jest tests (persist/reload, per-account isolation, cap, validation price update/unavailable)
- [x] 8.2 Additive wiring in `ChatApp/src/contexts/AuthContext.tsx`: `cartStore.setAccount` on active-account resolve and switch; clear cart storage on logout ← (verify: AuthContext change is additive only; logout clears cart; switching account swaps cart)

## 9. Mobile screens

- [x] 9.1 `useCommerceProductList` hook (reset on params, guarded loadMore, dedupe, stale-response guard, states) + tests
- [x] 9.2 `ShoppingHomeScreen`: server-driven search (300 ms debounce)/category/tag/sort chips, infinite scroll, skeleton/empty/error+retry, `[+ giỏ]` on card with toast, soldCount shown, rating removed, real seller chat; drop `filterAndSortProducts` and mock product import
- [x] 9.3 `ShoppingProductDetailScreen`: fetch detail by id (skeleton/404/error), image gallery from `imageUrls` with one refetch on image error, `[Thêm vào giỏ]` + `[Mua ngay]`, real seller block + chat, Vietnamese strings with diacritics fixed
- [x] 9.4 `ShoppingStorefrontScreen`: seller profile from `GET /commerce/sellers/:id`, products via list hook with `sellerId`, server search/sort, remove hardcoded `sellerDescriptions`
- [x] 9.5 Header cart badge (`ShoppingTabStack.tsx` / `ShoppingHeaderContext.tsx`) from `useCart().totalQuantity` (hidden at 0, 99+); `ShoppingCart` route params → `undefined` in `navigation/types.ts`
- [x] 9.6 `ShoppingCartScreen`: lines from cart store grouped by seller with subtotal, steppers/remove, revalidation on focus + reconnect, greyed unavailable + price-change notice + offline notice, "Phí ship: shop sẽ báo", interim "Nhắn tin với shop" per group; remove SHIPPING_FEE, MOCK pill, PAYMENT_METHODS ← (verify: no screen imports `shoppingProducts`; cart scenarios in spec; featureAvailability.shopping still 'preview')

## 10. Checks

- [x] 10.1 chat-backend: `npm run build`, `npx jest`, `npm run lint` (report pre-existing unrelated failures, do not fix out-of-scope files)
- [x] 10.2 ChatApp: `npx tsc --noEmit`, `npx jest`, `npx eslint` on changed files; admin-web: `npx tsc --noEmit` ← (verify: all gates green or only pre-existing failures documented)
- [ ] 10.3 Manual (user): run seed with a tester email, browse Home/PDP/Storefront on device, add to cart across 2 shops, restart app, deactivate a product in admin-web and reopen cart
