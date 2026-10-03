## 1. Backend order model + placement

- [x] 1.1 `commerce/orders/schemas/commerce-order.schema.ts`: fields per spec (orderCode/item snapshots/buyerInfo/payment/shipping block/status/statusHistory/conversationId/idempotencyKey/lastReminderAt/soldCountApplied/timestamps) + `schema.index()` only (buyerId+createdAt, sellerId+status+createdAt, conversationId, unique idempotencyKey, unique orderCode); register model in `CommerceModule`
- [x] 1.2 DTOs `commerce/orders/dto/orders.dto.ts`: `PlaceOrderDto` (sellerId mongoId, items 1–50 × {productId, qty 1–99 int}, buyerInfo {name 1–100, phone 1–20, address 1–500, note ≤500}, payment `cod|bank`, idempotencyKey uuid), `ConfirmOrderDto` (shippingFee int ≥0, expectedDeliveryDate ISO), `RejectOrderDto` (reason 1–500), `ShipOrderDto` (carrier ≤50 optional, trackingCode ≤100 optional), `ListOrdersQueryDto` (status filter, page/limit)
- [x] 1.3 `OrdersService.placeOrder(buyerId, dto)`: validate seller verified+not banned; all products active+visible+same seller; compute subtotal from live prices; orderCode gen with collision retry; create (catch duplicate idempotencyKey → return existing 200); `createDirect`; card message (D3); system line; seller push (D4) ← (verify: placement scenarios; mixed-seller 400; unverified-seller 400; duplicate key returns same order + single card message)

## 2. Transitions + reads + admin

- [x] 2.1 `confirm/reject/ship/receive/cancel` with the D5 role checks + D6 matrix; invalid → 409; each: atomic status update → statusHistory → `updateCardStatus` → system line → push; DELIVERED path increments soldCount via bulkWrite guarded by `soldCountApplied`
- [x] 2.2 `listMine/listSeller/getById` with 403 rules (D5); admin `GET /admin/commerce/orders` + `/:id` read-only in `AdminCommerceController` with batched name lookups
- [x] 2.3 `orders.controller.ts`: all routes, JwtAuthGuard (no @Public), throttled, no `as any`; `GET /commerce/orders/:id` returns seller/buyer names + product image URLs
- [x] 2.4 `commerce-orders.service.spec.ts` + HTTP spec: every transition incl. 409s, 403 roles, idempotency, frozen snapshot after price change, unverified rejection, soldCount once, cron paths with fake timers ← (verify: every transition/role/idempotency/cron scenario covered and passing)

## 3. Message metadata + gateway + push + cron

- [x] 3.1 Extend message `metadata` type with `order: { orderId, code, status }`; `MessagesService.sendMessageWithOrderCard` mirroring `sendMessageWithStoryReply`; extend the REST strip to also drop client `metadata.order`; unit test that forged order metadata is stripped
- [x] 3.2 `updateCardStatus` in OrdersService + reuse of the gateway `message_updated` path for live card refresh (fallback documented if wiring proves invasive)
- [x] 3.3 `NotificationsService.sendOrderPush` (D4) + `koola://orders/<id>` deep-link handling in `App.tsx` notification-tap flow (additive, reuse switchAccount flow); test payload shape
- [x] 3.4 `orders-cron.service.ts` (`*/15 * * * *`, Redis lock, injectable thresholds, reminder + auto-deliver reusing the service transition path with `by: 'system'`) + spec with fake timers ← (verify: no new event types, no global emits; cron lock prevents double-run; reminder does not change status)

## 4. Mobile API + checkout

- [x] 4.1 `commerceApi` order methods typed (placeOrder, myOrders, sellerOrders, orderDetail, confirm/reject/ship/receive/cancel)
- [x] 4.2 `ShoppingCheckoutScreen` (route `ShoppingCheckout: { sellerId }`): group items revalidated, buyerInfo form + per-account prefill in shopping MMKV, payment radio, totals + "Phí ship: shop sẽ báo", uuid idempotencyKey per mount, offline-disabled button, success clears seller lines + navigates to conversation; never touches OfflineQueueService
- [x] 4.3 Cart screen: replace interim "Nhắn tin với shop" with "Đặt hàng" → checkout per group ← (verify: checkout scenarios; double-tap creates one order; offline blocks with message)

## 5. Mobile order card + order screens

- [x] 5.1 `OrderCard` component + wiring in `MessageItem.tsx` next to storyReply (neutral card pre-fetch, role buttons per status, KoolaSheet inputs for confirm/ship/reject, confirm dialogs for cancel/receive); refresh trigger documented (message_updated or focus refetch)
- [x] 5.2 `PersonalOrders` + `PersonalOrderDetail` (filter chips, timeline, tracking-code carrier links with verified URL formats, cancel/receive); business `ShoppingOrders` + `ShoppingOrderDetail` (guarded non-business empty state, pending badge, same action sheets) ← (verify: card live-update; role buttons call correct endpoints; tracking links open)
- [x] 5.3 `featureAvailability.shopping = 'ready'`; remove interim action; check `isPreview('shopping')` usages compile; `navigation/types.ts` new routes

## 6. admin-web + checks

- [x] 6.1 `CommerceOrdersPage` list + read-only detail (status/seller/buyer filters) reusing TableShell + commerceApi helpers
- [x] 6.2 chat-backend `npm run build` + `npx jest` + lint on changed files; ChatApp `tsc` + `jest` + eslint on changed files; admin-web `tsc` ← (verify: gates green or only pre-existing failures documented with git evidence)
- [ ] 6.3 Manual (user): buyer places order for 2 shops → 2 orders + 2 chat cards; seller confirms with fee → buyer sees update; ship with tracking → buyer opens carrier page; receive → soldCount increments; 24h/7d cron paths (or forced via test clock)
