## ADDED Requirements

### Requirement: Offline callee FCM push delivery
When a user initiates a call via `call_initiate` and the target user has no active socket connection to the `/webrtc` namespace AND has at least one FCM token registered, the backend SHALL send a high-priority FCM data-only message to every registered FCM token for the target user and start a 25-second grace period before marking the call missed.

#### Scenario: Offline callee with tokens receives push
- **GIVEN** User A is connected to `/webrtc` namespace
- **AND** User B has no active `/webrtc` socket
- **AND** User B has at least one entry in `fcmTokens[]`
- **WHEN** User A emits `call_initiate` targeting User B
- **THEN** the backend sends an FCM data-only message with fields `type='incoming_call'`, `sessionId`, `callerId`, `callerName`, `callType`, `conversationId`, `expiresAt` to every token in User B's `fcmTokens[]`
- **AND** the Android config is `priority='high'` with `ttl='20s'`
- **AND** the APNs config sets `apns-priority='10'` and `content-available=1`
- **AND** the Redis session field `pushSentAt` is populated with the current timestamp
- **AND** the caller receives `call_initiated` with `sessionId` and ICE servers (same payload as online case)

#### Scenario: Offline callee accepts within grace window
- **GIVEN** the offline push flow has started for User B
- **WHEN** User B's device receives the push, connects to `/webrtc`, and emits `call_accept` with the `sessionId` within 25 seconds
- **THEN** the grace timer is cleared
- **AND** the existing `call_accept` flow runs (session transitions to `active`, `call_accepted` is emitted to caller, call log is updated to `answered`)

#### Scenario: Offline callee does not respond within grace window
- **GIVEN** the offline push flow has started
- **WHEN** 25 seconds elapse with no `call_accept` or `call_decline` from User B
- **THEN** the backend ends the session, updates the call log status to `missed`, and emits `call_missed` to the caller
- **AND** the Redis session `call:{sessionId}` is removed

#### Scenario: Caller cancels during grace window
- **GIVEN** the offline push flow has started
- **WHEN** the caller emits `call_cancel` with the `sessionId` within 25 seconds
- **THEN** the grace timer is cleared
- **AND** the backend ends the session, updates the call log status to `cancelled`, and emits `call_cancelled` to the caller
- **AND** if User B subsequently comes online and attempts to accept, the backend emits an error response and does NOT transition the session

### Requirement: Immediate-missed fallback when no FCM tokens
When a user initiates a call and the target user is offline on `/webrtc` AND has zero FCM tokens registered, the backend SHALL skip the push delivery and immediately end the session as missed with reason `User unreachable`.

#### Scenario: Target user has never registered a device
- **GIVEN** User A is online
- **AND** User B has no active `/webrtc` socket
- **AND** User B's `fcmTokens[]` is empty
- **WHEN** User A emits `call_initiate` targeting User B
- **THEN** the backend does NOT send any FCM request
- **AND** the backend immediately calls `endSession`, updates the call log status to `missed`, and emits `call_missed` to the caller with reason `User unreachable`
- **AND** the backend does NOT start a grace timer

### Requirement: FCM delivery failure resilience
When the FCM service returns an error while sending the incoming-call push, the backend SHALL log the error, still start the 25-second grace timer, and let the call either succeed (if the device reconnects via another path) or time out naturally.

#### Scenario: FCM messaging throws an error
- **GIVEN** User B has FCM tokens registered
- **WHEN** the backend calls `sendIncomingCallPush` and `firebase-admin` messaging returns an error (rate limit, network error, all tokens invalid)
- **THEN** the error is logged including the `sessionId` and the error message
- **AND** the Redis session `pushSentAt` is still populated (marking that a push attempt happened)
- **AND** the grace timer still starts
- **AND** the caller still receives `call_initiated` (call proceeds normally from caller's perspective)

#### Scenario: Partial FCM delivery (some tokens fail)
- **GIVEN** User B has three FCM tokens, one of which is expired
- **WHEN** the backend sends the push and the messaging API reports one failed delivery
- **THEN** the success count and failure count are logged
- **AND** the flow continues (grace timer runs, other devices may still deliver)

### Requirement: Grace timer cleanup on terminal events
The grace timer SHALL be cleared on any of the following terminal events: `call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, or callee disconnect during the grace window.

#### Scenario: Callee declines after receiving push
- **GIVEN** the offline push flow has started
- **WHEN** User B connects and emits `call_decline` with the `sessionId`
- **THEN** the grace timer is cleared
- **AND** the existing `call_decline` flow runs (session ends, log status `declined`, `call_declined` emitted to caller)

#### Scenario: Server restart during grace window
- **GIVEN** the offline push flow has started and the grace timer is pending in memory
- **WHEN** the backend process restarts (in-memory timer is lost)
- **THEN** the session in Redis remains in state `initiated`
- **AND** `CallSessionCronService` picks up the stale session on its next tick (within 15 seconds) plus the configured stale threshold (60s), ending it as `missed`

### Requirement: Caller UX parity
The caller SHALL receive the same `call_initiated` event payload (including ICE servers) regardless of whether the callee is online, offline with tokens (push sent), or offline with no tokens. The caller SHALL NOT receive any event that discloses the callee's presence state directly.

#### Scenario: Caller cannot distinguish online vs offline callee from signaling
- **GIVEN** the caller emits `call_initiate`
- **WHEN** the backend processes the event
- **THEN** the caller receives exactly one of: `call_initiated` (followed later by `call_accepted`, `call_declined`, `call_cancelled`, or `call_missed`) OR `call_missed` immediately (no-tokens case) OR `call_busy` (existing busy case)
- **AND** no event payload directly indicates callee online/offline state
