## Context

Single-instance NestJS backend is production-correct. Live verification (2026-08-25) against `docs/performance-audit-2026-08.md` and `docs/codebase-audit-2026-08-05.md` shows ~70% of findings still present. The remaining 30% (global emits, ReDoS, health throttle/Coturn probe, call-session atomicity) were fixed in prior sprints and are out of scope. The app must scale to 5–10 instances behind a LB with shared Redis — without turning the monolith into a distributed monolith. Infra today: `infra-local/docker-compose` 1 backend service (`chat-backend:3000`), single Mongo/Redis containers; Proxmox design is 4 VMs (API, Mongo, MinIO+Coturn, Redis). Constraints: preserve external API contracts (notably `senderId: string`), tolerate mixed old/new instances during rolling deploy, and avoid native-dep pain where possible.

## Goals / Non-Goals

**Goals:**
- Eliminate hot-path waste verified on live code: bogus `populate`, unbounded `getConversationList`, missing hot indexes, sequential fetches in `sendMessage`, blocking blurhash, inefficient search.
- Make the monolith safe to run at N=5–10: shared throttler quota, bounded Mongo pool, no index thundering, single Redis pool per instance, exactly-once cron ticks, cross-instance typing.
- Add `compression`+`helmet` and gate noisy logging; fix typing to be receiver-only.
- Document scale runbook (LB, sticky trade-off, Mongo pool math, rolling deploy).

**Non-Goals:**
- Microservice split (deferred explicitly; the chosen bounded contexts are recorded but not implemented).
- Full observability stack (`prom-client`/`pino`/`otel`/`k6`) — only the logging gate ships now.
- Changing `Message.senderId` type to `ObjectId`/ref (stays `String`; populate is removed, not the field type).
- Replacing `call-session-cron` atomicity (already correct).

## Decisions

### D1 — Remove `populate('senderId')` instead of adding `ref`
- Why: `Message.senderId` is `String` with no `ref` by design; `populate` issues a second query into the `messages` collection itself and mobile only consumes a string. Removing the call is zero-contract-change and measurably cheaper.
- Alternative: Add `ref: 'User'` and keep populate — rejected: forces a cross-collection join on the two hottest read paths and changes denormalization intent.
- Touch: `messages.service.ts` (7 sites) + `conversations.service.ts` (2–3 sites) + `membership.service.ts:25`.

### D2 — `sharp` for blurhash (replacing `jimp@0.22.12`)
- Why: `Jimp.read`+`resize(32)`+`blurhash.encode` blocks the event loop 200–600ms for 12MP images. `sharp` is libvips-native, 5–10× faster and already idiomatic in NestJS image paths.
- Alternative: keep Jimp in a worker thread — preserves dep but still pays JS decode cost; rejected as slower root fix.
- Execution stays fire-and-forget (does not block the send response), but must not hog the loop.

### D3 — Throttler backed by `RedisService.incrementWithExpiry` (Lua `INCR`+`EXPIRE`)
- Why: `@nestjs/throttler` defaults to in-memory; with N instances the quota becomes N×60/1000. The repo already has `RedisService.incrementWithExpiry` used by `translate-throttler` — extend it to a `ThrottlerStorage` implementation.
- Alternative: introduce `ThrottlerStorageRedisService` from `@nest-lab/throttler-storage-redis` — similar, but reusing the existing Lua path keeps one Redis client/shared config.
- Env: `REDIS_URL` shared; no extra infra.

### D4 — `MongooseModule.forRoot` hardening
- `{ autoIndex: false, maxPoolSize: 20 }`. Rationale: at N=10, default `maxPoolSize:100` = 1000 connections > single Mongo budget; `autoIndex:true` thunder-builds indexes on rolling restart. Requires a one-time manual `db.*.createIndex` migration or startup script run once.

### D5 — Cron mutual exclusion via `setNXEX('lock:<job>', podId, ttl)`
- Why: cheapest correct primitive; `RedisService.setNXEX` already exists. Only the leader runs the tick. TTL slightly exceeds the cron period.
- Note: `media-cron` and `media-cleanup` both at `0 3 * * *` — they each need distinct lock keys (`lock:media-cron` vs `lock:media-cleanup`) so they do not block each other, but neither runs twice.
- BullMQ path: keep interface narrow (`tryAcquireLock(key, ttl) → boolean`) so a future BullMQ `Queue`/`Worker` can replace the body without call-site changes.

