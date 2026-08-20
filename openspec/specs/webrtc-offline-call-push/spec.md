# webrtc-offline-call-push Specification

## Purpose
Deliver incoming-call signaling to callees who are offline on the `/webrtc` namespace: high-priority FCM data-only push to wake the device, a grace window before the call is marked missed, an immediate-missed fallback when no FCM tokens exist, and caller UX parity that never discloses callee presence.
## Requirements
### Requirement: Offline callee FCM push delivery
When a user initiates a call via `call_initiate` and the target user has no active socket connection to the `/webrtc` namespace AND has at least one FCM token registered, the backend SHALL send a high-priority FCM data-only message to every registered FCM token for the target user, record a per-session `deadlineAt` (createdAt + 25 s) as the grace expiry, write a `pending_call:<targetUserId>` replay entry scoped to that session with TTL equal to the grace window, and regard the pending entry as replayable only until its deadline.

#### Scenario: Offline callee with tokens receives push and pending replay entry
- **GIVEN** User A is connected to `/webrtc` namespace
- **AND** User B has no active `/webrtc` socket
- **AND** User B has at least one entry in `fcmTokens[]`
- **WHEN** User A emits `call_initiate` targeting User B
- **THEN** the backend sends an FCM data-only message with fields `type='incoming_call'`, `sessionId`, `callerId`, `callerName`, `callType`, `conversationId`, `expiresAt` to every token in User B's `fcmTokens[]`
- **AND** the Android config is `priority='high'` with `ttl='20s'`
- **AND** the APNs config sets `apns-priority='10'` and `content-available=1`
- **AND** the Redis session field `pushSentAt` is populated with the current timestamp
- **AND** the session field `deadlineAt` is set to `createdAt + 25_000`
- **AND** the server writes `pending_call:<targetUserId>` containing the full `incoming_call` payload and sets its TTL to 25 s
- **AND** the caller receives `call_initiated` with `sessionId` and ICE servers (same payload as the online case)

#### Scenario: Offline callee accepts within grace window
- **GIVEN** a `pending_call` replay entry exists for the offline push
- **WHEN** User B's device — via the `pending_call` replay on reconnect or via a background FCM wake — connects to `/webrtc` and emits `call_accept` with the `sessionId` within 25 seconds
- **THEN** the existing `call_accept` flow runs (session transitions to `active`, `call_accepted` is emitted to caller, call log is updated to `answered`), the `pending_call:<targetUserId>` entry that referenced this session is deleted, and the deadline is cleared so no timeout will subsequently fire for this session

#### Scenario: Offline callee does not respond within grace window
- **GIVEN** the offline push flow has started
- **WHEN** `deadlineAt` (createdAt + 25 s) is reached with no `call_accept` or `call_decline` from User B
- **THEN** the **cron** (the single authoritative timeout path, not a per-call `setTimeout`) claims the session, marks it `missed`, updates the call log status to `missed`, emits `call_missed` to the caller, emits `call_timeout` to User B if still reachable, and clears `pending_call:<targetUserId>` and the transient `call_timeout:<sessionId>` key

#### Scenario: Caller cancels during grace window
- **GIVEN** the offline push flow has started
- **WHEN** the caller emits `call_cancel` with the `sessionId` within 25 seconds
- **THEN** the backend transitions the session to the cancelled/ended state, updates the call log to `cancelled`, deletes `pending_call:<targetUserId>`, and emits `call_cancelled` to User B
- **AND** a late `/webrtc` reconnect for User B does NOT receive a replayed `incoming_call`
- **AND** if User B subsequently attempts to accept, the backend emits an error response and does NOT transition the session

### Requirement: Immediate-missed fallback when no FCM tokens
When a user initiates a call and the target user is offline on `/webrtc` AND has zero FCM tokens registered, the backend SHALL skip the push delivery, immediately end the session as missed with reason `User unreachable`, and SHALL NOT create a `pending_call` replay entry for that session.

#### Scenario: Target user has never registered a device
- **GIVEN** User A is online
- **AND** User B has no active `/webrtc` socket
- **AND** User B's `fcmTokens[]` is empty
- **WHEN** User A emits `call_initiate` targeting User B
- **THEN** the backend does NOT send any FCM request
- **AND** the backend immediately calls `endSession`, updates the call log status to `missed`, and emits `call_missed` to the caller with reason `User unreachable`
- **AND** the backend does NOT write `pending_call:<targetUserId>`
- **AND** the backend does NOT arm a cron deadline for this immediately-ended session

### Requirement: FCM delivery failure resilience
When the FCM service returns an error while sending the incoming-call push, the backend SHALL log the error, still record `deadlineAt` and still create `pending_call:<targetUserId>` with TTL 25 s, and let the call either succeed (if the device connects via the pending replay before `deadlineAt`) or be marked `missed` by the cron at `deadlineAt`.

