# APP_KOOLA — Issues Tracker

> Identified: 2026-04-24 | Source: Codebase analysis (4,357 symbols, 6,463 edges)
> Fix these incrementally. Check off when resolved.

---

## HIGH — Fix Immediately

### 1. Access token persisted to AsyncStorage (Security Violation)

**What:** Access token is saved to AsyncStorage (unencrypted on Android), violating the CLAUDE.md rule that access tokens must be in-memory only.

**Where:**
- `ChatApp/src/contexts/AuthContext.tsx:84` — `await asyncStorage.setAccessToken(tokens.accessToken)`
- `ChatApp/src/contexts/AuthContext.tsx:113` — `await asyncStorage.setAccessToken(data.accessToken)`
- `ChatApp/src/contexts/AuthContext.tsx:59` — reads it back for socket reconnect

**Why it matters:** AsyncStorage has no encryption by default on Android. A rooted device or backup extraction exposes the access token. The token should be derived from refresh token on reconnect, not cached on disk.

**Fix approach:** Remove `setAccessToken`/`getAccessToken` from asyncStorage. Rewrite `handleAppStateChange` to call `/auth/refresh` to get a fresh token instead of reading cached one.

- [x] Fixed

---

## MEDIUM — Fix Before Production

### 2. JWT_SECRET via process.env in 8 places (bypasses ConfigModule)

**What:** Manual `process.env.JWT_SECRET` calls instead of using NestJS ConfigService.

**Where:**
- `chat-backend/src/auth/auth.service.ts` (2x)
- `chat-backend/src/auth/jwt.strategy.ts`
- `chat-backend/src/gateway/chat.gateway.ts`
- `chat-backend/src/gateway/guards/ws-auth.guard.ts`
- `chat-backend/src/webrtc/webrtc.gateway.ts`
- `chat-backend/src/media/media.controller.ts`

**Why it matters:** If JWT_SECRET is sourced from a secrets manager via ConfigModule only, manual `process.env` reads would return undefined. Creates inconsistency.

**Fix approach:** Inject `ConfigService` and use `configService.get<string>('JWT_SECRET')` everywhere.

- [x] Fixed

### 3. TypingService uses in-memory Map (breaks horizontal scale)

**What:** `typingTimers = new Map<string, NodeJS.Timeout>()` is process-local.

**Where:** `chat-backend/src/messages/typing.service.ts:5`

**Why it matters:** In multi-instance deployment, `typing_start` on instance A and `typing_stop` on instance B won't cancel each other. Auto-stop timer fires incorrectly.

**Fix approach:** Move typing state to Redis with TTL keys, or document as known MVP limitation.

- [x] Fixed

### 4. WebRTC call timeout in-memory (stale sessions on crash)

**What:** `callTimeouts = new Map<string, NodeJS.Timeout>()` is process-local.

**Where:** `chat-backend/src/webrtc/webrtc.gateway.ts:44`

**Why it matters:** If backend instance crashes between call creation and the 30s timeout, session stays `initiated` in Redis for up to 3600s (SESSION_TTL). User appears "busy" until TTL expires. No cron cleanup exists.

**Fix approach:** Add a scheduled cleanup job (like MediaCronService) that scans for `call_timeout:{sessionId}` keys and marks expired sessions as `missed`.

- [x] Fixed (in-memory timeout Map remains for normal flow; cron covers crash recovery with socket notification)

### 5. Pin/unpin via socket only (lost when offline)

**What:** `pinMessage` and `unpinMessage` emit socket events instead of REST calls.

**Where:**
- `ChatApp/src/services/api/apiService.ts:184-189`

**Why it matters:** If socket is disconnected, pin/unpin silently fails. No offline queue. Pinning modifies the conversation document in MongoDB — it's a durable write that should go through REST.

**Fix approach:** Create REST endpoints for pin/unpin. Replace socket emits with API calls. Add to offline queue if desired.

- [x] Fixed

### 6. OfflineQueueService doesn't handle expired presigned URLs

**What:** Queued messages with `mediaUrl` are replayed as-is. If offline long enough for the presigned URL to expire, replay fails.

**Where:** `ChatApp/src/services/OfflineQueueService.ts:51-58`

**Why it matters:** User sends media while offline → comes back online hours/days later → replay sends expired URL → message fails silently.

**Fix approach:** On replay, check if mediaUrl is a presigned URL. If expired, re-request a fresh presigned URL before sending.

- [x] Fixed

---

## LOW — Cleanup / Tech Debt

### 7. JwtModule registered 4 times independently

**What:** Same `JwtModule.registerAsync` factory duplicated in 4 modules.

**Where:**
- `chat-backend/src/auth/auth.module.ts`
- `chat-backend/src/gateway/gateway.module.ts`
- `chat-backend/src/media/media.module.ts`
- `chat-backend/src/webrtc/webrtc.module.ts`

**Fix approach:** Create a `SharedModule` that registers JwtModule once and exports it.

- [x] Fixed

### 8. NotificationsModule has unnecessary forwardRef

**What:** `forwardRef(() => UsersModule)` in NotificationsModule, but UsersModule doesn't import NotificationsModule — no actual cycle exists.

**Where:**
- `chat-backend/src/notifications/notifications.module.ts:7`
- `chat-backend/src/notifications/notifications.service.ts:33`

**Fix approach:** Remove `forwardRef` wrappers, use direct imports.

- [x] Fixed

### 9. Duplicate schema index warning (Media)

**What:** `Media` schema uses both `index: true` on `@Prop` and `schema.index()` for `mediaKey`.

**Where:** Media schema file

**Fix approach:** Remove one of the duplicate index definitions.

- [x] Fixed

---

## INCOMPLETE — Open Work Items

### 10. Voice/Video Call E2E tests not run

**Where:** `openspec/changes/voice-video-call-production/tasks.md` — tasks 13.1–13.5

- [ ] Completed (manual device testing required — not a code fix)

### 11. Video messages — iOS/Android native module verification

**Where:** `openspec/changes/video-messages/tasks.md` — tasks 3.2, 3.3, 11.x

- [ ] Completed (manual device testing required — not a code fix)

### 12. Stale WebRTC session recovery cron (related to #4)

**What:** No background job exists to clean up sessions stuck in `initiated` state.

- [x] Implemented

---

## Placeholder Tabs (Not bugs — product roadmap)

- Shopping, Connect, Support tabs → PlaceholderScreen
- Videos, Journal material top tabs → PlaceholderScreen
