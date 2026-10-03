## Why

The catalog is live (change `commerce-catalog-live`): products belong to real verified businesses and the cart is persisted. But tapping checkout still only opens a chat — no order is created, the seller receives nothing structured, and neither side can track anything. This change completes the Level-1 flow: one structured order per shop, full lifecycle tracking driven by the seller, all inside the existing chat.

## What Changes

- New `CommerceOrder` collection: one order per seller per checkout, with frozen price snapshots, buyer info, shipping block, status lifecycle, and an idempotency key against double-tap.
- Buyer flow: checkout form (name/phone/address + note, prefilled from last order) → one order per shop → order card posted into the buyer↔seller chat → buyer lands in the chat. Cart lines for that seller are cleared.
- Seller flow: push + order card in chat + "Đơn hàng" list; updates via card buttons ([Xác nhận] with fee + date, [Từ chối] with reason, [Đang giao] with optional carrier + tracking) or the list.
- Buyer: "Đơn của tôi" list + detail, [Huỷ] before shipping, [Đã nhận] on delivery; tracking code opens the carrier's tracking page.
- Each status change: persist → order-card message updated → system line → push → socket. `shopping` feature becomes `ready`.
- Safety nets: 24h seller reminder and 7-day auto-delivery cron; `soldCount` feeds the bestseller sort.
- **BREAKING (internal)**: the interim cart "Nhắn tin với shop" action is replaced by the real checkout form.

## Capabilities

### New Capabilities
- `commerce-orders`: order lifecycle from placement to delivery (placement, status transitions with role enforcement, order-card chat integration, seller reminders/auto-delivery cron, buyer + seller order screens, read-only admin order views).

### Modified Capabilities
- `commerce-catalog`: cart group's interim chat-only action becomes the checkout entry point; `soldCount` is now incremented on delivery; `shopping` availability moves `preview` → `ready`.
- `admin-commerce-catalog`: product seed/`soldCount` semantics unchanged, but admin gains read-only order list/detail views.

## Impact

- Backend: new `chat-backend/src/commerce/orders/` (schema, DTOs, service, controller, cron); `message.schema.ts` metadata gains `order` (service-only, REST-stripped like `storyReply`); `MessagesService` gains order-card posting; `AdminCommerceController` gains read-only order endpoints; `MediaModule` untouched.
- Mobile: `commerceApi` order methods; new checkout screen + Cart wiring; `MessageItem.tsx` gains `OrderCard`; new PersonalTab "Đơn của tôi" + business "Đơn hàng" screens; `navigation/types.ts` new routes; `featureAvailability.shopping = 'ready'`.
- admin-web: new orders list/detail pages (read-only).
- Not touched: `MainNavigator.tsx`, `ChatHomeHeaderInsetContext.tsx`, `ChatHomeScreen.tsx`.
- No new dependencies (Schedule + Redis lock + FCM already exist).
