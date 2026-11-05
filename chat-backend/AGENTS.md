# AGENTS.md — chat-backend

Operational rules for agents working in `chat-backend/`. Companion to root `CLAUDE.md` (mental model) — this file is the playbook: do exactly this.

## Layer separation

- Flow is `Controller -> Service -> Schema`. No exceptions.
- NEVER import Mongoose `@InjectModel` or call a Model in a controller. Controller does: DTO in, auth/user extraction, call service, call gateway broadcast, return.
- Services own ALL business logic, DB access, membership checks, push fan-out.
- Gateways (`gateway/`, `webrtc/`) NEVER write to Mongo directly. Gateway = broadcast + room management only.
- Reference pattern: `src/messages/messages.controller.ts` calls `messagesService.sendMessage(...)` then `chatGateway.broadcastNewMessage(...)`.

## REST writes truth, socket syncs truth

- Persist to DB FIRST, `await` the write, THEN emit the socket event. Emitting before commit causes cross-instance races where receivers fetch a missing document.
- Every socket payload MUST include `conversationId` for room scoping.
- Join/leave `conv:<id>` rooms on screen mount/unmount. Never `io.emit()` globally — always `to('conv:<id>').emit()`.
- Keep payloads JSON-serializable and <10KB. Media goes via presigned-URL reference, never binary in events.
- Never queue/broadcast ephemeral events (typing, presence) through offline replay — only durable writes.
- Redis adapter (`src/main.ts` `RedisIoAdapter`) reuses the single shared `RedisService` client. Never open a second pool, never `quit()` it from the adapter.

## DTO validation

- Global `ValidationPipe` in `main.ts`: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: true`.
- Every controller input (`@Body`, `@Query`, `@Param`) MUST have a DTO class with `class-validator` decorators (`src/messages/dto/`, `src/media/dto/`).
- Never read raw `req.body`. Unknown fields are rejected with 400 — rely on this, do not hand-strip.
- `enableImplicitConversion` exists so `?limit=100` coerces to number — do not add manual `@Type(() => Number)` everywhere.

## Mongoose indexes

- Define indexes ONLY via `Schema.index({...})` at the bottom of `*.schema.ts`. Reference: `src/messages/message.schema.ts`.
- NEVER put `index: true` on `@Prop` for a field already covered by `schema.index()` — it creates duplicates.
- New query pattern = new compound index in the same commit. Hot fields: `conversationId`, `createdAt`, `updatedAt`, `senderId`, `clientMessageId`.
- Prefer `deletedForUsers[]` / `deletedAt` soft-delete over destructive deletes (sync + audit need it).
- Avoid heavy `populate()` on hot paths — denormalize instead.

## Auth, guards, @Public

- JWT guard is global. Every new route is authenticated by default.
- NEVER add `@Public()` without documenting why in a code comment. Audit target: `grep -rn "@Public" src/auth src/*//`.
- Admin routes: `@UseGuards(JwtAuthGuard, AdminGuard)` — order matters, JWT first. Never `@Public()` on `/admin/*`.
- `AdminGuard` (`src/auth/guards/admin.guard.ts`) loads the actor FRESH from DB by `request.user.actorId` and checks `isPlatformAdmin`. Never trust a token claim for the admin decision — demotion must take effect immediately.
- Access token: JWT ~15min, never persisted server-side. Refresh token: opaque, hashed in Mongo, rotates on use. Socket auth: JWT in handshake, validated by `WsAuthGuard`.

## Throttle / rate limits

- Keep `@Throttle` (or the project's rate-limit decorator) on write endpoints: send message, mark-read, reactions, presigned-URL request, OTP send.
- Adding a new mutation endpoint without a rate limit = incomplete. Document the limit in `@ApiResponse({ status: 429 })` like `messages.controller.ts` does.

## Env, CORS, global config

- Global prefix is `api` (`main.ts`). Swagger at `/api/docs`, WS at `/chat` namespace.
- `helmet()` + `compression()` + `HttpExceptionFilter` + `LoggingInterceptor` are global — do not re-add per controller.
- CORS: HTTP uses `getAllowedOrigins()` from `src/common/cors.ts`. `FRONTEND_URL` MUST be set in production or boot throws. Never add `*` origin.
- Socket CORS: use `socketCorsOrigin()` for gateways. Non-browser (RN, no/`null`/`file://` origin) is allowed by design; real browser origins must match the allow-list. Auth happens via JWT handshake, not CORS.
- Secrets (JWT secret, MinIO keys, Plivo, SMTP) come from env only. Fail fast at startup if missing. Never hardcode.

## Media / MinIO presigned flow

- Never proxy binary through NestJS, never store binary in Mongo.
- Flow: `POST /media/presigned-url` (validate mime + size in `media.service.ts`, magic-bytes check) -> client PUTs direct to MinIO -> message references `mediaKey`.
- Reuse `minio-client.ts` (`minioClient`, `BUCKET`, `ensureBucketExists`). Do not create a second client.
- Bucket lifecycle (e.g. `stories/` expiry) is installed idempotently at boot in `main.ts` — keep new lifecycle rules there, non-fatal on failure.

## Tests

- Colocate: `*.spec.ts` next to the service (`messages.service.spec.ts`, `media.service.spec.ts`). No separate test tree.
- New service logic ships with a spec covering the happy path + the membership/permission denial path.
- Run `npx jest <changed-spec>` before finishing. Do not fix red tests by weakening assertions.

## Before-done checklist

- [ ] Controller has no Mongoose import; gateway writes no DB
- [ ] DTO exists for every new input; unknown-field 400 verified
- [ ] New query has a `schema.index()`; no `index: true` duplicate
- [ ] Socket emit happens after DB commit, scoped to `conv:<id>`, payload <10KB
- [ ] No new `@Public()`; admin route uses `JwtAuthGuard, AdminGuard`
- [ ] Write endpoint has rate limit + 429 doc
- [ ] No secret in code; prod env var documented
- [ ] Spec colocated and green
