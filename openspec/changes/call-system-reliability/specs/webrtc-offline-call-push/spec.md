## ADDED Requirements

### Requirement: `call_initiated` payload includes remote user metadata
The backend SHALL include a `remoteUser` field in every `call_initiated` event emitted to the caller. The field SHALL be an object `{userId, displayName, avatar}` populated from `UsersService.findById(targetUserId)`. When the target user is not found, `displayName` SHALL fall back to `'Unknown'` and `avatar` SHALL be omitted or null.

#### Scenario: Caller sees callee name and avatar on online call
- **GIVEN** callee B is a registered user with `displayName='Bob'` and `avatar='https://.../bob.jpg'`
- **WHEN** caller A emits `call_initiate` targeting B and B is online
- **THEN** A receives `call_initiated` with `remoteUser={userId: 'B', displayName: 'Bob', avatar: 'https://.../bob.jpg'}`

#### Scenario: Caller sees callee name on offline-push call
- **GIVEN** callee B is offline but has FCM tokens
- **WHEN** A emits `call_initiate` targeting B
- **THEN** A receives `call_initiated` with `remoteUser` populated (same shape as online case)

#### Scenario: Callee user was deleted
- **GIVEN** `UsersService.findById(targetUserId)` returns null
- **WHEN** A emits `call_initiate` targeting that id
- **THEN** `call_initiated` still contains `remoteUser` with `displayName='Unknown'`

### Requirement: Busy detection via active session check
The backend SHALL emit `call_busy` to the caller and abort initiation when `CallSessionService.getActiveSessionIds(targetUserId)` returns any session ids OR `CallSessionService.hasExistingSession(targetUserId, callerId, conversationId)` returns a session id. No session SHALL be created, no FCM push SHALL be sent, and no `call-logs` row SHALL be created on busy rejection.

#### Scenario: Target is already in a call
- **GIVEN** callee B has one active session with another user
- **WHEN** caller A emits `call_initiate` targeting B
- **THEN** A receives `call_busy` with `{targetUserId: 'B'}`
- **AND** no new session is created in Redis
- **AND** no FCM push is sent
- **AND** no `call-logs` row is created
- **AND** B receives no `incoming_call` event

#### Scenario: Reverse-direction busy (A is already initiating B→A)
- **GIVEN** B already called A on the same conversation and the session is in `initiated` or `active` state
- **WHEN** A emits `call_initiate` targeting B on the same conversation
- **THEN** A receives `call_busy`
- **AND** no duplicate session is created

### Requirement: Multi-device cancel on accept
When a user accepts an incoming call via `handleCallAccept`, the backend SHALL emit `call_cancelled` with `{sessionId}` to every socket in the `user:<acceptingUserId>` room EXCEPT the socket that sent the accept. This dismisses the `IncomingCallScreen` on other devices of the same user.

#### Scenario: User has two devices, accepts on device A
- **GIVEN** user U is connected to `/webrtc` from device A (socket S_A) and device B (socket S_B)
- **AND** both devices show `IncomingCallScreen` for session `X`
- **WHEN** socket S_A emits `call_accept` for session `X`
- **THEN** the backend emits `call_cancelled` with `{sessionId: X}` via `io.in('user:U').except(S_A).emit('call_cancelled', ...)`
- **AND** socket S_B receives `call_cancelled` and dismisses its `IncomingCallScreen`
- **AND** socket S_A does NOT receive `call_cancelled`

#### Scenario: User has one device
- **GIVEN** user U is connected from one socket only
- **WHEN** that socket emits `call_accept`
- **THEN** `io.in('user:U').except(S_accept).emit(...)` delivers to zero sockets
- **AND** no error is thrown

### Requirement: ICE restart retry protocol on the client
`WebRTCService` SHALL detect `iceConnectionState === 'failed'` transitions and retry up to 3 times via `createOffer({iceRestart: true})`. After the third failure, it SHALL emit `call_failed` via the socket with `{sessionId}` and clean up. On `iceConnectionState === 'connected'`, the retry counter SHALL reset.

#### Scenario: Single ICE restart recovers the call
- **GIVEN** an active call is in progress
- **WHEN** `iceConnectionState` transitions to `failed` for the first time
- **THEN** `WebRTCService` calls `createOffer({iceRestart: true})`, sets local description, and emits a new `call_offer` via the socket
- **AND** the ICE restart counter is 1
- **AND** on next `connected` the counter resets to 0

