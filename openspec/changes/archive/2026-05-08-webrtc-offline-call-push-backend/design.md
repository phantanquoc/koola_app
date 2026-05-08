## Context

APP_KOOLA runs Socket.IO `/webrtc` namespace for call signaling. When a caller initiates a call (`call_initiate`), `handleCallInitiate` in `chat-backend/src/webrtc/webrtc.gateway.ts` calls `io.in('user:${targetId}').fetchSockets()` to check whether the callee has any active socket on the `/webrtc` namespace. If the count is zero, the current implementation at lines 251-264:
1. Ends the session immediately via `callSessionService.endSession`
2. Updates the call log as `missed`
3. Emits `call_missed` to the caller

The callee receives nothing — no push, no tray notification, no lock-screen UI, no chance to answer. This is the single biggest UX gap in the call system and a P0 blocker for production readiness.

Backend has FCM integration already via `chat-backend/src/notifications/notifications.service.ts` using `firebase-admin` messaging through `notifications/fcm-client.ts`. `UsersSchema.fcmTokens[]` already stores `{ token, platform, createdAt }` per device. We reuse this infra.

Mobile native integration (CallKit on iOS, ConnectionService + foreground service on Android, VoIP push setup) is a larger stream of work and is deferred to a separate change. This change delivers the **backend slice** so that as soon as mobile catches up, the full UX lights up.

## Goals / Non-Goals

**Goals:**
- Backend sends a high-priority FCM data-only push to all of callee's `fcmTokens` when the callee is not connected to `/webrtc`.
- Session stays alive in `initiated` state for a 25-second grace window so the callee's device has time to wake from doze, handle the data message, connect to socket, and emit `call_accept` / `call_decline`.
- Caller UX is identical to the online-callee case during the grace window (caller sees `call_initiated`, hears ringback, can cancel).
- All existing terminal events (`accept`, `decline`, `cancel`, `end`) cleanly clear the grace timer.
- No regression in the online-callee flow.

**Non-Goals:**
- Mobile side: FCM data-message handler, CallKit, ConnectionService, foreground service, full-screen intent — deferred.
- iOS VoIP push (PushKit + APNs VoIP cert) — deferred (needs Apple cert setup).
- Adding `voipToken` field to User schema — deferred (iOS-only, bundled with mobile VoIP work).
- Quiet hours / notification preferences for calls — out of scope.
- Call-specific notification sounds / channel configuration on Android — out of scope (done in mobile change).
- Rate-limiting push delivery — Batch 2 rate limit on `call_initiate` already caps upstream.

## Decisions

### Decision 1: Grace period of 25 seconds

**Choice**: Start a 25-second timer after sending the push. If no accept/decline within that window, end as missed.

**Alternatives considered**:
- 30s (same as online timeout) — rejected: callee's device needs time to wake from doze, but holding infra longer costs more and delayed UX feels worse than "phone stopped ringing".
- 15s — rejected: too tight for Android doze / iOS background.
- 45s+ — rejected: caller will hang up first; costs Redis TTL overhead; typical phone "rings ~6-7 times" UX pattern aligns with ~20-25s.

**Rationale**: 25s aligns with common mobile OS wake-up latency (5-10s on doze) plus a reasonable ring window (15-20s) and is slightly shorter than the online 30s timeout because offline path consumes more infra per call.

### Decision 2: Data-only FCM payload (NOT notification payload)

**Choice**: Use FCM `data` field only, no `notification` field.

**Alternatives considered**:
- Notification payload — rejected: OS displays a generic banner; app cannot wake to show full-screen incoming call UI (CallKit / full-screen intent).
- Mixed notification + data — rejected: on iOS, presence of `notification` suppresses `content-available` wake behavior in many states.

**Rationale**: Data-only messages trigger the app's FCM background handler, which is what CallKit / ConnectionService need to receive. The mobile change will add the handler. For this backend slice, we commit to the correct payload shape now.

Payload shape:
```json
{
  "data": {
    "type": "incoming_call",
    "sessionId": "<uuid>",
    "callerId": "<userId>",
    "callerName": "<displayName>",
    "callerAvatar": "<url or empty>",
    "callType": "audio" | "video",
    "conversationId": "<convId>",
    "expiresAt": "<epoch ms>"
  },
  "android": {
    "priority": "high",
    "ttl": "20s"
  },
  "apns": {
    "headers": {
      "apns-priority": "10",
      "apns-push-type": "background"
    },
    "payload": {
      "aps": {
        "content-available": 1
      }
    }
  }
}
```

Note: `apns-push-type: 'voip'` is reserved for the future VoIP slice. For now we use `background` with `content-available: 1`, which is best-effort for data delivery on regular APNs tokens.

### Decision 3: No `voipToken` field yet — use existing `fcmTokens` for both platforms

**Choice**: Send to all `fcmTokens` regardless of platform. Use `platform` field only if we need to tune per-platform config in the future.

**Alternatives considered**:
- Add `voipToken` field now — rejected: iOS VoIP requires a separate Apple cert and PushKit registration, which is tied to the mobile change. Adding the field now creates dead data until mobile ships.

**Rationale**: Android works fine with high-priority data FCM today. iOS will be best-effort until VoIP slice lands. This is acceptable for a backend-slice delivery.

### Decision 4: Non-blocking push; grace timer always starts

**Choice**: Call `sendIncomingCallPush` inside try/catch. If FCM delivery fails (service down, all tokens invalid), log the error but still start the grace timer.

