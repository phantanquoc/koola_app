# commerce-orders Specification

## Purpose
Order lifecycle from placement to delivery: placement, status transitions with role enforcement, order-card chat integration, seller reminders/auto-delivery cron, buyer + seller order screens, read-only admin order views.

## Requirements

### Requirement: Order data model with price snapshots

A `CommerceOrder` SHALL store: `orderCode` (unique, human-readable, e.g. `KO-XXXXXX`), `buyerId`, `sellerId`, `items[]` (each: `productId`, `name`, `price` frozen at placement, `imageKey`, `qty` 1–99), `subtotal` (sum of frozen prices × qty), `buyerInfo` (`name`, `phone`, `address` required, `note` optional), `payment` (`cod` | `bank`), `shipping` (`fee` null until seller confirms, `carrier` null, `trackingCode` null, `expectedDeliveryDate` null), `status` (`PENDING` | `CONFIRMED` | `SHIPPING` | `DELIVERED` | `CANCELLED`, default `PENDING`), `statusHistory[]` (each: `status`, `at`, `by` user id or `system`, `note` optional), `conversationId`, `idempotencyKey` (unique), timestamps. Indexes: `{ buyerId: 1, createdAt: -1 }`, `{ sellerId: 1, status: 1, createdAt: -1 }`, `{ conversationId: 1 }`, unique `{ idempotencyKey: 1 }`, unique `{ orderCode: 1 }`.

#### Scenario: Placed order freezes prices
- **WHEN** a buyer places an order and the product price later changes
- **THEN** the order's item prices and subtotal SHALL remain as placed

#### Scenario: Duplicate submission returns the same order
- **WHEN** `POST /commerce/orders` is called twice with the same `idempotencyKey`
- **THEN** the second call SHALL return the existing order with status 200 and SHALL NOT create a second order or a second chat message

### Requirement: Placing an order

`POST /commerce/orders` (authenticated) SHALL accept `sellerId`, `items[]` (`productId`, `qty` 1–99, 1–50 lines), `buyerInfo` (`name` 1–100, `phone` 1–20, `address` 1–500, `note` ≤ 500 optional), `payment` (`cod` | `bank`), `idempotencyKey` (uuid). The service SHALL reject with 400 when: any product is missing/inactive/seller-hidden, any product belongs to a different seller, the seller is not a verified non-banned business, or buyer info is incomplete. On success it SHALL: create one order (`PENDING`), find-or-create the buyer↔seller direct conversation, post the order-card message (buyer as sender, service-only `metadata.order`), post a system line "Đơn #<code> đã được tạo", push the seller "Đơn mới #<code> · N sp · <total>", and return the order plus `conversationId`. Ordering SHALL require a real network call and SHALL NOT be queued offline.

#### Scenario: Successful placement
- **WHEN** a buyer posts a valid order for one seller's products
- **THEN** one `PENDING` order SHALL be created, an order card SHALL appear in the buyer↔seller chat, the seller SHALL be pushed, and the response SHALL contain the order and `conversationId`

#### Scenario: Product removed since added to cart
- **WHEN** an ordered product was deactivated after the buyer added it to the cart
- **THEN** the system SHALL return 400 naming the unavailable product and SHALL NOT create any order

#### Scenario: Seller lost verification
- **WHEN** the seller is no longer a verified non-banned business at placement time
- **THEN** the system SHALL return 400 and SHALL NOT create any order

#### Scenario: Mixed-seller items rejected
- **WHEN** the items belong to two different sellers
- **THEN** the system SHALL return 400 (the client sends one request per seller)

### Requirement: Order status transitions with role enforcement

