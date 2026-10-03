## ADDED Requirements

### Requirement: Products are owned by verified business accounts

Every `CommerceProduct` SHALL carry a `sellerId` referencing a `User` with `accountType: 'business'`. A product SHALL be publicly visible only when `active === true` AND its seller exists with `verificationStatus: 'verified'` AND `isBanned !== true`. Seller-less legacy products SHALL NOT be publicly visible.

#### Scenario: Verified seller product is listed
- **WHEN** a product has `active: true` and its seller is a verified, non-banned business
- **THEN** it SHALL appear in `GET /commerce/products` and be returned by `GET /commerce/products/:id`

#### Scenario: Unverified or banned seller is hidden
- **WHEN** a product's seller has `verificationStatus` `pending` or `rejected`, or `isBanned: true`, or the seller user does not exist
- **THEN** the product SHALL NOT appear in `GET /commerce/products`, `GET /commerce/sellers/:id` SHALL return 404, and `GET /commerce/products/:id` SHALL return 404

#### Scenario: Inactive product is hidden
- **WHEN** a product has `active: false`
- **THEN** it SHALL NOT appear in public listings and `GET /commerce/products/:id` SHALL return 404

#### Scenario: Seller visibility follows verification changes
- **WHEN** an admin rejects (single or bulk) or bans a business that owns products
- **THEN** that business's products SHALL stop appearing publicly on the next request without manual product edits
- **AND WHEN** the business is approved again (single or bulk) and is not banned
- **THEN** its active products SHALL be publicly visible again

### Requirement: Product data model

`CommerceProduct` SHALL store: `name` (1–200 chars), `description` (≤ 2000 chars, default ''), `price` (integer VND ≥ 0), `originalPrice` (integer VND > `price`, or null), `imageKeys` (0–8 MinIO media keys), `category` (one of `grocery|food|electronics|home|beauty`), `tags` (0–10 strings, each ≤ 40 chars), `deliveryText` (≤ 100 chars, default ''), `active` (default true), `soldCount` (integer ≥ 0, default 0, NOT writable through any admin or public endpoint), `sellerId`, `sellerActive` (denormalized visibility flag), `searchText` (normalized lowercase, diacritic-stripped concatenation of name + tags, maintained by the service), `createdAt`, `updatedAt`. Indexes SHALL exist for every public query pattern (see design).

#### Scenario: originalPrice must exceed price
- **WHEN** an admin saves a product with `originalPrice <= price`
- **THEN** the system SHALL return 400 and not persist the change

#### Scenario: soldCount cannot be set by clients
- **WHEN** an admin create/update request body includes `soldCount`
- **THEN** the request SHALL be rejected with 400 (whitelist + forbidNonWhitelisted) and `soldCount` SHALL remain unchanged

#### Scenario: searchText stays in sync
- **WHEN** a product's `name` or `tags` are created or updated
- **THEN** `searchText` SHALL be recomputed from the new values

### Requirement: Public product listing with server-side search, filter, sort and pagination

`GET /commerce/products` SHALL be public (`@Public()`), rate-limited, and accept validated query params: `q` (≤ 100 chars), `category`, `tag`, `sellerId`, `sort` (`newest` default | `bestseller` | `priceLow`), `page` (≥ 1, default 1), `limit` (1–50, default 20). Filtering, sorting and pagination SHALL be performed in MongoDB, never in the client. The response SHALL be `{ data: ProductCard[], total, page, limit, hasMore }` where each card includes `id`, `name`, `price`, `originalPrice`, `imageUrl` (presigned GET for the first image or null), `imageKey`, `category`, `tags`, `deliveryText`, `soldCount`, and `seller: { id, displayName, verified: true, province }`.

#### Scenario: Search is diacritic- and case-insensitive
- **WHEN** a client calls `GET /commerce/products?q=rau cu` and a visible product is named "Combo Rau Củ Đà Lạt"
- **THEN** that product SHALL be in the results

#### Scenario: Category and tag filters combine
- **WHEN** a client calls `GET /commerce/products?category=grocery&tag=Organic`
- **THEN** every returned product SHALL have `category === 'grocery'` AND `tags` containing `Organic`

#### Scenario: Bestseller sort
- **WHEN** `sort=bestseller`
- **THEN** results SHALL be ordered by `soldCount` descending, ties broken by `createdAt` descending then `_id` descending

#### Scenario: Lowest price sort
- **WHEN** `sort=priceLow`
- **THEN** results SHALL be ordered by `price` ascending, ties broken by `_id` ascending

#### Scenario: Pagination is stable and reports hasMore
- **WHEN** 45 visible products match and the client requests `page=3&limit=20`
- **THEN** the response SHALL contain 5 products, `total: 45`, `hasMore: false`

#### Scenario: Invalid query is rejected
- **WHEN** a client sends `sort=random` or `limit=500` or `category=weapons`
- **THEN** the system SHALL return 400

### Requirement: Product detail endpoint