#### Scenario: FCM messaging throws an error
- **GIVEN** User B has FCM tokens registered
- **WHEN** the backend calls `sendIncomingCallPush` and `firebase-admin` messaging returns an error (rate limit, network error, all tokens invalid)
- **THEN** the error is logged including the `sessionId` and the error message
- **AND** the Redis session `pushSentAt` is still populated (marking that a push attempt happened)
- **AND** the Redis `pending_call:<targetUserId>` entry is still created (so socket reconnect still delivers the ring before `deadlineAt`)
- **AND** the per-session `deadlineAt` is still set
- **AND** the caller still receives `call_initiated` (call proceeds normally from caller's perspective)

#### Scenario: Partial FCM delivery (some tokens fail)
- **GIVEN** User B has three FCM tokens, one of which is expired
- **WHEN** the backend sends the push and the messaging API reports one failed delivery
- **THEN** the success count and failure count are logged
- **AND** the flow continues (`deadlineAt` and `pending_call` are still set, other devices may still deliver)

### Requirement: Grace timer cleanup on terminal events
The backend SHALL treat the per-session `deadlineAt` schedule as the authoritative "grace timer" and SHALL invalidate or clear it — together with `pending_call:<targetUserId>` — on any of the following terminal events: `call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, or `deadlineAt` miss/timeout itself.

#### Scenario: Callee declines after receiving push
- **GIVEN** the offline push flow has started and a `pending_call:<targetUserId>` exists
- **WHEN** User B connects and emits `call_decline` with the `sessionId`
- **THEN** the deadline eligibility for this session is revoked (the `initiated_sessions` entry is removed by the `declined` transition and any `call_timeout:<sessionId>` leaf is deleted), `pending_call:<targetUserId>` is deleted, and the existing `call_decline` flow runs (session ends, log status `declined`, `call_declined` emitted to caller)

#### Scenario: Server restart during grace window
- **GIVEN** the offline push flow has started and a `deadlineAt` + `pending_call` entry are live in Redis
- **WHEN** the backend process restarts (no in-memory timers survive, no pending replay is lost because both live in Redis)
- **THEN** the session in Redis remains in state `initiated` with its `deadlineAt` unchanged, held recoverably until the next `@Cron('*/15 * * * * *')` tick claims it once `deadlineAt <= now`, at which point it is ended as `missed` (with `call_missed`/`call_timeout` emitted once) — within at most the cron jitter (15 s) past the deadline

### Requirement: Caller UX parity
The caller SHALL receive the same `call_initiated` event payload (including ICE servers) regardless of whether the callee is online, offline with tokens (push sent), or offline with no tokens. The caller SHALL NOT receive any event that discloses the callee's presence state directly.

#### Scenario: Caller cannot distinguish online vs offline callee from signaling
- **GIVEN** the caller emits `call_initiate`
- **WHEN** the backend processes the event
- **THEN** the caller receives exactly one of: `call_initiated` (followed later by `call_accepted`, `call_declined`, `call_cancelled`, or `call_missed`) OR `call_missed` immediately (no-tokens case) OR `call_busy` (existing busy case)
- **AND** no event payload directly indicates callee online/offline state

### Requirement: Caller ringback lifecycle gated by server confirmation
The mobile caller (`WebRTCService`) SHALL NOT produce audible ringback as a side-effect of *sending* `call_initiate`; it SHALL start ringback only upon receiving `call_initiated` for that call. On receipt of `call_busy`, `call_missed` (any reason including `User unreachable`), or `error` (code 410) before the call is established, the service SHALL stop ringback immediately (idempotent) so no transient tone is audible. This guarantees a rejected/unreachable call never produces an audible ringback, while an accepted/online call still hears ringback starting right after `call_initiated`.

#### Scenario: Busy callee produces no ringback
- **WHEN** the caller emits `call_initiate` toward a callee whose `active_calls` set is non-empty and the server replies `call_busy` without ever sending `call_initiated`
- **THEN** the caller never hears ringback for that attempt

#### Scenario: Immediate-missed callee produces no ringback
- **WHEN** the caller emits `call_initiate` targeting an offline callee with zero FCM tokens and the server replies `call_missed {reason: 'User unreachable'}` without ever sending `call_initiated`
- **THEN** the caller never hears ringback for that attempt

#### Scenario: Stale-session error stops any tone
- **WHEN** the caller receives `error {code: 410}` for its session before the call is established
- **THEN** ringback is stopped immediately if running, and never started if not

#### Scenario: Successful call hears ringback after call_initiated
- **WHEN** the caller emits `call_initiate` toward an available callee and the server replies `call_initiated`
- **THEN** ringback starts after `call_initiated` is received and plays until `call_accepted` (which switches to voice mode) or a terminal event stops it