The allowed transitions SHALL be: `PENDING → CONFIRMED` (seller, body: `shippingFee` ≥ 0 integer + `expectedDeliveryDate`; sets `shipping.fee`, `shipping.expectedDeliveryDate`), `PENDING → CANCELLED` (seller with required `reason`, or buyer without reason), `CONFIRMED → SHIPPING` (seller, optional `carrier` + `trackingCode`), `CONFIRMED → CANCELLED` (buyer only), `SHIPPING → DELIVERED` (buyer, or system via cron), any other transition SHALL return 409. Every mutation SHALL verify the caller's role: seller endpoints require `request.user.sub` (or current business account id) to equal the order's `sellerId` — 403 otherwise; buyer endpoints require it to equal `buyerId` — 403 otherwise. Each transition SHALL: persist the order + append `statusHistory` first, then post a system line, update the order-card message metadata snapshot, push the other party, all in the same conversation scope. On `DELIVERED` (buyer or cron, but exactly once per order) the service SHALL increment `soldCount` of each ordered product by its qty via `bulkWrite`.

#### Scenario: Seller confirms with fee
- **WHEN** the seller confirms a `PENDING` order with fee 20000 and a delivery date
- **THEN** the order SHALL become `CONFIRMED` with `shipping.fee = 20000`, a system line SHALL be posted, and the buyer SHALL be pushed

#### Scenario: Buyer cannot confirm
- **WHEN** the buyer calls the confirm endpoint on their own order
- **THEN** the system SHALL return 403 and the status SHALL be unchanged

#### Scenario: Invalid transition rejected
- **WHEN** anyone calls ship on a `PENDING` order
- **THEN** the system SHALL return 409 with a clear message

#### Scenario: Delivery increments sold counts once
- **WHEN** an order with 2× product A and 1× product B becomes `DELIVERED`
- **THEN** A's `soldCount` SHALL increase by 2 and B's by 1, and a repeated delivery attempt SHALL NOT increment again

#### Scenario: Seller rejects with reason
- **WHEN** the seller rejects a `PENDING` order with reason "Hết hàng"
- **THEN** the order SHALL become `CANCELLED`, the buyer SHALL see the reason, and the buyer SHALL be pushed

### Requirement: Order reads for buyer, seller and admin