`GET /commerce/products/:id` SHALL be public and return the full product: all card fields plus `description`, `imageUrls[]` (presigned GET, same order as `imageKeys`), `imageKeys[]`, and `seller: { id, displayName, verified, province, businessCategory, logoUrl | null }`. A malformed id SHALL return 404 (not 500).

#### Scenario: Detail of visible product
- **WHEN** a client requests an existing visible product id
- **THEN** the full product with presigned image URLs SHALL be returned

#### Scenario: Malformed id
- **WHEN** a client requests `GET /commerce/products/not-an-objectid`
- **THEN** the system SHALL return 404

### Requirement: Seller storefront endpoint

`GET /commerce/sellers/:id` SHALL be public and return `{ seller: { id, displayName, verified, province, businessCategory, tagline, description, logoUrl | null }, productCount }` for a verified, non-banned business. The storefront's products SHALL be fetched through `GET /commerce/products?sellerId=:id` (same search/sort/pagination contract).

#### Scenario: Storefront of verified business
- **WHEN** a client requests a verified business id
- **THEN** the seller profile and its visible product count SHALL be returned

#### Scenario: Storefront of non-business or unverified user
- **WHEN** the id belongs to a personal user, an unverified business, a banned business, or no user
- **THEN** the system SHALL return 404

### Requirement: Cart revalidation endpoint

`POST /commerce/products/validate` SHALL be public and accept `{ ids: string[] }` (1–100 ids). It SHALL return `{ items: Array<{ id, available: boolean, price: number | null, name: string | null, imageUrl: string | null, seller: { id, displayName } | null }> }` in the same order as the request, with `available: false` (and null fields) for ids that are malformed, missing, inactive, or whose seller is not visible.

#### Scenario: Mixed cart validation
- **WHEN** a client validates `[visibleId, inactiveId, "garbage"]`
- **THEN** the response SHALL have 3 items in order with `available` = `true`, `false`, `false`, and the first item SHALL carry the current price

### Requirement: Admin product management with full fields

`POST|PATCH|DELETE /admin/commerce/products` (JwtAuthGuard + AdminGuard, audit-logged) SHALL accept every writable field of the product data model through validated DTOs. On create, and on update when `sellerId` changes, `sellerId` SHALL reference an existing business user with `verificationStatus: 'verified'`; otherwise the system SHALL return 400. `GET /admin/commerce/products` SHALL list all products (including inactive and seller-hidden ones) with seller display name and visibility state. `GET /admin/commerce/sellers` SHALL list verified, non-banned businesses (`id`, `displayName`, `businessCategory`) for the seller picker.

#### Scenario: Admin creates product for verified business
- **WHEN** an admin posts a valid product whose `sellerId` is a verified business
- **THEN** it SHALL be persisted with `sellerActive: true`, an audit log entry SHALL be written, and it SHALL be visible via `GET /commerce/products`

#### Scenario: Admin targets a non-business seller
- **WHEN** an admin posts a product whose `sellerId` is a personal user or an unverified business
- **THEN** the system SHALL return 400 and not persist the product

#### Scenario: Non-admin cannot write
- **WHEN** a non-admin calls any `/admin/commerce/products` write endpoint
- **THEN** the system SHALL return 403

### Requirement: admin-web product form

The admin-web Commerce Products page SHALL provide a list (name, seller, category, price, active, visibility) and a create/edit form with: seller picker (from `GET /admin/commerce/sellers`), category select, name, description, price, original price, tags, delivery text, active toggle, and image upload (up to 8 images, JPEG/PNG/WebP, uploaded to MinIO through `POST /media/upload` presigned PUT, then saved as `imageKeys`). Client-side validation SHALL mirror the server rules and server 400 messages SHALL be displayed.

#### Scenario: Admin uploads an image and saves
- **WHEN** an admin selects an image, the presigned PUT succeeds, and the form is saved
- **THEN** the product SHALL be persisted with the returned media key in `imageKeys` and the image SHALL render in the mobile catalog

#### Scenario: Upload failure is surfaced
- **WHEN** the presigned PUT fails
- **THEN** the form SHALL show an error for that image and SHALL NOT save its key

### Requirement: Catalog seed from mobile mocks

`chat-backend/scripts/seed-commerce-catalog.ts` SHALL create (or reuse) one verified retail business account per mock seller in `shoppingMockData.ts`, owned by the personal user given by the required `--owner-email` argument, upload each bundled image in `ChatApp/src/assets/mock-shopping/` to MinIO once (with a matching `Media` record), and upsert every mock product with its mock seller's business as `sellerId`, numeric price, tags, description, delivery text and image key. Re-running SHALL NOT create duplicates. `--wipe` SHALL delete only the products, media records/objects and business accounts this script created (identified by a dedicated marker), and SHALL NOT touch the owner user or any other data.

#### Scenario: Idempotent re-run
- **WHEN** the script is run twice with the same `--owner-email`
- **THEN** product, business and media counts SHALL be identical after both runs

