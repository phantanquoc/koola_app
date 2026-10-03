## MODIFIED Requirements

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

When the cart screen opens (and when connectivity returns while it is open), the app SHALL call `POST /commerce/products/validate` for all line ids and reconcile: unavailable lines SHALL render greyed with "Sản phẩm không còn bán" and be excluded from totals; lines whose current price differs from the snapshot SHALL show "Giá đã thay đổi: <old> → <new>" and use the new price, updating the stored snapshot. Lines SHALL be grouped by seller, each group showing seller name, its lines, and the group subtotal. The cart SHALL NOT show any hardcoded shipping fee nor a "MOCK" label; each group SHALL show "Phí ship: shop sẽ báo" and a "Đặt hàng" action that opens the checkout form for that group (per `commerce-orders`). If validation fails (offline/error), the cart SHALL show the stored snapshots with a notice "Chưa cập nhật được giá mới nhất".

#### Scenario: Removed product in cart
- **WHEN** a cart line's product was deactivated by an admin
- **THEN** on opening the cart the line SHALL be greyed with "Sản phẩm không còn bán" and excluded from the subtotal

#### Scenario: Price changed since adding
- **WHEN** a line was added at 89.000đ and the product now costs 95.000đ
- **THEN** the line SHALL display "Giá đã thay đổi: 89.000đ → 95.000đ" and the subtotal SHALL use 95.000đ

#### Scenario: Products from two shops
- **WHEN** the cart contains products from shop A and shop B
- **THEN** the cart SHALL render two groups with separate subtotals

#### Scenario: Checkout entry per group
- **WHEN** the user taps "Đặt hàng" on shop A's group
- **THEN** the app SHALL open the checkout form for shop A's lines only