`GET /commerce/orders/mine` (buyer = caller, optional `status` filter, page/limit, newest first), `GET /commerce/orders/seller` (caller must be a business account; returns orders where `sellerId` equals the caller's business account id — when the caller acts under a business token `sub` is the business id; 403 for personal tokens), `GET /commerce/orders/:id` (buyer or seller of that order only, else 403; includes seller/buyer display names and product image URLs). `GET /admin/commerce/orders` (admin, `status`/`sellerId`/`buyerId` filters, page/limit) and `GET /admin/commerce/orders/:id` (admin, read-only). No admin mutation of orders SHALL exist.

#### Scenario: Stranger cannot read an order
- **WHEN** a user who is neither the buyer nor the seller requests an order
- **THEN** the system SHALL return 403

#### Scenario: Personal account cannot use seller list
- **WHEN** a personal-token caller requests `GET /commerce/orders/seller`
- **THEN** the system SHALL return 403

### Requirement: Seller reminders and auto-delivery cron

A cron job every 15 minutes (guarded by the Redis `setNXEX` lock pattern) SHALL: push a reminder to the seller for each `PENDING` order older than 24h (no status change; at most one reminder per order per 24h — trackable via a `lastReminderAt` field or the existing Redis dedup key pattern), and transition each `SHIPPING` order older than 7 days to `DELIVERED` with `statusHistory` `by: 'system'`, posting the system line and pushing the buyer. Thresholds SHALL be injectable constants for tests.

#### Scenario: Old pending order reminds seller
- **WHEN** a `PENDING` order is 25h old
- **THEN** the next cron run SHALL push the seller and leave the status `PENDING`

#### Scenario: Old shipping order auto-delivers
- **WHEN** a `SHIPPING` order is 8 days old
- **THEN** the next cron run SHALL set it `DELIVERED` with a system history entry, post the system line, and increment product `soldCount`

### Requirement: Order card in chat

Order-card messages SHALL be `MessageType.TEXT` messages whose service-only `metadata.order = { orderId, code, status }` (same service-only pattern as `storyReply`; regular REST message creation SHALL strip/ignore `metadata.order`). The card SHALL be posted once at placement with the buyer as sender. On every status transition the backend SHALL update that card message's `metadata.order.status` and emit it through the existing `message_updated` socket path so open chats refresh live. Mobile SHALL render an `OrderCard` when `metadata.order` is present (code, status pill, item count, subtotal + shipping fee when set; tap opens order detail fetched from `GET /commerce/orders/:id`), with role-appropriate buttons per status: seller `[Xác nhận]` (opens fee + date sheet) / `[Từ chối]` (requires reason) / `[Đang giao]` (opens carrier + tracking sheet); buyer `[Huỷ]` (when cancellable) / `[Đã nhận]` (when `SHIPPING`). Buttons SHALL call the matching order endpoints and reflect the new status from socket/system updates, not local guessing.

#### Scenario: Card updates live on confirm
- **WHEN** the seller confirms and the buyer has the chat open
- **THEN** the card SHALL show `CONFIRMED` with the shipping fee without the buyer reloading

#### Scenario: Clients cannot forge order cards
- **WHEN** a regular message POST includes `metadata.order`
- **THEN** it SHALL be stripped/ignored and no order card SHALL render

### Requirement: Buyer "Đơn của tôi" screens

PersonalTab SHALL gain `PersonalOrders` (list of the buyer's orders, newest first, status filter chips, each row: code, seller name, item count, total, status pill, pending-count entry badge) and `PersonalOrderDetail` (full timeline from `statusHistory`, items with frozen prices, buyer info, shipping block incl. tracking code linking to the carrier tracking page — plain https links for GHN/GHTK/VTP; cancel/receive actions with confirm dialogs). Actions SHALL be available exactly when the order's status allows them.

#### Scenario: Tracking code opens carrier page
- **WHEN** the buyer taps a tracking code on a `SHIPPING` order
- **THEN** the app SHALL open the matching carrier's tracking URL with the code

### Requirement: Seller "Đơn hàng" screens

When the active account is a business account, the app SHALL expose a "Đơn hàng" list (status filter + pending count badge) with the same confirm/reject/ship sheets as the chat card, and order detail with buyer info (name/phone/address) for fulfilment. Personal accounts SHALL NOT see this entry.

#### Scenario: Seller confirms from the list
- **WHEN** a seller confirms a `PENDING` order from "Đơn hàng" with fee and date
- **THEN** the order SHALL become `CONFIRMED` and the chat card SHALL update via socket

### Requirement: Mobile checkout form

From each cart seller-group, "Đặt hàng" SHALL open a checkout sheet/screen showing the group's items (revalidated), subtotal, "Phí ship: shop sẽ báo", buyerInfo fields (name/phone/address required, note optional, prefilled from the last used buyerInfo stored per account in the shopping MMKV store), payment choice (`cod` | `bank`), and [Xác nhận đặt hàng]. The button SHALL be disabled offline with "Cần kết nối mạng để đặt hàng". Each attempt SHALL generate one uuid `idempotencyKey`, kept until that checkout succeeds so retries reuse it. On success the app SHALL remove that seller's lines from the cart and navigate into the returned `conversationId`. Placing an order SHALL NEVER go through `OfflineQueueService`.

#### Scenario: Successful checkout clears the group
- **WHEN** checkout for shop A succeeds
- **THEN** shop A's lines SHALL be removed from the cart, shop B's lines SHALL remain, and the app SHALL open the chat with shop A

#### Scenario: Offline checkout blocked
- **WHEN** the device is offline on the checkout screen
- **THEN** the confirm button SHALL be disabled with "Cần kết nối mạng để đặt hàng" while cart edits still work

### Requirement: admin-web order views and notification payloads

admin-web SHALL gain a read-only orders list (status/seller/buyer filters) and order detail page using the admin order endpoints. Order pushes SHALL carry `data: { type: 'order_update', orderId, status, deepLink: 'koola://orders/<orderId>', accountId, accountType }` following the existing `story_mention` payload pattern (`NotificationsService.sendMentionPush`), so tapping opens the right account's order view.

#### Scenario: Seller taps new-order push
- **WHEN** the seller taps the "Đơn mới" push
- **THEN** the app SHALL open the seller's order view for that order (switching to the business account if needed, following the existing notification-tap `switchAccount` flow in `App.tsx`)
