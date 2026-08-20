## ADDED Requirements

### Requirement: Offline-push callee can receive the incoming call on reconnect
When a session entered the offline-push path (FCM sent) and the target user subsequently creates a `/webrtc` socket, the backend SHALL use the `pending_call:<targetUserId>` Redis key to deliver the ringing signal to that just-connected socket, scoped to the socket that caused the reconnect and only while the session is still eligible for an answer.

#### Scenario: Online reconnect receives the pending incoming signal
- **WHEN** a `/webrtc` socket connects and successfully authenticates as `user:<targetUserId>` while `pending_call:<targetUserId>` holds a payload whose `sessionId` references a session with `state === 'initiated'` and a non-expired `deadlineAt`
- **THEN** the server emits `incoming_call` with the stored payload (`sessionId`, `fromUserId`, `fromUser`, `callType`, `conversationId`, `iceServers`) to the newly connected socket only
- **AND** deletes `pending_call:<targetUserId>` so a later reconnect does not replay the same ring

#### Scenario: Expired or settled session never replays
- **WHEN** a `/webrtc` socket connects while `pending_call:<targetUserId>` is present but the referenced session satisfies either `state !== 'initiated'` or `Number(deadlineAt) <= now` (or the `call:<id>` key is absent)
- **THEN** the server deletes `pending_call:<targetUserId>` without emitting `incoming_call`

#### Scenario: Terminal transition cleans the pending entry so reconnect never rings for a settled call
- **WHEN** `call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, or the timeout miss path settles the session that a `pending_call:<targetUserId>` references
- **THEN** that `pending_call:<targetUserId>` key is deleted

### Requirement: App foreground re-establishes the /webrtc signalling socket
The app SHALL keep both signalling namespaces connected on foreground so a reconnect replay is reachable. `AuthContext.handleAppStateChange` SHALL, when the app returns to `active`, reconnect the `/webrtc` namespace alongside `SocketService` whenever a token is available and the `/webrtc` socket is not already connected. `WebRTCService.connect(token)` SHALL be safe to retry: if a stale, disconnected `Socket` instance is held, it SHALL dispose that instance (`removeAllListeners` + `disconnect` + `null`) before creating the new connection; it SHALL remain a no-op when already `connected`.

#### Scenario: Foreground with live chat socket but dead webrtc socket reconnects webrtc
- **WHEN** the app transitions from `inactive`/`background` to `active`, the user is still authenticated, `socketService` is already connected, and `webrtcService.isConnected() === false`
- **THEN** `webrtcService.connect(token)` is invoked once with the current in-memory access token, after first tearing down the prior stale socket if present

#### Scenario: Repeated foreground does not leak sockets
- **WHEN** `connect(token)` is called multiple times (e.g. duplicate `AppState` events while the first reconnect is still in progress and `this.socket` is held but not yet `connected`)
- **THEN** each call disposes any prior disconnected socket before creating a new one, so only one live socket and one set of `incoming_call` listeners exist at a time

### Requirement: Killed-app FCM replay never surfaces a call that has already expired
`fcmCallHandler.consumePendingIncomingCall` SHALL be scoped to a call that could still be answered. After parsing and before the existing 45 s `_receivedAt` check, the handler SHALL consult the FCM payload's `expiresAt` when present: if `Date.now() > Number(expiresAt)` the payload SHALL be discarded and `null` returned, without navigating to `IncomingCallScreen`.

#### Scenario: Expired push is discarded even when the device just woke
- **WHEN** the FCM data payload carries `expiresAt` already in the past and the client reads it via `consumePendingIncomingCall()` within the 45 s `_receivedAt` window
- **THEN** the function returns `null` and no navigation to `IncomingCallScreen` is performed

#### Scenario: Fresh push within both windows still replays
- **WHEN** `Date.now() <= Number(expiresAt)` (or `expiresAt` is absent) and `Date.now() - _receivedAt < 45_000`
- **THEN** the payload is returned for navigation