### D6 — Typing: Redis `typing:<conv>:<user> EX 5` + receiver-only emit
- Why: `TypingService` is `Map<Timeout>` — cross-instance invisible and leaks. Redis key with 5s TTL is the minimal distributed presence. Gateway emits `typing` to `conv:<id>` excluding the sender (sender must not see own indicator — explicit user requirement).
- Key format `typing:{convId}:{userId}` keeps scan cheap; no value needed beyond existence.

### D7 — Single Redis client shared between `RedisService` and `RedisIoAdapter`
- Why: today `main.ts` does `new Redis(REDIS_URL)` separately from `RedisService`'s client — 2 pools/instance, double connections, distinct retry config. Share one `ioredis` instance created in `RedisService` and inject it into the adapter via `app.get(RedisService).getClient()` or factory.

### D8 — `compression` + `helmet` in `main.ts`; gate `LoggingInterceptor`
- `compression` (gzip) for JSON feed/sync; `helmet` defaults. Gate `console.log` in `LoggingInterceptor:20` behind `NODE_ENV !== 'production'` or `LOG_LEVEL` (prod becomes no-op/pino-ready).

### D9 — Moments feed sort fix
- Current `sort({authorId:1, createdAt:1})` contradicts index `{authorId:1, createdAt:-1}` in `story.schema.ts:140`. Fix sort to `-1` and add sparse index on `audienceScope` (or compound covering the 4-branch `$or`). Keep existing `limit*10` or document its purpose; prefer `limit` + proper index over over-fetch.

## Risks / Trade-offs

- [sharp native dep needs libvips] → Mitigation: use `sharp` official prebuilds; Docker `chat-backend` base image already Debian-slim — add `npm install --include=optional sharp` in Dockerfile; CI must cache.
- [autoIndex:false requires manual index creation] → Mitigation: ship a one-off `scripts/create-indexes.ts` or document `MONGODB_AUTO_INDEX=false` + run `db.*.createIndexes`; rolling deploy runs with old code still fine (indexes pre-exist).
- [Redis throttler adds 1 RTT per request] → Mitigation: Lua `INCR+EXPIRE` is single round-trip; short TTL keeps keyspace small; optional local short-circuit for `health` already `@SkipThrottle`.
- [Typing Redis writes per keystroke burst] → Mitigation: debounce client typing_start to ≤1/1s (mobile already throttles); `EX 5` auto-expires, no cleanup cron needed.
- [Cron TTL too short → double run; too long → missed tick after crash] → Mitigation: TTL = period + slack (e.g., daily jobs `EX 3000`); job idempotence preserved (`updateMany` with tight filter).
- [Shared Redis client couples adapter lifecycle to service] → Mitigation: adapter reuses the same `ioredis` but does not `quit()` it; `RedisService.onModuleDestroy` owns the lifecycle.
- [Removing populate must not change API shape] → Mitigation: add spec guard test asserting `senderId` is `string` in `GET /conversations` and `GET /messages` responses.

## Migration Plan

1. Add indexes (non-blocking): `message {deleted, deletedFor}`, `story {audienceScope}`, `userConversation {userId, joinedAt}` — run once before deploy.
2. Deploy backend with feature flags off → on: enable Redis throttler, `autoIndex:false`/`maxPoolSize:20`, `compression`/`helmet`, typing Redis, cron locks. Rolling deploy tolerates mixed instances (old lacks lock → may double-run once, safe due to idempotent filters).
3. Swap Jimp → sharp in blurhash path; keep fallback to skip blurhash on sharp failure (log warn).
4. Update `docs/performance-audit-2026-08.md` marking fixed items.
5. Rollback: revert image tag; locks/Redis keys auto-expire; no schema rollback needed.

## Open Questions

- None blocking. Follow-ups (out of scope): full `pino`+`prom-client`+`otel`+`k6` load suite; BullMQ queue for cron; `sharp` Dockerfile pin.
