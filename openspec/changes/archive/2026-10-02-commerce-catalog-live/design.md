## Context

- Mobile Shopping (`ChatApp/src/screens/shopping/ShoppingHomeScreen|ShoppingProductDetailScreen|ShoppingStorefrontScreen|ShoppingCartScreen.tsx`) imports `shoppingProducts` from `shoppingMockData.ts` (48 products, 6 mock sellers `seller-fresh|bep|tech|nhaxinh|beauty|choviet`, 6 bundled JPGs in `ChatApp/src/assets/mock-shopping/`, prices as strings like `"89.000đ"`). Client-side filter/sort lives in `filterAndSortProducts` (Home) and in Storefront; `parsePriceVnd` / `toNum` are duplicated.
- Backend `chat-backend/src/commerce/`: `CommerceProduct { name, price, imageKey, category, storeId }`, public `GET /commerce/products|services|stores` (`@Public`, `Cache-Control: public, max-age=60`, controllers pass `dto as any`), admin CRUD in `admin-commerce-controller.ts` with `AdminAuditService.log`. `CommerceStore` is not linked to `User`.
- Business accounts: `User.accountType === 'business'`, `verificationStatus pending|verified|rejected`, `isBanned`, `ownerUserId`, `displayName`, `logoKey`, `province`, `businessCategory`, `tagline`, `description`. Status is changed in `AdminService.approveBusiness / bulkApproveBusiness / rejectBusiness / bulkRejectBusiness / banUser / unbanUser` (`chat-backend/src/admin/admin.service.ts`). Seeded businesses (`scripts/seed-connect-businesses.ts`) are B2B (logistics, finance, manufacturing…) — not retail.
- Media: `MediaService.generatePresignedGetUrl(key)` (1 h expiry) and `POST /media/upload` → presigned PUT with magic-byte MIME validation; `Media` documents track keys.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` in `main.ts`.
- Mobile infra: `apiClient` (axios, auth interceptor) in `ChatApp/src/services/api/apiService.ts`; MMKV (`react-native-mmkv`) instances per concern; `useSyncExternalStore` external-store pattern (`services/translation/translationStore.ts`); `useNetworkStatus` hook; logout teardown in `AuthContext.tsx` (~line 560) and `switchAccount` (~line 338).

## Goals / Non-Goals

**Goals:**
- Real, seller-owned catalog served from MongoDB with server-side search/filter/sort/pagination.
- Products tied to verified business users so chat (and later orders) reach a real account.
- Persisted, shared, shop-grouped cart with revalidation.
- Admin can fully manage products (incl. images) from admin-web.
- Seed that reproduces today's catalog against real data.

**Non-Goals:**
- Orders, checkout form, order status, cron, order card, push (→ `commerce-orders`).
- Reviews/ratings, stock, carrier APIs, payments, supplier self-service posting.
- Services tab / `CommerceServiceDoc` behavior (untouched apart from DTO typing if trivially required).
- Touching `MainNavigator.tsx`, `ChatHomeHeaderInsetContext.tsx`, `ChatHomeScreen.tsx`.

## Decisions

### D1. Seller = business `User`, visibility via denormalized `sellerActive`
`CommerceProduct.sellerId: string` (User `_id`), plus `sellerActive: boolean`. Public queries filter `{ active: true, sellerActive: true }` — a single indexed query, no `$lookup`/`populate` on the hot path (CLAUDE.md: prefer denormalization). `sellerActive` is maintained by a `CommerceService.syncSellerVisibility(sellerIds[])` method that recomputes `verified && !isBanned` and `updateMany`s the seller's products. It is called from every AdminService method that changes verification or ban state (approve, bulkApprove, reject, bulkReject, ban, unban). Detail/storefront endpoints additionally re-check the seller document (they load it anyway for the seller block) so a drift can never expose a hidden seller's product page.
- Alternative: `$lookup` users on each listing → rejected (hot path join, cannot use compound index for sort).
- Alternative: keep `CommerceStore` and add `ownerUserId` → rejected: two sources of truth for a seller.
- Module wiring: `CommerceModule` imports `AdminModule`, so AdminModule must NOT import CommerceModule (cycle). `@nestjs/event-emitter` is not installed and no dependency is added. Therefore: create `chat-backend/src/commerce/seller-visibility/seller-visibility.service.ts` + `seller-visibility.module.ts` (`CommerceSellerVisibilityModule`), which registers only the `User` and `CommerceProduct` Mongoose models and exports `SellerVisibilityService.syncSellers(ids: string[])`. Both `AdminModule` and `CommerceModule` import this module. AdminService calls `syncSellers` after each successful approve/bulkApprove/reject/bulkReject/ban/unban (ban/unban only when the target is a business; sync is a no-op for sellers without products).

### D2. Schema and indexes
Fields per spec. Indexes (`schema.index`, no `index: true` duplication):
- `{ active: 1, sellerActive: 1, createdAt: -1, _id: -1 }` — default listing (newest)
- `{ active: 1, sellerActive: 1, soldCount: -1, createdAt: -1, _id: -1 }` — bestseller
- `{ active: 1, sellerActive: 1, price: 1, _id: 1 }` — priceLow
- `{ active: 1, sellerActive: 1, category: 1, createdAt: -1 }` — category filter
- `{ sellerId: 1, active: 1, createdAt: -1 }` — storefront + admin + visibility sync
- `{ tags: 1 }` — tag filter (multikey)
Existing `{ category: 1 }`, `{ storeId: 1 }`, `{ createdAt: -1 }` are dropped from the schema definition (storeId field removed from product; legacy field left untouched in DB documents).

### D3. Search via normalized `searchText` + escaped regex, not `$text`
Vietnamese diacritics make Mongo `$text` (no Vietnamese stemmer, diacritic-sensitive for many chars like đ) unreliable. `searchText = normalize(name + ' ' + tags.join(' '))` where `normalize` = lowercase → NFD → strip combining marks → `đ→d`. Query `q` is normalized the same way, regex-escaped, and matched as `searchText: { $regex: escaped }`. Catalog size is small (hundreds) so an unanchored regex over the active/visible subset is acceptable; this is documented as the scaling limit (→ Atlas Search/ES when catalog > ~50k). The normalize helper lives in `chat-backend/src/commerce/commerce-text.util.ts` with unit tests.

### D4. Pagination: page/limit with `hasMore`
Matches existing `PaginationDto` and admin-web; mobile infinite scroll requests `page+1` while `hasMore`. Deterministic tie-breakers (spec) prevent duplicates across pages for a static dataset. Cursor pagination rejected for now: three sort modes would need three cursor encodings for little benefit at this catalog size.

### D5. Public endpoints, DTOs, caching
New `ListProductsQueryDto` (`q`, `category` `@IsIn(CATEGORIES)`, `tag`, `sellerId` `@IsMongoId`, `sort @IsIn`, `page`, `limit @Max(50)`), `ValidateProductsDto` (`ids: string[]`, `@ArrayMinSize(1) @ArrayMaxSize(100)`, each `@IsString`). Controllers stop using `dto as any`. `Cache-Control: public, max-age=60` kept on listing/detail/seller; validate endpoint is `Cache-Control: no-store` (it exists to get fresh prices). Throttle consistent with existing `short/long` named throttlers. Category list is a shared constant `COMMERCE_CATEGORIES = ['grocery','food','electronics','home','beauty']` exported from `commerce/commerce.constants.ts`.

### D6. Image URLs: presigned GET at response time, cache keyed by imageKey on mobile
Responses include both `imageKey(s)` and presigned `imageUrl(s)` (1 h expiry, via `MediaService.generatePresignedGetUrl`). Because listing responses are `max-age=60`, a URL is always fresh for > 59 min after receipt. Mobile `<Image>` uses `cacheKey`-style stability by keying components on `imageKey`, and on image load error re-fetches the product detail once to obtain a fresh URL. Presigning happens with the public MinIO client (already used) and is a local HMAC operation (no network), so N presigns per page is cheap. `CommerceModule` imports `MediaModule` (verify no circular dependency; MediaModule does not import Commerce).
- Alternative: public bucket/prefix → rejected (changes MinIO policy, infra change out of scope).
- Alternative: stream through `/media/download` → rejected: requires a JWT in the URL and `Media.conversationId` access rules.

### D7. Admin endpoints
`CreateProductDto` / `UpdateProductDto` rewritten with the full field set and validators (`@IsInt @Min(0)` price, `originalPrice` validated in service vs price — including PATCH where only one side changes, compared against stored value). `sellerId` checked in service (`User.findOne({ _id, accountType: 'business', verificationStatus: 'verified' })`). `sellerActive` computed at write time. New `GET /admin/commerce/sellers` (verified, not banned; `_id displayName businessCategory`), and `GET /admin/commerce/products` returns seller displayName (one batched `User.find({_id: {$in}})`, not populate). Audit logging unchanged in pattern.

### D8. Seed script: dedicated retail businesses, not the 29 B2B seeds
The 29 Connect businesses are B2B categories (logistics, finance…) — assigning grocery/beauty products to a logistics company would produce nonsense storefronts. The script creates 6 retail business users mirroring the mock sellers (name, province, category → `businessCategory`), `verificationStatus: 'verified'`, `ownerUserId` = the user found by required `--owner-email` (so the tester can switch into them to act as the seller in `commerce-orders`), placeholder `email` `commerce-seed-biz-<slug>@koola.invalid` (required by the non-sparse unique `email_1` index — same pattern and reason as `seed-connect-businesses.ts`), no password. Marker: `seedTag: 'commerce-catalog-seed'` field on products and media docs; businesses identified by the email prefix. Images: each of the 6 JPGs uploaded once with `putObject` under `commerce-seed/<file>`, `Media` doc with `uploaderId` = owner, `conversationId: null`. Products upserted by a deterministic key `seedKey = mock id`. Respect `MAX_BUSINESS_ACCOUNTS_PER_OWNER` (10): 6 seed businesses + existing ones must fit; the script refuses with a clear message if the owner would exceed the limit. The old `seed-commerce-from-mocks.ts` product section is removed (services seeding kept).
- This deviates from the request's "29 verified businesses" wording; rationale above. Locked decision "seller = verified business User" is preserved.

### D9. Mobile API layer
Add a `commerceApi` object inside `ChatApp/src/services/api/apiService.ts` following the `accountsApi` pattern (uses the module-private `apiClient`); `ChatApp/src/api/commerceApi.ts` becomes a thin re-export of it (or is deleted if nothing else imports it — `fetchServices` currently has no callers either; surface deletion to the user rather than deleting). No raw `fetch`. Typed `ProductCard`, `ProductDetail`, `SellerProfile`, `ValidateResult`. Shared formatter `ChatApp/src/utils/formatVnd.ts` (`formatVnd(n) → "89.000đ"`), replacing `parsePriceVnd`, `toNum`, local `formatVnd`.

### D10. Mobile list state: per-screen hook, no global cache library
`useCommerceProductList(params)` hook in `ChatApp/src/screens/shopping/hooks/` handling: params → reset to page 1; `loadMore` guarded by in-flight ref + `hasMore`; dedupe by id when appending; request cancellation (AbortController / stale-response guard via request sequence number) so a slow older response cannot overwrite a newer filter's results; states `initialLoading | ready | empty | error | loadingMore | loadMoreError`. Search input debounced 300 ms. First-mount cost pattern kept (InteractionManager + KoolaSkeleton). No react-query (not a dependency; CLAUDE.md forbids adding deps without need).

### D11. Cart store
`ChatApp/src/services/shopping/cartStore.ts`: external store (`useSyncExternalStore`, same pattern as translationStore) backed by MMKV instance `id: 'shopping-cart'`, key `cart:<activeAccountId>`. API: `add(snapshot, qty=1)`, `setQty`, `remove`, `applyValidation(results)`, `clearAccount`, `getLines`, `getTotalQuantity`, `subscribe`. Active account id is set via `cartStore.setAccount(id | null)`, called from AuthContext where the active account is resolved/switched (lines ~304 and ~391) and with `null` + MMKV `clearAll()` for the cart instance during logout teardown (~560). This is an additive change to `AuthContext.tsx` (high-risk file: add calls only, no restructuring). Snapshot price updates from validation are persisted. Hook `useCart()` returns lines + grouped-by-seller view + total quantity.
- MMKV chosen over AsyncStorage: synchronous reads → badge renders correctly on first frame; already used for similar caches.

### D12. Cart screen + navigation
`ShoppingCart` route params become `undefined` (cart content comes from the store, not params); PDP "Mua ngay" = `cartStore.add` then navigate. Header cart icon (product header + Home header in `ShoppingTabStack.tsx` / `ShoppingHeaderContext.tsx`) shows badge from `useCart().totalQuantity`. Cart screen: groups by seller, qty steppers, remove, revalidation on focus + on `useNetworkStatus` online transition, "Phí ship: shop sẽ báo", interim "Nhắn tin với shop" per group (D13), no SHIPPING_FEE / MOCK / PAYMENT_METHODS (payment selection moves to `commerce-orders` checkout).

### D13. Interim cart action and featureAvailability
Per spec: per-group "Nhắn tin với shop" → `startDirectChat(sellerId)` → navigate to chat; no order, no cart clear, no success toast. `featureAvailability.shopping` stays `preview`. The `mobile-feature-availability` rule "preview add-to-cart SHALL not increment a durable-looking counter" applies to *sample* data; after this change the cart operates on real catalog data and is genuine local user state, so the badge is truthful. The 404 "Gian hàng mẫu chưa có tài khoản thật" toasts are removed (sellers are real now); chat failures show a generic retry toast.

## Risks / Trade-offs

- [Regex search does not scale to large catalogs] → documented limit; index-assisted prefilter on `active/sellerActive/category`; revisit with Atlas Search later.
- [`sellerActive` drift if a new code path changes verification without calling sync] → detail/storefront re-check seller document; unit test asserts each AdminService status mutator triggers sync; spec lists all mutators.
- [Presigned URLs expire while the app holds an old list > 1 h] → image `onError` triggers one detail refetch for a fresh URL; pull-to-refresh refetches lists.
- [Seed deviates from "29 businesses"] → justified in D8; the 29 Connect seeds remain untouched.
- [AuthContext is high-risk] → additive calls only, covered by a jest test for cart account scoping and logout clear.
- [Old seller-less products disappear publicly] → intended; admin list still shows them flagged "Không hiển thị — thiếu người bán".

## Migration Plan

1. Deploy backend (schema additions are backward-compatible; legacy docs lack `sellerId` → `sellerActive` undefined → hidden).
2. Run `npx ts-node scripts/seed-commerce-catalog.ts --owner-email <tester>`.
3. Ship mobile + admin-web.
Rollback: revert code; `--wipe` removes seeded data; legacy fields untouched.

## Open Questions

None blocking.
