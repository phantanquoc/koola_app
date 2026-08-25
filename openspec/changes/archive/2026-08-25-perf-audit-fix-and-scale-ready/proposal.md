## Why

Backend is production-correct on a single instance but carries ~70% of the performance audit findings still unfixed (verified against live code 2026-08-25). With N instances, in-memory throttling, un-locked crons, unbounded queries, and event-loop blocking will multiply failures. Fixing these now makes scaling from 1 to 5–10 instances a config/LB change instead of a rewrite. Microservice split is intentionally deferred.

## What Changes

- **Query path fixes (Batch 1 — quick wins):**
  - Remove `populate('senderId')` on `Message.senderId: String` without `ref` (7 call sites in `messages.service.ts` + 3 in `conversations.service.ts` + 1 in `membership.service.ts`). Response stays `string` senderId.
  - Add `limit/lean/select` + `joinedAt` index to `getConversationList` (`user-conversation.schema.ts`).
  - Add indexes for hot queries: `deleted`/`deletedFor` on `message.schema.ts`, `audienceScope` on `story.schema.ts`; fix Moments feed sort direction to match index (`createdAt: -1`).
  - `Promise.all` for independent fetches in `sendMessage` (`verifyMember` + `updateLastMessage`/`incrementUnreadCount` + `findByIdOrFail`).
  - Replace `jimp@0.22.12` blurhash path with `sharp` off the event loop (fire-and-forget stays, but not blocking).
  - Fix `searchMessages` `$text` sort + add `lean()`, deduplicate `countDocuments`.
- **Scale-readiness config (Batch 2):**
  - `ThrottlerModule` → Redis-backed storage via `RedisService.incrementWithExpiry` (shared quota across instances).
  - `MongooseModule.forRoot` → `{ autoIndex: false, maxPoolSize: 20 }`.
  - `main.ts` → `compression` + `helmet`.
  - `LoggingInterceptor` → gate `console.log` by `NODE_ENV` (or pino-ready no-op in prod).
- **Distributed correctness (Batch 3 — platform):**
  - Cron mutual exclusion via `RedisService.setNXEX('lock:<job>', podId, ttl)` for 5 remaining jobs: `media-cron` (`0 3 * * *`), `media-cleanup` (`0 3 * * *` — overlaps!), `moments flushViewCounts` (`EVERY_MINUTE`), `moments detectOrphanMedia` (`0 2 * * *`). Design reserves BullMQ upgrade path. `call-session-cron` already atomic — untouched.
  - `TypingService` → Redis `typing:<conv>:<user> EX 5` instead of `Map<Timeout>`; `ChatGateway` emits typing only to receivers (sender does not see own typing).
  - `RedisIoAdapter` shares the single `RedisService` client instead of `new Redis()` per instance (one pool/instance).
- **Docs:** Update `docs/performance-audit-2026-08.md` to reflect fixed items.

**Out of scope (explicitly not in this change):** microservice split; full observability (`prom-client`/`pino`/`otel`/`k6`); already-fixed areas (`moments.gateway` global emit, `admin ReDoS` via `escapeRegExp`, `health @SkipThrottle` + `coturn-health` split, `call-session-cron` atomicity).

## Capabilities

### New Capabilities
- `backend-perf-scale-readiness`: Cross-cutting backend performance fixes and horizontal scale readiness (query/index, image pipeline, throttling, DB pool, middleware, cron locks, typing distribution, Redis client sharing).

### Modified Capabilities
- None — existing spec behaviors (messaging, moments, conversations) keep the same external contracts; only internal performance/correctness changes. If any spec requirement text needs tightening, it will be captured as a delta under `backend-perf-scale-readiness`.

## Impact

- **Code:** `messages.service.ts`, `conversations.service.ts`, `membership.service.ts`, `message.schema.ts`, `user-conversation.schema.ts`, `story.schema.ts`, `app.module.ts`, `main.ts`, `common/redis/redis.service.ts`, `common/interceptors/logging.interceptor.ts`, `moments.service.ts`, `media-cron.service.ts`, `media/media-cleanup.service.ts`, `messages/typing.service.ts`, `gateway/chat.gateway.ts`, `package.json`, `docs/performance-audit-2026-08.md`.
- **APIs:** No breaking API changes; response shapes unchanged (notably `senderId` remains `string`).
- **Dependencies:** Add `sharp`, `compression`, `helmet` (+ types); remove or keep `jimp` as dev-only if still referenced elsewhere.
- **Systems:** Enables 5–10 instance scale behind LB with shared Redis; Mongo connection budget drops from 100/instance to 20/instance.