#### Scenario: Three restarts do not recover
- **GIVEN** an active call
- **WHEN** ICE fails three times in a row without reconnecting
- **THEN** on the third failure, `WebRTCService` emits `call_failed` via the socket
- **AND** transitions the local state to `failed`
- **AND** runs cleanup

### Requirement: Caller-side socket listeners forward terminal events
`WebRTCService.setupSocketListeners` SHALL subscribe to `call_ringing`, `call_cancelled`, `call_timeout`, `call_busy`, and `call_failed` events from the server and forward each via the internal event emitter so that hooks and screens can listen via `webrtcService.on(event, handler)`.

#### Scenario: Caller receives call_busy
- **GIVEN** a caller's `WebRTCService` is connected
- **AND** the caller code has registered `webrtcService.on('call_busy', handler)`
- **WHEN** the server emits `call_busy` to this caller
- **THEN** the registered `handler` is invoked with the server payload

#### Scenario: Callee receives call_cancelled
- **GIVEN** a callee has `IncomingCallScreen` mounted with a `call_cancelled` listener
- **WHEN** the server emits `call_cancelled`
- **THEN** the listener fires and the screen dismisses

### Requirement: Mobile FCM background handler persists incoming-call payload
A mobile-side background message handler SHALL be registered via `messaging().setBackgroundMessageHandler` at module load time, BEFORE `AppRegistry.registerComponent`. On a message with `data.type === 'incoming_call'`, the handler SHALL persist `{sessionId, callerId, callerName, callerAvatar, callType, conversationId, expiresAt, _receivedAt}` to `AsyncStorage` under the key `pendingIncomingCall`, where `_receivedAt = Date.now()`.

#### Scenario: App backgrounded when push arrives
- **GIVEN** the app is backgrounded and the device is in doze
- **WHEN** an FCM data-only push with `type='incoming_call'` arrives
- **THEN** the background handler writes the payload (including `_receivedAt`) to `AsyncStorage.pendingIncomingCall`

#### Scenario: App killed when push arrives
- **GIVEN** the app has been killed
- **WHEN** an FCM push arrives
- **THEN** Android wakes the JS runtime long enough to run the handler
- **AND** the payload is persisted to AsyncStorage

### Requirement: Pending incoming call replay on app mount
On `App.tsx` mount, after authentication is restored, the app SHALL read `AsyncStorage.pendingIncomingCall`. If the value is present and `Date.now() - _receivedAt < 45000`, the app SHALL navigate to `IncomingCallModal` with the mapped payload. The key SHALL be removed from AsyncStorage after reading, regardless of age.

#### Scenario: User opens app within 45 seconds of push
- **GIVEN** a pending incoming call was persisted 20 seconds ago
- **WHEN** the user opens the app and auth restores
- **THEN** the app navigates to `IncomingCallModal` with `{sessionId, callType, remoteUser: {id: callerId, displayName: callerName, avatar: callerAvatar}}`
- **AND** the AsyncStorage key is removed

#### Scenario: User opens app after 45-second window
- **GIVEN** a pending incoming call was persisted 60 seconds ago
- **WHEN** the user opens the app
- **THEN** the app does NOT navigate to `IncomingCallModal`
- **AND** the AsyncStorage key is still removed (single-use)

#### Scenario: No pending call
- **GIVEN** `AsyncStorage.pendingIncomingCall` is empty
- **WHEN** the user opens the app
- **THEN** no navigation occurs
- **AND** the app continues normal startup

### Requirement: Foreground FCM incoming-call handler navigates directly
When the app is running in the foreground and `messaging().onMessage` receives a message with `data.type === 'incoming_call'`, the handler SHALL navigate to `IncomingCallModal` via `navigationRef` immediately with the mapped payload, without going through AsyncStorage.

#### Scenario: Foreground push arrives while app is active
- **GIVEN** the app is in the foreground
- **WHEN** an FCM `incoming_call` message arrives via `onMessage`
- **THEN** the handler navigates to `IncomingCallModal` with the payload
- **AND** does NOT write to AsyncStorage
