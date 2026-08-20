## Context

The WebRTC signalling layer (namespace `/webrtc`, module `chat-backend/src/webrtc/webrtc.gateway.ts` + Redis-backed `CallSessionService`) currently enforces answered-vs-missed timeouts with **per-call `setTimeout` handles kept in a process-local `Map<string, Timeout>`** (`webrtc.gateway.ts:65`, `CALL_TIMEOUT_MS = 30_000`, `OFFLINE_PUSH_GRACE_MS = 25_000`). The gateway already writes every new call to Redis — `call:<id>` hash, `call_participants:<id>` set, `active_calls:<user>` index, and an `initiated_sessions` sorted-set scored by creation time — and a `CallSessionCronService` (`@Cron('*/15 * * * * *')`) scans `initiated_sessions` for sessions older than `TIMEOUT_TTL = 60s` as a crash-recovery / safety net. Real timeouts are still driven by the in-memory timers; the 60 s scan is best-effort. On a single-process deployment this works, but as soon as two gateway pods sit behind a load balancer it breaks:

- The handle for a call is stored on the pod that handled `call_initiate`. The callee's `call_accept` may land on a different pod whose `Map` has no entry, so `clearCallTimeout(sessionId)` is a no-op and the caller's stale timer fires 30 s later as a spurious `call_missed`/`call_timeout`.
- A server restart loses every handle. Until the cron's 60 s global cutoff fires, stale calls hang on both devices.
- The existing tests for both paths assert on `jest.advanceTimersByTime(30_000/25_000)` over the local timer, so they pass without ever exercising the cron path.

Separately, an incoming call can vanish before the callee's rings: the offline branch sends a data-only FCM push and expects the killed app to wake via `fcmCallHandler.ts` → `consumePendingIncomingCall`; but the push has no server-side pending replay if the socket reconnect races the grace window, and the foreground `AppState` path in `AuthContext.tsx:210` only reconnects `SocketService` (the `/chat` namespace), leaving `/webrtc` disconnected. FCM replay on the client also lacks an `expiresAt` recency check, so a stale payload could still launch `IncomingCallScreen` after the session has been marked `missed`.

The prior spec `webrtc-offline-call-push` records the FCM contract but not the pending-replay requirement. `call-system-reliability` (101/107 done) covers many call-lifecycle fixes but not these two failure modes.

## Goals / Non-Goals

**Goals:**

- Make answered-vs-missed enforce exactly once, shared by every gateway pod, with zero process-local timer state remaining in `webrtc.gateway.ts`.
- Close the "call that never rings" gap for offline and reconnecting callees with a server-side `pending_call` replay and a client-side `/webrtc` reconnect + stale-payload guard.
- Keep the external socket contract unchanged (`incoming_call`, `call_missed`, `call_timeout`, FCM `incoming_call` data message shape). Only *when* and *from which pod* the events are emitted changes.
- Make all existing specs that asserted on the local timer pass by driving the same assertions through the cron deadline path instead.

**Non-Goals:**

- Changing call audio (ringtone vs ringback), TURN/coturn configuration, SDP/ICE error surfaces, permission denial UX, or `docs/call-flow-analysis.md` — all deferred to follow-ups.
- Adding new infrastructure (no new queues, pub/sub channels, or Redis instances).
- Ship lockscreen/CallKit UI (`fcmCallHandler` stays as the mobile surface); the pending replay is the backend piece that feeds it.
- Signing out-of-band deadlines; the `call_initiate` → accept window remains a wall-clock duration.

## Decisions

### D1 — `deadlineAt` lives on the session hash, not as a separate TTL key

Store `deadlineAt` as a numeric string field on `call:<id>` (value: `Date.now()` at creation + `CALL_TIMEOUT_MS` or `OFFLINE_PUSH_GRACE_MS`) and keep it mirrored as the score of `initiated_sessions`. Alternatives considered:

- Dedicated `call_timeout:<id>` TTL key with `EXPIRE` + Redis keyspace notifications: requires enabling `notify-keyspace-events` and a subscriber, and would not let the cron attribute online vs offline deadlines differently without a second read. Rejected as heavier infra.
- A per-session Redis `EXPIRE` on `call:<id>` itself: would delete the session before the cron could update the call log with `status:'missed'`. Rejected.

Writing the field both to the hash (for callee optimistic rendering later) and the sorted-set score keeps `cleanupStaleSessions` able to `zrangebyscore(0, now)` for cheap pre-filtering, then confirm via `HGET` of `deadlineAt` + `state` before claiming.

### D2 — Cron claims sessions atomically before emitting

Two cron shards can see the same expired sorted-set entry in the same tick. To get exactly-once effects, `cleanupStaleSessions` must **claim** a session before it does any mutation or emit. Options:

- Optimistic read-then-claim: read `deadlineAt` + `state`, then try a `WATCH/MULTI` transaction that `ZREM`s the entry and `HSET state=missed` conditional on `state === 'initiated'`. Loser sees the write discarded and skips the emit.
- Simpler single-writer transaction: `hGetDel`-style LUA that atomically checks `state === 'initiated'` and transitions to `missed`, returning whether the claim succeeded. Effects proceed only on success.

