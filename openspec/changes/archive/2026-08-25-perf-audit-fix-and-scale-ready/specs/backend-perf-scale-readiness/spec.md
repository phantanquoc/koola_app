## ADDED Requirements

### Requirement: Message sender identity stays string without populate
The system SHALL return `senderId` as a `string` on all message and conversation read paths and SHALL NOT issue a `populate('senderId')` query against the messages collection on those paths. No extra user lookup is performed for these responses.

#### Scenario: Conversation latest message does not populate sender
- **WHEN** a client calls `GET /conversations` or receives a conversation via sync
- **THEN** the server fetches conversations and latest messages without `populate('senderId')` and `senderId` in the response is a string

#### Scenario: Message list does not populate sender
- **WHEN** a client calls `GET /conversations/:id/messages` or search/forward paths that return messages
- **THEN** the server returns messages without `populate('senderId')` and `senderId` is a string

### Requirement: Bounded conversation list with indexes
The system SHALL serve `getConversationList` with bounded queries using `limit`, `lean`, and field `select`, and SHALL have an index supporting sort by `joinedAt`.

#### Scenario: Conversation list paginates without full scan
- **WHEN** a user requests their conversation list with pagination
- **THEN** the server queries `user_conversations` with `limit`/`skip` (or cursor), `lean()`, and a projection that includes only fields needed for the list, sorted by `joinedAt` descending

#### Scenario: Index supports conversation list sort
- **WHEN** `getConversationList` sorts by `joinedAt` descending
- **THEN** a supporting index exists on `user_conversations` (e.g. `{ userId: 1, joinedAt: -1 }`) so the sort is indexed

### Requirement: Hot-path message indexes
The system SHALL have indexes that cover the hot message filters on `deleted` and `deletedFor` (alongside `conversationId`).

#### Scenario: Filtered message query uses indexes
- **WHEN** the server queries messages for a conversation filtered by `deleted`/`deletedFor`
- **THEN** the query is served by an index that includes those fields so the filter does not require a collection scan

### Requirement: Parallel independent fetches in send path
The system SHALL fetch independent documents in the `sendMessage` path in parallel where correctness allows.

#### Scenario: Send does not add sequential RTT for independent reads
- **WHEN** a client sends a message to a conversation
- **THEN** the server does not sequentially await two independent conversation reads (e.g. `updateLastMessage` and `incrementUnreadCount`); they are issued via `Promise.all` (or equivalent parallelization), preserving the single `verifyMember` gate

### Requirement: Non-blocking blurhash generation via sharp
The system SHALL generate image blurhash/thumbnail data without blocking the event loop, using `sharp`.

#### Scenario: Sending a large image does not block other requests
- **WHEN** a client sends an image message (including large 12MP images)
- **THEN** the server generates `blurhash`/`imageWidth`/`imageHeight` via `sharp` off the event loop and does not block the response nor other concurrent requests; on `sharp` failure the message is still persisted and the blurhash is skipped with a warning log

### Requirement: Message search is indexed and lean
The system SHALL serve message search with an index-aligned sort and `lean()` and SHALL not issue duplicate count queries with mismatched filters.

#### Scenario: Search returns without blocking sort
- **WHEN** a client searches messages via `$text` in a conversation
- **THEN** the server sorts in a way that can use the text index (or avoids an in-memory blocking sort), uses `lean()`, and any total count uses the same filter as the paged query

### Requirement: Shared throttler quota across instances
The system SHALL enforce throttling quotas globally across instances via Redis, so N instances share one quota (e.g. 60/min short, 1000/min long). Health checks are exempt.

#### Scenario: Quota is global not per-instance
- **WHEN** 61 requests arrive within one minute spread across 2 instances
- **THEN** the 61st request is throttled with `429` regardless of which instance handles it

#### Scenario: Health probes are not throttled
- **WHEN** a load balancer calls `GET /health`
- **THEN** the request is not counted toward throttler quotas

### Requirement: Bounded Mongo pool and no runtime index builds
The system SHALL connect to Mongo with `autoIndex: false` and `maxPoolSize: 20` (or equivalent bounded pool), and indexes are created via an explicit one-time migration/script.

