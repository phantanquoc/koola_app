## Why

The callee sometimes never receives the incoming call signal: the caller hears ringback, the server marks the call as missed, but the callee never shows the `IncomingCallScreen` and never plays a ringtone. Two independent root causes explain the non-determinism: (a) call timeouts live only as in-memory `Map<string, Timeout>` handles on the single backend instance that created the session, so cross-instance `call_accept`/`call_cancel` cannot clear them and false `call_missed`/`call_timeout` events fire after the call was already settled; and (b) when the callee is offline or its `/webrtc` socket is disconnected at the instant `call_initiate` arrives, there is no pending-call replay on reconnect and the mobile `AppState` foreground path never re-establishes the `/webrtc` namespace, so the call is silently lost even after the device comes back.

## What Changes

- **BREAKING (internal): `WebrtcGateway` hold no process-local call timeout state.** Remove `callTimeouts: Map<string, Timeout>` and every `setTimeout/clearTimeout` call; timeout enforcement becomes the sole responsibility of Redis state (`deadlineAt` on the session hash) and the existing `CallSessionCronService`.
- **Backend — per-session `deadlineAt`:** When a session is created, write `deadlineAt = createdAt + CALL_TIMEOUT_MS (30s)` for the online branch and `+ OFFLINE_PUSH_GRACE_MS (25s)` for the offline-push branch as a numeric epoch-millis field on the `call:<id>` hash and as the score of `initiated_sessions`. Replace the global `TIMEOUT_TTL=60s` cutoff in `CallSessionService.cleanupStaleSessions` with a per-session `deadlineAt <= now && state === 'initiated'` scan.
- **Backend — cron single source of truth:** Keep `@Cron('*/15 * * * * *')`. For every expired-to-missed session the cron must produce exactly the same effects the old timers did: `updateSessionState('missed')`, `updateLog({status:'missed', duration:0, endedAt})`, `io.to(user:<initiator>).emit('call_missed', {sessionId, reason:'No answer'})`, and `io.to(user:<target>).emit('call_timeout', {sessionId})`. Make session claiming atomic so two cron shards racing on the same session emit once.
- **Backend — `pending_call:<targetUserId>` replay:** On the offline-push branch, after the FCM send also write a `pending_call:<targetUserId>` string key holding the full `incoming_call` payload (JSON: `sessionId`, `fromUserId`, `fromUser`, `callType`, `conversationId`, `iceServers`) with TTL = `OFFLINE_PUSH_GRACE_MS`. In `handleConnection` after `client.join(user:<id>)`, read `pending_call:<userId>`; emit `incoming_call` to the just-connected socket iff the session is still `initiated`, then delete the key; if the session is already settled, just delete the key. Every terminal handler (`call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, and the cron miss path) must delete `pending_call:<targetUserId>` if it references the settled session.
- **Mobile — `AppState` reconnect:** In `ChatApp/src/contexts/AuthContext.tsx:handleAppStateChange`, when the app returns to `active`, reconnect the `/webrtc` namespace alongside `SocketService`: if a token exists and `!webrtcService.isConnected()` then `webrtcService.connect(token)`.
- **Mobile — safe `WebRTCService.connect()`:** If `this.socket` already exists but is disconnected, dispose it (`removeAllListeners` + `disconnect`) before creating a new `io()` client; change nothing else in this high-risk file.
- **Mobile — stale FCM replay guard:** In `ChatApp/src/services/push/fcmCallHandler.ts:consumePendingIncomingCall`, after parsing, return `null` if `payload.expiresAt` is present and `Date.now() > expiresAt`; keep the existing 45 s `_receivedAt` TTL as the secondary guard.
- **Test alignment:** Rewrite `webrtc.gateway.call-log.spec.ts` task 6.11 and `webrtc.gateway.offline-push.spec.ts` grace-timer assertions so they drive expiration via the cron deadline rather than `jest.advanceTimersByTime(30_000/25_000)`.

## Capabilities

### New Capabilities
- `webrtc-call-timeout-reliability`: Per-session deadline enforcement in Redis + cron as single source of truth for call timeouts; multi-instance safe; zero in-memory call timers in `WebrtcGateway`.
- `webrtc-pending-call-replay`: Redis `pending_call` replay on `/webrtc` reconnect + app-foreground webrtc reconnect + stale FCM replay guard.

### Modified Capabilities
- `webrtc-offline-call-push`: REQUIREMENTS change — offline-call `pending_call` replay and `deadlineAt`-driven timeout expiry become part of the contract. Existing `webrtc-offline-call-push` deltas are amended by new deltas in this change.

## Impact

- **Backend code:** `chat-backend/src/webrtc/webrtc.gateway.ts` (remove Map + timers, add pending_call writes/replays, wire deadlineAt creation), `chat-backend/src/webrtc/services/call-session.service.ts` (deadlineAt field + per-session deadline scan + pending_call helpers + atomic claim), `chat-backend/src/webrtc/services/call-session-cron.service.ts` (authoritative miss/timeout emission with atomic claim), `chat-backend/src/common/redis/redis.service.ts` (reuse only; no new method unless needed for GETDEL-style claim).
- **Backend tests:** `call-session.service.spec.ts`, `webrtc.gateway.sequence.spec.ts`, `webrtc.gateway.call-log.spec.ts`, `webrtc.gateway.offline-push.spec.ts`, `webrtc.gateway.regression.spec.ts`.
- **Mobile code:** `ChatApp/src/contexts/AuthContext.tsx` (AppState webrtc reconnect), `ChatApp/src/services/webrtc/WebRTCService.ts` (`connect()` safe-reconnect only), `ChatApp/src/services/push/fcmCallHandler.ts` (`expiresAt` guard).
- **APIs / socket events:** Socket event contracts are unchanged — `incoming_call`, `call_missed`, `call_timeout`, etc. keep the same shapes; only who emits when changes (cron instead of per-call timer; replay on reconnect).
- **Data:** `call:<id>` hash gains a numeric `deadlineAt` field; new transient key `pending_call:<userId>` with 25 s TTL; `initiated_sessions` semantics remain but are filtered by per-session deadline.
- **Infra / deps:** No new infrastructure, no new dependencies.
- **Risk / rollout:** Timeout latency widens from exactly 30s to 30-45s (cron ticks every 15s). Treat as conscious tradeoff for multi-instance correctness; the previous exact 30s was only correct on a single-process deployment and already tolerated the same variance on restarts.