Chosen approach: LUA claim that checks `state === 'initiated' && Number(deadlineAt) <= now`, `HSET`s to `missed`, `ZREM`s, and returns 1 on success; caller then does the call-log, `pending_call` cleanup, and `io.to(...)` emits. On failure the session is skipped. This gives exactly-once without adding a claim flag. The existing `WATCH`/`MULTI` pattern may be used if LUA is disallowed by the Redis provider — contract is the same (exactly once).

### D3 — `pending_call:<targetUserId>` key shape and lifetime

- Redis string key `pending_call:<targetUserId>` (single slot per user; at most one inbound ring exists because concurrent inbound is rejected with `call_busy` at `handleCallInitiate`). Value is a JSON string: `{ sessionId, fromUserId, fromUser, callType, conversationId, iceServers, startedAt }`.
- TTL = `OFFLINE_PUSH_GRACE_MS` (25 s). Aligns the replay window with the grace the cron will enforce, so a reconnect either rings inside the window or gets correctly discarded when the cron marks the session `missed` and deletes the key.
- Writers: offline-push branch after the FCM send. Deleters: `handleCallAccept` (target-side), `handleCallDecline`, `handleCallCancel`, `call_failed`, and the cron miss path for the target user.
- Readers: `handleConnection` after `client.join(user:<id>)`. If the key is present, fetch the referenced `call:<id>` and verify `state === 'initiated' && Number(deadlineAt) > now` before re-emitting `incoming_call` to the just-joined socket.

### D4 — Mobile `connect()` dispose-before-recreate

`WebRTCService` is a module-level singleton. `AppState` foregrounding may call `connect(token)` while a stale, disconnected `Socket` is still held. Blindly creating a second `io(...)` leaks listeners and delivers duplicate `incoming_call` events. The safe pattern is:

```ts
if (this.socket) {
  if (this.socket.connected) return;   // already healthy
  this.socket.removeAllListeners();
  this.socket.disconnect();
  this.socket = null;
}
// then create the new io(WS_URL + '/webrtc', { query: { token }, transports, ... })
```

No other change in `WebRTCService` (high-risk file per `CLAUDE.md`). `AuthContext.handleAppStateChange` calls `webrtcService.connect(token)` alongside the existing `socketService.connect(token)` inside the same foreground branch, once the token is read from `getAccessTokenInMemory()`.

### D5 — Stale FCM payload guard ordering

`consumePendingIncomingCall` in `fcmCallHandler.ts` currently gates only on `_receivedAt` (`PENDING_TTL_MS = 45 s`). A new `expiresAt`-based gate must run **before** the `_receivedAt` check: if `payload.expiresAt` is present and `Date.now() > Number(expiresAt)`, return `null` even if the local write was recent — the server already considers the call missed. The secondary `_receivedAt` guard stays to cover offline messages that never carried `expiresAt`.

## Risks / Trade-offs

- **Timeout jitter widens from 0 to at most 15 s** (cron granularity) so callers may see "ringing" for up to 45 s instead of exactly 30 s → Documented as conscious tradeoff for multi-instance correctness; single-pod deployments could hold a tighter interval only by host networking, not an option here.
- **Two pods racing on cron emits double `call_missed` unless claim is atomic** → Mitigated by D2 LUA claim; without it the callee sees a spurious extra `IncomingCallScreen` ring.
- **`pending_call` slot is single-entry per user** → First ringing session wins; a second incoming call within the same 25 s window would overwrite it, but that caller would have already been rejected with `call_busy` so no data loss.
- **Mobile double-reconnect if both `App.tsx` and `AuthContext` foreground handlers fire** → Guarded by `isConnected()` check and idempotent `connect()`; no extra handling needed.
- **FCM wake path and socket replay path can both fire for the same session** → Both are idempotent: the first to be acted on (ring shown or accepted) settles the session; the late one sees a non-`initiated` state and is ignored/deleted.
- **Existing tests that advance fake timers over `setTimeout` will fail** → Each such test is rewritten to: create session → mutate `deadlineAt` into the past → invoke `cleanupStaleSessions` → assert same emits and log updates, preserving assertion counts but driving the cron path.

## Migration Plan

1. `CallSessionService`: add `deadlineAt` writes, `pending_call` helpers (`setPendingCall`, `getPendingCall`, `delPendingCall`), and the LUA-backed `claimMissableSessions(now)` or equivalent used by `cleanupStaleSessions`.
2. `WebrtcGateway`: delete `callTimeouts`, `CALL_TIMEOUT_MS` usage via timers, and `clearCallTimeout`; wire `deadlineAt` at creation, `pending_call` on offline-push, replay in `handleConnection`, deletion in every terminal handler.
3. `CallSessionCronService`: delegate to the new `cleanupStaleSessions(now)` return and emit `call_missed`/`call_timeout` once per claimed session, plus call-log + `pending_call` cleanup.
4. Mobile `AuthContext` + `WebRTCService.connect` + `fcmCallHandler` guards.
5. Rewrite affected specs to drive cron deadlines rather than `jest.advanceTimersByTime`.

Rollback: remove `deadlineAt` reads (sessions without it fall back to the old `TIMEOUT_TTL=60s` scan), keep `pending_call` entries ignored by an old gateway that never reads them, and release a new mobile build without the two foreground lines.

## Open Questions

- None. Per-session deadlines subsume both the 30 s and 25 s windows without a schema migration; a follow-up may persist `deadlineAt` to the call log for observability.