**Alternatives considered**:
- Fail-fast: on push error, immediately end as missed — rejected: device might connect via a different path (background socket reconnect triggered by OS), and caller UX shouldn't change just because our downstream hiccuped.
- Retry push — rejected: firebase-admin SDK already retries transient errors; our retry would race with the grace timer.

**Rationale**: Graceful degradation. Worst case the call silently times out at 25s, which is identical to the pre-change "user offline" UX — no regression even in the failure mode.

### Decision 5: Caller UX is unchanged (no leak of presence)

**Choice**: Caller always receives `call_initiated` with full `iceServers` regardless of whether callee is online, offline+push, or offline+no-tokens. Caller sees normal ringback UI.

**Alternatives considered**:
- Emit a different event (`call_offline_pending`) to caller — rejected: leaks presence state; adds client complexity for no UX gain.
- No emit if offline (caller sees spinner) — rejected: breaks existing caller state machine.

**Rationale**: Privacy + consistency. The caller doesn't need to know, and it simplifies the mobile state machine.

**Side effect**: In the no-tokens case (user registered but never installed the app / uninstalled), caller rings for a brief moment then sees missed. We accept this minor inconsistency (it's the same behavior as today, just with the caller event emitted first).

Actually — re-evaluating: for the **no-tokens** case we should preserve today's immediate-missed behavior because starting a 25s timer for a user who literally cannot receive the push is wasted time for caller. Spec scenario for no-tokens clarifies this: emit `call_missed` immediately with reason 'User unreachable'.

### Decision 6: Reuse `callTimeouts` Map + add `pushSentAt` to session

**Choice**: Reuse the existing `callTimeouts: Map<string, NodeJS.Timeout>` at `webrtc.gateway.ts:44` for the 25-second grace timer. Add optional `pushSentAt?: Date` to `CallSession` in Redis.

**Alternatives considered**:
- Separate `pushGraceTimeouts` Map — rejected: duplication; same lifecycle (cleared on same events).
- Use Redis TTL only (no in-memory timer) — rejected: would require Redis keyspace notifications or polling; in-memory + cron safety net is the existing pattern.

**Rationale**: Minimizes surface area. The cron `CallSessionCronService` already reconciles stale `initiated` sessions every 15 seconds, so any server restart during a grace period is self-healing within ~75 seconds (acceptable recovery window for a call). `pushSentAt` is diagnostic only, not used for control flow.

### Decision 7: Separate service file, not extension of NotificationsService

**Choice**: Create `chat-backend/src/webrtc/services/call-notifications.service.ts`.

**Alternatives considered**:
- Extend `NotificationsService` with a new `sendIncomingCallPush` method — rejected: that service is scoped to chat messages with dedup, preview builders, conversation types. Adding call logic pollutes its cohesion.

**Rationale**: Cohesion with webrtc module. The new service is injected into the gateway via `WebrtcModule`. It reuses the FCM client directly.

## Risks / Trade-offs

- [**Risk**: FCM delivery can be slow or dropped on iOS without VoIP push] → **Mitigation**: expected until mobile VoIP slice ships; documented as known limitation. Android unaffected.
- [**Risk**: 25s grace timer is in-memory; server restart loses timer] → **Mitigation**: `CallSessionCronService` picks up stale `initiated` sessions every 15s (confirmed by task 8); recovery within ~75s.
- [**Risk**: Callee receives push after caller already cancelled] → **Mitigation**: client checks `expiresAt` in payload and discards; grace timer cleared on `call_cancel`; FCM `ttl: 20s` caps straggler delivery.
- [**Risk**: Callee has multiple devices; push goes to all] → **Mitigation**: expected (multi-device already supported via `user:{userId}` room in online case); first device to `call_accept` wins, others receive `call_cancelled` via existing multi-device dismiss logic at `webrtc.gateway.ts:563`.
- [**Risk**: All FCM tokens stale (returned `registration-token-not-registered`)] → **Mitigation**: `CallNotificationsService` logs the count of stale tokens and, as a follow-up optimization, can prune them from the user document. Out of scope here — tracked as open question.
- [**Trade-off**: We start the grace timer even when push delivery fully failed] → **Accepted**: simpler flow; worst case is identical to pre-change UX.
- [**Trade-off**: No `voipToken` field means iOS delivery is best-effort background data] → **Accepted**: documented; VoIP slice will address.

## Migration Plan

**Deployment**:
- Backend-only change. No database migration. No schema change.
- Safe to deploy independently. Mobile without the new FCM handler will receive the data message but have no handler for `type=incoming_call` — the push is simply no-op on the device side until mobile ships.
- No feature flag needed; behavior degrades gracefully for mobile clients without the handler (just like today's offline experience, which is what they had anyway).

**Rollback**: Revert the two files changed (`webrtc.gateway.ts` and the new service). Redis sessions with `pushSentAt` field are compatible with the pre-change schema (optional field).

## Open Questions

- Should we add automatic FCM token pruning when the messaging SDK returns `registration-token-not-registered`? Currently, stale tokens accumulate in `fcmTokens[]` forever. Answer: **Not in this change**; track as follow-up hygiene task.
- Do we log `pushSentAt` / delivery result to call logs for analytics? Answer: **Not in this change**; Fix #8 observability endpoint will accumulate mobile-side metrics, and we can extend call logs later if needed.
