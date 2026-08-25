## 1. Indexes and Schemas

- [x] 1.1 Add supporting indexes to `message.schema.ts` for `deleted`/`deletedFor` hot filter (compound with `conversationId` as appropriate)
- [x] 1.2 Add index to `user-conversation.schema.ts` supporting `getConversationList` sort `{ userId: 1, joinedAt: -1 }`
- [x] 1.3 Add index for `story.schema.ts` `audienceScope` (or compound covering the 4-branch `$or`) and verify feed sort alignment
- [x] 1.4 Create one-time index migration/script or startup guard docs for `autoIndex:false` rollout

## 2. Messages Service — Hot Path Fixes

- [x] 2.1 Remove all `populate('senderId', ...)` on `Message.senderId: String` without `ref` in `messages.service.ts` (7 sites: ~405,481,505,531,543,839,923) — keep `senderId` as string
- [x] 2.2 Parallelize independent fetches in `sendMessage` via `Promise.all` for `updateLastMessage` + `incrementUnreadCount` (keep `verifyMember` as gate) — measure no extra RTT
- [x] 2.3 Replace `jimp@0.22.12` blurhash path with `sharp`: `sharp(buffer).resize(32, h).ensureAlpha().raw().toBuffer(...)` → `blurhash.encode`, keep fire-and-forget, add failure fallback (skip blurhash + warn log)
- [x] 2.4 Fix `searchMessages` (`messages.service.ts:990-1046`): align sort with text index, add `lean()`, deduplicate `countDocuments` filter, add projection
- [x] 2.5 Add/adjust unit tests guarding `senderId` remains `string` and no `populate` is issued on the fixed paths ← (verify: mock query chain has no populate call; response senderId is string)

## 3. Conversations and Membership — Bounded List

- [x] 3.1 Fix `getConversationList` (`conversations.service.ts:340-346`): add `.limit()`/`.lean()`/`.select()` with pagination, use the new `joinedAt` index
- [x] 3.2 Fix `membership.service.ts:25` populate on the hot path: remove or replace with `select('members').lean()` boolean check; keep `isMember` cheap path as primary
- [x] 3.3 Fix any remaining `populate('senderId')` in `conversations.service.ts` (sites ~359,383,405) — string-only

## 4. App Wiring — Throttler, Mongoose, Redis Client Sharing

- [x] 4.1 `app.module.ts`: set `MongooseModule.forRoot(URI, { autoIndex: false, maxPoolSize: 20 })` and document index migration
- [x] 4.2 `app.module.ts` + `common/redis/redis.service.ts`: implement `ThrottlerStorage` backed by `RedisService.incrementWithExpiry` (Lua INCR+EXPIRE) and wire `ThrottlerModule.forRoot({ storage })` so quota is global; keep `@SkipThrottle` for `health`
- [x] 4.3 `main.ts` + `common/redis/redis.service.ts`: share a single `ioredis` client between `RedisService` and `RedisIoAdapter` (adapter reuses `app.get(RedisService).getClient()`), single pool/instance ← (verify: only one `new Redis` call site remains; adapter does not quit the shared client)

## 5. HTTP Middleware and Logging

- [x] 5.1 `main.ts`: add `compression` (gzip) for JSON feed/sync responses
- [x] 5.2 `main.ts`: add `helmet` with defaults
- [x] 5.3 Gate `LoggingInterceptor:20` `console.log` behind `NODE_ENV !== 'production'` / `LOG_LEVEL` (prod no-op/pino-ready)
- [x] 5.4 Update `package.json` deps: add `sharp`, `compression`, `helmet` (+ `@types/compression`, `@types/helmet` if needed); keep/remove `jimp` per D2 decision

## 6. Moments Feed

- [x] 6.1 Fix feed sort direction in `moments.service.ts:381-413` to `{ authorId: 1, createdAt: -1 }` matching `story.schema.ts:140` index
- [x] 6.2 Justify or remove `limit * 10` over-fetch; ensure `audienceScope` uses the new index and explain/explain plan shows indexed use

## 7. Cron Mutual Exclusion

- [x] 7.1 Add `tryAcquireLock(key, ttl)` helper (thin wrapper over `RedisService.setNXEX`) with distinct keys `lock:media-cron` vs `lock:media-cleanup` (both at `0 3 * * *` — must not block each other)
- [x] 7.2 Guard `media-cron.service.ts:11` (`0 3 * * *`), `media/media-cleanup.service.ts:20` (`0 3 * * *`), `moments.service.ts:687` (`EVERY_MINUTE`), `moments.service.ts:1463` (`0 2 * * *`) with the lock; skipped tick is no-op with debug log; keep `call-session-cron` untouched (already atomic) ← (verify: concurrent lock acquire only one succeeds; crons are idempotent on re-run)

## 8. Typing — Distributed Receiver-Only

- [x] 8.1 Replace `messages/typing.service.ts` `Map<Timeout>` with Redis `typing:<conv>:<user> EX 5` (set on startTyping, del on stopTyping, TTL auto-expire)
- [x] 8.2 `gateway/chat.gateway.ts`: emit typing to `conv:<id>` excluding sender (sender does not see own indicator); wire `TypingService` to Redis and handle cross-instance visibility ← (verify: sender excluded; 2-instance typing visible to receiver; expires after 5s)

## 9. Docs and Audit

- [x] 9.1 Update `docs/performance-audit-2026-08.md` marking fixed vs out-of-scope items and checks performed for this change
- [x] 9.2 Add scale runbook note (LB, sticky trade-off, Mongo pool math 20/instance, rolling deploy tolerance) either in docs or `design.md` appendix — written to `docs/scale-runbook-5-10.md`

## 10. Verification

- [x] 10.1 Run `npm --prefix chat-backend run build` and `npx tsc --noEmit` (backend) and fix type errors — `nest build` green; `tsc --noEmit` shows only 2 pre-existing file errors outside scope (reseed-businesses bad import, accounts.service.spec type mismatches)
- [x] 10.2 Run `npm --prefix chat-backend test` (or `jest`) for affected suites: `messages.service`, `conversations.service`, `moments.service`, `chat.gateway` typing, throttler — all green or explicitly documented skips ← (verify: no regression in senderId shape, throttler 429, typing receiver-only, cron lock, feed sort) — full suite: 29 passed, 378 passed