#### Scenario: Missing owner
- **WHEN** `--owner-email` is omitted or does not match an existing personal user
- **THEN** the script SHALL exit non-zero without writing anything

#### Scenario: Wipe is scoped
- **WHEN** the script is run with `--wipe`
- **THEN** only documents/objects carrying the script's marker SHALL be removed

### Requirement: Mobile catalog reads the live server

The mobile Shopping Home, Product Detail and Storefront screens SHALL read products exclusively from the commerce API through the authenticated `apiClient`. Search, category, tag and sort selections SHALL be sent as query params (search debounced 300 ms); lists SHALL paginate on scroll (infinite scroll, no duplicate rows, no fetch while a page is in flight). Each screen SHALL render a skeleton on first load, an empty state when there are no results, and an error state with a retry action on failure. Prices SHALL be numbers formatted by one shared VND formatter. Rating SHALL NOT be displayed; `soldCount` SHALL be displayed (as "Đã bán N" when N > 0, hidden when 0). No screen SHALL import product data from `shoppingMockData.ts`.

#### Scenario: Filter change refetches from the server
- **WHEN** the user selects the "Giá thấp nhất" sort chip
- **THEN** the app SHALL request `GET /commerce/products?sort=priceLow&page=1` and replace the list with the response

#### Scenario: Network failure on first load
- **WHEN** the first products request fails
- **THEN** the screen SHALL show an error state with a "Thử lại" action that repeats the request

#### Scenario: Chat with the seller uses the real business id
- **WHEN** the user taps "Nhắn tin" on a product or storefront
- **THEN** the app SHALL call `startDirectChat(product.seller.id)` with the business user id and navigate to the conversation

### Requirement: Device-persisted shared cart grouped by shop

The mobile app SHALL keep one cart shared across all Shopping screens and persisted on the device (MMKV) so it survives navigation and app restarts. Each line SHALL store `productId`, `quantity` (1–99), and a snapshot (`name`, `price`, `imageKey`, `seller { id, displayName }`) captured when added. The cart SHALL be scoped per active account (switching account shows that account's cart) and cleared on logout. Product cards SHALL have a `[+ giỏ]` action; Product Detail SHALL have `[Thêm vào giỏ]` and `[Mua ngay]` (adds then opens the cart). The Shopping header cart icon SHALL show a badge with the total quantity (hidden at 0, "99+" above 99). Adding an existing product increments its quantity (capped at 99). Cart edits SHALL work offline.

#### Scenario: Cart survives restart
- **WHEN** the user adds two products, kills the app, and reopens the cart
- **THEN** both lines with their quantities SHALL be present

#### Scenario: Add from card updates badge
- **WHEN** the user taps `[+ giỏ]` on a product card
- **THEN** the header badge SHALL increase by 1 and a confirmation toast SHALL appear

#### Scenario: Cart is per account
- **WHEN** the user switches from their personal account to a business account
- **THEN** the cart shown SHALL be the business account's cart, not the personal one

### Requirement: Cart revalidation and grouping on open

When the cart screen opens (and when connectivity returns while it is open), the app SHALL call `POST /commerce/products/validate` for all line ids and reconcile: unavailable lines SHALL render greyed with "Sản phẩm không còn bán" and be excluded from totals; lines whose current price differs from the snapshot SHALL show "Giá đã thay đổi: <old> → <new>" and use the new price, updating the stored snapshot. Lines SHALL be grouped by seller, each group showing seller name, its lines, and the group subtotal. The cart SHALL NOT show any hardcoded shipping fee nor a "MOCK" label; each group SHALL show "Phí ship: shop sẽ báo". If validation fails (offline/error), the cart SHALL show the stored snapshots with a notice "Chưa cập nhật được giá mới nhất".

#### Scenario: Removed product in cart
- **WHEN** a cart line's product was deactivated by an admin
- **THEN** on opening the cart the line SHALL be greyed with "Sản phẩm không còn bán" and excluded from the subtotal

#### Scenario: Price changed since adding
- **WHEN** a line was added at 89.000đ and the product now costs 95.000đ
- **THEN** the line SHALL display "Giá đã thay đổi: 89.000đ → 95.000đ" and the subtotal SHALL use 95.000đ

#### Scenario: Products from two shops
- **WHEN** the cart contains products from shop A and shop B
- **THEN** the cart SHALL render two groups with separate subtotals

### Requirement: Interim per-shop action until ordering ships

Until the `commerce-orders` change ships, each cart group's action SHALL be labeled "Nhắn tin với shop" and SHALL open the direct chat with that group's seller. It SHALL NOT create any order, SHALL NOT clear the cart, and SHALL NOT display any order-success feedback. `featureAvailability.shopping` SHALL remain `preview`.

#### Scenario: Interim action opens chat only
- **WHEN** the user taps "Nhắn tin với shop" on a cart group
- **THEN** the app SHALL open the direct conversation with that seller and the cart SHALL remain unchanged