#### Scenario: Rolling restart does not thunder-build indexes
- **WHEN** 10 instances restart together
- **THEN** they do not concurrently build indexes on startup; total Mongo connections stay bounded (20 per instance)

### Requirement: HTTP hardening middleware
The system SHALL use `compression` (gzip) for JSON responses and `helmet` headers, configured in `main.ts`.

#### Scenario: Large JSON responses are compressed
- **WHEN** a client requests a large feed or sync response with `Accept-Encoding: gzip`
- **THEN** the response is gzip-compressed

#### Scenario: Security headers are present
- **WHEN** any HTTP response is returned
- **THEN** `helmet` default headers are present

### Requirement: Production logging is gated
The system SHALL NOT emit per-request `console.log` in production. `LoggingInterceptor` is gated by `NODE_ENV`/`LOG_LEVEL` (no-op or pino-ready in prod).

#### Scenario: No per-request console.log in production
- **WHEN** `NODE_ENV=production`
- **THEN** `LoggingInterceptor` does not call `console.log` for every request

### Requirement: Moments feed sort matches index and scope is indexed
The system SHALL sort the Moments feed in the direction matching the `story` index (`createdAt: -1`) and SHALL have an index covering `audienceScope` for the `$or` branches. The feed does not over-fetch by `limit * 10` without justification.

#### Scenario: Feed query uses the author+createdAt index
- **WHEN** the server queries the Moments feed sorted by `authorId`/`createdAt`
- **THEN** the sort direction is `{ authorId: 1, createdAt: -1 }` matching the existing index, and `audienceScope` is indexed so the `$or` filter is indexed

### Requirement: Exactly-once cron ticks via Redis lock
The system SHALL ensure each scheduled cron job runs at most once per tick across N instances via `RedisService.setNXEX('lock:<job>', podId, ttl)`. The `media-cron` and `media-cleanup` jobs (both at `0 3 * * *`) use distinct lock keys. The interface is narrow to allow a future BullMQ replacement.

#### Scenario: Only one instance runs each daily cron
- **WHEN** 10 instances reach `0 3 * * *`
- **THEN** only the instance that acquires `lock:media-cron` runs `media-cron`, and only the instance that acquires `lock:media-cleanup` runs `media-cleanup`; others skip without side effects

#### Scenario: Per-minute view flush is leader-only
- **WHEN** `flushViewCounts` (`EVERY_MINUTE`) fires across N instances
- **THEN** only the lock holder flushes `REDIS_DIRTY_STORIES_KEY` to Mongo; others skip the tick

### Requirement: Typing indicator is distributed and receiver-only
The system SHALL store typing state in Redis (`typing:<conv>:<user>` with `EX 5`) and SHALL emit typing events only to receivers — the sender does not see their own typing indicator. Storage is per-instance shared via Redis, not `Map<Timeout>`.

#### Scenario: Sender does not see own typing
- **WHEN** user A starts typing in conversation C
- **THEN** members of C except A receive `typing` true for A; A does not receive a typing event for themselves, and the indicator auto-expires after 5s

#### Scenario: Cross-instance typing is visible
- **WHEN** user A (connected to instance 1) types and user B (connected to instance 2) is in the same conversation
- **THEN** B receives the typing indicator via Redis-backed state

### Requirement: Single Redis pool per instance
The system SHALL use a single Redis client/pool per instance shared between `RedisService` and `RedisIoAdapter`, not two independent `new Redis()` pools.

#### Scenario: One pool per instance
- **WHEN** the app boots
- **THEN** `RedisIoAdapter` reuses the `RedisService` client (or a single shared `ioredis` instance) and does not create a second independent pool

### Requirement: Performance audit doc stays current
The system SHALL keep `docs/performance-audit-2026-08.md` updated to mark items fixed by this change and the remaining open items.

#### Scenario: Audit reflects reality after change
- **WHEN** this change is merged
- **THEN** `docs/performance-audit-2026-08.md` lists which findings are fixed, which are out of scope, and the verification checks performed
