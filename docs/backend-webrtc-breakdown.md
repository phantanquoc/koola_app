# backend-webrtc — Breakdown

## Fog Points & Resolutions

### Fog 1: Call session storage — Redis vs MongoDB?
**Spec silent**: Where are active call sessions stored?
- **Option A (Recommended)**: Redis — ephemeral, TTL-based expiry, low latency for signaling lookups
- **Option B**: MongoDB — persistent, queryable, but overkill for ephemeral signaling state
- **Resolution**: **Option A — Redis**. Call sessions are ephemeral (minutes). Use Redis with TTL = 3600s (matches TURN credential TTL). No need to persist call history in MVP.

### Fog 2: Call session state machine — which states exist?
**Spec lists**: `initiated`, `active`, `ended`, `missed`, `declined` — but doesn't define transitions.
- **Resolution**: Full state machine:
  - `initiated` → `active` (call_accept) | `declined` (call_decline) | `missed` (60s timeout) | `ended` (call_end)
  - `active` → `ended` (call_end)
  - All other states are terminal.

### Fog 3: ICE server config — static or dynamic per session?
**Spec**: Coturn credentials generated with HMAC-SHA1 using `turn 오` format.
- **Resolution**: **Dynamic per session** — NestJS generates fresh TURN credentials when `call_initiate` is received. Return ICE servers in the `call_initiate` response to the caller. This is the standard Coturn long-term credential flow.

### Fog 4: Group call — how to track all participants in a session?
**Spec**: Up to 8 participants, TURN mandatory for >2.
- **Resolution**: Store `sessionParticipants: string[]` in Redis (max 8). When initiator starts a group call, all members receive `incoming_call` and must emit `call_join` to join the session. Only joined participants can exchange SDP/ICE. Session is `active` when ≥2 participants joined.

### Fog 5: Call timeout — server-side or client-side?
**Spec**: Server emits `call_missed` after 60 seconds.
- **Resolution**: **Server-side via Redis TTL + scheduled timer**. Store `call_timeout:<sessionId>` key in Redis with 60s TTL. If `call_accept` arrives before TTL expires, cancel the timer. If TTL fires, emit `call_missed` to caller and mark session `missed`.

### Fog 6: Coturn monitoring — how does NestJS health check verify Coturn?
**Spec**: NestJS health check verifies Coturn reachable on port 3478.
- **Resolution**: TCP socket connection check (`net.createConnection(3478, coturnHost)`). Timeout 3s. If connect succeeds → healthy. If fail → unhealthy.

## Architecture Decisions

- **Module location**: `src/webrtc/` — separate module from `gateway/`
- **WebSocket namespace**: `/webrtc` (separate from `/chat` for clean separation)
- **Redis keys**:
  - `call:<sessionId>` — session state + metadata, TTL 3600s
  - `call_timeout:<sessionId>` — timeout guard, TTL 60s
  - `call_participants:<sessionId>` — Set of userIds, TTL 3600s
- **Auth**: Same `WsAuthGuard` pattern as ChatGateway (JWT from handshake query)
- **Coturn credentials**: `TurnService` generates `username = <timestamp>:<targetUserId>`, password = HMAC-SHA1(`static-auth-secret`, username), TTL = 3600

## Schema Definitions

### Redis Call Session
```
call:<sessionId> = {
  sessionId: string,
  initiatorId: string,
  targetUserId: string | null,       // null for group calls
  conversationId: string,
  callType: "audio" | "video",
  state: "initiated" | "active" | "ended" | "missed" | "declined",
  createdAt: ISO string,
  participantCount: number,
  maxParticipants: 8,
}
```

## Edge Cases Table

| Scenario | Handling |
|----------|----------|
| Target user offline | Emit `call_missed` to caller immediately on `call_initiate` |
| Call declined | Emit `call_declined` to caller; mark session `declined` |
| Call timeout (60s) | TTL key expires → server emits `call_missed` to caller |
| Max 8 participants exceeded | Reject `call_join` with error, emit `error` to client |
| User joins already-ended session | Check state before accepting join; reject with error |
| SDP/ICE sent to non-existent session | Validate session exists and user is participant |
| Duplicate `call_initiate` to same target | Reject with error — active session already exists |
| Coturn unreachable | Health check fails; ICE config still returned (client handles) |

## Files to Create

```
src/webrtc/
  webrtc.module.ts
  webrtc.gateway.ts          ← all WebSocket event handlers
  services/
    call-session.service.ts  ← Redis session management
    turn.service.ts          ← TURN credential generation
    call-timeout.service.ts  ← 60s timeout via Redis TTL
  dto/
    call-initiate.dto.ts
    call-offer.dto.ts
    call-answer.dto.ts
    call-ice-candidate.dto.ts
    call-accept.dto.ts
    call-decline.dto.ts
    call-end.dto.ts
    call-join.dto.ts
  guards/
    ws-auth.guard.ts          ← reuse from gateway
```

## Files to Modify

```
src/app.module.ts              ← import WebrtcModule
.env.example                   ← COTURN_HOST, COTURN_SECRET, COTURN_PORT
```

## Dependencies

- `crypto` (Node.js built-in) — HMAC-SHA1 for TURN credentials
- `net` (Node.js built-in) — Coturn TCP health check
- `ioredis` — already in package.json ✅
- `uuid` — already in package.json (for sessionId) ✅

---

## Module: backend-health

### Fog 1: Health check endpoint — separate controller or extend existing?
**Spec**: GET /health includes infrastructure check.
- **Resolution**: Extend existing `app.controller.ts` or create `HealthController` in a new `health/` module. Include MongoDB, Redis, Coturn checks. Use `@nestjs/terminus` for standardized health responses.

### Fog 2: Coturn health check — TCP connect or STUN binding request?
**Spec**: Verify Coturn reachable on port 3478.
- **Resolution**: TCP connect (`net.createConnection`). Simpler than sending actual STUN binding request. 3s timeout. If connect succeeds → `UP`, else → `DOWN`.

## Files to Create (backend-health)

```
src/health/
  health.module.ts
  health.controller.ts
  services/
    coturn-health.service.ts   ← TCP socket check
```

## Files to Modify

```
src/app.module.ts              ← import HealthModule
src/app.controller.ts         ← add /health route OR
                                 create separate HealthController
```

## Edge Cases (backend-health)

| Scenario | Handling |
|----------|----------|
| MongoDB down | Return `{ status: 'error', checks: { mongodb: 'down' }}` |
| Redis down | Return `{ status: 'error', checks: { redis: 'down' }}` |
| Coturn down | Return `{ status: 'degraded', checks: { coturn: 'down' }}` (app still works) |
| All healthy | Return `{ status: 'ok', checks: { mongodb: 'up', redis: 'up', coturn: 'up' }}` |
