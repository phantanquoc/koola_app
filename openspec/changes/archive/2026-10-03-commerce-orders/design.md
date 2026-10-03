## Context

- `commerce-catalog-live` (archived) delivered: seller-owned `CommerceProduct` (`sellerId`, `sellerActive`, `searchText`, indexes), public listing/detail/seller/validate endpoints (`CommerceService`, `commerce.controller.ts`), admin CRUD (`AdminCommerceController`), `CommerceModule` importing `MediaModule` + `CommerceSellerVisibilityModule` and exporting `CommerceService`.
- Message flow: `MessagesService.sendMessage(text)` strips `metadata` to null; `sendMessageWithStoryReply` (called only by `MomentsService`) sets service-only `metadata.storyReply` and emits via `emitNewMessage` + `newMessageEmitCallback`, which `ChatGateway` fans out as `new_message` to `conversation:<id>` (see `chat.gateway.ts` wiring at lines ~83–110, and `message_updated` emit at line ~73). `ConversationsService.createDirect` is find-or-create; `createSystemMessage(conversationId, content)` exists (~line 463).
- Push: `NotificationsService.sendMentionPush` pattern (eligibility: notificationsEnabled, offline, has tokens; Redis `setNXEX` dedup `notif:mention:<user>:<story>`; payload with `data.type`, `deepLink`, `accountId`, `accountType`). `sendPushNotification` is the message-push path. Notification tap → `App.tsx` `switchAccount` flow (~lines 116–120).
- Auth identity: `request.user` = `{ sub, act?, accountType }` (`CurrentUser` decorator). Business token: `sub` = business account id, `act` = owner. Personal token: `sub` = user id, no `act`. Seller endpoints authorize `order.sellerId === user.sub` — works for both the seed owner (acting as business) and real sellers.
- Cron: `ScheduleModule.forRoot()` in `app.module.ts`; `RedisService.setNXEX(key, value, seconds)` + `acquireLock`-style helper (~line 104–112); media-cron is the lock pattern reference.
- Mobile: `commerceApi` in `apiService.ts`; cart store MMKV `shopping-cart` (`services/shopping/`); `MessageItem.tsx` renders `StoryReferenceCard` when `metadata.storyReply` (~line 334); `messageItemEquality.ts` includes `metadata` in equality; `featureAvailability.shopping = 'preview'`; PersonalTab routes in `navigation/types.ts` (`PersonalHome`, `EditProfile`, …).

## Goals / Non-Goals

**Goals:** real ordering with frozen prices, role-safe transitions, order card in chat with live updates, buyer + seller order screens, reminders/auto-delivery, admin read-only views, `shopping` → `ready`.
**Non-Goals:** carrier APIs, online payment, stock, reviews, returns, seller self-posting, editing messages, admin order mutation.

## Decisions

### D1. `CommerceOrder` schema and module layout
New files under `chat-backend/src/commerce/orders/`: `schemas/commerce-order.schema.ts`, `dto/orders.dto.ts`, `orders.service.ts`, `orders.controller.ts`, `orders-cron.service.ts` (or cron inside service — implementer picks; one `@Cron` method with lock). Registered via `MongooseModule.forFeature` in `CommerceModule` (add `CommerceOrder` model) — no new top-level module, matching how products live in `CommerceModule`. Indexes via `schema.index()` only. `orderCode`: `KO-` + base36 timestamp + 4 random chars, retry on duplicate-key collision (unique index is the backstop).

### D2. Placement is a coordinated write in OrdersService, not a transaction
MongoDB standalone (local dev) has no multi-doc transactions; the codebase doesn't use them. Placement order: (1) validate seller + products from live reads; (2) `create` order with `idempotencyKey` (duplicate-key error → fetch existing by key, return 200); (3) `createDirect`; (4) card message via `MessagesService`; (5) system line; (6) push. If steps 3–6 fail after the order is created, the order still exists and the client retries with the same idempotency key; make the post-create steps themselves idempotent: before posting the card/system line, check whether a card message with this `orderId` already exists in the conversation (query `messages.findOne({ conversationId, 'metadata.order.orderId' })`) and skip duplicates. Document this "create-then-reconcile" approach; no distributed transaction.

