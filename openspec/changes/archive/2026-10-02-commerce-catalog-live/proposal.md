## Why

The Shopping tab is 100% driven by the static `ChatApp/src/screens/shopping/shoppingMockData.ts` (108 products, fake seller ids like `seller-fresh`, prices as strings). The backend `commerce` module already exposes catalog endpoints but no mobile code calls them, products are not tied to any real account, and every "Nhắn tin" tap fails because `startDirectChat("seller-fresh")` targets a non-existent user. The cart is per-screen `useState` that forgets everything on navigation. This change makes the catalog, sellers and cart real — the foundation the follow-up change `commerce-orders` needs to place orders against real sellers.

## What Changes

- Products belong to a **verified business account**: `CommerceProduct.sellerId → User._id` (accountType `business`, verificationStatus `verified`). Products of unverified/rejected/missing sellers are never served publicly.
- `CommerceProduct` gains `description`, `originalPrice`, `imageKeys[]`, `tags[]`, `deliveryText`, `active`, `soldCount` (default 0; incremented only by `commerce-orders` on delivery), and a normalized `searchText` field. Indexes for every new query pattern.
- Public catalog API: `GET /commerce/products` (server-side `q`, `category`, `tag`, `sort=newest|bestseller|priceLow`, page/limit), `GET /commerce/products/:id`, `GET /commerce/sellers/:id` (business profile + its products), `POST /commerce/products/validate` (cart revalidation). All query/body input validated by DTOs (no `dto as any`).
- Admin CRUD accepts the full product field set; `sellerId` must reference a verified business. admin-web `CommerceProductsPage` becomes a full product form (seller picker, category, image upload to MinIO, description, tags, price, original price, delivery text, active toggle).
- New seed script `chat-backend/scripts/seed-commerce-catalog.ts` migrates the 108 mock products + bundled images into Mongo/MinIO and assigns them to the seeded verified businesses by category. Idempotent; `--wipe` deletes only its own data.
- Mobile: `commerceApi` rewritten on the authenticated `apiClient`; Home / Product detail / Storefront read from the server with infinite scroll and loading/empty/error states; one shared VND formatter (price is a number end-to-end); rating hidden, `soldCount` shown; "Nhắn tin" opens a real direct chat with the business.
- Mobile cart: a shared, device-persisted store grouped by shop, header cart badge, `[+ giỏ]` on product cards, `[Thêm vào giỏ]` + `[Mua ngay]` on product detail, revalidation on open (removed → greyed "Sản phẩm không còn bán", price change shown old → new). Hardcoded `SHIPPING_FEE` 15000 and the "MOCK" pill are removed.
- **Interim (explicit, replaced by `commerce-orders`)**: the per-shop action in the cart opens the direct chat with that seller; it does not create an order and never claims an order succeeded. `featureAvailability.shopping` stays `preview` until ordering ships.
- **BREAKING (internal)**: the old `scripts/seed-commerce-from-mocks.ts` (3 seller-less products) is superseded; seller-less legacy products are no longer listed publicly.

## Capabilities

### New Capabilities
- `commerce-catalog`: seller-owned public product catalog (search/filter/sort/pagination, product detail, seller storefront, cart revalidation), admin product management with full fields, catalog seed, and the mobile catalog + persisted cart experience.

### Modified Capabilities
- `admin-commerce-catalog`: product schema/fields, seller ownership requirement, seed script and the mobile-graduation scenario change (mobile reads the live catalog while `shopping` remains `preview` until `commerce-orders`).

## Impact

- Backend: `chat-backend/src/commerce/` (schema, DTOs, service, public + admin controllers, module imports `User`/`Media` models and `MediaModule` for presigned URLs), new `chat-backend/scripts/seed-commerce-catalog.ts`.
- admin-web: `admin-web/src/pages/CommerceProductsPage.tsx` (+ small API helpers).
- Mobile: `ChatApp/src/api/commerceApi.ts`, `ChatApp/src/screens/shopping/*`, new cart store under `ChatApp/src/services/shopping/`, `ChatApp/src/navigation/ShoppingTabStack.tsx` + `ShoppingHeaderContext.tsx` (cart badge), `ChatApp/src/navigation/types.ts` (cart route params).
- Not touched: `ChatApp/src/navigation/MainNavigator.tsx`, `ChatApp/src/screens/main/ChatHomeHeaderInsetContext.tsx`, `ChatApp/src/screens/main/ChatHomeScreen.tsx` (unrelated uncommitted work).
- No new dependencies (MMKV, axios, minio client already present).