### D3. Card message emission reuses the existing story-reply path exactly
Add `MessagesService.sendMessageWithOrderCard(conversationId, senderId, content, order: { orderId, code, status })` mirroring `sendMessageWithStoryReply` (verifyMember → create with `metadata: { order }` → updateLastMessage → incrementUnread → `emitNewMessage` + `newMessageEmitCallback`). No gateway changes, no new event types. Status refresh: on each transition, `OrdersService` loads the card message by `metadata.order.orderId` and updates `metadata.order.status` (+ `total` when fee is set), saving it — the save triggers no socket by itself, so explicitly call the gateway's `message_updated` emit path: check how `chat.gateway.ts:73` gets its payload and expose the same call (likely via a callback registered like the pin/unpin callbacks at lines ~100–110; implementer wires the minimal callback without restructuring the gateway). Fallback if wiring proves invasive: post a fresh system line only (card refreshes on next focus fetch) — but primary is the `message_updated` path; report if fallback was used.
- Regular message creation MUST strip `metadata.order` exactly like `storyReply` (extend the existing strip, same lines).
- Schema: extend the `metadata` prop type with `order?: { orderId, code, status }` alongside `storyReply`.

### D4. Push for order events goes through a dedicated method, not the message path
Add `NotificationsService.sendOrderPush({ recipientUserId, title, body, orderId, status, conversationId })` following `sendMentionPush` (same eligibility checks, dedup key `notif:order:<user>:<orderId>:<status>` so each transition pushes at most once, payload `data: { type: 'order_update', orderId, status, deepLink: 'koola://orders/<orderId>', accountId, accountType }`). Rationale: order events are not messages; the message-push path dedups per conversation and would swallow them. `accountType` for a seller recipient: look up the user — if business, send `business` so the tap opens the seller view; else `personal`.
- Deep-link handling for `koola://orders/<id>` in `App.tsx` notification-tap flow: route to buyer detail or seller detail based on the `accountType` in the payload, using the existing `switchAccount` flow. Additive only.

### D5. Seller authorization = `sub`
Seller endpoints require `user.sub === order.sellerId` (works whether the caller is the business account itself or any token whose sub is that business id). Buyer endpoints require `user.sub === order.buyerId`. No `ownerUserId` traversal: an owner acting from their personal token cannot manage the shop's orders — they must switch to the business account (the app's standard flow). Document this in the endpoint descriptions.

### D6. Cancellation matrix (locked)
- Buyer: `PENDING` (no reason) and `CONFIRMED` (no reason; covers "disagrees with ship fee") → `CANCELLED`.
- Seller: `PENDING` only, reason required → `CANCELLED`.
- `SHIPPING`/`DELIVERED` cannot be cancelled by anyone via API (409). Returns/complaints are out of scope (chat it out).

### D7. `soldCount` exactly-once
On transition into `DELIVERED`, `OrdersService` runs `CommerceProduct.bulkWrite([updateOne {_id, $inc: {soldCount: qty}}])` guarded by a `soldCountApplied: boolean` flag on the order (set in the same update that sets `DELIVERED`; if the flag is already true, skip). This covers both buyer-receive and cron auto-deliver racing. The flag check + set must be in the same atomic `findOneAndUpdate` filter (`{ _id, status: 'SHIPPING' }` → sets `DELIVERED`); a second concurrent call finds no `SHIPPING` order and gets 409, so double-increment is impossible even without the flag — the flag is defense in depth.

### D8. Cron details
`orders-cron.service.ts` with `@Cron('*/15 * * * *')`, lock key `cron:commerce-orders` via `RedisService` `setNXEX` (TTL ~10 min, value = pod id if available following the media-cron pattern). Two phases: (1) `PENDING` + `createdAt < now-24h` + (`lastReminderAt` null or > 24h ago) → push seller, set `lastReminderAt`; (2) `SHIPPING` + `updatedAt < now-7d` → same transition path as buyer receive but `by: 'system'` (reuse the service method with a `bySystem` flag so history/push/card/soldCount all happen identically). Thresholds as exported constants (`ORDER_REMINDER_AFTER_MS`, `ORDER_AUTO_DELIVER_AFTER_MS`). `lastReminderAt: Date | null` is part of the order schema.

### D9. Admin reads
`GET /admin/commerce/orders` (JwtAuthGuard + AdminGuard, `status`/`sellerId`/`buyerId` filters, page/limit, newest first, includes buyer/seller display names via batched lookup) and `GET /admin/commerce/orders/:id` (full order + names + image URLs). No POST/PATCH/DELETE.

### D10. Mobile checkout
New screen `ShoppingCheckoutScreen` (route `ShoppingCheckout: { sellerId }`) reading the cart group for that seller, reusing the validate call on open. `buyerInfo` prefill: `cartStore.getLastBuyerInfo(accountId)` / `setLastBuyerInfo` in the same `shopping-cart` MMKV store. `idempotencyKey`: `crypto.randomUUID()` (check RN availability; fallback: existing uuid usage in codebase — implementer checks, no new dep) generated when the screen mounts per seller group, retained in screen state so retries reuse it. On success: `cartStore.removeSellerLines(sellerId)`, navigate to `ChatTab/Chat` with the returned `conversationId`, toast "Đã gửi đơn #<code>". Payment `cod|bank` via the same radio-row UI pattern the old mock screen used (informational). Offline: `useNetworkStatus` → disabled button + notice; cart edits unaffected. Never touch `OfflineQueueService`.

### D11. Mobile order card + lists
- `OrderCard` component (`screens/shopping/components/OrderCard.tsx`): props `{ orderId, code, status, itemCount, total, shippingFee, role: 'buyer'|'seller', onAction }`. Data: on mount fetch `GET /orders/:id` (cached per orderId in a tiny module map like translationStore? No — simpler: parent `MessageItem` passes the snapshot from metadata; the card fetches full detail only when expanded/tapped or when a `message_updated`/new system message for that order arrives; implementer picks the minimal consistent approach and documents it). Role is derived from current account id vs order buyer/seller (pass `buyerId/sellerId` in metadata? Metadata stays `{orderId, code, status}` per spec — role derived after the detail fetch; before fetch, show neutral card without buttons).
- Action sheets reuse `KoolaSheet`: confirm (fee + date inputs), ship (carrier select GHN/GHTK/VTP/Khác + tracking input), reject (reason input, required), cancel (confirm dialog), receive (confirm dialog).
- Routes: `PersonalOrders`, `PersonalOrderDetail: { orderId }` in `PersonalTabStackParamList`; business `ShoppingOrders`, `ShoppingOrderDetail: { orderId }` — placed in the Shopping stack but guarded: if active account is not business, show "Dành cho tài khoản bán hàng" empty state (simpler than dynamic navigator surgery; document). Badge: pending count via `sellerOrders?status=PENDING` total on focus.
- Tracking links map: `{ GHN: 'https://donhang.ghn.vn/?order_code=', GHTK: 'https://ghtk.vn/don-hang/', VTP: 'https://viettelpost.com.vn/tra-cuu-hanh-trinh-don?code=' }` — verify these exact URL formats work; if any is wrong, link to the carrier homepage instead and note it. (Plain https links, no API.)
- `featureAvailability.shopping = 'ready'` with the interim-action removal; PreviewBanner for shopping disappears accordingly (check `isPreview('shopping')` usages still compile).

### D12. admin-web orders pages
`admin-web/src/pages/CommerceOrdersPage.tsx` (+ detail): list with status/seller/buyer filters + read-only detail (timeline, items, buyer info, shipping). Reuse `TableShell` + `commerceApi.ts` helpers pattern from change 1.

## Risks / Trade-offs

- [No multi-doc transaction] → D2 create-then-reconcile with pre-checks; duplicate card/system lines impossible via the existence check.
- [Two writers of card metadata (placement + transitions)] → single `updateCardStatus` helper in OrdersService; card message located by `metadata.order.orderId` unique per order (only placement creates it).
- [Gateway wiring for `message_updated`] → reuse existing callback pattern; fallback documented in D3.
- [Cron on multiple instances] → Redis lock; thresholds injectable; cron service unit-tested with fake timers + mocked lock.
- [Owner-on-personal-token cannot manage shop orders] → D5; by design, matches account-switching UX.
- [Carrier tracking URL formats may drift] → plain links, verified at implementation; homepage fallback.

## Migration Plan

Purely additive: new collection, new endpoints, new screens. Existing catalog/cart behavior untouched except the interim-action swap and `shopping → ready`. No data migration. Rollback = revert code; orders collection stays but is unread.

## Open Questions

None blocking. D3 gateway wiring detail and D11 card-refresh trigger are resolved by the implementer within the stated constraints.
